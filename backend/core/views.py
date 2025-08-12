from django.http import JsonResponse
from rest_framework import viewsets
from django.conf import settings
from django.http import FileResponse, Http404
import os
import uuid
from .serializers import MaskSerializer
from rest_framework.response import Response
from rest_framework import status
from .storage import save_image

def health_check(request):
    return JsonResponse({"status": "ok"})


class MaskView(viewsets.ModelViewSet):
    serializer_class = MaskSerializer
    
    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save() 

        file = serializer.validated_data['file']
        session_id = serializer.validated_data['session_id']
        file_path = save_image(file, session_id)

        relative_path = os.path.relpath(file_path, settings.MEDIA_ROOT)
        file_url = os.path.join(settings.MEDIA_URL, relative_path).replace('\\', '/')

        return Response({'file_url': file_url}, status=status.HTTP_201_CREATED)



    def get(self, request):
        file_url = request.query_params.get('file_url')
        if not file_url:
            return Response({'error': 'file_url param required'}, status=status.HTTP_400_BAD_REQUEST)

        if not file_url.startswith(settings.MEDIA_URL):
            return Response({'error': 'Invalid file_url'}, status=status.HTTP_400_BAD_REQUEST)

        relative_path = file_url[len(settings.MEDIA_URL):]
        full_path = os.path.join(settings.MEDIA_ROOT, relative_path)

        if not os.path.exists(full_path):
            raise Http404('File not found')

        return FileResponse(open(full_path, 'rb'), content_type='image/png')

    def delete(self, request):
        file_url = request.data.get('file_url')
        if not file_url:
            return Response({'error': 'file_url param required'}, status=status.HTTP_400_BAD_REQUEST)

        if not file_url.startswith(settings.MEDIA_URL):
            return Response({'error': 'Invalid file_url'}, status=status.HTTP_400_BAD_REQUEST)

        relative_path = file_url[len(settings.MEDIA_URL):]
        full_path = os.path.join(settings.MEDIA_ROOT, relative_path)

        if not os.path.exists(full_path):
            return Response({'error': 'File not found'}, status=status.HTTP_404_NOT_FOUND)

        os.remove(full_path)
        return Response({'status': 'deleted'}, status=status.HTTP_204_NO_CONTENT)