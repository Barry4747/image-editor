from django.db import models

class Job(models.Model):
    prompt = models.TextField()
    image = models.ImageField(upload_to='inputs/')
    mask = models.ImageField(upload_to='masks/', null=True, blank=True)
    output = models.ImageField(upload_to='outputs/', null=True, blank=True)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Job {self.id} - {self.status}"