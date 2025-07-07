'use client';
import { DIFFICULTY_LEVELS, QUIZ_CATEGORIES, QUIZ_ROOM_STATUS } from '@/lib/quizData';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export default function MultiplayerQuiz({ roomId, userId, userName }) {
    // 状態管理
    const [roomStatus, setRoomStatus] = useState(QUIZ_ROOM_STATUS.WAITING);
    const [participants, setParticipants] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [quizSettings, setQuizSettings] = useState({
        category: 'mixed',
        difficulty: 'normal',
        questionCount: 5,
        timeLimit: 30
    });
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [questions, setQuestions] = useState([]);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(30);
    const [answers, setAnswers] = useState([]);
    const [finalResults, setFinalResults] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [error, setError] = useState(null);
    const [showExplanation, setShowExplanation] = useState(false);

    // Refs
    const socketRef = useRef();
    const timerRef = useRef();
    const mountedRef = useRef(true);

    // 問題開始関数（useCallbackで依存関係を明確化）
    const startQuestionCallback = useCallback((question, timeLimit, index) => {
        console.log('Starting question:', question.question, 'Index:', index);
        
        setCurrentQuestion(question);
        setCurrentQuestionIndex(index);
        setSelectedAnswer(null);
        setShowExplanation(false);
        setRoomStatus(QUIZ_ROOM_STATUS.QUESTION_TIME);
        
        // 参加者の回答状況をリセット
        setParticipants(prev => prev.map(p => ({ ...p, hasAnswered: false, answerTime: null })));
        
        startTimer(timeLimit);
    }, []);

    // Socket.IO接続の初期化
    useEffect(() => {
        mountedRef.current = true;

        const initializeSocket = () => {
            socketRef.current = io(window.location.origin, {
                path: '/yoriai/socket.io/',
                transports: ['polling', 'websocket'],
                query: { 
                    roomId: `quiz_${roomId}`, 
                    userId, 
                    userName,
                    type: 'quiz'
                },
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            // 接続イベント
            socketRef.current.on('connect', () => {
                console.log('Quiz socket connected');
                setConnectionStatus('connected');
                setError(null);
            });

            socketRef.current.on('connect_error', (error) => {
                console.error('Quiz socket connection error:', error);
                setConnectionStatus('error');
                setError('接続に失敗しました');
            });

            // クイズルーム専用イベント
            socketRef.current.on('quiz-room-users', (users) => {
                console.log('Quiz room users updated:', users);
                if (!mountedRef.current) return;
                
                setParticipants(users);
                
                // 最初に入った人がホストになる
                const sortedUsers = users.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
                setIsHost(sortedUsers[0]?.userId === userId);
            });

            socketRef.current.on('quiz-settings-updated', (settings) => {
                console.log('Quiz settings updated:', settings);
                if (!mountedRef.current) return;
                setQuizSettings(settings);
            });

            socketRef.current.on('quiz-started', ({ questions: quizQuestions, settings }) => {
                console.log('Quiz started with questions:', quizQuestions);
                if (!mountedRef.current) return;
                
                setQuestions(quizQuestions);
                setQuizSettings(settings);
                setRoomStatus(QUIZ_ROOM_STATUS.IN_PROGRESS);
                setCurrentQuestionIndex(0);
                setAnswers([]);
                setSelectedAnswer(null);
                setShowExplanation(false);
            });

            socketRef.current.on('quiz-question', ({ question, index, timeLimit }) => {
                console.log('New question received:', question);
                if (!mountedRef.current) return;
                
                startQuestionCallback(question, timeLimit, index);
            });

            socketRef.current.on('quiz-answer-submitted', ({ userId: answerUserId, userName: answerUserName, answer, timestamp }) => {
                console.log(`${answerUserName} submitted answer:`, answer);
                if (!mountedRef.current) return;
                
                // 参加者の回答状況を更新
                setParticipants(prev => prev.map(p => 
                    p.userId === answerUserId 
                        ? { ...p, hasAnswered: true, answerTime: timestamp }
                        : p
                ));
            });

            socketRef.current.on('quiz-question-results', ({ correctAnswer, explanation, participantAnswers }) => {
                console.log('Question results received:', { correctAnswer, explanation });
                if (!mountedRef.current) return;
                
                showQuestionResults(correctAnswer, explanation, participantAnswers);
            });

            socketRef.current.on('quiz-finished', ({ results }) => {
                console.log('Quiz finished with results:', results);
                if (!mountedRef.current) return;
                
                setFinalResults(results);
                setRoomStatus(QUIZ_ROOM_STATUS.FINISHED);
                stopTimer();
            });

            socketRef.current.on('participant-left', ({ userId: leftUserId, userName: leftUserName }) => {
                console.log(`${leftUserName} left the quiz room`);
                if (!mountedRef.current) return;
                
                setParticipants(prev => prev.filter(p => p.userId !== leftUserId));
            });

            socketRef.current.on('disconnect', () => {
                console.log('Quiz socket disconnected');
                if (!mountedRef.current) return;
                
                setConnectionStatus('disconnected');
                stopTimer();
            });
        };

        initializeSocket();

        return () => {
            mountedRef.current = false;
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            stopTimer();
        };
    }, [roomId, userId, userName, startQuestionCallback]); // 依存関係を追加

    // タイマー管理
    const startTimer = (duration) => {
        setTimeLeft(duration);
        stopTimer(); // 既存のタイマーを停止

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    // 時間切れ
                    if (roomStatus === QUIZ_ROOM_STATUS.QUESTION_TIME && selectedAnswer === null) {
                        submitAnswer(null); // 時間切れで未回答
                    }
                    stopTimer();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // 問題開始（元の関数名を維持、内部でcallbackを使用）
    const startQuestion = (question, timeLimit, index) => {
        startQuestionCallback(question, timeLimit, index);
    };

    // 回答送信
    const submitAnswer = (answerIndex) => {
        if (selectedAnswer !== null || roomStatus !== QUIZ_ROOM_STATUS.QUESTION_TIME) return;

        setSelectedAnswer(answerIndex);
        setRoomStatus(QUIZ_ROOM_STATUS.ANSWER_TIME);
        stopTimer();

        // 回答を保存
        const newAnswers = [...answers];
        newAnswers[currentQuestionIndex] = answerIndex;
        setAnswers(newAnswers);

        // Socket.IOで回答を送信
        socketRef.current?.emit('quiz-submit-answer', {
            roomId: `quiz_${roomId}`,
            questionIndex: currentQuestionIndex,
            answer: answerIndex,
            timestamp: Date.now()
        });
    };

    // 問題結果表示
    const showQuestionResults = (correctAnswer, explanation, participantAnswers) => {
        setRoomStatus(QUIZ_ROOM_STATUS.RESULT_TIME);
        setShowExplanation(true);
        
        // 正解/不正解の表示用に正解情報を保存（既存の問題データに追加）
        setCurrentQuestion(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                correctAnswer,
                explanation,
                participantAnswers
            };
        });
    };

    // クイズ設定更新（ホストのみ）
    const updateQuizSettings = (newSettings) => {
        if (!isHost) return;

        setQuizSettings(newSettings);
        socketRef.current?.emit('quiz-update-settings', {
            roomId: `quiz_${roomId}`,
            settings: newSettings
        });
    };

    // クイズ開始（ホストのみ）
    const startQuiz = () => {
        if (!isHost) return;

        socketRef.current?.emit('quiz-start', {
            roomId: `quiz_${roomId}`,
            settings: quizSettings
        });
    };

    // クイズ退出
    const leaveQuiz = () => {
        if (socketRef.current) {
            socketRef.current.emit('quiz-leave', {
                roomId: `quiz_${roomId}`,
                userId,
                userName
            });
            socketRef.current.disconnect();
        }
        // 元のビデオ通話に戻る
        window.close(); // 新しいタブで開いている場合は閉じる
    };

    // 接続エラー時の表示
    if (connectionStatus === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-red-50">
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-md">
                    <div className="text-6xl mb-4">❌</div>
                    <h2 className="text-2xl font-bold text-red-600 mb-4">接続エラー</h2>
                    <p className="text-lg text-gray-700 mb-6">{error}</p>
                    <div className="flex gap-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-blue-600 text-white rounded-xl text-lg font-bold hover:bg-blue-700"
                        >
                            再試行
                        </button>
                        <button
                            onClick={leaveQuiz}
                            className="px-6 py-3 bg-gray-600 text-white rounded-xl text-lg font-bold hover:bg-gray-700"
                        >
                            戻る
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 接続中の表示
    if (connectionStatus === 'connecting') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-blue-50">
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <h2 className="text-2xl font-bold text-gray-800">クイズルームに接続中...</h2>
                    <p className="text-lg text-gray-600 mt-2">しばらくお待ちください</p>
                </div>
            </div>
        );
    }

    // 待機ロビー画面
    if (roomStatus === QUIZ_ROOM_STATUS.WAITING) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
                <div className="max-w-6xl mx-auto">
                    {/* ヘッダー */}
                    <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
                        <div className="flex justify-between items-center">
                            <h1 className="text-3xl font-bold text-gray-800">
                                🧠 みんなでクイズ
                            </h1>
                            <button
                                onClick={leaveQuiz}
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-lg"
                            >
                                退出
                            </button>
                        </div>
                        <p className="text-lg text-gray-600 mt-2">
                            ルーム: {roomId} | あなた: {userName}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 参加者リスト */}
                        <div className="bg-white rounded-2xl shadow-xl p-6">
                            <h2 className="text-2xl font-bold mb-4 text-gray-800">
                                👥 参加者 ({participants.length}人)
                            </h2>
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                {participants.map((participant, index) => (
                                    <div
                                        key={participant.userId}
                                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center text-xl font-bold">
                                                {participant.userName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-lg font-bold">
                                                    {participant.userName}
                                                </div>
                                                {participant.userId === userId && (
                                                    <div className="text-sm text-blue-600 font-bold">あなた</div>
                                                )}
                                            </div>
                                        </div>
                                        {index === 0 && (
                                            <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-bold">
                                                👑 ホスト
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {participants.length < 2 && (
                                <div className="mt-4 p-4 bg-blue-50 text-blue-700 rounded-xl text-center">
                                    <div className="text-lg font-bold">🕐 他の参加者を待っています</div>
                                    <div className="text-sm mt-2">
                                        ビデオ通話の参加者にクイズ参加を呼びかけてみましょう！
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* クイズ設定 */}
                        <div className="bg-white rounded-2xl shadow-xl p-6">
                            <h2 className="text-2xl font-bold mb-4 text-gray-800">
                                ⚙️ クイズ設定
                            </h2>

                            {isHost ? (
                                <div className="space-y-6">
                                    {/* カテゴリ選択 */}
                                    <div>
                                        <label className="block text-lg font-bold mb-3">📚 カテゴリ</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => updateQuizSettings({ ...quizSettings, category: 'mixed' })}
                                                className={`p-3 rounded-xl text-center transition-colors font-bold ${
                                                    quizSettings.category === 'mixed'
                                                        ? 'bg-blue-500 text-white'
                                                        : 'bg-gray-100 hover:bg-gray-200'
                                                }`}
                                            >
                                                🎲 ミックス
                                            </button>
                                            {Object.values(QUIZ_CATEGORIES).map(category => (
                                                <button
                                                    key={category.id}
                                                    onClick={() => updateQuizSettings({ ...quizSettings, category: category.id })}
                                                    className={`p-3 rounded-xl text-center transition-colors font-bold ${
                                                        quizSettings.category === category.id
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-gray-100 hover:bg-gray-200'
                                                    }`}
                                                    title={category.description}
                                                >
                                                    {category.icon} {category.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 難易度選択 */}
                                    <div>
                                        <label className="block text-lg font-bold mb-3">🎯 難易度</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {Object.values(DIFFICULTY_LEVELS).map(level => (
                                                <button
                                                    key={level.id}
                                                    onClick={() => updateQuizSettings({ 
                                                        ...quizSettings, 
                                                        difficulty: level.id,
                                                        timeLimit: level.timeLimit 
                                                    })}
                                                    className={`p-3 rounded-xl text-center transition-colors font-bold ${
                                                        quizSettings.difficulty === level.id
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-gray-100 hover:bg-gray-200'
                                                    }`}
                                                >
                                                    {level.icon} {level.name}
                                                    <div className="text-xs mt-1">{level.timeLimit}秒</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 問題数 */}
                                    <div>
                                        <label className="block text-lg font-bold mb-3">🔢 問題数</label>
                                        <select
                                            value={quizSettings.questionCount}
                                            onChange={(e) => updateQuizSettings({ 
                                                ...quizSettings, 
                                                questionCount: parseInt(e.target.value) 
                                            })}
                                            className="w-full p-3 border-2 border-gray-300 rounded-xl text-lg font-bold"
                                        >
                                            <option value={3}>3問（お試し）</option>
                                            <option value={5}>5問（標準）</option>
                                            <option value={10}>10問（たっぷり）</option>
                                            <option value={15}>15問（チャレンジ）</option>
                                        </select>
                                    </div>

                                    {/* 開始ボタン */}
                                    <button
                                        onClick={startQuiz}
                                        disabled={participants.length < 1}
                                        className={`w-full py-4 rounded-xl text-xl font-bold transition-colors ${
                                            participants.length >= 1
                                                ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
                                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                    >
                                        🚀 クイズを開始する
                                    </button>

                                    {participants.length < 1 && (
                                        <p className="text-center text-sm text-gray-500">
                                            ※ 1人以上いれば開始できます
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-gray-50 rounded-xl">
                                        <div className="text-lg space-y-2">
                                            <div><strong>📚 カテゴリ:</strong> {
                                                quizSettings.category === 'mixed' 
                                                    ? '🎲 ミックス' 
                                                    : `${QUIZ_CATEGORIES[quizSettings.category]?.icon} ${QUIZ_CATEGORIES[quizSettings.category]?.name}`
                                            }</div>
                                            <div><strong>🎯 難易度:</strong> {DIFFICULTY_LEVELS[quizSettings.difficulty]?.icon} {DIFFICULTY_LEVELS[quizSettings.difficulty]?.name}</div>
                                            <div><strong>🔢 問題数:</strong> {quizSettings.questionCount}問</div>
                                            <div><strong>⏰ 制限時間:</strong> {quizSettings.timeLimit}秒</div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-blue-50 text-blue-700 rounded-xl text-center">
                                        <div className="text-lg font-bold">👑 ホストがクイズを開始するまでお待ちください</div>
                                        <div className="text-sm mt-2">設定はホストが調整しています</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // クイズ進行中画面
    if (roomStatus === QUIZ_ROOM_STATUS.QUESTION_TIME || 
        roomStatus === QUIZ_ROOM_STATUS.ANSWER_TIME || 
        roomStatus === QUIZ_ROOM_STATUS.RESULT_TIME) {
        
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
                <div className="max-w-4xl mx-auto">
                    {/* ヘッダー情報 */}
                    <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <div className="text-2xl font-bold text-gray-600">
                                問題 {currentQuestionIndex + 1}/{questions.length}
                            </div>
                            <div className="bg-blue-100 px-6 py-3 rounded-2xl">
                                <span className="text-xl font-bold text-blue-800">
                                    {currentQuestion?.category ? QUIZ_CATEGORIES[currentQuestion.category]?.name || '混合' : '混合'}
                                </span>
                            </div>
                            <div className={`text-3xl font-bold px-6 py-3 rounded-2xl ${
                                timeLeft <= 10 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                                ⏰ {timeLeft}秒
                            </div>
                        </div>
                    </div>

                    {/* 問題文 */}
                    <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
                        <h2 className="text-3xl font-bold text-gray-800 leading-relaxed text-center">
                            {currentQuestion?.question}
                        </h2>
                    </div>

                    {/* 選択肢 */}
                    <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
                        {roomStatus === QUIZ_ROOM_STATUS.QUESTION_TIME ? (
                            <div className="grid grid-cols-1 gap-4">
                                {currentQuestion?.options?.map((option, index) => (
                                    <button
                                        key={index}
                                        onClick={() => submitAnswer(index)}
                                        disabled={selectedAnswer !== null}
                                        className="p-6 text-2xl font-bold border-3 border-gray-200 rounded-2xl
                                                 hover:border-blue-500 hover:bg-blue-50 transition-all
                                                 text-left shadow-sm hover:shadow-md disabled:opacity-50
                                                 disabled:cursor-not-allowed"
                                    >
                                        <span className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full mr-4 text-xl">
                                            {String.fromCharCode(65 + index)}
                                        </span>
                                        {option}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            // 結果表示時
                            <div className="grid grid-cols-1 gap-4">
                                {currentQuestion?.options?.map((option, index) => {
                                    let bgColor = 'bg-gray-100';
                                    let textColor = 'text-gray-700';
                                    let icon = '';
                                    let borderColor = 'border-gray-300';

                                    if (showExplanation && index === currentQuestion.correctAnswer) {
                                        bgColor = 'bg-green-100';
                                        textColor = 'text-green-800';
                                        borderColor = 'border-green-400';
                                        icon = '✅';
                                    } else if (showExplanation && index === selectedAnswer && index !== currentQuestion.correctAnswer) {
                                        bgColor = 'bg-red-100';
                                        textColor = 'text-red-800';
                                        borderColor = 'border-red-400';
                                        icon = '❌';
                                    }

                                    return (
                                        <div
                                            key={index}
                                            className={`p-6 text-2xl font-bold border-3 rounded-2xl ${bgColor} ${textColor} ${borderColor}`}
                                        >
                                            <span className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full mr-4 text-xl">
                                                {String.fromCharCode(65 + index)}
                                            </span>
                                            {option}
                                            {icon && <span className="float-right text-3xl">{icon}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 解説表示 */}
                        {roomStatus === QUIZ_ROOM_STATUS.RESULT_TIME && currentQuestion?.explanation && showExplanation && (
                            <div className="mt-6 bg-blue-50 rounded-2xl p-6">
                                <h3 className="text-2xl font-bold text-blue-800 mb-3">💡 解説</h3>
                                <p className="text-xl text-blue-700 leading-relaxed">{currentQuestion.explanation}</p>
                            </div>
                        )}

                        {/* 回答待ちメッセージ */}
                        {roomStatus === QUIZ_ROOM_STATUS.ANSWER_TIME && !showExplanation && (
                            <div className="mt-6 bg-yellow-50 rounded-2xl p-6 text-center">
                                <div className="text-xl font-bold text-yellow-800">
                                    ⏳ 他の参加者の回答を待っています...
                                </div>
                                <div className="text-lg text-yellow-700 mt-2">
                                    あなたの回答: <strong>{selectedAnswer !== null ? String.fromCharCode(65 + selectedAnswer) : '未回答'}</strong>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 参加者の回答状況 */}
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                        <h3 className="text-xl font-bold mb-4">👥 参加者の回答状況</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {participants.map(participant => (
                                <div
                                    key={participant.userId}
                                    className={`p-3 rounded-xl text-center transition-colors ${
                                        participant.hasAnswered 
                                            ? 'bg-green-100 text-green-800 border-2 border-green-300' 
                                            : 'bg-gray-100 text-gray-600 border-2 border-gray-300'
                                    }`}
                                >
                                    <div className="font-bold text-lg">{participant.userName}</div>
                                    <div className="text-sm mt-1">
                                        {participant.hasAnswered ? '✅ 回答済み' : '⏳ 回答中...'}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* 進捗バー */}
                        <div className="mt-4">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>回答済み: {participants.filter(p => p.hasAnswered).length}人</span>
                                <span>全体: {participants.length}人</span>
                            </div>
                            <div className="bg-gray-200 rounded-full h-3">
                                <div
                                    className="bg-green-500 h-3 rounded-full transition-all duration-500"
                                    style={{ 
                                        width: `${participants.length > 0 ? (participants.filter(p => p.hasAnswered).length / participants.length) * 100 : 0}%` 
                                    }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // 最終結果画面
    if (roomStatus === QUIZ_ROOM_STATUS.FINISHED && finalResults) {
        const myResult = finalResults.find(r => r.userId === userId);
        const sortedResults = [...finalResults].sort((a, b) => b.score.totalScore - a.score.totalScore);
        
        // スコアに応じたメッセージ
        const getScoreMessage = (percentage) => {
            if (percentage >= 90) return "🌟 完璧です！素晴らしい知識をお持ちですね！";
            if (percentage >= 80) return "👏 とても良くできました！博識ですね！";
            if (percentage >= 70) return "😊 良い結果です！なかなかやりますね！";
            if (percentage >= 60) return "🙂 まずまずの成績です！";
            if (percentage >= 50) return "😌 平均的な結果です！";
            return "💪 お疲れさまでした！また挑戦してくださいね！";
        };

        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
                <div className="max-w-6xl mx-auto">
                    {/* ヘッダー */}
                    <div className="bg-white rounded-2xl shadow-xl p-8 text-center mb-6">
                        <h1 className="text-4xl font-bold mb-4 text-gray-800">
                            🎉 クイズ終了！お疲れさまでした！
                        </h1>
                        {myResult && (
                            <div className="bg-gradient-to-r from-blue-100 to-purple-100 rounded-2xl p-6 max-w-2xl mx-auto">
                                <div className="text-3xl font-bold text-blue-600 mb-2">
                                    {myResult.userName}さんの結果
                                </div>
                                <div className="text-6xl font-bold text-blue-600 mb-3">
                                    {myResult.score.correctCount}/{myResult.score.totalQuestions}問正解
                                </div>
                                <div className="text-2xl text-gray-700 mb-3">
                                    スコア: <span className="font-bold text-blue-600">{myResult.score.totalScore}点</span> | 
                                    正解率: <span className="font-bold text-blue-600">{myResult.score.percentage}%</span>
                                </div>
                                <div className="text-xl text-gray-600">
                                    {getScoreMessage(myResult.score.percentage)}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ランキング */}
                        <div className="bg-white rounded-2xl shadow-xl p-6">
                            <h2 className="text-2xl font-bold mb-6 text-gray-800">🏆 最終ランキング</h2>
                            <div className="space-y-4 max-h-96 overflow-y-auto">
                                {sortedResults.map((result, index) => {
                                    const isMyResult = result.userId === userId;
                                    const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
                                    
                                    return (
                                        <div
                                            key={result.userId}
                                            className={`p-4 rounded-xl flex items-center justify-between transition-all ${
                                                isMyResult 
                                                    ? 'bg-blue-50 border-2 border-blue-200 shadow-md' 
                                                    : 'bg-gray-50 border-2 border-gray-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold ${
                                                    index === 0 ? 'bg-yellow-500 text-white' :
                                                    index === 1 ? 'bg-gray-400 text-white' :
                                                    index === 2 ? 'bg-orange-600 text-white' :
                                                    'bg-blue-500 text-white'
                                                }`}>
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl">{rankEmoji}</span>
                                                        <span className={`text-xl font-bold ${isMyResult ? 'text-blue-600' : 'text-gray-800'}`}>
                                                            {result.userName}
                                                        </span>
                                                        {isMyResult && (
                                                            <span className="bg-blue-500 text-white px-2 py-1 rounded-full text-sm font-bold">
                                                                あなた
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-base text-gray-600">
                                                        {result.score.correctCount}/{result.score.totalQuestions}問正解 
                                                        ({result.score.percentage}%)
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-bold text-blue-600">
                                                    {result.score.totalScore}
                                                </div>
                                                <div className="text-sm text-gray-600">
                                                    ポイント
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 詳細統計 */}
                        <div className="bg-white rounded-2xl shadow-xl p-6">
                            <h2 className="text-2xl font-bold mb-6 text-gray-800">📊 詳細統計</h2>
                            
                            {myResult && (
                                <div className="space-y-6">
                                    {/* 個人統計 */}
                                    <div className="bg-blue-50 p-4 rounded-xl">
                                        <div className="text-xl font-bold mb-3 text-blue-800">🎯 あなたの詳細</div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white p-3 rounded-lg text-center">
                                                <div className="text-3xl font-bold text-green-600">
                                                    {myResult.score.correctCount}
                                                </div>
                                                <div className="text-sm text-gray-600">正解数</div>
                                            </div>
                                            <div className="bg-white p-3 rounded-lg text-center">
                                                <div className="text-3xl font-bold text-red-600">
                                                    {myResult.score.totalQuestions - myResult.score.correctCount}
                                                </div>
                                                <div className="text-sm text-gray-600">不正解数</div>
                                            </div>
                                            <div className="bg-white p-3 rounded-lg text-center">
                                                <div className="text-3xl font-bold text-blue-600">
                                                    {myResult.score.totalScore}
                                                </div>
                                                <div className="text-sm text-gray-600">総得点</div>
                                            </div>
                                            <div className="bg-white p-3 rounded-lg text-center">
                                                <div className="text-3xl font-bold text-purple-600">
                                                    {sortedResults.findIndex(r => r.userId === userId) + 1}位
                                                </div>
                                                <div className="text-sm text-gray-600">順位</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 全体統計 */}
                                    <div className="bg-gray-50 p-4 rounded-xl">
                                        <div className="text-xl font-bold mb-3 text-gray-800">📈 全体統計</div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between">
                                                <span>参加者数:</span>
                                                <span className="font-bold">{finalResults.length}人</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>平均スコア:</span>
                                                <span className="font-bold">
                                                    {Math.round(finalResults.reduce((sum, r) => sum + r.score.totalScore, 0) / finalResults.length)}点
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>平均正解率:</span>
                                                <span className="font-bold">
                                                    {Math.round(finalResults.reduce((sum, r) => sum + r.score.percentage, 0) / finalResults.length)}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>最高得点:</span>
                                                <span className="font-bold text-yellow-600">
                                                    {Math.max(...finalResults.map(r => r.score.totalScore))}点
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>問題数:</span>
                                                <span className="font-bold">{myResult.score.totalQuestions}問</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 表彰 */}
                                    {sortedResults.length > 1 && (
                                        <div className="bg-yellow-50 p-4 rounded-xl">
                                            <div className="text-xl font-bold mb-3 text-yellow-800">🎊 表彰</div>
                                            <div className="space-y-2">
                                                {sortedResults[0] && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl">🥇</span>
                                                        <span className="font-bold">
                                                            チャンピオン: {sortedResults[0].userName} 
                                                            ({sortedResults[0].score.totalScore}点)
                                                        </span>
                                                    </div>
                                                )}
                                                {/* 最高正解率 */}
                                                {(() => {
                                                    const bestAccuracy = Math.max(...finalResults.map(r => r.score.percentage));
                                                    const bestAccuracyUser = finalResults.find(r => r.score.percentage === bestAccuracy);
                                                    return bestAccuracyUser && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-2xl">🎯</span>
                                                            <span className="font-bold">
                                                                正確王: {bestAccuracyUser.userName} 
                                                                ({bestAccuracy}%)
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* クイズ設定情報 */}
                    <div className="mt-6 bg-white rounded-2xl shadow-xl p-6">
                        <h3 className="text-xl font-bold mb-4 text-gray-800">📋 今回のクイズ情報</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="bg-gray-50 p-3 rounded-xl">
                                <div className="text-lg font-bold text-gray-600">カテゴリ</div>
                                <div className="text-xl">
                                    {quizSettings.category === 'mixed' 
                                        ? '🎲 ミックス' 
                                        : `${QUIZ_CATEGORIES[quizSettings.category]?.icon} ${QUIZ_CATEGORIES[quizSettings.category]?.name}`
                                    }
                                </div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-xl">
                                <div className="text-lg font-bold text-gray-600">難易度</div>
                                <div className="text-xl">
                                    {DIFFICULTY_LEVELS[quizSettings.difficulty]?.icon} {DIFFICULTY_LEVELS[quizSettings.difficulty]?.name}
                                </div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-xl">
                                <div className="text-lg font-bold text-gray-600">問題数</div>
                                <div className="text-xl font-bold">{quizSettings.questionCount}問</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-xl">
                                <div className="text-lg font-bold text-gray-600">制限時間</div>
                                <div className="text-xl font-bold">{quizSettings.timeLimit}秒</div>
                            </div>
                        </div>
                    </div>

                    {/* アクションボタン */}
                    <div className="mt-6 flex flex-col md:flex-row justify-center gap-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-8 py-4 bg-blue-600 text-white rounded-xl text-xl font-bold 
                                     hover:bg-blue-700 transition-colors shadow-lg
                                     flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl">🔄</span>
                            もう一度挑戦
                        </button>
                        <button
                            onClick={() => {
                                // 結果をローカルストレージに保存（オプション）
                                try {
                                    const quizHistory = JSON.parse(localStorage.getItem('quiz_history') || '[]');
                                    quizHistory.push({
                                        date: new Date().toISOString(),
                                        roomId,
                                        settings: quizSettings,
                                        myResult,
                                        participantCount: finalResults.length
                                    });
                                    localStorage.setItem('quiz_history', JSON.stringify(quizHistory.slice(-10))); // 最新10件のみ保存
                                } catch (e) {
                                    console.log('Failed to save quiz history:', e);
                                }
                                
                                leaveQuiz();
                            }}
                            className="px-8 py-4 bg-green-600 text-white rounded-xl text-xl font-bold 
                                     hover:bg-green-700 transition-colors shadow-lg
                                     flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl">🏠</span>
                            ビデオ通話に戻る
                        </button>
                        <button
                            onClick={() => {
                                // 結果をシェア（簡易版）
                                const shareText = `みんなでクイズをやりました！\n` +
                                    `結果: ${myResult?.score.correctCount}/${myResult?.score.totalQuestions}問正解 ` +
                                    `(${myResult?.score.percentage}%)\n` +
                                    `スコア: ${myResult?.score.totalScore}点\n` +
                                    `順位: ${sortedResults.findIndex(r => r.userId === userId) + 1}/${finalResults.length}位`;
                                
                                if (navigator.share) {
                                    navigator.share({
                                        title: 'クイズ結果',
                                        text: shareText
                                    });
                                } else {
                                    navigator.clipboard.writeText(shareText).then(() => {
                                        alert('結果をクリップボードにコピーしました！');
                                    });
                                }
                            }}
                            className="px-8 py-4 bg-purple-600 text-white rounded-xl text-xl font-bold 
                                     hover:bg-purple-700 transition-colors shadow-lg
                                     flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl">📤</span>
                            結果をシェア
                        </button>
                    </div>

                    {/* お疲れさまメッセージ */}
                    <div className="mt-6 bg-gradient-to-r from-pink-100 to-purple-100 rounded-2xl p-6 text-center">
                        <div className="text-2xl font-bold text-gray-800 mb-2">
                            🎊 皆さまお疲れさまでした！ 🎊
                        </div>
                        <div className="text-lg text-gray-600">
                            今日も楽しい時間をありがとうございました。また一緒にクイズを楽しみましょう！
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // デフォルト画面（何かエラーが起きた場合など）
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <div className="text-6xl mb-4">🤔</div>
                <div className="text-2xl font-bold text-gray-600 mb-4">何かおかしいようです</div>
                <div className="text-lg text-gray-500 mb-6">
                    ページを再読み込みしてみてください
                </div>
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-3 bg-blue-600 text-white rounded-xl text-lg font-bold hover:bg-blue-700"
                    >
                        再読み込み
                    </button>
                    <button
                        onClick={leaveQuiz}
                        className="px-6 py-3 bg-gray-600 text-white rounded-xl text-lg font-bold hover:bg-gray-700"
                    >
                        戻る
                    </button>
                </div>
            </div>
        </div>
    );
}