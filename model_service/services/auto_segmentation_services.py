from services.registry import ModelManager
import PIL
import numpy as np

def auto_segment(
        model_name: str,
        image: PIL.Image.Image,
):
    model = ModelManager.get_auto_segmentation_model(model_name)

    masks = model.auto_segment(image)

    ModelManager.unload_model(model_name)
    masks_list = []
    for mask in masks:
        if isinstance(mask, dict):
            mask_copy = mask.copy()
            if isinstance(mask_copy.get('segmentation'), np.ndarray):
                mask_copy['segmentation'] = mask_copy['segmentation'].astype(int).tolist()
            masks_list.append(mask_copy)
        elif isinstance(mask, np.ndarray):
            masks_list.append(mask.astype(int).tolist())
        else:
            raise TypeError(f"Unexpected mask type: {type(mask)}")

    return masks_list 
