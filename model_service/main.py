from fastapi import FastAPI
from routes import editing_routes
from stable_diffusion.registry import ModelManager

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    ModelManager.load_config("models.yaml")

@app.get("/health")
async def health_check():
    return {"status": "ok"}


app.include_router(editing_routes.router)