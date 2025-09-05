import torch
import numpy as np
from PIL import Image
from realesrgan import RealESRGANer
from basicsr.archs.rrdbnet_arch import RRDBNet



class RealESRGANUpscaler:
    def __init__(self, device: str = None):
        """
        Args:
            device: "cuda" or "cpu". If None, auto-detect.
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.upsampler = None
        self.model_name = None

    def load_model(self, model_path: str, model_name: str = "realesrgan-x4plus", scale: int = 4,
                   num_block: int = 23, num_feat: int = 64, num_grow_ch: int = 32):
        """
        Load Real-ESRGAN model from a given checkpoint path.
        """
        if self.upsampler is not None:
            return  

        if not model_path or not model_path.endswith('.pth'):
            raise ValueError("model_path cannot be None or empty and should end with .pth")
        self.scale = scale
        model = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            scale=scale,
            num_feat=num_feat,
            num_block=num_block,
            num_grow_ch=num_grow_ch
        )


        self.upsampler = RealESRGANer(
            scale=scale,
            model_path=model_path,
            model=model,
            tile=256,
            tile_pad=10,
            pre_pad=0,
            half=self.device == "cuda",
            device=self.device,
        )

        self.model_name = model_name


    def unload_model(self):
        """
        Free GPU memory by unloading the model.
        """
        self.upsampler = None
        self.model_name = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def upscale(self, image: Image.Image) -> Image.Image:
        """
        Upscale a PIL image and return the result as a PIL image.

        Args:
            image: input PIL.Image.Image
            scale: upscale factor

        Returns:
            output_image: upscaled PIL.Image.Image
        """
        if self.upsampler is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        img_array = np.array(image.convert("RGB"))
        output, _ = self.upsampler.enhance(img_array, outscale=self.scale)

        return Image.fromarray(output)
