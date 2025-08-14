from fastapi import APIRouter, UploadFile, Form
from fastapi.responses import JSONResponse
import os
from services.editing_services import process_image_file, convert_system_path_to_url
from fastapi import HTTPException
import shutil

router = APIRouter()

@router.post("/process-image")
async def process_image(
    image: UploadFile,
    mask: UploadFile = None,
    prompt: str = Form(...),
    job_id: int = Form(...)
):
    # simple mock logic for now
    temp_path = os.path.join("media", f"temp_{image.filename}")
    os.makedirs(os.path.dirname(temp_path), exist_ok=True)
    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(image.file, f)

        # Przetwarzanie obrazu - teraz zwraca ścieżkę systemową
        system_path = process_image_file(temp_path)
        
        # Konwersja ścieżki systemowej na URL
        output_url = convert_system_path_to_url(system_path)
        
        return JSONResponse({
            "output_url": output_url,
            "system_path": system_path  # opcjonalnie, do debugowania
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Sprzątanie tymczasowego pliku
        if os.path.exists(temp_path):
            os.remove(temp_path)
