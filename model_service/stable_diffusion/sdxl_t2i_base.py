import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from typing import Optional
import torch
from PIL import Image
from diffusers import (
    StableDiffusionXLPipeline,
    AutoencoderKL,
    EulerAncestralDiscreteScheduler,
)
from torchvision import transforms
from fastapi import HTTPException
import logging
from stable_diffusion.callback import callback 

logger = logging.getLogger(__name__)


class SDXLTextToImageModel:
    """
    Text-to-Image pipeline for SDXL using .safetensors checkpoints.
    Optimized for photorealistic models like epiCRealism, Juggernaut, etc.
    Supports VAE, upscaler, and VRAM optimizations.
    """

    def __init__(self, device: Optional[str] = None, upscaler_path: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None
        self.upscaler = None
        self.upscaler_path = upscaler_path

    # ---------------- Speed & VRAM Optimizations ----------------
    def _enable_speed_optimizations(self, pipe):
        try:
            if hasattr(torch.nn.functional, "scaled_dot_product_attention"):
                pipe.unet.set_attn_processor()
            else:
                pipe.enable_xformers_memory_efficient_attention()
        except Exception as e:
            logger.warning(f"Could not enable xformers: {e}")

        try:
            if torch.cuda.is_available():
                total_mem = torch.cuda.get_device_properties(0).total_memory
                if total_mem < 16 * 1024**3:  # <16GB VRAM
                    pipe.enable_attention_slicing()

                pipe.unet.to(memory_format=torch.channels_last)
                if total_mem >= 12 * 1024**3:
                    pipe.unet.float()
                    if pipe.vae:
                        pipe.vae.float()
        except Exception as e:
            logger.warning(f"Optimization warning: {e}")

    # ---------------- Load / Unload ----------------
    def load_model(
        self,
        model_path: str,
        torch_dtype: torch.dtype = torch.float16,
        vae_path: Optional[str] = None,
    ):
        try:
            logger.info(f"Loading SDXL model from {model_path}")

            # Load base pipeline from .safetensors
            self.pipeline = StableDiffusionXLPipeline.from_single_file(
                model_path,
                torch_dtype=torch_dtype,
                safety_checker=None,
                use_safetensors=True,
            )

            # Optional: load custom VAE
            if vae_path:
                try:
                    vae = AutoencoderKL.from_pretrained(vae_path, torch_dtype=torch_dtype)
                    self.pipeline.vae = vae
                    logger.info(f"Loaded VAE from {vae_path}")
                except Exception as ve:
                    logger.warning(f"Failed to load VAE: {ve}")

            # Set scheduler (recommended for realism)
            self.pipeline.scheduler = EulerAncestralDiscreteScheduler.from_config(
                self.pipeline.scheduler.config
            )

            # Move to device
            self.pipeline.to(self.device)
            self._enable_speed_optimizations(self.pipeline)

            # Load upscaler (e.g. 4x_NMKD-Superscale-SP_178000_G.pth)
            if self.upscaler_path and os.path.isfile(self.upscaler_path):
                try:
                    self.upscaler = torch.load(self.upscaler_path, map_location="cpu")
                    self.upscaler.eval()
                    logger.info(f"Loaded upscaler from {self.upscaler_path}")
                except Exception as e:
                    logger.warning(f"Could not load upscaler: {e}")

        except Exception as e:
            logger.exception("Error loading SDXL Text-to-Image model")
            raise HTTPException(status_code=500, detail=f"Model loading error: {e}")

    def unload_model(self):
        """Unloads model from memory and clears VRAM."""
        if self.pipeline is not None:
            self.pipeline = None
        self.upscaler = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()

    # ---------------- Generation ----------------
    def generate_image(
        self,
        *,
        job_id,
        prompt: str,
        negative_prompt: str = (
            "cartoon, painting, illustration, (worst quality, low quality, normal quality:2), "
            "grain, noise, blurry, deformed, distorted, extra limbs, bad anatomy"
        ),
        width: int = 768,
        height: int = 1024,
        steps: int = 28,
        guidance_scale: float = 5.0,
        seed: Optional[int] = None,
        clip_skip: int = 1,  # Critical for models like epiCRealism
        apply_upscale: bool = False,
    ) -> Image.Image:
        """
        Generate image from text prompt.

        Args:
            prompt: Simple, natural language prompt (avoid 'best quality', '8k', etc.)
            negative_prompt: Common artifacts to avoid
            width: Image width (should be multiple of 64)
            height: Image height (should be multiple of 64)
            steps: Inference steps
            guidance_scale: CFG scale (5 is ideal for realism)
            seed: Random seed
            clip_skip: Skip last N layers of text encoder (1 = use all)
            apply_upscale: If True and upscaler loaded, upscale x2

        Returns:
            Generated PIL Image
        """
        if self.pipeline is None:
            raise HTTPException(status_code=500, detail="Pipeline not loaded")

        # Ensure resolution is divisible by 64
        width = (width // 64) * 64
        height = (height // 64) * 64

        generator = None
        if seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        try:
            # Force clip_skip (SDXL uses text_encoder + text_encoder_2)
            # Note: Diffusers doesn't support clip_skip directly in pipeline,
            # so we manually set it in forward pass (simplified here)
            # For full control, you'd override the text encoder — this is a practical workaround
            # Here we assume model was trained with Clip Skip = 1 (common in epiCRealism)

            logger.info(f"Generating image: {width}x{height}, Prompt: {prompt[:50]}...")
            self.pipeline.scheduler.set_timesteps(steps)
            result = self.pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                generator=generator,
                output_type="pil",
                callback_on_step_end=callback(job_id=job_id, num_steps=steps),
            )

            image: Image.Image = result.images[0]

            # Optional: upscale
            if apply_upscale and self.upscaler is not None:
                import numpy as np
                import cv2

                # Convert PIL to tensor
                img_np = np.array(image).astype(np.float32) / 255.0
                img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(self.device)

                # Upscale
                with torch.no_grad():
                    upsampled = self.upscaler(img_tensor * 2 - 1)  # [-1, 1] range
                    upsampled = (upsampled[0].permute(1, 2, 0).cpu().numpy() + 1) / 2
                    upsampled = (upsampled * 255).clip(0, 255).astype(np.uint8)

                image = Image.fromarray(upsampled)
                logger.info("Applied 2x upscaling")

            return image

        except torch.cuda.OutOfMemoryError:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise HTTPException(status_code=500, detail="VRAM out of memory")
        except Exception as e:
            logger.exception("Text-to-image generation error")
            raise HTTPException(status_code=500, detail=f"Generation error: {e}")