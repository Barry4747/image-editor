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

logger = logging.getLogger(__name__)

class IllustriousPony:
    """
    Inpainting pipeline dla modelu Damn IllustriousPony (SD 1.5).
    Obsługuje prompt, negative_prompt, optymalizacje VRAM i prosty upscaler.
    """

    def __init__(self, device: Optional[str] = None, upscaler_path: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None
        self.upscaler = None
        self.upscaler_path = upscaler_path

    # ------------- Optymalizacje -------------
    def _enable_speed_optimizations(self, pipe):
        try:
            if hasattr(torch.nn.functional, 'scaled_dot_product_attention'):
                pipe.unet.set_attn_processor()
            else:
                pipe.enable_xformers_memory_efficient_attention()
        except Exception:
            pass

        if torch.cuda.is_available() and torch.cuda.get_device_properties(0).total_memory < 12 * 1024**3:
            pipe.enable_attention_slicing()

        try:
            pipe.unet.to(memory_format=torch.channels_last)
        except Exception:
            pass

    # ------------- Ładowanie / zwalnianie -------------
    def load_model(
        self,
        model_path: str,
        torch_dtype: torch.dtype = torch.float16,
        vae_path: Optional[str] = None,
    ):
        try:
            self.pipeline = StableDiffusionXLInpaintPipeline.from_single_file(
                model_path, torch_dtype=torch_dtype, safety_checker=None
            )

            if vae_path is not None:
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
            logger.exception("Error loading SD15 Inpaint model")
            raise HTTPException(status_code=500, detail=f"Model loading error: {e}")

    def unload_model(self):
        self.pipeline = None
        self.upscaler = None
        if self.device == "cuda":
            torch.cuda.empty_cache()

    # ------------- Generacja -------------
    def generate_image(
        self,
        *,
        prompt: str,
        negative_prompt: str = "grain, noise, lowres, worst quality, low quality, jpeg artifacts, blurry, deformed",
        init_image: Optional[Image.Image] = None,
        mask_image: Optional[Image.Image] = None,
        steps: int = 30,
        guidance_scale: float = 7.5,
        strength: float = 0.75,
        seed: Optional[int] = None,
        invert_mask: bool = True,
        keep_background: bool = True,
    ) -> Image.Image:

        if self.pipeline is None:
            raise HTTPException(status_code=500, detail="Pipeline not loaded")

        if init_image is None:
            init_image = Image.new("RGB", (768, 768), color=(255, 255, 255))
        if mask_image is None:
            mask_image = Image.new("L", init_image.size, color=255)

        init_image = init_image.convert("RGB")
        mask_image = mask_image.convert("L")

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
            )

            gen = result.images[0]

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
