from django.db import models

class Job(models.Model):
    prompt = models.TextField()
    image = models.ImageField(upload_to='inputs/')
    mask = models.ImageField(upload_to='masks/', null=True, blank=True)
    output = models.ImageField(upload_to='outputs/', null=True, blank=True)
    status = models.CharField(max_length=20, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    model = models.CharField(max_length=100, default='lustify-sdxl')

    #session_id mock MVP solution (in future change this to foreign key of user id for prod)
    session_id = models.CharField(max_length=100, null=True, blank=True)

    def __str__(self):
        return f"Job {self.id} - {self.status}"