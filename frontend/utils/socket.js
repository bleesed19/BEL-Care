import { io } from 'socket.io-client';

let socket = null;
let currentUserId = null;

export function initSocket(userId) {
    if (socket) socket.disconnect();
    currentUserId = userId;
    socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket'] });
    socket.on('connect', () => {
        console.log('Socket connected');
        socket.emit('register', userId);
    });
    return socket;
}

export function joinChatRoom(hospitalId, userId, role) {
    if (!socket) return;
    socket.emit('join_room', { hospitalId, userId, role });
}

export function sendChatMessage(message, hospitalId, receiverId, senderId, senderName) {
    if (!socket) return;
    socket.emit('send_message', { message, hospitalId, receiverId, senderId, senderName });
}

export function onNewMessage(callback) {
    if (!socket) return;
    socket.on('receive_message', callback);
}

export function onTyping(callback) {
    if (!socket) return;
    socket.on('typing_indicator', callback);
}

export function sendTyping(hospitalId, userId, isTyping) {
    if (!socket) return;
    socket.emit('typing', { hospitalId, userId, isTyping });
}