from fastapi import APIRouter, UploadFile, Form
from fastapi.responses import JSONResponse
import os
from services.editing_services import process_image_file
import shutil

router = APIRouter()

@router.post("/process-image")
async def process_image(
    image: UploadFile,
    mask: UploadFile = None,
    prompt: str = Form(...),
    job_id: int = Form(...)
):
    temp_path = os.path.join("media", f"temp_{image.filename}")
    os.makedirs(os.path.dirname(temp_path), exist_ok=True)
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(image.file, f)

    output_path = process_image_file(temp_path)

    return JSONResponse({"output_url": output_path})
