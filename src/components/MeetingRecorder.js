'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const MeetingRecorder = ({ roomId, userId, userName, isAudioOn }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const recognitionRef = useRef(null);
    const activeMeetingIdRef = useRef(null);
    const isInitializedRef = useRef(false);
    const processingRef = useRef(false);
    const pendingSpeechesRef = useRef([]);
    const maxRetries = 3;
    const retryDelay = 1000;
    const cleanupTimeoutRef = useRef(null);

    // デバッグ用のログ関数
    const logDebug = (message, data = null) => {
        console.log(`★ [MeetingRecorder] ${message}`, data ? data : '');
    };

    // キューに音声を追加
    const saveSpeechToQueue = useCallback((content) => {
        if (!content.trim() || !activeMeetingIdRef.current) {
            logDebug('Empty content or no active meeting, skipping');
            return;
        }

        const speechData = {
            content: content.trim(),
            timestamp: new Date().toISOString(),
            retryCount: 0
        };

        logDebug('Adding speech to queue:', speechData);
        pendingSpeechesRef.current.push(speechData);
        processSpeechQueue(); // 即座にキュー処理を開始
    }, []);

    // キューの処理
    const processSpeechQueue = useCallback(async () => {
        if (processingRef.current || !activeMeetingIdRef.current || pendingSpeechesRef.current.length === 0) {
            return;
        }

        processingRef.current = true;
        let currentSpeech;

        try {
            currentSpeech = pendingSpeechesRef.current[0];
            logDebug('Processing speech:', currentSpeech);

            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    meetingId: activeMeetingIdRef.current,
                    userId,
                    content: currentSpeech.content
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            setTranscript(prev => [
                ...prev,
                {
                    id: data.id,
                    userName,
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
    }, [userId, userName, maxRetries]);

    // 音声認識結果のハンドリング
    const handleSpeechResult = useCallback((event) => {
        if (!isRecording || !activeMeetingIdRef.current) {
            logDebug('Skip - not recording or no active meeting');
            return;
        }

        const results = event.results;
        for (let i = event.resultIndex; i < results.length; i++) {
            const result = results[i];
            if (result.isFinal) {
                const transcript = result[0].transcript.trim();
                if (transcript) {
                    logDebug('Final transcript:', transcript);
                    saveSpeechToQueue(transcript);
                }
            }
        }
    }, [isRecording, saveSpeechToQueue]);

    // 音声認識の初期化と開始
    const initializeSpeechRecognition = useCallback(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setError('This browser does not support speech recognition');
            return null;
        }

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onstart = () => {
            logDebug('Speech recognition started');
            setError(null);
        };

        recognition.onend = () => {
            logDebug('Speech recognition ended');
            // 手動で停止した場合は再開しない
            if (isRecording && activeMeetingIdRef.current && !recognition.manualStop) {
                try {
                    recognition.start();
                    logDebug('Recognition restarted');
                } catch (error) {
                    console.error('Failed to restart recognition:', error);
                    setError('Failed to restart speech recognition');
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setError(`Speech recognition error: ${event.error}`);
        };

        recognition.onresult = handleSpeechResult;

        return recognition;
    }, [handleSpeechResult, isRecording]);

    // 会議終了処理
    const endMeeting = async () => {
        if (!activeMeetingIdRef.current) return;

        try {
            const response = await fetch(`/api/meetings/${activeMeetingIdRef.current}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endTime: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error('Failed to end meeting');
            }

            const data = await response.json();
            logDebug('Meeting ended:', data);

            setMeetingId(null);
            activeMeetingIdRef.current = null;
            setTranscript([]);
            pendingSpeechesRef.current = [];

        } catch (error) {
            console.error('Failed to end meeting:', error);
            setError(`Failed to end meeting: ${error.message}`);
        }
    };

    // 録音開始
    const startRecording = async () => {
        try {
            const response = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId })
            });

            if (!response.ok) {
                throw new Error('Failed to create meeting');
            }

            const data = await response.json();
            setMeetingId(data.meetingId);
            activeMeetingIdRef.current = data.meetingId;

            const recognition = initializeSpeechRecognition();
            if (!recognition) {
                throw new Error('Failed to initialize speech recognition');
            }

            recognitionRef.current = recognition;
            recognition.start();
            setIsRecording(true);
            setError(null);

        } catch (error) {
            console.error('Failed to start recording:', error);
            setError(`Failed to start recording: ${error.message}`);
            setIsRecording(false);
            setMeetingId(null);
            activeMeetingIdRef.current = null;
        }
    };

    // 録音停止
    const stopRecording = async () => {
        logDebug('Stopping recording');

        if (!activeMeetingIdRef.current) {
            logDebug('No active meeting, aborting');
            return;
        }

        try {
            setIsSaving(true);

            // 音声認識の停止
            if (recognitionRef.current) {
                recognitionRef.current.manualStop = true;
                recognitionRef.current.stop();
                logDebug('Recognition stopped');
            }

            // 残りの音声データを処理
            logDebug('Processing remaining speeches:', pendingSpeechesRef.current.length);
            while (pendingSpeechesRef.current.length > 0) {
                await processSpeechQueue();
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            logDebug('All speeches processed');
            await endMeeting();

        } catch (error) {
            console.error('Error during stop recording:', error);
            setError(`Failed to stop recording: ${error.message}`);
        } finally {
            setIsRecording(false);
            recognitionRef.current = null;
            processingRef.current = false;
            setIsSaving(false);
            logDebug('Recording stopped and cleaned up');
        }
    };

    // クリーンアップ
    useEffect(() => {
        return () => {
            const cleanup = async () => {
                if (recognitionRef.current) {
                    await stopRecording();
                }
                if (cleanupTimeoutRef.current) {
                    clearTimeout(cleanupTimeoutRef.current);
                }
            };
            cleanup();
        };
    }, []);

    return (
        <div className="fixed right-4 top-20 w-80 bg-white/90 rounded-lg shadow-lg p-4 max-h-[calc(100vh-120px)] overflow-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">議事録</h3>
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!isAudioOn || error || isSaving}
                    className={`
                        px-4 py-2 rounded-lg 
                        transition-all duration-200 ease-in-out
                        flex items-center gap-2
                        ${isRecording
                            ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }
                        ${(!isAudioOn || error || isSaving) && 'opacity-50 cursor-not-allowed'}
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
                {transcript.map((item) => (
                    <div key={item.id} className="bg-white rounded p-3 shadow-sm">
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