import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:8000';

export const socket = io(SOCKET_URL, {
  autoConnect: false, // Only connect on active session
  reconnectionAttempts: 3,
  timeout: 3000,
  transports: ['websocket', 'polling']
});

export function joinClassroom(roomCode) {
  try {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join_room', { room_code: roomCode });
  } catch (err) {
    console.log('[Socket] Offline mode active');
  }
}

export function leaveClassroom(roomCode) {
  try {
    if (socket.connected) {
      socket.emit('leave_room', { room_code: roomCode });
    }
  } catch (err) {}
}
