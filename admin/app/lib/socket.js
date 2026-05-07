import { io } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

let socket = null;

export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io(API_BASE, {
    auth: { token, type: 'admin' },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000
  });

  socket.on('connect', () => {
    console.log('✅ WebSocket bağlandı');
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ WebSocket kesildi:', reason);
  });

  socket.on('connect_error', (err) => {
    console.log('⚠️ WebSocket hata:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
