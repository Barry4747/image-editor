from diffusers import StableDiffusionInpaintPipeline, DPMSolverMultistepScheduler, AutoencoderKL
from PIL import Image, ImageOps, ImageFilter
from stable_diffusion.t2i_base import T2IBase
import torch

class InpaintingModel(T2IBase):
    def load_model(self, model_path: str, vae_path: str = None):
        vae = None
        if vae_path:
            vae = AutoencoderKL.from_pretrained(
                vae_path,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32
            ).to(self.device)

        self.pipeline = StableDiffusionInpaintPipeline.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            variant="fp16" if self.device == "cuda" else None,
            vae=vae  
        ).to(self.device)

        # ustawienie schedulera DPM SDE++ Karras zgodnie z rekomendacją
        self.pipeline.scheduler = DPMSolverMultistepScheduler.from_config(
            self.pipeline.scheduler.config
        )

    def generate_image(
        self, 
        image: Image.Image, 
        mask_image: Image.Image, 
        prompt: str,
        strength: float = 0.4,
        guidance_scale: float = 1.8,   # rekomendowane 1.5-2.0
        steps: int = 5,                # rekomendowane 4-6+
        invert_mask: bool = False
    ) -> Image.Image:
        if self.pipeline is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        if invert_mask:
            mask_image = self.invert_mask(mask_image)

        image = image.convert("RGB")
        mask_image = mask_image.convert("L").filter(ImageFilter.GaussianBlur(2))

        prompt = (
            prompt
            + ", keep the photo similar, change only what is needed, make the photo look natural, realistic, high quality"
        )

        negative_prompt = (
            "bad anatomy, deformed, warped, distorted, ugly, disfigured, weird colors, blurry, low quality, "
            "worst quality, jpeg artifacts, signature, watermark, text, error, missing fingers, extra digit, fewer digits, cropped"
        )

        result = self.pipeline(
            prompt=prompt,
            image=image,
            mask_image=mask_image,
            strength=strength,
            guidance_scale=guidance_scale,
            num_inference_steps=steps,
            negative_prompt=negative_prompt,
        ).images[0]

        return result

    def invert_mask(self, mask: Image.Image) -> Image.Image:
        mask = mask.convert("L")
        inverted_mask = ImageOps.invert(mask)
        return inverted_mask
