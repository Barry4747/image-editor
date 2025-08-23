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

class LustifySDXL:
    """
    Inpainting / full generation pipeline for SDXL.
    Obsługuje prompt + negative_prompt, rekomendowane ustawienia SDXL i optymalizacje VRAM.
    """

    def __init__(self, device: Optional[str] = None, upscaler_path: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None
        self.upscaler = None
        self.upscaler_path = upscaler_path

    # ------------- Optimizations -------------
    def _enable_speed_optimizations(self, pipe):
        try:
            if hasattr(torch.nn.functional, 'scaled_dot_product_attention'):
                pipe.unet.set_attn_processor()
            else:
                pipe.enable_xformers_memory_efficient_attention()
        except Exception:
            pass
        
        if torch.cuda.get_device_properties(0).total_memory < 16 * 1024**3: 
            pipe.enable_attention_slicing()
        
        try:
            pipe.unet.to(memory_format=torch.channels_last)
            if torch.cuda.get_device_properties(0).total_memory >= 12 * 1024**3:
                pipe.unet.float()
                if pipe.vae is not None:
                    pipe.vae.float()
        except Exception:
            pass

    # ------------- Load / Unload -------------
    def load_model(
        self, 
        model_path: str, 
        torch_dtype: torch.dtype = torch.float16, 
        vae_path: Optional[str] = None, 
        controlnet_path: Optional[str] = None
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

            self.pipeline.scheduler = EulerAncestralDiscreteScheduler.from_config(self.pipeline.scheduler.config)

            self.pipeline.to(self.device)

            if self.upscaler_path and os.path.isfile(self.upscaler_path):
                self.upscaler = torch.load(self.upscaler_path, map_location="cpu")
                logger.info(f"Loaded upscaler from {self.upscaler_path}")

        except Exception as e:
            logger.exception("Error loading SDXL model")
            raise HTTPException(status_code=500, detail=f"Model loading error: {e}")

    def unload_model(self):
        self.pipeline = None
        self.upscaler = None
        if self.device == "cuda":
            torch.cuda.empty_cache()

    # ------------- Helpers -------------
    @staticmethod
    def _ensure_rgb(img: Image.Image) -> Image.Image:
        return img.convert("RGB")

    @staticmethod
    def _ensure_l(img: Image.Image) -> Image.Image:
        return img.convert("L")

    @staticmethod
    def _resize_to(img: Image.Image, size: tuple) -> Image.Image:
        return img.resize(size, Image.LANCZOS)

    # ------------- Generation -------------
    def generate_image(
        self,
        *,
        prompt: str,
        negative_prompt: str = "grain, noise, speckles, film grain, grainy, lowres, worst quality, low quality, jpeg artifacts, ugly, duplicate, blurry, deformed",
        init_image: Optional[Image.Image] = None,
        mask_image: Optional[Image.Image] = None,
        steps: int = 50,  
        guidance_scale: float = 7.0,  
        strength: float = 0.7,
        seed: Optional[int] = None,
        keep_background: bool = True,
        invert_mask: bool = True,
        control_image: Optional[Image.Image] = None,
    ) -> Image.Image:

        if self.pipeline is None:
            raise HTTPException(status_code=500, detail="Pipeline not loaded")

        if strength > 0.8:
            steps = max(steps, 60)

        if init_image is None:
            init_image = Image.new("RGB", (1024, 1024), color=(255, 255, 255))
        if mask_image is None:
            mask_image = Image.new("L", (init_image.width, init_image.height), color=255)

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
                eta=0.0,
                output_type="pil",
            )
            gen = result.images[0]
            gen = gen.resize(init_image.size, Image.LANCZOS)

            if keep_background:
                final = Image.composite(gen, init_image, mask_image)
            else:
                final = gen

            if self.upscaler is not None:
                lr = final
                hr = transforms.functional.resize(
                    lr, (lr.width * 2, lr.height * 2), interpolation=transforms.InterpolationMode.BICUBIC
                )
                final = hr
            
            return final

        except torch.cuda.OutOfMemoryError:
            if self.device == "cuda":
                torch.cuda.empty_cache()
            raise HTTPException(status_code=500, detail="VRAM out of memory")
        except Exception as e:
            logger.exception("Generation error")
            raise HTTPException(status_code=500, detail=f"Generation error: {e}")
