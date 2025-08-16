import torch
import gc

class T2IBase:
    def __init__(self):
        self.pipeline = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def load_model(self, model_path: str):
        raise NotImplementedError

    def unload_model(self):
        if self.pipeline is not None:
            del self.pipeline
            self.pipeline = None
            gc.collect()
            if self.device == "cuda":
                torch.cuda.empty_cache()

    def generate_image(self, *args, **kwargs):
        raise NotImplementedError