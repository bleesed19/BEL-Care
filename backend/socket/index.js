const { Server } = require('socket.io');

function initializeSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling']
    });

    const userSockets = new Map(); // userId -> socketId
    const roomParticipants = new Map(); // roomId -> Set of socketIds

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('register', (userId) => {
            userSockets.set(userId, socket.id);
            socket.userId = userId;
            console.log(`User ${userId} registered with socket ${socket.id}`);
        });

        // Join a chat room (hospitalId_userId combination)
        socket.on('join_room', ({ hospitalId, userId, role }) => {
            const roomName = `hospital_${hospitalId}_user_${userId}`;
            socket.join(roomName);
            if (!roomParticipants.has(roomName)) roomParticipants.set(roomName, new Set());
            roomParticipants.get(roomName).add(socket.id);
            socket.roomName = roomName;
            console.log(`Socket ${socket.id} joined room ${roomName}`);
        });

        // Send message event
        socket.on('send_message', async ({ message, hospitalId, receiverId, senderId, senderName }) => {
            const roomName = `hospital_${hospitalId}_user_${receiverId}`;
            // Store message in DB via REST? But for realtime, we emit first; API will store
            io.to(roomName).emit('receive_message', {
                id: Date.now(),
                message,
                sender_id: senderId,
                sender_name: senderName,
                created_at: new Date(),
                hospital_id: hospitalId,
                delivered: true
            });
            
            // Send typing notification
            socket.to(roomName).emit('typing_indicator', { userId: senderId, isTyping: false });
        });

        // Typing indicator
        socket.on('typing', ({ hospitalId, userId, isTyping }) => {
            const roomName = `hospital_${hospitalId}_user_${userId}`;
            socket.to(roomName).emit('typing_indicator', { userId, isTyping });
        });

        // Mark message as seen (implement if needed)
        socket.on('mark_seen', ({ messageId, roomName }) => {
            socket.to(roomName).emit('message_seen', { messageId });
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
            if (socket.userId) userSockets.delete(socket.userId);
            if (socket.roomName && roomParticipants.has(socket.roomName)) {
                roomParticipants.get(socket.roomName).delete(socket.id);
            }
        });
    });

    return io;
}

module.exports = initializeSocket;