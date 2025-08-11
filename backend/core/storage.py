import os
import uuid
from django.conf import settings

def save_image(file, session_id):
    filename = f"{uuid.uuid4()}.png"
    dir_path = os.path.join(settings.MEDIA_ROOT, session_id)
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)
    with open(file_path, "wb") as f:
        for chunk in file.chunks():
            f.write(chunk)
    return file_path
