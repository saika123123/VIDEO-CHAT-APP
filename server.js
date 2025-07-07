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

// server.js に追加するクイズ機能のコード
// 既存のコードの後に追加してください

// クイズルーム管理用のMap
const quizRooms = new Map();

// クイズデータのインポート（実際の実装ではAPIから取得）
const { getQuestionsByCategory, getMixedQuestions, calculateScore } = require('./src/lib/quizData');

// Socket.IO の connection イベントハンドラ内に追加
socket.on('connection', (socket) => {
    // 既存のコード...

    const { roomId, userId, userName, type } = socket.handshake.query;
    
    // クイズ接続の場合の処理
    if (type === 'quiz') {
        console.log(`Quiz user ${userName} (${userId}) joining quiz room ${roomId}`);

        // クイズルームに参加
        socket.join(roomId);

        // クイズルームが存在しない場合は新規作成
        if (!quizRooms.has(roomId)) {
            quizRooms.set(roomId, {
                participants: new Map(),
                settings: {
                    category: 'mixed',
                    difficulty: 'normal',
                    questionCount: 5,
                    timeLimit: 30
                },
                status: 'waiting',
                questions: [],
                currentQuestionIndex: -1,
                answers: new Map(), // userId -> [answers]
                startTime: null
            });
        }

        const quizRoom = quizRooms.get(roomId);

        // 参加者をクイズルームに追加
        quizRoom.participants.set(socket.id, {
            userId,
            userName,
            socketId: socket.id,
            joinedAt: new Date(),
            answers: [],
            hasAnswered: false
        });

        // 参加者リストを全員に送信
        const participantsList = Array.from(quizRoom.participants.values());
        io.to(roomId).emit('quiz-room-users', participantsList);

        console.log(`Quiz room ${roomId} now has ${participantsList.length} participants`);

        // クイズ設定更新イベント
        socket.on('quiz-update-settings', ({ roomId: targetRoomId, settings }) => {
            if (targetRoomId !== roomId) return;

            const room = quizRooms.get(targetRoomId);
            if (!room) return;

            // ホスト権限チェック（最初に参加した人がホスト）
            const participants = Array.from(room.participants.values());
            const host = participants.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];
            
            if (host?.userId !== userId) {
                console.log(`Non-host ${userName} tried to update quiz settings`);
                return;
            }

            room.settings = { ...room.settings, ...settings };
            console.log(`Quiz settings updated for room ${targetRoomId}:`, room.settings);
            
            // 設定を全員に送信
            io.to(targetRoomId).emit('quiz-settings-updated', room.settings);
        });

        // クイズ開始イベント
        socket.on('quiz-start', async ({ roomId: targetRoomId, settings }) => {
            if (targetRoomId !== roomId) return;

            const room = quizRooms.get(targetRoomId);
            if (!room || room.status !== 'waiting') return;

            // ホスト権限チェック
            const participants = Array.from(room.participants.values());
            const host = participants.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))[0];
            
            if (host?.userId !== userId) {
                console.log(`Non-host ${userName} tried to start quiz`);
                return;
            }

            console.log(`Starting quiz in room ${targetRoomId} with settings:`, settings);

            // 問題を生成
            let questions;
            if (settings.category === 'mixed') {
                questions = getMixedQuestions(null, settings.difficulty, settings.questionCount);
            } else {
                questions = getQuestionsByCategory(settings.category, settings.difficulty, settings.questionCount);
            }

            room.questions = questions;
            room.settings = settings;
            room.status = 'in_progress';
            room.currentQuestionIndex = 0;
            room.startTime = new Date();

            // 参加者の回答をリセット
            room.participants.forEach(participant => {
                participant.answers = [];
                participant.hasAnswered = false;
            });

            // クイズ開始を全員に通知
            io.to(targetRoomId).emit('quiz-started', {
                questions: room.questions,
                settings: room.settings
            });

            // 最初の問題を送信
            setTimeout(() => {
                sendNextQuestion(targetRoomId, 0);
            }, 2000);
        });

        // 回答送信イベント
        socket.on('quiz-submit-answer', ({ roomId: targetRoomId, questionIndex, answer, timestamp }) => {
            if (targetRoomId !== roomId) return;

            const room = quizRooms.get(targetRoomId);
            if (!room || room.status !== 'in_progress') return;

            const participant = room.participants.get(socket.id);
            if (!participant || participant.hasAnswered) return;

            console.log(`${userName} submitted answer ${answer} for question ${questionIndex}`);

            // 回答を記録
            participant.answers[questionIndex] = answer;
            participant.hasAnswered = true;
            participant.answerTime = timestamp;

            // 回答送信を他の参加者に通知
            socket.to(targetRoomId).emit('quiz-answer-submitted', {
                userId,
                userName,
                answer,
                timestamp
            });

            // 全員が回答したかチェック
            const allParticipants = Array.from(room.participants.values());
            const allAnswered = allParticipants.every(p => p.hasAnswered);

            if (allAnswered) {
                // 全員回答済みの場合、即座に結果を表示
                setTimeout(() => {
                    showQuestionResults(targetRoomId, questionIndex);
                }, 1000);
            }
        });

        // 次の問題へのイベント
        socket.on('quiz-next-question', ({ roomId: targetRoomId, questionIndex }) => {
            if (targetRoomId !== roomId) return;
            sendNextQuestion(targetRoomId, questionIndex);
        });

        // クイズ終了イベント
        socket.on('quiz-finish', ({ roomId: targetRoomId }) => {
            if (targetRoomId !== roomId) return;
            finishQuiz(targetRoomId);
        });

        // クイズ退出イベント
        socket.on('quiz-leave', ({ roomId: targetRoomId, userId: leavingUserId, userName: leavingUserName }) => {
            if (targetRoomId !== roomId) return;

            const room = quizRooms.get(targetRoomId);
            if (!room) return;

            // 参加者を削除
            room.participants.delete(socket.id);

            // 退出を他の参加者に通知
            socket.to(targetRoomId).emit('participant-left', {
                userId: leavingUserId,
                userName: leavingUserName
            });

            // 更新された参加者リストを送信
            const participantsList = Array.from(room.participants.values());
            io.to(targetRoomId).emit('quiz-room-users', participantsList);

            console.log(`${leavingUserName} left quiz room ${targetRoomId}`);

            // 部屋が空になった場合は削除
            if (participantsList.length === 0) {
                quizRooms.delete(targetRoomId);
                console.log(`Empty quiz room ${targetRoomId} deleted`);
            }
        });

        // 切断時の処理
        socket.on('disconnect', () => {
            console.log(`Quiz client disconnected: ${userName} (${userId})`);

            const room = quizRooms.get(roomId);
            if (room) {
                // 参加者を削除
                const participant = room.participants.get(socket.id);
                if (participant) {
                    room.participants.delete(socket.id);

                    // 切断を他の参加者に通知
                    socket.to(roomId).emit('participant-left', {
                        userId: participant.userId,
                        userName: participant.userName
                    });

                    // 更新された参加者リストを送信
                    const participantsList = Array.from(room.participants.values());
                    io.to(roomId).emit('quiz-room-users', participantsList);

                    console.log(`Remaining participants in quiz room ${roomId}:`, participantsList.length);

                    // 部屋が空になった場合は削除
                    if (participantsList.length === 0) {
                        quizRooms.delete(roomId);
                        console.log(`Empty quiz room ${roomId} deleted`);
                    }
                }
            }
        });

        return; // クイズ接続の場合はここで処理終了
    }

    // 既存のビデオ通話用のコード...
});

