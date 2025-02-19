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

        // speech-dataイベントで送信された場合は、そのまま保存
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

            const response = await fetch('/yoriai/api/speeches', {
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

            // 既存のトランスクリプトに追加する際、送信者の情報を含める
            setTranscript(prev => [
                ...prev,
                {
                    id: data.id,
                    userId: currentSpeech.userId,
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
    }, []);

    // Socket.IOイベントハンドラの設定
    useEffect(() => {
        if (!socketRef.current) return;

        localSocketRef.current = socketRef.current;

        // 録音開始イベントのハンドラ
        const handleRecordingStart = async ({ meetingId: remoteMeetingId, initiatorId, initiatorName }) => {
            logDebug(`Received recording start from ${initiatorName}`);

            setRecordingInitiator(initiatorName);
            setMeetingId(remoteMeetingId);
            meetingIdRef.current = remoteMeetingId;
            setIsRecording(true);
            isRecordingRef.current = true;

            if (isAudioOn) {
                try {
                    if (!recognitionRef.current) {
                        recognitionRef.current = initializeSpeechRecognition();
                    }
                    await recognitionRef.current.start();
                } catch (error) {
                    console.error('Error starting remote recording:', error);
                    setError(`Failed to start recording: ${error.message}`);
                }
            }
        };

        // 録音停止イベントのハンドラ
        const handleRecordingStop = async ({ initiatorId }) => {
            logDebug(`Received recording stop from ${initiatorId}`);
            await stopRecording(false); // false means don't emit stop event
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
    }, [socketRef?.current, isRecording, saveSpeechToQueue, isAudioOn, initializeSpeechRecognition]);

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
                    // 他の参加者に音声データを送信
                    if (socketRef.current) {
                        socketRef.current.emit('speech-data', {
                            content: transcript,
                            userId,
                            userName
                        });
                    }

                    // 自分の音声をキューに追加
                    saveSpeechToQueue(transcript, userId, userName);
                }
            }
        }
    }, [userId, userName, saveSpeechToQueue]);

    // 録音開始
    const startRecording = async () => {
        try {
            setIsSaving(true);
            logDebug('Starting new recording session');

            if (!isAudioOn) {
                throw new Error('マイクがミュートされています');
            }

            // ミーティングの作成
            const response = await fetch('/yoriai/api/meetings', {
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

            // Socket.IOで録音開始を通知
            if (socketRef.current) {
                socketRef.current.emit('recording-start', {
                    meetingId: data.meetingId,
                    initiatorId: userId,
                    initiatorName: userName,
                    roomId: roomId
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
    const stopRecording = async (emitEvent = true) => {
        logDebug('Stopping recording');

        if (!meetingIdRef.current) {
            logDebug('No active meeting, cannot stop');
            return;
        }

        try {
            setIsSaving(true);

            // Socket.IOで録音停止を通知（initiatorの場合のみ）
            if (emitEvent && socketRef.current) {
                socketRef.current.emit('recording-stop', {
                    meetingId: meetingIdRef.current,
                    initiatorId: userId,
                    roomId: roomId
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

            // ミーティングを終了（initiatorの場合のみ）
            if (emitEvent) {
                const response = await fetch(`/yoriai/api/meetings/${meetingIdRef.current}`, {
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

            logDebug('Meeting ended successfully');

            // 状態のリセット
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
                stopRecording(true);
            }
        };
    }, []);

    // MeetingRecorder.js のreturn部分を修正
    return (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* ヘッダーと録音コントロール */}
            <div className="bg-blue-600 p-6">
                <div className="flex flex-col items-stretch gap-4">
                    <h3 className="text-2xl font-bold text-white text-center">音声の記録</h3>

                    <button
                        onClick={isRecording ? () => stopRecording(true) : startRecording}
                        disabled={!isAudioOn || isSaving}
                        className={`
                            w-full px-6 py-4 rounded-xl
                            text-xl font-bold
                            flex items-center justify-center gap-3
                            transition-all duration-200
                            ${isRecording
                                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                                : 'bg-white text-blue-600 hover:bg-blue-50'
                            }
                            ${(!isAudioOn || isSaving) && 'opacity-50 cursor-not-allowed'}
                            shadow-lg
                        `}
                    >
                        {isSaving ? (
                            <>
                                <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <span>保存しています...</span>
                            </>
                        ) : (
                            <>
                                {isRecording ? (
                                    <>
                                        <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
                                        <span>録音を停止する</span>
                                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                            <rect x="6" y="6" width="12" height="12" />
                                        </svg>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="6" />
                                        </svg>
                                        <span>ここを押して録音開始</span>
                                    </>
                                )}
                            </>
                        )}
                    </button>

                    {!isAudioOn && (
                        <div className="bg-yellow-50 border-2 border-yellow-200 text-yellow-800 p-4 rounded-xl text-lg text-center">
                            <div className="flex items-center justify-center gap-2">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                                <span>マイクがオフになっています</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* エラーメッセージ */}
            {error && (
                <div className="m-4 p-4 bg-red-50 border-2 border-red-200 text-red-700 rounded-xl text-lg">
                    <div className="flex items-center gap-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        {error}
                    </div>
                </div>
            )}

            {/* 録音中の状態表示 */}
            {isRecording && (
                <div className="mx-4 mt-4 p-4 bg-green-50 border-2 border-green-200 text-green-700 rounded-xl">
                    <div className="flex items-center gap-2 text-lg font-bold">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <span>録音中です</span>
                    </div>
                    {recordingInitiator && (
                        <div className="mt-3 text-lg">
                            <span className="font-bold">開始した人:</span> {recordingInitiator}
                        </div>
                    )}
                    <div className="mt-2 text-lg">
                        <span className="font-bold">処理待ち:</span> {pendingSpeechesRef.current.length} 件
                    </div>
                </div>
            )}

            {/* 議事録一覧 */}
            <div className="p-4">
                <div className="font-bold text-xl mb-4 text-gray-700">記録された会話</div>
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                    {transcript.map((item, index) => (
                        <div
                            key={item.id || index}
                            className="bg-gray-50 rounded-xl p-4 shadow-sm border border-gray-100"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-lg font-bold text-gray-700">
                                    {item.userName}
                                </span>
                                <span className="text-base text-gray-600">
                                    {new Date(item.timestamp).toLocaleTimeString('ja-JP', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </span>
                            </div>
                            <p className="text-lg text-gray-800 leading-relaxed">
                                {item.content}
                            </p>
                        </div>
                    ))}

                    {/* 記録がない場合の表示 */}
                    {transcript.length === 0 && !isRecording && (
                        <div className="text-center py-8 bg-gray-50 rounded-xl">
                            <div className="text-gray-400">
                                <svg className="w-16 h-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                    />
                                </svg>
                                <p className="text-xl font-bold mb-2">
                                    まだ会話は記録されていません
                                </p>
                                <p className="text-lg">
                                    上の「録音開始」ボタンを<br />押してください
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeetingRecorder;