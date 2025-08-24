import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from typing import Optional
import torch
from PIL import Image, ImageOps
from diffusers import (
    StableDiffusionInpaintPipeline,
    DPMSolverMultistepScheduler,
    AutoencoderKL,
)
import torch
from torchvision import transforms
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

class CyberRealistic:
    """
    Inpainting pipeline for RealisticVision Hyper Inpainting (CivitAI).
    Uses recommended sampling, resolution, and upscaling settings.
    """

    def __init__(self, device: Optional[str] = None, upscaler_path: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None
        self.upscaler = None
        self.upscaler_path = upscaler_path

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

    def load_model(self, model_path: str, torch_dtype: torch.dtype = torch.float16, vae_path: Optional[str] = None, controlnet_path: Optional[str] = None):
        """
        Load RealisticVision Hyper inpaint model converted to diffusers format.
        Applies recommended scheduler settings.
        """

        try:
            self.pipeline = StableDiffusionInpaintPipeline.from_single_file(
                model_path,
                torch_dtype=torch_dtype,
                safety_checker=None,
                feature_extractor=None,
            )
            scheduler = DPMSolverMultistepScheduler.from_config(self.pipeline.scheduler.config)
            scheduler.use_karras_sigmas = True  
            self.pipeline.scheduler = scheduler

            self._enable_speed_optimizations(self.pipeline)
            self.pipeline.to(self.device)

            if self.upscaler_path and os.path.isfile(self.upscaler_path):
                self.upscaler = torch.load(self.upscaler_path, map_location="cpu")
                logger.info(f"Loaded upscaler from {self.upscaler_path}")

        except Exception as e:
            logger.exception("Error loading RealisticVision Hyper inpaint model")
            raise HTTPException(status_code=500, detail=f"Model loading error: {e}")

    def unload_model(self):
        try:
            self.pipeline = None
            self.upscaler = None
            if self.device == "cuda":
                torch.cuda.empty_cache()
        except Exception:
            pass

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
    def _ensure_size_align(gen: Image.Image, ref: Image.Image, mask: Image.Image):
        if gen.size != ref.size:
            gen = gen.resize(ref.size, Image.LANCZOS)
        if mask.size != ref.size:
            mask = mask.resize(ref.size, Image.NEAREST)
        return gen, mask

    def generate_image(
        self,
        *,
        prompt: str,
        init_image: Image.Image,
        mask_image: Image.Image,
        steps: int = 30,
        guidance_scale: float = 5.0,
        strength: float = 0.3,
        seed: Optional[int] = None,
        keep_background: bool = True,
        invert_mask_if_needed: bool = False,
        invert_mask: bool = True,
        resize_to: tuple = (512, 768),
        control_image: Optional[Image.Image] = None,
    ) -> Image.Image:
        if self.pipeline is None:
            raise HTTPException(status_code=500, detail="Pipeline not loaded")

        init = self._ensure_rgb(init_image).resize(resize_to, Image.LANCZOS)
        mask = self._ensure_l(mask_image).resize(resize_to, Image.NEAREST)
        if invert_mask_if_needed and not invert_mask:
            mask = ImageOps.invert(mask)
        elif invert_mask:
            mask = ImageOps.invert(mask)

        generator = None
        if seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        try:
            result = self.pipeline(
                prompt=prompt,
                image=init,
                mask_image=mask,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                strength=strength,
                generator=generator,
            )
            gen = result.images[0]

            gen, mask = self._ensure_size_align(gen, init, mask)

            if keep_background:
                final = Image.composite(gen, init, mask)
            else:
                final = gen

            if self.upscaler is not None:
                lr = final
                hr = transforms.functional.resize(lr, (lr.height * 2, lr.width * 2), interpolation=transforms.InterpolationMode.BICUBIC)
                final = hr

            return final

        except torch.cuda.OutOfMemoryError:
            if self.device == "cuda":
                torch.cuda.empty_cache()
            raise HTTPException(status_code=500, detail="VRAM out of memory")
        except Exception as e:
            logger.exception("Generation error")
            raise HTTPException(status_code=500, detail=f"Generation error: {e}")
