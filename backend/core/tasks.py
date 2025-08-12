from celery import shared_task
import time

@shared_task
def process_image(image_path):
    pass
