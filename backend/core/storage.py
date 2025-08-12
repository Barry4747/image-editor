import os
import uuid
from django.conf import settings

def save_image(file, session_id):
    print(f"Saving image for session {session_id} with file name {file.name}")
    print(f"File size: {file.size}")

    filename = f"{uuid.uuid4()}.png"
    dir_path = os.path.join(settings.MEDIA_ROOT, session_id)
    os.makedirs(dir_path, exist_ok=True)

    file_path = os.path.join(dir_path, filename)
    print(f"File will be saved to {file_path}")

    try:
        with open(file_path, "wb") as f:
            # Spróbuj zapisać całe naraz
            f.write(file.read())
    except Exception as e:
        print(f"Error while saving file: {e}")
        raise

    relative_path = os.path.relpath(file_path, settings.MEDIA_ROOT)
    file_url = os.path.join(settings.MEDIA_URL, relative_path).replace("\\", "/")

    print(f"File URL: {file_url}")

    return file_url
