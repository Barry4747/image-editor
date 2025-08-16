from fastapi import APIRouter, UploadFile, Form
from fastapi.responses import JSONResponse
import io
from services.editing_services import process_image_file, convert_system_path_to_url
from PIL import Image

router = APIRouter()

@router.post("/process-image")
async def process_image(
    image: UploadFile,
    mask: UploadFile = None,
    prompt: str = Form(...),
    job_id: int = Form(...),
    model: str = Form("sd-inpainting"),
    strength: float = Form(0.75),
    guidance_scale: float = Form(7.5),
    steps: int = Form(30)
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
    )

    return JSONResponse({"output_url": output_path})
