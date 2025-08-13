from fastapi import FastAPI
from routes import editing_routes

app = FastAPI()

@app.get("/health")
async def health_check():
    return {"status": "ok"}


app.include_router(editing_routes.router)