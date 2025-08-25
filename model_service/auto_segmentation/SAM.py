import torch
import numpy as np
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
from fastapi import HTTPException
import logging
import PIL


logger = logging.getLogger(__name__)


class SAMSegmenter:
    """
    Autosegmentation using Meta's Segment Anything Model (SAM).
    """

    def __init__(self, model_type: str = "vit_h", device: str = None):
        self.model_type = model_type
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.sam = None
        self.mask_generator = None

    # ------------- Loading / Unloading -------------

    def load_model(self, checkpoint_path: str):
        """Loads the SAM model from the specified checkpoint."""
        try:
            logger.info(f"Loading SAM {self.model_type} z {checkpoint_path} na {self.device}")
            self.sam = sam_model_registry[self.model_type](checkpoint=checkpoint_path)
            self.sam.to(device=self.device)
            self.mask_generator = SamAutomaticMaskGenerator(self.sam)
        except Exception as e:
            logger.exception("Loading while loading SAM")
            raise HTTPException(status_code=500, detail=f"Error loading SAM: {e}")

    def unload_model(self):
        """Unloads the SAM model to free up VRAM."""
        try:
            if self.sam is not None:
                del self.sam
                self.sam = None
            self.mask_generator = None
            if self.device == "cuda":
                torch.cuda.empty_cache()
        except Exception as e:
            logger.warning(f"Error while unloading SAM: {e}")

    # ------------- Segmentation -------------

    def auto_segment(self, image: PIL.Image.Image):
        """
        image: PIL.Image.Image (RGB)
        return: list[dict] — masks SAM
        """
        if self.mask_generator is None:
            raise HTTPException(status_code=500, detail="SAM not loaded")

        try:
            # konwersja PIL -> numpy (RGB)
            if image.mode != "RGB":
                image = image.convert("RGB")
            np_image = np.array(image)

            masks = self.mask_generator.generate(np_image)
            return masks
        except Exception as e:
            logger.exception("Error while segmenting")
            raise HTTPException(status_code=500, detail=f"Segmentation error: {e}")