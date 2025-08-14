import json
from channels.generic.websocket import AsyncWebsocketConsumer

class JobProgressConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.session_id = self.scope['url_route']['kwargs']['session_id']
        self.group_name = f"progress_{self.session_id}"

        print(f"Session ID: {self.session_id}")
        print(f"Connecting to group: {self.group_name}")
        print(f"Channel name: {self.channel_name}")

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )

    async def job_progress(self, event):
        print(f"Received event: {event}")
        await self.send(text_data=json.dumps(event))
