'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const MeetingRecorder = ({ roomId, userId, userName, isAudioOn, users, socketRef }) => {
    // State管理
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isInitiator, setIsInitiator] = useState(false);
    const [recordingInitiator, setRecordingInitiator] = useState(null);

    // Ref管理
    const recognitionRef = useRef(null);
    const meetingIdRef = useRef(null);
    const processingRef = useRef(false);
    const pendingSpeechesRef = useRef([]);
    const isInitializedRef = useRef(false);
    const isRecordingRef = useRef(false);
    const localSocketRef = useRef(null);

    // 定数
    const maxRetries = 3;
    const retryDelay = 1000;

    // デバッグログ
    const logDebug = (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`★ [MeetingRecorder ${timestamp}] ${message}`, data ? data : '');
    };

    // キューに音声を追加（送信者の情報を含める）
    const saveSpeechToQueue = useCallback((content, speakerId, speakerName) => {
        if (!content.trim()) {
            logDebug('Empty content, skipping');
            return;
        }

        if (!meetingIdRef.current) {
            logDebug('No active meeting ID, skipping');
            return;
        }

        const speechData = {
            content: content.trim(),
            timestamp: new Date().toISOString(),
            userId: speakerId,
            userName: speakerName,
            retryCount: 0
        };

        logDebug('Adding speech to queue:', speechData);
        pendingSpeechesRef.current.push(speechData);
        void processSpeechQueue();
    }, []);

    // 録音開始処理
    const startRecording = async () => {
        try {
            setIsSaving(true);
            logDebug('Starting new recording session');

            if (!isAudioOn) {
                throw new Error('マイクがミュートされています');
            }

            // ミーティングの作成
            const response = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId })
            });

            if (!response.ok) {
                throw new Error('Failed to create meeting');
            }

            const data = await response.json();
            logDebug('Meeting created:', data);

            // 状態の更新
            setMeetingId(data.meetingId);
            meetingIdRef.current = data.meetingId;
            setIsInitiator(true);
            setRecordingInitiator(userName);

            // Socket.IOで録音開始を通知（ミーティングIDと開始者情報を含める）
            if (socketRef.current) {
                socketRef.current.emit('recording-start', {
                    meetingId: data.meetingId,
                    roomId,
                    initiatorId: userId,
                    initiatorName: userName
                });
            }

            // 音声認識の開始
            await initializeRecognition();

        } catch (error) {
            console.error('Failed to start recording:', error);
            setError(error.message);
            setIsRecording(false);
            isRecordingRef.current = false;
            setMeetingId(null);
            meetingIdRef.current = null;
        } finally {
            setIsSaving(false);
        }
    };

    // 録音停止処理
    const stopRecording = async (emitEvent = true) => {
        try {
            setIsSaving(true);
            logDebug('Stopping recording');

            if (emitEvent && socketRef.current) {
                socketRef.current.emit('recording-stop', {
                    meetingId: meetingIdRef.current,
                    roomId,
                    initiatorId: userId
                });
            }

            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }

            // 残りの音声データを処理
            while (pendingSpeechesRef.current.length > 0) {
                await processSpeechQueue();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // ミーティングを終了（initiatorの場合のみ）
            if (isInitiator) {
                const response = await fetch(`/api/meetings/${meetingIdRef.current}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endTime: new Date().toISOString()
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to end meeting');
                }
            }

            // 状態のリセット
            setIsRecording(false);
            isRecordingRef.current = false;
            setMeetingId(null);
            meetingIdRef.current = null;
            recognitionRef.current = null;
            setIsInitiator(false);
            setRecordingInitiator(null);

        } catch (error) {
            console.error('Error during stop recording:', error);
            setError(`Failed to stop recording: ${error.message}`);
        } finally {
            setIsSaving(false);
            processingRef.current = false;
        }
    };

    // Socket.IOイベントハンドラの設定
    useEffect(() => {
        if (!socketRef.current) return;

        localSocketRef.current = socketRef.current;

        // 録音開始イベントのハンドラ
        const handleRecordingStart = async ({ meetingId: remoteMeetingId, initiatorName }) => {
            logDebug(`Received recording start from ${initiatorName}`);

            setMeetingId(remoteMeetingId);
            meetingIdRef.current = remoteMeetingId;
            setRecordingInitiator(initiatorName);
            setIsRecording(true);
            isRecordingRef.current = true;

            try {
                await initializeRecognition();
            } catch (error) {
                console.error('Error starting remote recording:', error);
                setError(`Failed to start recording: ${error.message}`);
            }
        };

        // 録音停止イベントのハンドラ
        const handleRecordingStop = async () => {
            if (!isRecordingRef.current) return;
            try {
                await stopRecording(false);
            } catch (error) {
                console.error('Error stopping remote recording:', error);
            }
        };

        // 他の参加者からの音声データを受信
        const handleRemoteSpeech = ({ content, userId: speakerId, userName: speakerName }) => {
            if (!isRecordingRef.current) return;
            saveSpeechToQueue(content, speakerId, speakerName);
        };

        // イベントリスナーの登録
        localSocketRef.current.on('recording-start', handleRecordingStart);
        localSocketRef.current.on('recording-stop', handleRecordingStop);
        localSocketRef.current.on('speech-data', handleRemoteSpeech);

        return () => {
            if (localSocketRef.current) {
                localSocketRef.current.off('recording-start', handleRecordingStart);
                localSocketRef.current.off('recording-stop', handleRecordingStop);
                localSocketRef.current.off('speech-data', handleRemoteSpeech);
            }
        };
    }, [socketRef?.current, saveSpeechToQueue]);

    // 音声認識の初期化と開始
    const initializeRecognition = async () => {
        if (!('webkitSpeechRecognition' in window)) {
            throw new Error('This browser does not support speech recognition');
        }

        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onstart = () => {
            logDebug('Speech recognition started');
            setError(null);
            setIsRecording(true);
            isRecordingRef.current = true;
        };

        recognition.onresult = (event) => {
            if (!isRecordingRef.current || !meetingIdRef.current) return;

            const results = event.results;
            for (let i = event.resultIndex; i < results.length; i++) {
                const result = results[i];
                if (result.isFinal) {
                    const transcript = result[0].transcript.trim();
                    if (transcript) {
                        // 自分の音声をキューに追加
                        saveSpeechToQueue(transcript, userId, userName);

                        // 他の参加者に音声データを送信
                        if (socketRef.current) {
                            socketRef.current.emit('speech-data', {
                                content: transcript,
                                userId,
                                userName
                            });
                        }
                    }
                }
            }
        };

        recognition.onend = () => {
            if (isRecordingRef.current) {
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Failed to restart recognition:', error);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event);
            setError(`Speech recognition error: ${event.error}`);
        };

        recognitionRef.current = recognition;
        await recognition.start();
    };

    // キューの処理
    const processSpeechQueue = async () => {
        if (processingRef.current || !meetingIdRef.current || pendingSpeechesRef.current.length === 0) {
            return;
        }

        processingRef.current = true;
        let currentSpeech = null;

        try {
            currentSpeech = pendingSpeechesRef.current[0];

            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId: meetingIdRef.current,
                    userId: currentSpeech.userId,
                    content: currentSpeech.content
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to save speech: ${response.statusText}`);
            }

            const data = await response.json();
            setTranscript(prev => [...prev, {
                id: data.id,
                userId: currentSpeech.userId,
                userName: currentSpeech.userName,
                content: currentSpeech.content,
                timestamp: currentSpeech.timestamp
            }]);

            pendingSpeechesRef.current.shift();
            setError(null);

        } catch (error) {
            console.error('Failed to save speech:', error);
            if (currentSpeech) {
                currentSpeech.retryCount = (currentSpeech.retryCount || 0) + 1;
                if (currentSpeech.retryCount >= maxRetries) {
                    pendingSpeechesRef.current.shift();
                    setError(`Failed to save speech after ${maxRetries} attempts`);
                }
            }
        } finally {
            processingRef.current = false;
            if (pendingSpeechesRef.current.length > 0) {
                setTimeout(processSpeechQueue, retryDelay);
            }
        }
    };

    // クリーンアップ
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (isRecordingRef.current) {
                stopRecording(true).catch(console.error);
            }
        };
    }, []);

    return (
        <div className="fixed right-4 top-20 w-80 bg-white/90 rounded-lg shadow-lg p-4 max-h-[calc(100vh-120px)] overflow-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">議事録</h3>
                <button
                    onClick={isRecording ? () => stopRecording(true) : startRecording}
                    disabled={!isAudioOn || isSaving}
                    className={`
                        px-4 py-2 rounded-lg 
                        transition-all duration-200 ease-in-out
                        flex items-center gap-2
                        ${isRecording
                            ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }
                        ${(!isAudioOn || isSaving) && 'opacity-50 cursor-not-allowed'}
                    `}
                >
                    {isSaving ? (
                        <span>保存中...</span>
                    ) : (
                        <span>{isRecording ? '録音停止' : '録音開始'}</span>
                    )}
                </button>
            </div>

            {error && (
                <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
                    {error}
                </div>
            )}

            {isRecording && (
                <div className="mb-4 p-2 bg-green-100 text-green-700 rounded text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        録音中...
                    </div>
                    {recordingInitiator && (
                        <div className="text-xs mt-1">
                            開始者: {recordingInitiator}
                        </div>
                    )}
                    <div className="text-xs mt-1">
                        処理待ち: {pendingSpeechesRef.current.length} 件
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {transcript.map((item, index) => (
                    <div key={item.id || index} className="bg-white rounded p-3 shadow-sm">
                        <div className="flex justify-between text-sm text-gray-500 mb-1">
                            <span>{item.userName}</span>
                            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-gray-700">{item.content}</p>
                    </div>
                ))}
                {transcript.length === 0 && !isRecording && (
                    <p className="text-gray-500 text-center text-sm">
                        録音を開始すると発言が記録されます
                    </p>
                )}
            </div>
        </div>
    );
};

export default MeetingRecorder;