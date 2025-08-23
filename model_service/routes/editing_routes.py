from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
import io
from services.editing_services import process_image_file
from PIL import Image
from stable_diffusion.registry import ModelManager

router = APIRouter()

@router.post("/process-image")
async def process_image(
    image: UploadFile,
    mask: UploadFile = File(None),
    prompt: str = Form(...),
    job_id: int = Form(...),
    model: str = Form("lustify-sdxl"),
    strength: float = Form(0.75),
    guidance_scale: float = Form(9.5),
    steps: int = Form(40),
    passes: int = Form(4),
):
    input_img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    mask_img = None
    if mask:
        mask_img = Image.open(io.BytesIO(await mask.read())).convert("RGB")

    output_path = process_image_file(
        input_img=input_img,
        mask_img=mask_img,
        prompt=prompt,
        job_id=job_id,
        model=model,
        strength=strength,
        guidance_scale=guidance_scale,
        steps=steps,
        passes=passes,
    )

    return JSONResponse({"output_url": output_path})

@router.get("/models")
async def get_models():
    """
    Returns a list of available models.
    """
    models = ModelManager.list_models()

    if not models:
        status = "error"
    else:
        status = "success"
    return JSONResponse({"status": status, "models": models})
