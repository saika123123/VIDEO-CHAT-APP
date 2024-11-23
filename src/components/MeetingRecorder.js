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

    // 音声認識の結果をキューに追加
    // saveSpeechToQueue関数を修正
    const saveSpeechToQueue = useCallback((content) => {
        if (!content.trim()) return;

        const speechData = {
            content: content.trim(),
            timestamp: new Date().toISOString(),
            retryCount: 0
        };

        console.log('Adding speech to queue:', speechData);
        pendingSpeechesRef.current.push(speechData);

        // キューの状態をログ出力
        console.log('Current queue length:', pendingSpeechesRef.current.length);
    }, []);

    // キューの処理
    const processSpeechQueue = useCallback(async () => {
        if (processingRef.current || !activeMeetingIdRef.current || pendingSpeechesRef.current.length === 0) {
            return;
        }

        processingRef.current = true;
        const speech = pendingSpeechesRef.current[0];

        try {
            console.log('Processing speech:', speech);
            console.log('Current meeting ID:', activeMeetingIdRef.current);

            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    meetingId: activeMeetingIdRef.current,
                    userId,
                    content: speech.content
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Speech saved successfully:', data);

            setTranscript(prev => [...prev, {
                id: data.id,
                userName,
                content: speech.content,
                timestamp: speech.timestamp
            }]);

            // 成功したらキューから削除
            pendingSpeechesRef.current.shift();
            setError(null);

        } catch (error) {
            console.error('Failed to save speech:', error);
            speech.retryCount++;

            if (speech.retryCount >= maxRetries) {
                console.log('Max retries reached, removing from queue:', speech);
                pendingSpeechesRef.current.shift();
                setError(`Failed to save speech after ${maxRetries} attempts: ${error.message}`);
            }
        } finally {
            processingRef.current = false;

            // キューに残りがあれば再度処理
            if (pendingSpeechesRef.current.length > 0) {
                setTimeout(() => processSpeechQueue(), retryDelay);
            }
        }
    }, [userId, userName, maxRetries]);

    // 定期的なキュー処理
    useEffect(() => {
        const interval = setInterval(() => {
            if (pendingSpeechesRef.current.length > 0 && !processingRef.current) {
                console.log('Processing queue:', pendingSpeechesRef.current.length, 'items remaining');
                processSpeechQueue();
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [processSpeechQueue]);

    // 音声認識結果のハンドリング
    const handleSpeechResult = useCallback((event) => {
        if (!isRecording || !activeMeetingIdRef.current) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
                const transcript = result[0].transcript.trim();
                if (transcript) {
                    console.log('Got final transcript:', transcript);
                    saveSpeechToQueue(transcript);
                }
            }
        }
    }, [isRecording, saveSpeechToQueue]);

    // 音声認識の初期化
    // 音声認識の初期化を修正
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
            console.log('Speech recognition started');
            setError(null);
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            // onendイベントで処理完了フラグを設定
            recognition.isEnded = true;

            if (isRecording && activeMeetingIdRef.current && !recognition.manualStop) {
                try {
                    recognition.start();
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
    }, [isRecording, handleSpeechResult]);

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
            console.log('Meeting created:', data);

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
    // stopRecording関数の修正
    // 録音停止の処理を修正
    // 録音停止の処理を修正
    const stopRecording = async () => {
        if (!activeMeetingIdRef.current) return;

        try {
            setIsSaving(true);

            // 音声認識の停止をPromiseでラップ
            const stopRecognition = () => {
                return new Promise((resolve) => {
                    if (!recognitionRef.current) {
                        resolve();
                        return;
                    }

                    // 手動停止フラグを設定
                    recognitionRef.current.manualStop = true;

                    // onendイベントのリスナーを追加
                    const handleEnd = () => {
                        console.log('Recognition stopped completely');
                        recognitionRef.current.removeEventListener('end', handleEnd);
                        // 最後の結果を処理するための短い遅延
                        setTimeout(resolve, 500);
                    };

                    recognitionRef.current.addEventListener('end', handleEnd);
                    recognitionRef.current.stop();
                });
            };

            // 音声認識の完全な停止を待つ
            console.log('Stopping speech recognition...');
            await stopRecognition();
            console.log('Speech recognition stopped');

            // 残っている音声データの処理
            console.log('Processing remaining speeches...', pendingSpeechesRef.current.length);

            const processRemainingSpeeches = async () => {
                while (pendingSpeechesRef.current.length > 0) {
                    const speech = pendingSpeechesRef.current[0];
                    console.log('Processing speech:', speech);

                    try {
                        const response = await fetch('/api/speeches', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                meetingId: activeMeetingIdRef.current,
                                userId,
                                content: speech.content
                            })
                        });

                        if (!response.ok) {
                            throw new Error(`Failed to save speech: ${response.statusText}`);
                        }

                        const data = await response.json();
                        console.log('Speech saved:', data);

                        pendingSpeechesRef.current.shift();

                        setTranscript(prev => [...prev, {
                            id: data.id,
                            userName,
                            content: speech.content,
                            timestamp: speech.timestamp
                        }]);

                    } catch (error) {
                        console.error('Error saving speech:', error);
                        speech.retryCount = (speech.retryCount || 0) + 1;

                        if (speech.retryCount >= maxRetries) {
                            console.error('Max retries reached, skipping speech');
                            pendingSpeechesRef.current.shift();
                        } else {
                            // リトライ間隔を設定
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                            continue;
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            };

            await processRemainingSpeeches();
            console.log('All speeches processed successfully');

        } catch (err) {
            console.error('Error during stop recording:', err);
            setError(`Failed to stop recording: ${err.message}`);
        } finally {
            setIsRecording(false);
            recognitionRef.current = null;
            processingRef.current = false;
            setIsSaving(false);
        }
    };

    // 会議終了の処理を分離
    const endMeeting = async () => {
        if (!activeMeetingIdRef.current) return;

        try {
            // もし録音中なら、まず録音を停止
            if (isRecording) {
                await stopRecording();
            }

            // すべての処理が完了してからミーティングを終了
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
            console.log('Meeting ended successfully:', data);

            // 状態をリセット
            setMeetingId(null);
            activeMeetingIdRef.current = null;
            setTranscript([]);
            pendingSpeechesRef.current = [];

        } catch (error) {
            console.error('Failed to end meeting:', error);
            setError(`Failed to end meeting: ${error.message}`);
        }
    };

    // コンポーネントのアンマウント時の処理
    useEffect(() => {
        return () => {
            const cleanup = async () => {
                if (recognitionRef.current) {
                    await stopRecording();
                }
                await endMeeting();
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