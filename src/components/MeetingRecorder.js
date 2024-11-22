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
    const maxRetries = 3;
    const retryDelay = 1000;

    const logStatus = useCallback(() => {
        console.log('Status Check:', {
            isRecording,
            meetingId,
            activeMeetingId: activeMeetingIdRef.current,
            hasRecognition: !!recognitionRef.current,
            isInitialized: isInitializedRef.current
        });
    }, [isRecording, meetingId]);

    const saveSpeech = useCallback(async (content, currentMeetingId) => {
        console.log('★saveSpeech called:', {
            content,
            currentMeetingId,
            isProcessing: processingRef.current
        });

        if (processingRef.current || !content.trim() || !currentMeetingId) {
            console.log('★Speech save skipped due to conditions');
            return;
        }

        processingRef.current = true;
        try {
            console.log('★Sending POST request to /api/speeches');
            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId: currentMeetingId,
                    userId,
                    content: content.trim()
                })
            });

            console.log('★Response received:', {
                status: response.status,
                ok: response.ok
            });

            const responseText = await response.text();
            console.log('★Raw response:', responseText);

            let responseData;
            try {
                responseData = JSON.parse(responseText);
                console.log('★Parsed response data:', responseData);
            } catch (parseError) {
                console.error('★Failed to parse response:', parseError);
                throw new Error('Invalid response format');
            }

            if (!response.ok) {
                throw new Error(responseData.error || '音声の保存に失敗しました');
            }

            setTranscript(prev => [...prev, {
                id: responseData.id,
                userName,
                content,
                timestamp: new Date()
            }]);

        } catch (error) {
            console.error('★Failed to save speech:', error);
            setError(`音声の保存に失敗しました: ${error.message}`);
        } finally {
            processingRef.current = false;
        }
    }, [userId, userName]);

    const handleRecognitionError = useCallback((event) => {
        console.log('Speech recognition error:', event.error);

        if (event.error === 'no-speech') {
            if (retryCountRef.current < maxRetries) {
                retryCountRef.current++;
                console.log(`Retrying... Attempt ${retryCountRef.current} of ${maxRetries}`);

                setTimeout(() => {
                    if (recognitionRef.current && isRecording && activeMeetingIdRef.current) {
                        try {
                            recognitionRef.current.stop();
                            setTimeout(() => {
                                recognitionRef.current.start();
                                setError(null);
                            }, 100);
                        } catch (error) {
                            console.error('Error restarting recognition:', error);
                        }
                    }
                }, retryDelay);

                setError('音声を検出中です...');
            } else {
                setError('音声を検出できません。マイクの設定を確認してください。');
                retryCountRef.current = 0;
            }
        } else if (event.error === 'audio-capture') {
            setError('マイクが見つかりません。設定を確認してください。');
        } else {
            setError(`音声認識エラー: ${event.error}`);
        }
    }, [isRecording]);

    const initializeSpeechRecognition = useCallback(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setError('お使いのブラウザは音声認識をサポートしていません');
            return null;
        }

        try {
            const SpeechRecognition = window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
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
                    setTimeout(() => {
                        try {
                            recognition.start();
                        } catch (error) {
                            console.error('Failed to restart recognition:', error);
                        }
                    }, 100);
                }
            };

            recognition.onerror = handleRecognitionError;

            recognition.onresult = async (event) => {
                if (!isRecording || !activeMeetingIdRef.current) return;

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        const transcript = result[0].transcript.trim();
                        if (transcript) {
                            await saveSpeech(transcript, activeMeetingIdRef.current);
                        }
                    }
                }
            };

            return recognition;
        } catch (error) {
            console.error('Failed to initialize speech recognition:', error);
            setError('音声認識の初期化に失敗しました');
            return null;
        }
    }, [isRecording, handleRecognitionError, saveSpeech]);

    const startRecording = async () => {
        try {
            setError(null);
            console.log('Starting recording process');
            setIsRecording(true);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('★Microphone check passed:', stream.getAudioTracks()[0].enabled);
            stream.getTracks().forEach(track => track.stop());

            const response = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'ミーティングの作成に失敗しました');
            }

            const data = await response.json();
            console.log('Meeting created successfully:', data);

            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (error) {
                    console.error('Error stopping existing recognition:', error);
                }
            }

            setMeetingId(data.meetingId);
            activeMeetingIdRef.current = data.meetingId;

            recognitionRef.current = initializeSpeechRecognition();

            if (recognitionRef.current) {
                await new Promise(resolve => setTimeout(resolve, 200));
                try {
                    recognitionRef.current.start();
                    console.log('Speech recognition started after meeting creation');
                } catch (error) {
                    throw new Error('音声認識の開始に失敗しました: ' + error.message);
                }
            } else {
                throw new Error('音声認識の初期化に失敗しました');
            }

            logStatus();
        } catch (error) {
            console.error('Failed to start recording:', error);
            setIsRecording(false);
            setMeetingId(null);
            activeMeetingIdRef.current = null;
            setError(`録音の開始に失敗しました: ${error.message}`);
            logStatus();
        }
    };

    const stopRecording = async () => {
        let apiError = false;
        try {
            setIsRecording(false);

            const currentMeetingId = activeMeetingIdRef.current;
            console.log('Stopping recording for meeting:', currentMeetingId);

            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (error) {
                    console.warn('Error stopping recognition:', error);
                }
            }

            if (currentMeetingId) {
                try {
                    const response = await fetch(`/api/meetings/${currentMeetingId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            endTime: new Date().toISOString()
                        }),
                        cache: 'no-store'
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        let errorMessage;
                        try {
                            const errorData = JSON.parse(errorText);
                            errorMessage = errorData.error || 'Unknown error';
                        } catch (e) {
                            errorMessage = errorText || `HTTP error! status: ${response.status}`;
                        }
                        throw new Error(errorMessage);
                    }

                    const text = await response.text();
                    if (!text) {
                        throw new Error('Empty response received');
                    }

                    const data = JSON.parse(text);
                    if (!data.success) {
                        throw new Error(data.error || 'Failed to end meeting');
                    }

                    console.log('Meeting ended successfully:', data);

                } catch (error) {
                    apiError = true;
                    throw new Error(`ミーティングの終了に失敗しました: ${error.message}`);
                }
            }

        } catch (error) {
            console.error('Failed to stop recording:', error);
            setError(`録音の停止に失敗しました: ${error.message}`);
        } finally {
            if (!apiError) {
                setMeetingId(null);
                activeMeetingIdRef.current = null;
                setTranscript([]);
            }

            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) {
                    console.warn('Error in final recognition stop:', e);
                }
                recognitionRef.current = null;
            }
        }
    };

    useEffect(() => {
        if (!isInitializedRef.current) {
            console.log('Initializing MeetingRecorder');
            isInitializedRef.current = true;
            logStatus();
        }

        return () => {
            console.log('Cleaning up MeetingRecorder');
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (isRecording) {
                stopRecording();
            }
            logStatus();
        };
    }, []);

    useEffect(() => {
        if (!isAudioOn && isRecording) {
            console.log('Audio turned off while recording, stopping...');
            stopRecording();
        }
    }, [isAudioOn, isRecording]);

    useEffect(() => {
        console.log('Recording state changed:', isRecording);
    }, [isRecording]);

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