// クイズ関連のヘルパー関数

// 次の問題を送信
function sendNextQuestion(roomId, questionIndex) {
    const room = quizRooms.get(roomId);
    if (!room || questionIndex >= room.questions.length) return;

    const question = room.questions[questionIndex];
    room.currentQuestionIndex = questionIndex;

    // 参加者の回答状況をリセット
    room.participants.forEach(participant => {
        participant.hasAnswered = false;
        participant.answerTime = null;
    });

    console.log(`Sending question ${questionIndex + 1}/${room.questions.length} to room ${roomId}`);

    // 問題を送信
    io.to(roomId).emit('quiz-question', {
        question: {
            ...question,
            correctAnswer: undefined, // 正解は隠す
            explanation: undefined    // 解説も隠す
        },
        index: questionIndex,
        timeLimit: room.settings.timeLimit
    });

    // 制限時間後に自動的に結果表示
    setTimeout(() => {
        showQuestionResults(roomId, questionIndex);
    }, room.settings.timeLimit * 1000);
}

// 問題の結果を表示
function showQuestionResults(roomId, questionIndex) {
    const room = quizRooms.get(roomId);
    if (!room || questionIndex !== room.currentQuestionIndex) return;

    const question = room.questions[questionIndex];
    const participants = Array.from(room.participants.values());

    // 参加者の回答結果を集計
    const participantAnswers = participants.map(participant => ({
        userId: participant.userId,
        userName: participant.userName,
        answer: participant.answers[questionIndex] || null,
        isCorrect: participant.answers[questionIndex] === question.correctAnswer,
        answerTime: participant.answerTime
    }));

    console.log(`Showing results for question ${questionIndex + 1} in room ${roomId}`);

    // 結果を送信
    io.to(roomId).emit('quiz-question-results', {
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        participantAnswers
    });

    // 最後の問題の場合は、しばらく後にクイズを終了
    if (questionIndex >= room.questions.length - 1) {
        setTimeout(() => {
            finishQuiz(roomId);
        }, 5000);
    }
}

// クイズを終了して最終結果を表示
function finishQuiz(roomId) {
    const room = quizRooms.get(roomId);
    if (!room) return;

    const participants = Array.from(room.participants.values());
    const results = participants.map(participant => {
        const score = calculateScore(participant.answers, room.questions);
        return {
            userId: participant.userId,
            userName: participant.userName,
            answers: participant.answers,
            score
        };
    });

    console.log(`Quiz finished for room ${roomId}. Results:`, results);

    // 最終結果を送信
    io.to(roomId).emit('quiz-finished', {
        results,
        questions: room.questions
    });

    // クイズルームの状態を更新
    room.status = 'finished';
}

// クイズルームのクリーンアップ（定期実行）
setInterval(() => {
    const now = new Date();
    const maxAge = 2 * 60 * 60 * 1000; // 2時間

    quizRooms.forEach((room, roomId) => {
        if (room.startTime && now - room.startTime > maxAge) {
            console.log(`Cleaning up old quiz room: ${roomId}`);
            quizRooms.delete(roomId);
        } else if (room.participants.size === 0) {
            console.log(`Cleaning up empty quiz room: ${roomId}`);
            quizRooms.delete(roomId);
        }
    });

    console.log(`Active quiz rooms: ${quizRooms.size}`);
}, 5 * 60 * 1000); // 5分ごとにチェック