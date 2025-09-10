import yaml
import os
import torch
from typing import Dict, Any
from fastapi import HTTPException

from stable_diffusion.controlnet import ControlNet
from stable_diffusion.specifics.realistic_vision import RealisticVision
from stable_diffusion.specifics.cyberrealistic import CyberRealistic
from stable_diffusion.specifics.lustify_sdxl import LustifySDXL
from stable_diffusion.specifics.illustrious import IllustriousPony
from stable_diffusion.sd_inpaint_base import UnifiedInpaintModel
from stable_diffusion.sdxl_inpaint_base import SDXLInpaintModel
from auto_segmentation.SAM import SAMSegmenter
from upscalers.realesrganupscaler import RealESRGANUpscaler
from stable_diffusion.sdxl_t2i_base import SDXLTextToImageModel
from stable_diffusion.t2i_base import SDTextToImageModel

CLASS_MAP = {
    "ControlNetModelWrapper": ControlNet,
    "RealisticVisionModelWrapper": RealisticVision,
    "CyberRealisticModelWrapper": CyberRealistic,
    "LustifyModelWrapper": LustifySDXL,
    "IllustriousPonyModelWrapper": IllustriousPony,
    "SDXLInpaintModelWrapper": SDXLInpaintModel,
    "UnifiedInpaintModelWrapper": UnifiedInpaintModel,
    
    "RealESRGANUpscalerWrapper": RealESRGANUpscaler,
    
    "SamModelWrapper": SAMSegmenter,

    "SDTextToImageModelWrapper": SDTextToImageModel,
    "SDXLTextToImageModelWrapper": SDXLTextToImageModel,
}
import dotenv
import os
import logging


dotenv.load_dotenv()


