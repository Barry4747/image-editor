from fastapi import FastAPI
from routes import editing_routes, auto_segmentation, upscaler_routes
from services.registry import ModelManager

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    ModelManager.load_config("models.yaml")

@app.get("/health")
async def health_check():
    return {"status": "ok"}


app.include_router(editing_routes.router)
app.include_router(auto_segmentation.router)
app.include_router(upscaler_routes.router)