import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from typing import Optional
import torch
from PIL import Image, ImageOps
from diffusers import StableDiffusionInpaintPipeline, AutoencoderKL, DPMSolverMultistepScheduler
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

class RealisticVision:
    """
    RealisticVision inpainting pipeline using checkpoint converted to diffusers format.
    Supports init_image + mask_image for inpainting.
    """

    def __init__(self, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None

    # ---------------- loading/unloading ----------------

    def _enable_speed_optimizations(self, pipe):
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
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
        torch_dtype: torch.dtype = torch.float16,
        controlnet_path: Optional[str] = None,
    ):
        """
        Load RealisticVision inpaint pipeline from a diffusers folder
        """
        try:
            self.pipeline = StableDiffusionInpaintPipeline.from_single_file(
                model_path,
                torch_dtype=torch_dtype,
                safety_checker=None,
                feature_extractor=None,
            )

            if vae_path:
                logger.info(f"Loading VAE from {vae_path}")
                self.pipeline.vae = AutoencoderKL.from_pretrained(vae_path, torch_dtype=torch_dtype)
            self.pipeline.scheduler = DPMSolverMultistepScheduler.from_config(self.pipeline.scheduler.config)
            self._enable_speed_optimizations(self.pipeline)
            self.pipeline.to(self.device)

        except Exception as e:
            logger.exception("Error loading RealisticVision inpaint pipeline")
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

    # ---------------- helpers ----------------

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
        hist = mask_l.histogram()
        black = sum(hist[:128])
        white = sum(hist[128:])
        if white < black:
            return ImageOps.invert(mask_l)
        return mask_l

    @staticmethod
    def _invert_mask(mask_l: Image.Image) -> Image.Image:
        return ImageOps.invert(mask_l)

    # ---------------- inference ----------------

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
        keep_background: bool = True,
        invert_mask_if_needed: bool = False,
        invert_mask: bool = True,
        resize_to_multiple_of_8: bool = True,
        control_image: Optional[Image.Image] = None,
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

            result = self.pipeline(**kwargs)
            gen = result.images[0]
            if gen.size != init_image.size:
                gen = gen.resize(init_image.size, Image.LANCZOS)
            if mask_l.size != init_image.size:
                mask_l = mask_l.resize(init_image.size, Image.NEAREST)

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
