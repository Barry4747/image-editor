from celery import shared_task
import time

@shared_task
def process_image(image_path):
    time.sleep(5)  # symulacja długiego przetwarzania
    return f"Processed {image_path}"
