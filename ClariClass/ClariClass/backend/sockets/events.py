# pyrefly: ignore [missing-import]
import socketio

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

@sio.event
async def connect(sid, environ):
    print(f"[Socket.IO] Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"[Socket.IO] Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    room_code = data.get("room_code")
    if room_code:
        sio.enter_room(sid, room_code)
        print(f"[Socket.IO] Client {sid} joined room {room_code}")

@sio.event
async def leave_room(sid, data):
    room_code = data.get("room_code")
    if room_code:
        sio.leave_room(sid, room_code)
        print(f"[Socket.IO] Client {sid} left room {room_code}")

async def broadcast_chunk_simplified(room_code: str, payload: dict):
    """
    Emits chunk_simplified event to room.
    """
    await sio.emit("chunk_simplified", payload, room=room_code)

async def broadcast_struggle_update(room_code: str, payload: dict):
    """
    Emits struggle_updated event to room for live dashboard heatmap.
    """
    await sio.emit("struggle_updated", payload, room=room_code)
