import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

from typing import Optional, Tuple
import torch
from PIL import Image, ImageOps
from diffusers import StableDiffusionInpaintPipeline, AutoencoderKL, DPMSolverMultistepScheduler
from torchvision import transforms
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)


class UnifiedInpaintModel:
    """
    Uniwersalna klasa do inpaintingu (SD 1.5, SDXL, RealisticVision, CyberRealistic).
    Różnice między modelami kontrolowane są parametrami load_model() i generate_image().
    """

    def __init__(self, device: Optional[str] = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.pipeline = None
        self.upscaler = None

    # ---------------- helpers ----------------

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

    @staticmethod
    def _to_multiple_of_8(size: Tuple[int, int]) -> Tuple[int, int]:
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

    @staticmethod
    def _ensure_size_align(gen: Image.Image, ref: Image.Image, mask: Image.Image):
        if gen.size != ref.size:
            gen = gen.resize(ref.size, Image.LANCZOS)
        if mask.size != ref.size:
            mask = mask.resize(ref.size, Image.NEAREST)
        return gen, mask

    # ---------------- loading/unloading ----------------

    def load_model(
        self,
        model_path: str,
        torch_dtype: torch.dtype = torch.float16,
        vae_path: Optional[str] = None,
        upscaler_path: Optional[str] = None,
    ):
        """
        Ładowanie modelu z .safetensors lub folderu diffusers.
        - vae_path: opcjonalny VAE (np. dla RealisticVision)
        - upscaler_path: opcjonalny upscaler (np. dla CyberRealistic)
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
                self.pipeline.vae = AutoencoderKL.from_pretrained(
                    vae_path, torch_dtype=torch_dtype
                )

            scheduler = DPMSolverMultistepScheduler.from_config(
                self.pipeline.scheduler.config
            )
            scheduler.use_karras_sigmas = True
            self.pipeline.scheduler = scheduler

            self._enable_speed_optimizations(self.pipeline)
            self.pipeline.to(self.device)

            if upscaler_path and os.path.isfile(upscaler_path):
                self.upscaler = torch.load(upscaler_path, map_location="cpu")
                logger.info(f"Loaded upscaler from {upscaler_path}")

        except Exception as e:
            logger.exception("Error loading inpaint model")
            raise HTTPException(status_code=500, detail=f"Model loading error: {e}")

    def unload_model(self):
        try:
            self.pipeline = None
            self.upscaler = None
            if self.device == "cuda":
                torch.cuda.empty_cache()
        except Exception:
            pass

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
        resize_to: Optional[Tuple[int, int]] = None,
        resize_to_multiple_of_8: bool = True,
        control_image: Optional[Image.Image] = None,
        upscale: bool = False,
    ) -> Image.Image:
        if self.pipeline is None:
            raise HTTPException(status_code=500, detail="Pipeline not loaded")

        init = self._ensure_rgb(init_image)
        mask = self._ensure_l(mask_image)

        # dopasowanie rozmiaru
        if resize_to:
            target_size = resize_to
        elif resize_to_multiple_of_8:
            target_size = self._to_multiple_of_8(init.size)
        else:
            target_size = init.size

        if init.size != target_size:
            init = init.resize(target_size, Image.LANCZOS)
        if mask.size != target_size:
            mask = mask.resize(target_size, Image.NEAREST)

        # logika maski
        if invert_mask_if_needed and not invert_mask:
            mask = self._maybe_invert_mask(mask)
        elif invert_mask:
            mask = self._invert_mask(mask)

        generator = None
        if seed is not None:
            generator = torch.Generator(device=self.device).manual_seed(seed)

        try:
            result = self.pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
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

            if upscale and self.upscaler is not None:
                lr = final
                hr = transforms.functional.resize(
                    lr,
                    (lr.height * 2, lr.width * 2),
                    interpolation=transforms.InterpolationMode.BICUBIC,
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
