from rest_framework import serializers
from .storage import save_image

class MaskSerializer(serializers.Serializer):
    session_id = serializers.CharField()
    file = serializers.FileField()

    def create(self, validated_data):
        file = validated_data['file']
        session_id = validated_data['session_id']
        return validated_data