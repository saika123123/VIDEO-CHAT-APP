const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// ルームごとの参加者を管理
const rooms = new Map();

io.on('connection', (socket) => {
    const { roomId, userId, userName } = socket.handshake.query;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
    }

    rooms.get(roomId).set(socket.id, {
        userId,
        userName,
        socketId: socket.id
    });

    io.to(roomId).emit('users', Array.from(rooms.get(roomId).values()));

    socket.on('offer', ({ offer, to }) => {
        io.to(to).emit('offer', {
            offer,
            from: socket.id
        });
    });

    socket.on('answer', ({ answer, to }) => {
        io.to(to).emit('answer', {
            answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', ({ candidate, to }) => {
        io.to(to).emit('ice-candidate', {
            candidate,
            from: socket.id
        });
    });

    socket.on('disconnect', () => {
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            io.to(roomId).emit('users', Array.from(rooms.get(roomId).values()));
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }
    });
});

server.listen(3001, () => {
    console.log('Server is running on port 3001');
});