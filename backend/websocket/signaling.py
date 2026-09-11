"""
FastAPI WebSocket Signaling Router for WebRTC peer-to-peer camera streaming.
Connects the phone camera sender to the computer application receiver.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any
import json
import logging

logger = logging.getLogger("kai_nokki.signaling")
router = APIRouter()


class SignalingManager:
    """
    Manages peer rooms for phone camera (sender) and computer browser (receiver).
    """
    def __init__(self):
        # Mapping from room_id to list of active WebSockets
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
        self.rooms[room_id].append(websocket)
        logger.info(f"Client connected to room {room_id}. Total peers: {len(self.rooms[room_id])}")

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.rooms:
            if websocket in self.rooms[room_id]:
                self.rooms[room_id].remove(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
        logger.info(f"Client disconnected from room {room_id}")

    async def broadcast(self, room_id: str, sender: WebSocket, message: dict):
        """
        Relays signaling messages to all other peers in the room.
        """
        if room_id in self.rooms:
            for connection in self.rooms[room_id]:
                if connection != sender:
                    try:
                        await connection.send_text(json.dumps(message))
                    except Exception as e:
                        logger.error(f"Error sending message to peer: {e}")


manager = SignalingManager()


@router.websocket("/ws/signaling")
async def websocket_signaling_endpoint(websocket: WebSocket, room: str = "kai-nokki-default"):
    """
    Signaling endpoint for WebRTC offer, answer, and ICE candidate exchange.
    Query param 'room' groups the computer and phone into the same pairing session.
    """
    await manager.connect(room, websocket)
    try:
        # Notify peers that a new participant has joined
        await manager.broadcast(room, websocket, {"type": "peer-joined", "room": room})
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                # Forward signaling payload to peer
                await manager.broadcast(room, websocket, message)
            except json.JSONDecodeError:
                logger.warning("Received invalid JSON payload on signaling socket")
    except WebSocketDisconnect:
        manager.disconnect(room, websocket)
        await manager.broadcast(room, websocket, {"type": "peer-left", "room": room})
    except Exception as exc:
        logger.error(f"Signaling error: {exc}")
        manager.disconnect(room, websocket)
