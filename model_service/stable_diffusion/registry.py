import yaml
import os
from typing import Dict, Any
from .inpainting import InpaintingModel

CLASS_MAP = {
    "InpaintingModel": InpaintingModel,
}

class ModelManager:
    _instances: Dict[str, Any] = {}
    _model_map: Dict[str, Any] = {}

    @classmethod
    def load_config(cls, config_path: str = "models.yaml"):
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file {config_path} not found")

        with open(config_path, "r") as f:
            config = yaml.safe_load(f)
        
        cls._model_map = config.get("models", {})

    @classmethod
    def get_model(cls, model_name: str):
        if model_name not in cls._model_map:
            raise ValueError(f"Unknown model: {model_name}")

        if model_name not in cls._instances:
            model_info = cls._model_map[model_name]
            model_class_name = model_info["class"]
            model_path = model_info["path"]
            vae_path = model_info["vae"]

            if model_class_name not in CLASS_MAP:
                raise ValueError(f"Unknown class: {model_class_name}")

            model_class = CLASS_MAP[model_class_name]
            instance = model_class()
            instance.load_model(model_path, vae_path=vae_path)
            cls._instances[model_name] = instance

        return cls._instances[model_name]

    @classmethod
    def unload_model(cls, model_name: str):
        if model_name in cls._instances:
            cls._instances[model_name].unload_model()
            del cls._instances[model_name]
