import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from typing import Optional
import torch
from PIL import Image, ImageOps
from diffusers import (
    StableDiffusionXLInpaintPipeline,
    AutoencoderKL,
    EulerAncestralDiscreteScheduler,
)
from torchvision import transforms
from fastapi import HTTPException
import logging
from stable_diffusion.callback import callback 

logger = logging.getLogger(__name__)

class SDXLInpaintModel:
    """
    Universal inpainting pipeline for SDXL.
    Supports prompt + negative_prompt, recommended SDXL settings, and VRAM optimizations.
    """

    def __init__(self, device: Optional[str] = None, upscaler_path: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None
        self.upscaler = None
        self.upscaler_path = upscaler_path

    # ---------------- Optimalizations ----------------
    def _enable_speed_optimizations(self, pipe):
        try:
            if hasattr(torch.nn.functional, "scaled_dot_product_attention"):
                pipe.unet.set_attn_processor()
            else:
                pipe.enable_xformers_memory_efficient_attention()
        except Exception:
            pass

        try:
            total_mem = torch.cuda.get_device_properties(0).total_memory if torch.cuda.is_available() else 0
            if total_mem < 16 * 1024**3: 
                pipe.enable_attention_slicing()

            pipe.unet.to(memory_format=torch.channels_last)
            if total_mem >= 12 * 1024**3:
                pipe.unet.float()
                if pipe.vae is not None:
                    pipe.vae.float()
        except Exception:
            pass

    # ---------------- Loading / unloading ----------------
    def load_model(
        self,
        model_path: str,
        torch_dtype: torch.dtype = torch.float16,
        vae_path: Optional[str] = None,
    ):
        try:
            self.pipeline = StableDiffusionXLInpaintPipeline.from_single_file(
                model_path, torch_dtype=torch_dtype
            )

            if vae_path:
                try:
                    vae = AutoencoderKL.from_pretrained(vae_path, torch_dtype=torch_dtype)
                    self.pipeline.vae = vae
                    logger.info(f"Loaded VAE from {vae_path}")
                except Exception as ve:
                    logger.warning(f"Could not load VAE from {vae_path}: {ve}")

            self.pipeline.scheduler = EulerAncestralDiscreteScheduler.from_config(
                self.pipeline.scheduler.config
            )
            self.pipeline.to(self.device)
            self._enable_speed_optimizations(self.pipeline)

            if self.upscaler_path and os.path.isfile(self.upscaler_path):
                self.upscaler = torch.load(self.upscaler_path, map_location="cpu")
                logger.info(f"Loaded upscaler from {self.upscaler_path}")

        except Exception as e:
            logger.exception("Error loading SDXL Inpaint model")
            raise HTTPException(status_code=500, detail=f"Model loading error: {e}")

    def unload_model(self):
        self.pipeline = None
        self.upscaler = None
        if self.device == "cuda":
            torch.cuda.empty_cache()

    # ---------------- Helpers ----------------
    @staticmethod
    def _ensure_rgb(img: Image.Image) -> Image.Image:
        return img.convert("RGB")

    @staticmethod
    def _ensure_l(img: Image.Image) -> Image.Image:
        return img.convert("L")

    # ---------------- Generation ----------------
    def generate_image(
        self,
        *,
        job_id,
        prompt: str,
        negative_prompt: str = "grain, noise, lowres, worst quality, low quality, jpeg artifacts, blurry, deformed",
        init_image: Optional[Image.Image] = None,
        mask_image: Optional[Image.Image] = None,
        steps: int = 50,
        guidance_scale: float = 7.5,
        strength: float = 0.7,
        seed: Optional[int] = None,
        invert_mask: bool = True,
        keep_background: bool = True,
    ) -> Image.Image:

        if self.pipeline is None:
            raise HTTPException(status_code=500, detail="Pipeline not loaded")

        if init_image is None:
            init_image = Image.new("RGB", (1024, 1024), color=(255, 255, 255))
        if mask_image is None:
            mask_image = Image.new("L", init_image.size, color=255)

        init_image = self._ensure_rgb(init_image)
        mask_image = self._ensure_l(mask_image)

        width = (init_image.width // 64) * 64
        height = (init_image.height // 64) * 64
        init_image = init_image.resize((width, height), Image.LANCZOS)
        mask_image = mask_image.resize((width, height), Image.NEAREST)

        if invert_mask:
            mask_image = ImageOps.invert(mask_image)

        generator = None
        if seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        try:
            self.pipeline.scheduler.set_timesteps(steps)
            _, actual_steps = self.pipeline.get_timesteps(steps, strength, self.device)
            logger.info(f"steps {actual_steps}")
            result = self.pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=init_image,
                mask_image=mask_image,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                strength=strength,
                generator=generator,
                width=width,
                height=height,
                output_type="pil",
                callback_on_step_end=callback(job_id=job_id, num_steps=actual_steps),
            )

            gen = result.images[0]
            gen = gen.resize(init_image.size, Image.LANCZOS)

            if keep_background:
                final = Image.composite(gen, init_image, mask_image)
            else:
                final = gen

            if self.upscaler is not None:
                final = transforms.functional.resize(
                    final,
                    (final.width * 2, final.height * 2),
                    interpolation=transforms.InterpolationMode.BICUBIC,
                )

            return final

        except torch.cuda.OutOfMemoryError:
            if self.device == "cuda":
                torch.cuda.empty_cache()
            raise HTTPException(status_code=500, detail="VRAM out of memory")
        except Exception as e:
            logger.exception("Generation error")
            raise HTTPException(status_code=500, detail=f"Generation error: {e}")
