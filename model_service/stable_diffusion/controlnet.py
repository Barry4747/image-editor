import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import torch
from diffusers import (
    StableDiffusionControlNetPipeline,
    StableDiffusionControlNetInpaintPipeline,
    StableDiffusionImg2ImgPipeline,
    ControlNetModel,
    AutoencoderKL,
)
from PIL import Image
from .t2i_base import T2IBase

import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)

class ControlNet(T2IBase):
    def __init__(self, inpaint: bool = True):
        super().__init__()
        self.inpaint = inpaint
        self.pipeline = None
        self.img2img_pipeline = None

    def _enable_speed_optimizations(self, pipeline):
        # VAE i UNet optymalizacje pod GPU
        if hasattr(pipeline, "enable_vae_slicing"):
            pipeline.enable_vae_slicing()
        if hasattr(pipeline, "enable_vae_tiling"):
            pipeline.enable_vae_tiling()
        if hasattr(pipeline, "enable_attention_slicing"):
            pipeline.enable_attention_slicing()
        try:
            pipeline.enable_xformers_memory_efficient_attention()
        except Exception:
            pass

        try:
            pipeline.unet.to(memory_format=torch.channels_last)
            pipeline.unet.half()
        except Exception:
            pass

        try:
            if pipeline.vae is not None:
                pipeline.vae.to(memory_format=torch.channels_last)
                pipeline.vae.half()
        except Exception:
            pass

    def load_model(self, model_path: str, vae_path: str = None, controlnet_path: str = None):
        torch.cuda.empty_cache()
        try:
            controlnet = ControlNetModel.from_pretrained(controlnet_path, torch_dtype=torch.float16)
        except Exception as e:
            logger.exception("Błąd przy ładowaniu ControlNet")
            raise HTTPException(status_code=500, detail=f"Błąd przy ładowaniu ControlNet: {e}")

        pipeline_cls = StableDiffusionControlNetInpaintPipeline if self.inpaint else StableDiffusionControlNetPipeline

        try:
            self.pipeline = pipeline_cls.from_pretrained(
                model_path,
                controlnet=controlnet,
                torch_dtype=torch.float16,
                safety_checker=None,
                feature_extractor=None
            )
        except Exception as e:
            logger.exception("Błąd przy ładowaniu pipeline")
            raise HTTPException(status_code=500, detail=f"Błąd przy ładowaniu pipeline: {e}")

        # osobny pipeline dla Pass 1 (img2img)
        try:
            self.img2img_pipeline = StableDiffusionImg2ImgPipeline.from_pretrained(
                model_path,
                torch_dtype=torch.float16,
                safety_checker=None,
                feature_extractor=None
            )
        except Exception as e:
            logger.exception("Błąd przy ładowaniu img2img pipeline")
            raise HTTPException(status_code=500, detail=f"Błąd przy ładowaniu img2img pipeline: {e}")

        if vae_path:
            try:
                self.pipeline.vae = AutoencoderKL.from_pretrained(vae_path, torch_dtype=torch.float16)
                self.img2img_pipeline.vae = AutoencoderKL.from_pretrained(vae_path, torch_dtype=torch.float16)
            except Exception as e:
                logger.exception("Błąd przy ładowaniu VAE")
                raise HTTPException(status_code=500, detail=f"Błąd przy ładowaniu VAE: {e}")

        self._enable_speed_optimizations(self.pipeline)
        self._enable_speed_optimizations(self.img2img_pipeline)

        device = "cuda" if torch.cuda.is_available() else self.device
        self.pipeline.to(device)
        self.img2img_pipeline.to(device)

    def generate_image(
        self,
        control_image: Image.Image,
        prompt: str,
        negative_prompt: str = "",
        strength: float = 0.25,
        guidance_scale: float = 7.5,
        steps: int = 30,
        seed: int = None,
        mask_image: Image.Image = None,
        init_image: Image.Image = None,
    ) -> Image.Image:
        if self.device == "cuda":
            torch.cuda.empty_cache()
        generator = torch.Generator(device=self.device).manual_seed(seed) if seed else None

        # --- Pass 1: img2img (init_image) ---
        if init_image:
            pass1_result = self.img2img_pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=init_image,
                strength=strength,
                guidance_scale=guidance_scale,
                num_inference_steps=steps,
                generator=generator
            )
            intermediate_image = pass1_result.images[0]
        else:
            intermediate_image = control_image

        # --- Pass 2: ControlNet ---
        kwargs = dict(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            controlnet_conditioning_scale=1.0,
            generator=generator,
            image=intermediate_image,
            control_image=control_image,
            mask_image=mask_image,
        )

        try:
            result = self.pipeline(**kwargs)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            raise HTTPException(status_code=500, detail="Brak pamięci GPU podczas generacji obrazu")

        return result.images[0]
