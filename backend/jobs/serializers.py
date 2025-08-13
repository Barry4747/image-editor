from rest_framework import serializers

class JobSerializer(serializers.Serializer):
    class Meta:
        fields = '__all__'