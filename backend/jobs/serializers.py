from rest_framework import serializers
from .models import Job

class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = '__all__'


from rest_framework import serializers
from .models import Job

class GalleryJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = ["id", "output", "created_at"]

    def get_output(self, obj):
        if not obj.output:
            return None
        return obj.output.url
