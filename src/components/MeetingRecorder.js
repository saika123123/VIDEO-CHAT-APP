'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const MeetingRecorder = ({ roomId, userId, userName, isAudioOn, users, socketRef }) => {
    // State管理
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Ref管理
    const recognitionRef = useRef(null);
    const meetingIdRef = useRef(null);
    const processingRef = useRef(false);
    const pendingSpeechesRef = useRef([]);
    const isInitializedRef = useRef(false);
    const isRecordingRef = useRef(false);

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

    // キューの処理
    const processSpeechQueue = useCallback(async () => {
        if (processingRef.current) {
            logDebug('Already processing queue, skipping');
            return;
        }

        if (!meetingIdRef.current) {
            logDebug('No active meeting ID, cannot process queue');
            return;
        }

        if (pendingSpeechesRef.current.length === 0) {
            logDebug('Queue is empty, nothing to process');
            return;
        }

        processingRef.current = true;
        let currentSpeech = null;

        try {
            currentSpeech = pendingSpeechesRef.current[0];
            logDebug('Processing speech:', currentSpeech);

            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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
            logDebug('Speech saved successfully:', data);

            setTranscript(prev => [
                ...prev,
                {
                    id: data.id,
                    userName: currentSpeech.userName,
                    content: currentSpeech.content,
                    timestamp: currentSpeech.timestamp
                }
            ]);

            pendingSpeechesRef.current.shift();
            setError(null);

        } catch (error) {
            console.error('Failed to save speech:', error);
            if (currentSpeech) {
                currentSpeech.retryCount = (currentSpeech.retryCount || 0) + 1;
                if (currentSpeech.retryCount >= maxRetries) {
                    logDebug(`Max retries reached for speech, discarding:`, currentSpeech);
                    pendingSpeechesRef.current.shift();
                    setError(`Failed to save speech after ${maxRetries} attempts`);
                } else {
                    logDebug(`Retry attempt ${currentSpeech.retryCount} for speech`);
                }
            }
        } finally {
            processingRef.current = false;
            if (pendingSpeechesRef.current.length > 0) {
                setTimeout(processSpeechQueue, retryDelay);
            }
        }
    }, [maxRetries]);

    // Socket.IOイベントハンドラの設定
    useEffect(() => {
        if (!socketRef.current || !isRecording) return;

        // 他の参加者からの音声データを受信
        const handleRemoteSpeech = ({ content, userId: speakerId, userName: speakerName }) => {
            logDebug(`Received remote speech from ${speakerName}:`, content);
            saveSpeechToQueue(content, speakerId, speakerName);
        };

        socketRef.current.on('speech-data', handleRemoteSpeech);

        return () => {
            socketRef.current.off('speech-data', handleRemoteSpeech);
        };
    }, [socketRef, isRecording, saveSpeechToQueue]);

    // 音声認識結果のハンドリング
    const handleSpeechResult = useCallback((event) => {
        if (!isRecordingRef.current || !meetingIdRef.current) {
            return;
        }

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
    }, [userId, userName, saveSpeechToQueue, socketRef]);

    // 音声認識の初期化
    const initializeSpeechRecognition = useCallback(() => {
        if (!('webkitSpeechRecognition' in window)) {
            throw new Error('This browser does not support speech recognition');
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

        recognition.onend = () => {
            logDebug('Speech recognition ended');
            if (isRecordingRef.current && meetingIdRef.current && !recognition.manualStop) {
                try {
                    recognition.start();
                    logDebug('Recognition restarted');
                } catch (error) {
                    console.error('Failed to restart recognition:', error);
                    setError('Failed to restart speech recognition');
                    setIsRecording(false);
                    isRecordingRef.current = false;
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event);
            logDebug(`Recognition error: ${event.error}`);
            setError(`Speech recognition error: ${event.error}`);
            if (event.error === 'not-allowed') {
                setIsRecording(false);
                isRecordingRef.current = false;
            }
        };

        recognition.onresult = handleSpeechResult;
        return recognition;
    }, [handleSpeechResult]);

    // 録音開始
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

            // Socket.IOで録音開始を通知
            if (socketRef.current) {
                socketRef.current.emit('recording-started', {
                    meetingId: data.meetingId,
                    userId,
                    userName
                });
            }

            // 音声認識の初期化と開始
            if (!recognitionRef.current) {
                recognitionRef.current = initializeSpeechRecognition();
            }

            setIsRecording(true);
            isRecordingRef.current = true;

            await recognitionRef.current.start();
            logDebug('Recognition started successfully');

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

    // 録音停止
    const stopRecording = async () => {
        logDebug('Stopping recording');

        if (!meetingIdRef.current) {
            logDebug('No active meeting, cannot stop');
            return;
        }

        try {
            setIsSaving(true);

            // Socket.IOで録音停止を通知
            if (socketRef.current) {
                socketRef.current.emit('recording-stopped', {
                    meetingId: meetingIdRef.current
                });
            }

            setIsRecording(false);
            isRecordingRef.current = false;

            if (recognitionRef.current) {
                recognitionRef.current.stop();
                logDebug('Recognition stopped');
            }

            // 残りの音声データを処理
            while (pendingSpeechesRef.current.length > 0) {
                await processSpeechQueue();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // ミーティングを終了
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

            logDebug('Meeting ended successfully');

            // 状態のリセット
            setMeetingId(null);
            meetingIdRef.current = null;
            recognitionRef.current = null;

        } catch (error) {
            console.error('Error during stop recording:', error);
            setError(`Failed to stop recording: ${error.message}`);
        } finally {
            setIsSaving(false);
            processingRef.current = false;
        }
    };

    // クリーンアップ
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
            setIsRecording(false);
            isRecordingRef.current = false;
            if (meetingIdRef.current) {
                stopRecording();
            }
        };
    }, []);

    return (
        <div className="fixed right-4 top-20 w-80 bg-white/90 rounded-lg shadow-lg p-4 max-h-[calc(100vh-120px)] overflow-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">議事録</h3>
                <button
                    onClick={isRecording ? stopRecording : startRecording}
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
                <div className="mb-4 p-2 bg-green-100 text-green-700 rounded text-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    録音中... ({pendingSpeechesRef.current.length} 件処理待ち)
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