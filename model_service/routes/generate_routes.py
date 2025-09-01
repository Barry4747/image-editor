from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
import io
from services.generate_services import generate_image_file
from PIL import Image
from services.registry import ModelManager

router = APIRouter()

@router.post("/generate-image")
async def process_image(
    prompt: str = Form(...),
    negative_prompt: str = Form(None),
    job_id: int = Form(...),
    model: str = Form("lustify-sdxl"),
    guidance_scale: float = Form(9.5),
    steps: int = Form(40),
    seed: int = Form(None),
):

    output_path = generate_image_file(
        prompt=prompt,
        negative_prompt = negative_prompt,
        job_id=job_id,
        model=model,
        guidance_scale=guidance_scale,
        steps=steps,
        seed=seed,
    )

    return JSONResponse({"output_url": output_path})

@router.get("/t2i-models")
async def get_models():
    """
    Returns a list of available models.
    """
    models = ModelManager.list_t2i_models()

    if not models:
        status = "error"
    else:
        status = "success"
    return JSONResponse({"status": status, "models": models})

@router.get("/upscalers")
async def get_models():
    """
    Returns a list of available models.
    """
    upscalers = ModelManager.list_upscalers()

    if not upscalers:
        status = "error"
    else:
        status = "success"
    return JSONResponse({"status": status, "upscalers": upscalers})
