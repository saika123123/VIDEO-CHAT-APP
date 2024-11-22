import { useEffect, useRef, useState } from 'react';

const MeetingRecorder = ({
    roomId,
    userId,
    userName,
    isAudioOn
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const recognitionRef = useRef(null);
    const [error, setError] = useState(null);

    // meetingId の変更を監視
    useEffect(() => {
        console.log('Current meetingId:', meetingId);
    }, [meetingId]);

    const startRecording = async () => {
        try {
            console.log('Starting recording for room:', roomId);

            // 既存のミーティングIDをクリア
            setMeetingId(null);
            setTranscript([]);

            const response = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId })
            });

            const responseText = await response.text();
            console.log('Raw response:', responseText);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error(`Invalid JSON response: ${responseText}`);
            }

            if (!response.ok) {
                throw new Error(`Failed to start meeting: ${data.error || 'Unknown error'}`);
            }

            console.log('Meeting created:', data);

            if (!data.meetingId) {
                throw new Error('No meeting ID received');
            }

            // ミーティングID設定前に音声認識を開始しない
            setMeetingId(data.meetingId);
            await new Promise(resolve => setTimeout(resolve, 100)); // State更新を待つ

            if (recognitionRef.current) {
                recognitionRef.current.start();
                setIsRecording(true);
                setError(null);
            } else {
                throw new Error('Speech recognition not initialized');
            }
        } catch (error) {
            console.error('Failed to start recording:', error);
            setError(`録音の開始に失敗しました: ${error.message}`);
            setIsRecording(false);
            setMeetingId(null);
        }
    };

    const stopRecording = async () => {
        try {
            console.log('Stopping recording for meeting:', meetingId);

            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsRecording(false);

            if (meetingId) {
                const response = await fetch(`/api/meetings/${meetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endTime: new Date().toISOString()
                    })
                });

                const responseText = await response.text();
                console.log('Raw stop response:', responseText);

                let data;
                try {
                    data = JSON.parse(responseText);
                } catch (e) {
                    throw new Error(`Invalid JSON response: ${responseText}`);
                }

                if (!response.ok) {
                    throw new Error(`Failed to end meeting: ${data.error || 'Unknown error'}`);
                }

                console.log('Meeting ended:', data);
            }

            setMeetingId(null);
            setError(null);
        } catch (error) {
            console.error('Failed to stop recording:', error);
            setError(`録音の停止に失敗しました: ${error.message}`);
        }
    };

    const saveSpeech = async (content) => {
        console.log('Attempting to save speech with meeting ID:', meetingId);

        if (!meetingId) {
            console.error('No active meeting ID');
            setError('アクティブな会議がありません。録音を開始してください。');
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsRecording(false);
            return;
        }

        try {
            const speechData = {
                meetingId,
                userId,
                content: content.trim()
            };

            console.log('Saving speech:', speechData);

            const response = await fetch('/api/speeches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(speechData)
            });

            const responseText = await response.text();
            console.log('Raw speech response:', responseText);

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error(`Invalid JSON response: ${responseText}`);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}, ${data.error || 'Unknown error'}`);
            }

            console.log('Speech saved:', data);

            setTranscript(prev => [...prev, {
                id: data.id,
                userName,
                content,
                timestamp: new Date()
            }]);

            setError(null);
        } catch (error) {
            console.error('Failed to save speech:', error);
            setError(`音声の保存に失敗しました: ${error.message}`);
        }
    };

    // 音声認識の初期化と設定
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setError('お使いのブラウザは音声認識をサポートしていません');
            return;
        }

        const SpeechRecognition = window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'ja-JP';

        recognitionRef.current.onresult = (event) => {
            if (!meetingId || !isRecording) {
                console.log('Ignoring speech result - no active meeting or not recording');
                return;
            }

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal && result[0].transcript.trim().length > 0) {
                    console.log('Final transcript:', result[0].transcript);
                    saveSpeech(result[0].transcript);
                }
            }
        };

        recognitionRef.current.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setError(`音声認識エラー: ${event.error}`);
            setIsRecording(false);
        };

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [meetingId, isRecording]);

    // コンポーネントのクリーンアップ
    useEffect(() => {
        return () => {
            if (isRecording) {
                stopRecording();
            }
        };
    }, [isRecording]);

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