class ModelManager:
    _instances: Dict[str, Any] = {}
    _is_t2i = False
    _model_map: Dict[str, Any] = {}

    @classmethod
    def load_config(cls, config_path: str = None):
        if not config_path:
            config_path = os.getenv("MODELS_YAML_PATH", "models.yaml")
        print(f"Trying to load models config from: {config_path}")
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file {config_path} not found")

        with open(config_path, "r") as f:
            config = yaml.safe_load(f)

        cls._model_map = config.get("models", {})
        cls._auto_segmantation_map = config.get("auto_segmantation", {})
        cls._upscaler_map = config.get("upscalers", {})

    @classmethod
    def list_models(cls):
        return list(cls._model_map.keys())
    
    @classmethod
    def list_t2i_models(cls):
        models =  list(cls._model_map.keys())
        return [ model for model in models if cls._model_map[model].get("class_t2i") ]
    
    @classmethod
    def list_upscalers(cls):
        return list(cls._upscaler_map.keys())

    @staticmethod
    def _get_free_vram_gb() -> float:
        """ Returns free VRAM in GB."""
        if not torch.cuda.is_available():
            return 0.0
        free, total = torch.cuda.mem_get_info()
        return free / (1024**3)  

    @classmethod
    def get_model(cls, model_name: str, t2i=False):
        if model_name not in cls._model_map:
            raise ValueError(f"Unknown model: {model_name}")

        if model_name not in cls._instances or cls._is_t2i is not t2i :
            model_info = cls._model_map[model_name]
            if t2i and model_info.get("class_t2i"):
                model_class_name = model_info["class_t2i"]
            elif t2i:
                raise ValueError(f"Model does not support text to image pipeline: {model_name}")
            else:
                model_class_name = model_info["class"]
            model_path = model_info["path"]
            
            print(f"Loading {model_class_name}")

            required_vram = model_info.get("required_vram")
            if not required_vram:
                required_vram = 10

            free_gb = cls._get_free_vram_gb()
            if free_gb < float(required_vram):
                models = cls._find_models_to_unload(required_vram - free_gb)
                if models:
                    for m in models:
                        cls.unload_model(m)
                    free_gb = cls._get_free_vram_gb()

            extra_kwargs = {}
            if "vae" in model_info:
                extra_kwargs["vae_path"] = model_info.get("vae")
            if "controlnet_path" in model_info:
                extra_kwargs["controlnet_path"] = model_info.get("controlnet_path")

            if model_class_name not in CLASS_MAP:
                raise ValueError(f"Unknown class: {model_class_name}")

            model_class = CLASS_MAP[model_class_name]
            instance = model_class()
            instance.load_model(
                model_path,
                **extra_kwargs,
            )
            cls._instances[model_name] = instance

        return cls._instances[model_name]
    
    @classmethod
    def get_auto_segmentation_model(cls, model_name: str):
        if model_name not in cls._auto_segmantation_map:
            raise ValueError(f"Unknown auto segmentation model: {model_name}")
        
        model_info = cls._auto_segmantation_map[model_name]
        model_class_name = model_info["class"]
        model_path = model_info["path"]
        model_type = model_info["type"]
        required_vram = model_info.get("required_vram", 8)

        free_gb = cls._get_free_vram_gb()
        if free_gb < float(required_vram):
            models = cls._find_models_to_unload(required_vram - free_gb)
            if models:
                for m in models:
                    cls.unload_model(m)
                free_gb = cls._get_free_vram_gb()

        if model_class_name not in CLASS_MAP:
            raise ValueError(f"Unknown class: {model_class_name}")
        model_class = CLASS_MAP[model_class_name]
        instance = model_class(model_type=model_type)

        instance.load_model(model_path)

        cls._instances[model_name] = instance


        return cls._instances[model_name]
    

    @classmethod
    def get_upscaler(cls, model_name: str):
        if model_name not in cls._upscaler_map:
            raise ValueError(f"Unknown upscaler: {model_name}")
        
        model_info = cls._upscaler_map[model_name]
        model_class_name = model_info["class"]
        model_path = model_info["path"]
        required_vram = model_info.get("required_vram", 8)

        free_gb = cls._get_free_vram_gb()
        if free_gb < float(required_vram):
            models = cls._find_models_to_unload(required_vram - free_gb)
            if models:
                for m in models:
                    cls.unload_model(m)
                free_gb = cls._get_free_vram_gb()

        if model_class_name not in CLASS_MAP:
            raise ValueError(f"Unknown class: {model_class_name}")
        model_class = CLASS_MAP[model_class_name]
        instance = model_class()

        num_block = model_info.get("num_block", 23)
        num_feat = model_info.get("num_feat", 64)
        num_grow_ch = model_info.get("num_grow_ch", 32)
        scale = model_info.get("scale", 4)

        instance.load_model(
            model_path=model_path,
            model_name=model_name,
            scale=scale,
            num_block=num_block,
            num_feat=num_feat,
            num_grow_ch=num_grow_ch
        )

        cls._instances[model_name] = instance
        return cls._instances[model_name]

    @classmethod
    def unload_model(cls, model_name: str):
        if model_name in cls._instances:
            cls._instances[model_name].unload_model()
            del cls._instances[model_name]

    @classmethod
    def switch_model(cls, old_model: str, new_model: str):
        if old_model == new_model:
            return cls.get_model(old_model)
        cls.unload_model(old_model)
        return cls.get_model(new_model)
    
    @classmethod
    def _find_models_to_unload(cls, required_vram: float) -> list:
        """Finds models to unload to free up the required VRAM."""

        combined_map = {}
        combined_map.update(cls._model_map)
        combined_map.update(cls._auto_segmantation_map)
        combined_map.update(cls._upscaler_map)

        sorted_models = sorted(
            cls._instances.items(),
            key=lambda item: combined_map.get(item[0], {}).get("required_vram", 10),
            reverse=True
        )

        to_unload = []
        freed_vram = 0.0

        for model_name, instance in sorted_models:
            model_info = combined_map.get(model_name, {})
            model_vram = model_info.get("required_vram", 10)
            to_unload.append(model_name)
            freed_vram += model_vram
            if freed_vram >= required_vram:
                break

        return to_unload
