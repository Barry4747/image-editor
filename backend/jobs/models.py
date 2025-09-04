from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Job(models.Model):
    prompt = models.TextField()
    negative_prompt = models.TextField(null=True, blank=True)
    image = models.ImageField(upload_to='inputs/', null=True, blank=True)
    mask = models.ImageField(upload_to='masks/', null=True, blank=True)
    output = models.ImageField(upload_to='outputs/', null=True, blank=True)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    model = models.CharField(max_length=100, default='lustify-sdxl')
    masks = models.JSONField(null=True, blank=True)

    #settings
    strength = models.FloatField(null=True, blank=True)
    guidance_scale = models.FloatField(null=True, blank=True)
    steps = models.IntegerField(null=True, blank=True)
    passes = models.IntegerField(null=True, blank=True)
    seed = models.IntegerField(null=True, blank=True)
    finish_model = models.CharField(null=True, blank=True)

    #for upscaling
    upscale_model = models.CharField(null=True, blank=True)
    scale = models.IntegerField(default=4)

    #identification
    session_id = models.CharField(max_length=100, db_index=True, blank=True)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="jobs")

    def __str__(self):
        return f"Job {self.id} - {self.status}"


class JobEvent(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="events")
    type = models.CharField(max_length=32)           
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["job", "created_at"])]