'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const MeetingRecorder = ({ roomId, userId, userName, isAudioOn }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const recognitionRef = useRef(null);
    const activeMeetingIdRef = useRef(null);
    const isInitializedRef = useRef(false);
    const processingRef = useRef(false);
    const retryCountRef = useRef(0);
    const pendingSpeechesRef = useRef([]);
    const maxRetries = 3;
    const retryDelay = 1000;

    const saveSpeechToQueue = useCallback((content) => {
        if (!content.trim()) return;

        pendingSpeechesRef.current.push({
            content: content.trim(),
            timestamp: new Date(),
            retryCount: 0
        });
    }, []);

    const processSpeechQueue = useCallback(async () => {
        if (processingRef.current || !activeMeetingIdRef.current || pendingSpeechesRef.current.length === 0) {
            return;
        }

        processingRef.current = true;
        const speech = pendingSpeechesRef.current[0];

        try {
            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId: activeMeetingIdRef.current,
                    userId,
                    content: speech.content
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            setTranscript(prev => [...prev, {
                id: data.id,
                userName,
                content: speech.content,
                timestamp: speech.timestamp
            }]);

            // 成功したら配列から削除
            pendingSpeechesRef.current.shift();

        } catch (error) {
            console.error('Failed to save speech:', error);
            speech.retryCount++;

            if (speech.retryCount >= 3) {
                pendingSpeechesRef.current.shift();
                setError(`Failed to save speech after ${maxRetries} attempts`);
            }
        } finally {
            processingRef.current = false;

            // キューに残りがあれば再度処理
            if (pendingSpeechesRef.current.length > 0) {
                setTimeout(() => processSpeechQueue(), 1000);
            }
        }
    }, [userId, userName]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (pendingSpeechesRef.current.length > 0) {
                processSpeechQueue();
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [processSpeechQueue]);

    const handleSpeechResult = useCallback((event) => {
        if (!isRecording || !activeMeetingIdRef.current) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
                const transcript = result[0].transcript.trim();
                if (transcript) {
                    saveSpeechToQueue(transcript);
                }
            }
        }
    }, [isRecording, saveSpeechToQueue]);

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
            retryCountRef.current = 0;
            setError(null);
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            if (isRecording && activeMeetingIdRef.current) {
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

            if (event.error === 'no-speech' && retryCountRef.current < maxRetries) {
                retryCountRef.current++;
                setTimeout(() => {
                    try {
                        recognition.stop();
                        recognition.start();
                    } catch (error) {
                        console.error('Error restarting recognition:', error);
                    }
                }, retryDelay);
            }
        };

        recognition.onresult = handleSpeechResult;

        return recognition;
    }, [isRecording, handleSpeechResult]);

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

    const stopRecording = async () => {
        if (!activeMeetingIdRef.current) return;

        try {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }

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

            // Process any remaining speeches in queue
            while (pendingSpeechesRef.current.length > 0) {
                await processSpeechQueue();
            }

        } catch (error) {
            console.error('Failed to stop recording:', error);
            setError(`Failed to stop recording: ${error.message}`);
        } finally {
            setIsRecording(false);
            setMeetingId(null);
            activeMeetingIdRef.current = null;
            recognitionRef.current = null;
            setTranscript([]);
        }
    };

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (isRecording) {
                stopRecording();
            }
        };
    }, []);

    useEffect(() => {
        if (!isAudioOn && isRecording) {
            stopRecording();
        }
    }, [isAudioOn, isRecording]);

    return (
        <div className="fixed right-4 top-20 w-80 bg-white/90 rounded-lg shadow-lg p-4 max-h-[calc(100vh-120px)] overflow-auto">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">議事録</h3>
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!isAudioOn || error}
                    className={`
                        px-4 py-2 rounded-lg 
                        transition-all duration-200 ease-in-out
                        flex items-center gap-2
                        ${isRecording
                            ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }
                        ${(!isAudioOn || error) && 'opacity-50 cursor-not-allowed'}
                    `}
                >
                    {/* 録音状態に応じたアイコン */}
                    <svg
                        className={`w-5 h-5 ${isRecording ? 'animate-ping' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        {isRecording ? (
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                            />
                        ) : (
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                            />
                        )}
                    </svg>
                    {isRecording ? '録音停止' : '録音開始'}
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
                    録音中...
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