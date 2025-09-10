from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
from services.registry import ModelManager
from PIL import Image
import io
from dotenv import load_dotenv
import os
import uuid
from services.editing_services import convert_system_path_to_url

load_dotenv()

BASE_MEDIA_ROOT = os.getenv("MEDIA_ROOT", "/data/media")
MEDIA_ROOT = os.path.join(BASE_MEDIA_ROOT, "upscaled")
MEDIA_URL = "/media/"

router = APIRouter()

@router.post("/upscale")
async def upscale_image(
    image: UploadFile = File(...),
    model: str = Form("realesrgan-x4plus"),
):
    img_bytes = await image.read()
    pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    model = ModelManager.get_upscaler(model_name=model)
    upscaled = model.upscale(pil_image)

    

    filename = f"upscaled_{uuid.uuid4().hex}.png"
    output_path = os.path.join(MEDIA_ROOT, filename)

    os.makedirs(MEDIA_ROOT, exist_ok=True)

    upscaled.save(output_path)
    return {"status": "success", "output_url": convert_system_path_to_url(output_path)}
