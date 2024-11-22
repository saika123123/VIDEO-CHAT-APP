import { useEffect, useRef, useState } from 'react';

const MeetingRecorder = ({ roomId, userId, userName, isAudioOn }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const recognitionRef = useRef(null);
    const [error, setError] = useState(null);

    // ミーティングIDの状態を追跡する新しいRef
    const activeMeetingIdRef = useRef(null);

    // meetingIdが変更されたらRefも更新
    useEffect(() => {
        activeMeetingIdRef.current = meetingId;
        console.log('Active meeting ID updated:', meetingId);
    }, [meetingId]);

    const startRecording = async () => {
        try {
            console.log('Starting recording for room:', roomId);
            setMeetingId(null);
            setTranscript([]);

            const response = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to start meeting');
            }

            console.log('Meeting created:', data);

            // ミーティングIDを両方の場所で設定
            setMeetingId(data.meetingId);
            activeMeetingIdRef.current = data.meetingId;

            // 音声認識の開始前に少し待つ
            await new Promise(resolve => setTimeout(resolve, 100));

            if (recognitionRef.current) {
                recognitionRef.current.start();
                setIsRecording(true);
                setError(null);
            }
        } catch (error) {
            console.error('Failed to start recording:', error);
            setError(`録音の開始に失敗しました: ${error.message}`);
            setIsRecording(false);
            setMeetingId(null);
            activeMeetingIdRef.current = null;
        }
    };

    const stopRecording = async () => {
        try {
            const currentMeetingId = activeMeetingIdRef.current;
            console.log('Stopping recording for meeting:', currentMeetingId);

            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsRecording(false);

            if (currentMeetingId) {
                const response = await fetch(`/api/meetings/${currentMeetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endTime: new Date().toISOString()
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to end meeting');
                }
            }

            setMeetingId(null);
            activeMeetingIdRef.current = null;
            setError(null);
        } catch (error) {
            console.error('Failed to stop recording:', error);
            setError(`録音の停止に失敗しました: ${error.message}`);
        }
    };

    // 音声認識の初期化と設定
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setError('お使いのブラウザは音声認識をサポートしていません');
            return;
        }

        const SpeechRecognition = window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onresult = (event) => {
            const currentMeetingId = activeMeetingIdRef.current;
            if (!currentMeetingId || !isRecording) {
                console.log('Ignoring speech result - no active meeting or not recording', {
                    currentMeetingId,
                    isRecording
                });
                return;
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal && result[0].transcript.trim().length > 0) {
                    console.log('Final transcript:', result[0].transcript);
                    saveSpeech(result[0].transcript, currentMeetingId);
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setError(`音声認識エラー: ${event.error}`);
            if (isRecording) {
                stopRecording();
            }
        };

        recognition.onend = () => {
            console.log('Speech recognition ended');
            if (isRecording) {
                recognition.start();
            }
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [isRecording]); // isRecordingを依存配列に追加

    const saveSpeech = async (content, currentMeetingId) => {
        if (!currentMeetingId) {
            console.error('No active meeting ID for speech saving');
            return;
        }

        try {
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
                const data = await response.json();
                throw new Error(data.error || 'Failed to save speech');
            }

            const data = await response.json();
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

    // コンポーネントのクリーンアップ
    useEffect(() => {
        return () => {
            if (isRecording) {
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
                    disabled={!isAudioOn || error}
                    className={`px-4 py-2 rounded-lg ${isRecording
                        ? 'bg-red-600 text-white'
                        : 'bg-blue-600 text-white'
                        } disabled:opacity-50`}
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