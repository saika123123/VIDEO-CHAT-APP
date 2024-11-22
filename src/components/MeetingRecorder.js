import { useCallback, useEffect, useRef, useState } from 'react';

const MeetingRecorder = ({ roomId, userId, userName, isAudioOn }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const recognitionRef = useRef(null);
    const activeMeetingIdRef = useRef(null);
    const isInitializedRef = useRef(false);

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

    const saveSpeech = async (content, currentMeetingId) => {
        if (!content.trim() || !currentMeetingId) {
            console.log('Speech save skipped:', { content: content.trim(), currentMeetingId });
            return;
        }

        try {
            console.log('Saving speech:', { content, meetingId: currentMeetingId });
            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId: currentMeetingId,
                    userId,
                    content: content.trim()
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '音声の保存に失敗しました');
            }

            const data = await response.json();
            console.log('Speech saved successfully:', data);

            setTranscript(prev => [...prev, {
                id: data.id,
                userName,
                content,
                timestamp: new Date()
            }]);
        } catch (error) {
            console.error('Failed to save speech:', error);
            setError(`音声の保存に失敗しました: ${error.message}`);
        }
    };

    const initializeSpeechRecognition = useCallback(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setError('お使いのブラウザは音声認識をサポートしていません');
            return null;
        }

        const SpeechRecognition = window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onstart = () => {
            console.log('Speech recognition started');
            setIsRecording(true);
            logStatus();
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            // まだ録音中かつアクティブなミーティングがある場合は再開
            if (isRecording && activeMeetingIdRef.current) {
                console.log('Restarting speech recognition');
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Failed to restart recognition:', error);
                    setTimeout(() => recognition.start(), 1000);
                }
            } else {
                setIsRecording(false);
            }
            logStatus();
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
                        }
                    }, 1000);
                }
            } else {
                setError(`音声認識エラー: ${event.error}`);
                stopRecording();
            }
            logStatus();
        };

        recognition.onresult = async (event) => {
            console.log('Speech recognition result received', {
                isRecording,
                activeMeetingId: activeMeetingIdRef.current
            });

            if (!isRecording || !activeMeetingIdRef.current) {
                console.log('Skipping result - no active meeting or not recording');
                return;
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal && result[0].transcript.trim()) {
                    const transcript = result[0].transcript.trim();
                    console.log('Processing final transcript:', transcript);
                    await saveSpeech(transcript, activeMeetingIdRef.current);
                }
            }
        };

        return recognition;
    }, [isRecording, logStatus, saveSpeech]);

    const startRecording = async () => {
        try {
            setError(null);
            console.log('Starting recording process');

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
        try {
            const currentMeetingId = activeMeetingIdRef.current;
            console.log('Stopping recording for meeting:', currentMeetingId);

            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }

            if (currentMeetingId) {
                const response = await fetch(`/api/meetings/${currentMeetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endTime: new Date().toISOString()
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'ミーティングの終了に失敗しました');
                }
            }

            setIsRecording(false);
            setMeetingId(null);
            activeMeetingIdRef.current = null;
            logStatus();

        } catch (error) {
            console.error('Failed to stop recording:', error);
            setError(`録音の停止に失敗しました: ${error.message}`);
            logStatus();
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