import cv2
import numpy as np
from PIL import Image


def preprocess_canny(pil_image: Image.Image, low_threshold=100, high_threshold=200) -> Image.Image:
    """Generates Canny edges from a PIL image."""
    np_img = np.array(pil_image)
    np_gray = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(np_gray, low_threshold, high_threshold)
    edges_rgb = np.stack([edges] * 3, axis=-1)
    return Image.fromarray(edges_rgb)
