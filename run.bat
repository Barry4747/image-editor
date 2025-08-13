
@echo off

REM Uruchom frontend (npm) w osobnym oknie
start cmd /k "cd frontend && npm start"

REM Uruchom backend Django z aktywacją venv w cmd
start cmd /k "cd backend && call C:/Users/Bartek/Desktop/ImageGenerator-main\venv310\Scripts\activate.bat && python manage.py runserver 0.0.0.0:8000"

REM Uruchom FastAPI model_service z aktywacją venv w cmd
start cmd /k "cd model_service && call C:/Users/Bartek/Desktop/ImageGenerator-main\venv310\Scripts\activate.bat && uvicorn main:app --reload --port 8001 --log-level info"
