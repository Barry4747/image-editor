from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
from services.auto_segmentation_services import auto_segment
from PIL import Image

router = APIRouter()
@router.post("/auto_segmentation")
async def get_models(
    model: str = Form(...),
    image: UploadFile = File(...)
):
    """
    Returns a list of masks.
    """
    return JSONResponse({"status": "success", "masks": auto_segment(model, Image.open(image.file).convert("RGB"))})
