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

    // ステータスログ用の関数
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

            // responseTextとしてテキストを先に取得
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

            console.log('★Speech saved successfully:', responseData);
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

    const initializeSpeechRecognition = useCallback(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setError('お使いのブラウザは音声認識をサポートしていません');
            return null;
        }

        try {
            const SpeechRecognition = window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false; // 最終結果のみを取得
            recognition.lang = 'ja-JP';

            // 音声認識の開始時
            recognition.onstart = () => {
                console.log('★Speech recognition started', {
                    meetingId: activeMeetingIdRef.current,
                    isRecording
                });
            };

            recognition.onend = () => {
                console.log('Speech recognition ended');
                if (isRecording && activeMeetingIdRef.current) {
                    console.log('Restarting speech recognition');
                    try {
                        recognition.start();
                    } catch (error) {
                        console.error('Failed to restart recognition:', error);
                        setTimeout(() => {
                            try {
                                recognition.start();
                            } catch (e) {
                                console.error('Retry failed:', e);
                                setError('音声認識の再開に失敗しました');
                            }
                        }, 1000);
                    }
                } else {
                    setIsRecording(false);
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if (event.error === 'no-speech' || event.error === 'audio-capture') {
                    setError('マイクの入力を確認してください');
                    if (isRecording && activeMeetingIdRef.current) {
                        setTimeout(() => {
                            try {
                                recognition.start();
                            } catch (error) {
                                console.error('Error restarting after error:', error);
                                setError('音声認識の再開に失敗しました');
                            }
                        }, 1000);
                    }
                } else {
                    setError(`音声認識エラー: ${event.error}`);
                }
            };

            // 音声認識の結果取得時
            recognition.onresult = async (event) => {
                console.log('★Speech recognition result received');
                if (!isRecording || !activeMeetingIdRef.current) {
                    console.log('★Speech skipped - not recording or no meeting', {
                        isRecording,
                        meetingId: activeMeetingIdRef.current
                    });
                    return;
                }

                const lastResult = event.results[event.results.length - 1];
                if (lastResult.isFinal) {
                    const transcript = lastResult[0].transcript.trim();
                    console.log('★Final transcript:', transcript);
                    if (transcript) {
                        await saveSpeech(transcript, activeMeetingIdRef.current);
                    }
                }
            };

            return recognition;
        } catch (error) {
            console.error('Failed to initialize speech recognition:', error);
            setError('音声認識の初期化に失敗しました');
            return null;
        }
    }, [isRecording, saveSpeech]);

    const startRecording = async () => {
        try {
            setError(null);
            console.log('Starting recording process');

            // マイクの動作確認を追加
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('★Microphone check passed:', stream.getAudioTracks()[0].enabled);
        stream.getTracks().forEach(track => track.stop()); // チェック用のストリームを停止

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

            // 状態を更新する前に既存の認識を停止
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (error) {
                    console.error('Error stopping existing recognition:', error);
                }
            }

            setMeetingId(data.meetingId);
            activeMeetingIdRef.current = data.meetingId;

            // 新しい音声認識インスタンスを作成
            recognitionRef.current = initializeSpeechRecognition();

            if (recognitionRef.current) {
                await new Promise(resolve => setTimeout(resolve, 200));
                recognitionRef.current.start();
                console.log('Speech recognition started after meeting creation');
            } else {
                throw new Error('音声認識の初期化に失敗しました');
            }

            logStatus();
        } catch (error) {
            console.error('Failed to start recording:', error);
            setError(`録音の開始に失敗しました: ${error.message}`);
            setIsRecording(false);
            setMeetingId(null);
            activeMeetingIdRef.current = null;
            logStatus();
        }
    };

    const stopRecording = async () => {
        let apiError = false;
        try {
            const currentMeetingId = activeMeetingIdRef.current;
            console.log('Stopping recording for meeting:', currentMeetingId);

            // 音声認識の停止
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (error) {
                    console.warn('Error stopping recognition:', error);
                }
            }

            // ミーティングの終了処理
            if (currentMeetingId) {
                setIsRecording(false); // 先に録音状態を更新

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
            // APIエラーの場合でも状態をクリーンアップ
            if (!apiError) {
                setMeetingId(null);
                activeMeetingIdRef.current = null;
                setTranscript([]);
            }

            // 確実に録音を停止
            setIsRecording(false);
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

    // 初期化とクリーンアップ
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

    // マイクの状態監視
    useEffect(() => {
        if (!isAudioOn && isRecording) {
            console.log('Audio turned off while recording, stopping...');
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
                    className={`px-4 py-2 rounded-lg ${isRecording ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {isRecording ? '録音停止' : '録音開始'}
                </button>
            </div>

            {error && (
                <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
                    {error}
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