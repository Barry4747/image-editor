from django.db import models

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
    upscale_model = models.CharField(default='realesrgan-x4plus')
    scale = models.IntegerField(default=4)

    #session_id mock MVP solution (in future change this to foreign key of user id for prod)
    session_id = models.CharField(max_length=100, null=True, blank=True)

    def __str__(self):
        return f"Job {self.id} - {self.status}"