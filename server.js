const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// CORSの設定
app.use(cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
}));

const server = http.createServer(app);

// Socket.IOサーバーの設定
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ルームごとの参加者を管理するMap
const rooms = new Map();

// デバッグ用の関数
const logRoomState = (roomId) => {
    if (rooms.has(roomId)) {
        const participants = Array.from(rooms.get(roomId).values());
        console.log(`Room ${roomId} state:`, participants);
    }
};

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    const { roomId, userId, userName } = socket.handshake.query;
    console.log(`User ${userName} (${userId}) joining room ${roomId}`);

    // ルームに参加
    socket.join(roomId);

    // ルームが存在しない場合は新規作成
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
    }

    // ユーザー情報をルームに追加
    rooms.get(roomId).set(socket.id, {
        userId,
        userName,
        socketId: socket.id
    });

    // 現在のルーム状態をログ出力
    logRoomState(roomId);

    // ルーム参加者リストを全員に送信
    io.to(roomId).emit('users', Array.from(rooms.get(roomId).values()));

    // オファーの転送
    socket.on('offer', ({ offer, to }) => {
        console.log(`Forwarding offer from ${socket.id} to ${to}`);
        socket.to(to).emit('offer', {
            offer,
            from: socket.id
        });
    });

    // アンサーの転送
    socket.on('answer', ({ answer, to }) => {
        console.log(`Forwarding answer from ${socket.id} to ${to}`);
        socket.to(to).emit('answer', {
            answer,
            from: socket.id
        });
    });

    // ICE candidateの転送
    socket.on('ice-candidate', ({ candidate, to }) => {
        console.log(`Forwarding ICE candidate from ${socket.id} to ${to}`);
        socket.to(to).emit('ice-candidate', {
            candidate,
            from: socket.id
        });
    });

    // クライアントエラーの処理
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    // 音声データの中継
    socket.on('speech-data', (data) => {
        // 送信者以外のルーム内の全員に転送
        socket.to(roomId).emit('speech-data', {
            content: data.content,
            userId: data.userId,
            userName: data.userName
        });
    });

    // 切断時の処理
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${userName} (${userId})`);

        if (rooms.has(roomId)) {
            // ユーザーをルームから削除
            rooms.get(roomId).delete(socket.id);

            // 他の参加者に切断を通知
            io.to(roomId).emit('user-disconnected', userId);

            // 更新された参加者リストを送信
            const remainingUsers = Array.from(rooms.get(roomId).values());
            io.to(roomId).emit('users', remainingUsers);

            console.log(`Remaining users in room ${roomId}:`, remainingUsers);

            // ルームが空になった場合は削除
            if (rooms.get(roomId).size === 0) {
                console.log(`Removing empty room: ${roomId}`);
                rooms.delete(roomId);
            }
        }
    });
});

// 未使用のルームを定期的にクリーンアップ
setInterval(() => {
    rooms.forEach((participants, roomId) => {
        if (participants.size === 0) {
            console.log(`Cleaning up empty room: ${roomId}`);
            rooms.delete(roomId);
        }
    });
}, 60000); // 1分ごとにチェック

// エラーハンドリング
server.on('error', (error) => {
    console.error('Server error:', error);
});

// サーバーの起動
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// プロセスの終了時の処理
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});