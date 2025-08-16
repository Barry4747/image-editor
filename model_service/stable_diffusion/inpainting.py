from diffusers import StableDiffusionInpaintPipeline
from PIL import Image
from stable_diffusion.t2i_base import T2IBase
import torch
from PIL import ImageOps

class InpaintingModel(T2IBase):
    def load_model(self, model_path: str):
        self.pipeline = StableDiffusionInpaintPipeline.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            variant="fp16" if self.device == "cuda" else None,
        ).to(self.device)

    def generate_image(
        self, 
        image: Image.Image, 
        mask_image: Image.Image, 
        prompt: str,
        strength: float = 0.75,
        guidance_scale: float = 8.5,
        steps: int = 30,
        invert_mask: bool = False
    ) -> Image.Image:
        if self.pipeline is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        if invert_mask:
            mask_image = self.invert_mask(mask_image)

        prompt = prompt + ", keep the photo similar, change only what needed, make the photo look natural, realistic, and high quality, "

        result = self.pipeline(
            prompt=prompt,
            image=image,
            mask_image=mask_image,
            strength=strength,
            guidance_scale=guidance_scale,
            num_inference_steps=100,
            negative_prompt = "bad anatomy, deformed, ugly, disfigured, weird colors, blurry, low quality, bad quality, worst quality, jpeg artifacts, signature, watermark, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality",
        ).images[0]
        return result


    def invert_mask(self, mask: Image.Image) -> Image.Image:
        mask = mask.convert("L")
        inverted_mask = ImageOps.invert(mask)
        return inverted_mask