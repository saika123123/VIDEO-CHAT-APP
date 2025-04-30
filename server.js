const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
    cors: {
        origin: "*", // すべてのオリジンからのアクセスを許可
        methods: ["GET", "POST"],
        credentials: true
    },
    // デフォルトで/socket.io/パスを使用
    transports: ['polling', 'websocket'] // ポーリングとWebSocket両方対応
});

// ルームごとの参加者を管理するMap
const rooms = new Map();
// アクティブな録音セッションを管理するMap
const activeRecordings = new Map();

// デバッグ用の関数
const logRoomState = (roomId) => {
    if (rooms.has(roomId)) {
        const participants = Array.from(rooms.get(roomId).values());
        console.log(`Room ${roomId} state:`, participants);
    }
};

// デバッグ用の録音状態ログ関数
const logRecordingState = () => {
    console.log('Active recordings:');
    activeRecordings.forEach((data, roomId) => {
        console.log(`Room ${roomId}: Meeting ${data.meetingId}, Initiator: ${data.initiatorName}`);
    });
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

    // アクティブな録音があれば通知
    if (activeRecordings.has(roomId)) {
        const recordingInfo = activeRecordings.get(roomId);
        console.log(`Notifying new user ${userName} about active recording:`, recordingInfo);

        socket.emit('recording-started', {
            meetingId: recordingInfo.meetingId,
            initiatorId: recordingInfo.initiatorId,
            initiatorName: recordingInfo.initiatorName
        });
    }

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
        console.log(`Received speech data from ${data.userName} (${data.userId}): "${data.content.substring(0, 20)}..."`);

        // 送信者以外のルーム内の全員に転送
        socket.to(roomId).emit('speech-data', {
            content: data.content,
            userId: data.userId,
            userName: data.userName
        });
    });

    // 録音開始イベント
    socket.on('recording-start', ({ meetingId, roomId, initiatorId, initiatorName }) => {
        console.log(`Recording started in room ${roomId} by ${initiatorName} (${initiatorId}), meetingId: ${meetingId}`);

        // アクティブな録音情報を保存
        activeRecordings.set(roomId, {
            meetingId,
            initiatorId,
            initiatorName,
            startTime: new Date()
        });

        logRecordingState();

        // 同じルームの全員に録音開始を通知
        io.to(roomId).emit('recording-started', {
            meetingId,
            initiatorId,
            initiatorName
        });
    });

    // 録音停止イベント
    socket.on('recording-stop', ({ meetingId, roomId, initiatorId }) => {
        console.log(`Recording stopped in room ${roomId} by ${initiatorId}, meetingId: ${meetingId}`);

        // アクティブな録音情報を削除
        activeRecordings.delete(roomId);

        logRecordingState();

        // 同じルームの全員に録音停止を通知
        io.to(roomId).emit('recording-stopped', {
            meetingId,
            initiatorId
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

            // このユーザーが録音の開始者で、まだ録音中の場合でも、録音は継続する
            // (他のユーザーがいる限り録音は継続し、誰でも停止できる)
            if (activeRecordings.has(roomId) &&
                activeRecordings.get(roomId).initiatorId === userId) {
                console.log(`Recording initiator disconnected, but recording continues in room ${roomId}`);

                // 録音開始者が退出しても録音は続く
                // ただし、録音開始者の名前を「不明」に変更
                const recordingInfo = activeRecordings.get(roomId);
                recordingInfo.initiatorName = `${userName}(退出済み)`;
                activeRecordings.set(roomId, recordingInfo);

                // 録音状態の更新を通知
                io.to(roomId).emit('recording-initiator-left', {
                    meetingId: recordingInfo.meetingId,
                    formerInitiatorId: userId,
                    formerInitiatorName: userName
                });
            }

            // ルームが空になった場合は削除と録音データのクリーンアップ
            if (rooms.get(roomId).size === 0) {
                console.log(`Removing empty room: ${roomId}`);
                rooms.delete(roomId);

                if (activeRecordings.has(roomId)) {
                    console.log(`Cleaning up recording for empty room: ${roomId}`);
                    activeRecordings.delete(roomId);
                }
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
            activeRecordings.delete(roomId);
        }
    });

    // アクティブな録音のチェック
    activeRecordings.forEach((recordingInfo, roomId) => {
        // ルームが存在しない場合は録音情報をクリーンアップ
        if (!rooms.has(roomId)) {
            console.log(`Cleaning up recording for non-existent room: ${roomId}`);
            activeRecordings.delete(roomId);
            return;
        }

        // 録音開始から長時間経過した場合もチェック (例: 3時間以上)
        const now = new Date();
        const threeHoursInMs = 3 * 60 * 60 * 1000;
        if (now - recordingInfo.startTime > threeHoursInMs) {
            console.log(`Cleaning up long-running recording in room: ${roomId}`);
            activeRecordings.delete(roomId);

            // 録音が自動停止されたことを通知
            io.to(roomId).emit('recording-stopped', {
                meetingId: recordingInfo.meetingId,
                initiatorId: 'system',
                reason: 'timeout'
            });
        }
    });
}, 60000); // 1分ごとにチェック

// エラーハンドリング
server.on('error', (error) => {
    console.error('Server error:', error);
});

// サーバーの起動
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
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