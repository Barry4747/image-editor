import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from typing import Optional
import io
import torch
from PIL import Image, ImageOps
from diffusers import (
    StableDiffusionInpaintPipeline,
    StableDiffusionControlNetInpaintPipeline,
    ControlNetModel,
    AutoencoderKL,
)
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)


class ControlNet:
    """
    Simple inpainting pipeline with optional ControlNet support.
    It uses stable diffusion 1.5 model, controlnets (in this case canny)
    """

    def __init__(self, use_controlnet: bool = True, device: Optional[str] = None):
        self.use_controlnet = use_controlnet
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None
        self._controlnet_loaded = False

    # ------------- loading/unloading -------------

    def _enable_speed_optimizations(self, pipe):
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
        if hasattr(pipe, "enable_vae_tiling"):
            pipe.enable_vae_tiling()
        if hasattr(pipe, "enable_attention_slicing"):
            pipe.enable_attention_slicing()
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except Exception:
            pass
        try:
            pipe.unet.to(memory_format=torch.channels_last)
            pipe.unet.half()
        except Exception:
            pass
        try:
            if pipe.vae is not None:
                pipe.vae.to(memory_format=torch.channels_last)
                pipe.vae.half()
        except Exception:
            pass

    def load_model(
        self,
        model_path: str,
        vae_path: Optional[str] = None,
        controlnet_path: Optional[str] = None,
        torch_dtype: torch.dtype = torch.float16,
    ):
        try:
            controlnet = None
            if self.use_controlnet and controlnet_path:
                controlnet = ControlNetModel.from_pretrained(controlnet_path, torch_dtype=torch_dtype)
                self._controlnet_loaded = True

            if controlnet is not None:
                self.pipeline = StableDiffusionControlNetInpaintPipeline.from_pretrained(
                    model_path,
                    controlnet=controlnet,
                    torch_dtype=torch_dtype,
                    safety_checker=None,
                    feature_extractor=None,
                )
            else:
                self.pipeline = StableDiffusionInpaintPipeline.from_pretrained(
                    model_path,
                    torch_dtype=torch_dtype,
                    safety_checker=None,
                    feature_extractor=None,
                )

            if vae_path:
                logger.info(f"Loading VAE from {vae_path}")
                self.pipeline.vae = AutoencoderKL.from_pretrained(vae_path, torch_dtype=torch_dtype)

            self._enable_speed_optimizations(self.pipeline)
            self.pipeline.to(self.device)

        except Exception as e:
            logger.exception("Error on loading model/pipeline")
            raise HTTPException(status_code=500, detail=f"Model loading error: {e}")

    def unload_model(self):
        try:
            if self.pipeline is not None:
                del self.pipeline
                self.pipeline = None
            if self.device == "cuda":
                torch.cuda.empty_cache()
        except Exception:
            pass

    # ------------- helpers -------------

    @staticmethod
    def _to_multiple_of_8(size):
        w, h = size
        return (w // 8 * 8, h // 8 * 8)

    @staticmethod
    def _ensure_rgb(img: Image.Image) -> Image.Image:
        return img.convert("RGB")

    @staticmethod
    def _ensure_l(img: Image.Image) -> Image.Image:
        return img.convert("L")

    @staticmethod
    def _maybe_invert_mask(mask_l: Image.Image) -> Image.Image:
        """
        If there are more white pixels than black, inverts the mask.
        (In sd 1.5 inpainting white is the area to be modified)
        """
        hist = mask_l.histogram()
        black = sum(hist[:128])
        white = sum(hist[128:])
        if white < black:
            return ImageOps.invert(mask_l)
        return mask_l
    
    @staticmethod
    def _invert_mask(mask_l: Image.Image) -> Image.Image:
        return ImageOps.invert(mask_l)

    # ------------- inference -------------

    def generate_image(
        self,
        *,
        prompt: str,
        init_image: Image.Image,
        mask_image: Image.Image,
        negative_prompt: str = "",
        steps: int = 30,
        guidance_scale: float = 7.5,
        strength: float = 0.75,
        seed: Optional[int] = None,
        control_img: Optional[Image.Image] = None,
        controlnet_conditioning_scale: float = 1.0,
        keep_background: bool = True,
        invert_mask_if_needed: bool = False,
        invert_mask: bool = True,
        resize_to_multiple_of_8: bool = True,
    ) -> Image.Image:
        if self.pipeline is None:
            raise HTTPException(status_code=500, detail="Pipeline not loaded")

        init_image = self._ensure_rgb(init_image)
        mask_l = self._ensure_l(mask_image)

        if resize_to_multiple_of_8:
            target_size = self._to_multiple_of_8(init_image.size)
        else:
            target_size = init_image.size

        if init_image.size != target_size:
            init_image = init_image.resize(target_size, Image.LANCZOS)
        if mask_l.size != target_size:
            mask_l = mask_l.resize(target_size, Image.NEAREST)

        if invert_mask_if_needed and not invert_mask:
            mask_l = self._maybe_invert_mask(mask_l)

        elif invert_mask:
            mask_l = self._invert_mask(mask_l)


        if self.use_controlnet and self._controlnet_loaded:
            if control_img is None:
                control_img = init_image
            control_img = self._ensure_rgb(control_img).resize(target_size, Image.LANCZOS)

        generator = None
        if seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        try:
            kwargs = dict(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=init_image,
                mask_image=mask_l,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                strength=strength,  
                generator=generator,
            )

            if self.use_controlnet and self._controlnet_loaded:
                kwargs.update(
                    dict(
                        control_image=control_img,
                        controlnet_conditioning_scale=controlnet_conditioning_scale,
                    )
                )

            result = self.pipeline(**kwargs)
            gen = result.images[0]

            if keep_background:
                final = Image.composite(gen, init_image, mask_l)
                return final
            else:
                return gen

        except torch.cuda.OutOfMemoryError:
            if self.device == "cuda":
                torch.cuda.empty_cache()
            raise HTTPException(status_code=500, detail="VRAM out of memory")
        except Exception as e:
            logger.exception("Generation error")
            raise HTTPException(status_code=500, detail=f"Generation error: {e}")
