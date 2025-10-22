// src/components/MeetingRecorder.js

'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

const MeetingRecorder = forwardRef(({ roomId, userId, userName, isAudioOn, users, socketRef }, ref) => {
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
    const audioContextRef = useRef(null);
    const hasAudioAccessRef = useRef(false);

    // デバッグログ
    const logDebug = (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`★ [MeetingRecorder ${timestamp}] ${message}`, data ? data : '');
    };

    // 親コンポーネントに公開するメソッド
    useImperativeHandle(ref, () => ({
        startRecording: async () => {
            try {
                if (!isAudioOn) {
                    throw new Error('マイクがミュートされています');
                }

                // 録音前に音声へのアクセス許可を確認
                await checkAudioAccess();
                
                await startRecording();
                return true;
            } catch (error) {
                console.error('録音開始エラー:', error);
                setError(error.message);
                return false;
            }
        },
        stopRecording: async () => {
            try {
                await stopRecording(true);
                return true;
            } catch (error) {
                console.error('録音停止エラー:', error);
                return false;
            }
        },
        isCurrentlyRecording: () => isRecording
    }));

    // 音声デバイスへのアクセス確認
    const checkAudioAccess = async () => {
        if (hasAudioAccessRef.current) return true;
        
        try {
            logDebug('Checking audio access...');
            
            // AudioContextをチェック/作成
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // マイクへのアクセス許可を確認
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // テストのためにトラックを停止
            stream.getTracks().forEach(track => track.stop());
            
            hasAudioAccessRef.current = true;
            logDebug('Audio access granted');
            return true;
        } catch (error) {
            logDebug('Audio access denied:', error.message);
            throw new Error(`マイクへのアクセスが許可されていません: ${error.message}`);
        }
    };

    // キューに音声を追加（送信者の情報を含める）
    const saveSpeechToQueue = useCallback((content, speakerId, speakerName) => {
        if (!content || !content.trim()) {
            logDebug('Empty content, skipping');
            return;
        }

        if (!meetingIdRef.current) {
            logDebug('No active meeting ID, skipping');
            return;
        }

        // 音声データを保存キューに追加
        const speechData = {
            content: content.trim(),
            timestamp: new Date().toISOString(),
            userId: speakerId,
            userName: speakerName,
            retryCount: 0
        };

        logDebug('Adding speech to queue:', speechData);
        pendingSpeechesRef.current.push(speechData);
        
        // 保存処理を非同期で実行
        processSpeechQueue();
    }, []);

    // キューの処理
    const processSpeechQueue = useCallback(async () => {
        if (pendingSpeechesRef.current.length === 0 || processingRef.current) {
            logDebug('Queue is empty or already processing, skipping. Length:', pendingSpeechesRef.current.length);
            return;
        }

        if (!meetingIdRef.current) {
            logDebug('No active meeting ID, cannot process queue');
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
                const errorText = await response.text();
                throw new Error(`Failed to save speech: ${response.statusText}. Details: ${errorText.substring(0, 100)}`);
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
            console.error('Failed to save speech (API/Network Error):', error);
            if (currentSpeech) {
                currentSpeech.retryCount = (currentSpeech.retryCount || 0) + 1;
                if (currentSpeech.retryCount >= 3) { // maxRetries
                    logDebug(`Max retries reached for speech, discarding:`, currentSpeech);
                    pendingSpeechesRef.current.shift();
                    setError(`Failed to save speech after 3 attempts. API Error: ${error.message.substring(0, 50)}...`);
                } else {
                    logDebug(`Retry attempt ${currentSpeech.retryCount} for speech. Retrying in 500ms.`);
                }
            }
        } finally {
            processingRef.current = false;
            
            // キューが残っていれば、新しい処理サイクルを開始（setTimeoutを使用し、非同期のブロックを防ぐ）
            if (pendingSpeechesRef.current.length > 0) {
                 logDebug(`Queue remaining. Starting new cycle in 500ms.`);
                 setTimeout(processSpeechQueue, 500); 
            }
        }
    }, []);

    // 音声認識の結果を処理
    const handleSpeechResult = useCallback((event) => {
        if (!isRecordingRef.current || !meetingIdRef.current) {
            return;
        }

        const results = event.results;
        for (let i = event.resultIndex; i < results.length; i++) {
            const result = results[i];
            const transcript = result[0].transcript.trim();

            if (result.isFinal) {
                logDebug(`Final result received: ${transcript}`); 
                if (transcript) {
                    // 他の参加者に音声データを送信
                    if (socketRef.current) {
                        logDebug(`Emitting speech data: ${transcript}`);
                        socketRef.current.emit('speech-data', {
                            content: transcript,
                            userId,
                            userName
                        });
                    }

                    // 自分の音声をキューに追加
                    saveSpeechToQueue(transcript, userId, userName);
                }
            } else {
                // 中間結果をログに出力（診断用）
                logDebug(`Interim result: ${transcript}`);
            }
        }
    }, [userId, userName, saveSpeechToQueue, socketRef]);

    // 音声認識の初期化
    const initializeSpeechRecognition = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            throw new Error('このブラウザは音声認識をサポートしていません');
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';

        recognition.onstart = () => {
            logDebug('Speech recognition started');
            setError(null);
        };

        recognition.onend = () => {
            logDebug('Speech recognition ended');
            recognition.manualStop = false; 
            if (isRecordingRef.current && meetingIdRef.current) {
                try {
                    setTimeout(() => {
                        if (isRecordingRef.current && meetingIdRef.current) {
                            try {
                                // recognition.start()のtry/catchは認識が安定するまで維持
                                recognition.start(); 
                                logDebug('Recognition restarted after delay');
                            } catch (err) {
                                logDebug('Error during recognition.start() restart:', err.message);
                            }
                        }
                    }, 500);
                } catch (error) {
                    console.error('Failed to restart recognition:', error);
                    setError('Failed to restart speech recognition');
                }
            }
        };

        recognition.onerror = (event) => {
            // 'no-speech'エラー（発言なし）の処理
            if (event.error === 'no-speech') {
                logDebug(`Recognition error (ignored): ${event.error}. Please check mic.`);
                
                // ユーザーにマイクのチェックを促すメッセージを一時的に表示
                setError('マイクが音声を拾えていないようです。ブラウザのマイク許可と音量をご確認ください。');
                setTimeout(() => setError(null), 5000); 
                
                return; 
            }
            
            console.error('Speech recognition error:', event);
            logDebug(`Recognition error: ${event.error}`);
            
            // 特定のエラータイプに対する処理
            if (event.error === 'audio-capture') {
                setError('マイクへのアクセスができません。設定を確認してください。');
                if (isRecordingRef.current) {
                    isRecordingRef.current = false;
                    setIsRecording(false);
                }
            } else if (event.error === 'not-allowed') {
                setError('マイクの使用が許可されていません。');
                isRecordingRef.current = false;
                setIsRecording(false);
            } else {
                setError(`音声認識エラー: ${event.error}`);
            }
        };

        recognition.onresult = handleSpeechResult;
        return recognition;
    }, [handleSpeechResult]); 

    // Socket.IOイベントハンドラの設定
    useEffect(() => {
        if (!socketRef.current) return;

        localSocketRef.current = socketRef.current;

        // 録音開始イベントのハンドラ
        const handleRecordingStart = async ({ meetingId: remoteMeetingId, initiatorId, initiatorName }) => {
            logDebug(`Received recording start from ${initiatorName || initiatorId}`);

            setRecordingInitiator(initiatorName || initiatorId);
            setMeetingId(remoteMeetingId);
            meetingIdRef.current = remoteMeetingId;
            setIsRecording(true);
            isRecordingRef.current = true;

            // 自身がイニシエーターの場合は、Socketイベントによる認識開始をスキップ（二重起動回避）
            if (initiatorId === userId) {
                logDebug('I am the initiator, skipping recognition start via socket event to avoid double start.');
                return; 
            }
            
            if (isAudioOn) {
                try {
                    await checkAudioAccess(); 
                    
                    if (!recognitionRef.current) {
                        recognitionRef.current = initializeSpeechRecognition();
                    }
                    
                    // recognition.start()をtry...catchでラップ
                    try {
                        recognitionRef.current.start();
                        logDebug('Recognition started after receiving recording-start event');
                    } catch (err) {
                        logDebug('Failed to call recognition.start() from remote event (likely already running):', err.message);
                    }
                    
                } catch (error) {
                    console.error('Error starting remote recording:', error);
                    setError(`録音の開始に失敗しました: ${error.message}`);
                }
            }
        };

        // 録音停止イベントのハンドラ
        const handleRecordingStop = async ({ meetingId: remoteMeetingId, initiatorId }) => {
            logDebug(`Received recording stop from ${initiatorId} for meeting ${remoteMeetingId}`);
            
            if (meetingIdRef.current && meetingIdRef.current === remoteMeetingId) {
                await stopRecording(false); // false means don't emit stop event
            } else {
                logDebug('Received stop event for different meeting, ignoring');
            }
        };

        // 他の参加者からの音声データを受信
        const handleRemoteSpeech = ({ content, userId: speakerId, userName: speakerName }) => {
            logDebug(`Received remote speech from ${speakerName}: ${content}`);
            
            if (!isRecordingRef.current || !meetingIdRef.current) {
                logDebug('Recording not active, ignoring remote speech');
                return;
            }
            
            // ここが重要: リモート音声を保存キューに追加
            saveSpeechToQueue(content, speakerId, speakerName);
            
            // 自分のUIに中間結果が表示されないため、リモートから来た確定結果はUIに追加
            setTranscript(prev => [
                ...prev,
                {
                    id: Date.now().toString(), // リモート結果にはDB IDがないため、一時ID
                    userId: speakerId,
                    userName: speakerName,
                    content: content,
                    timestamp: new Date().toISOString()
                }
            ]);
        };

        // イベントリスナーの登録
        localSocketRef.current.on('recording-started', handleRecordingStart);
        localSocketRef.current.on('recording-stopped', handleRecordingStop);
        localSocketRef.current.on('speech-data', handleRemoteSpeech);

        return () => {
            if (localSocketRef.current) {
                localSocketRef.current.off('recording-started', handleRecordingStart);
                localSocketRef.current.off('recording-stopped', handleRecordingStop);
                localSocketRef.current.off('speech-data', handleRemoteSpeech);
            }
        };
    }, [socketRef?.current, isAudioOn, initializeSpeechRecognition, saveSpeechToQueue, userId, checkAudioAccess, userName]);

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

            // recognition.start()をtry...catchでラップし、競合エラーをログに残す
            try {
                recognitionRef.current.start();
                logDebug('Recognition started successfully');
            } catch (err) {
                 logDebug('Failed to call recognition.start() locally (likely started by remote event):', err.message);
                 // InvalidStateErrorの場合は無視して続行
                 if (err.name !== 'InvalidStateError') {
                     throw err; 
                 }
            }


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

        const currentMeetingId = meetingIdRef.current;

        try {
            setIsSaving(true);

            // 状態のリセットを先に行う
            setIsRecording(false);
            isRecordingRef.current = false;

            // Socket.IOで録音停止を通知（どのユーザーからでも停止できるようにする）
            if (emitEvent && socketRef.current) {
                socketRef.current.emit('recording-stop', {
                    meetingId: currentMeetingId,
                    initiatorId: userId,
                    roomId: roomId
                });
            }

            if (recognitionRef.current) {
                recognitionRef.current.manualStop = true;
                try {
                    recognitionRef.current.stop();
                    logDebug('Recognition stopped');
                } catch (err) {
                    logDebug('Error stopping recognition:', err.message);
                }
            }

            // 残りの音声データを処理
            let retryCount = 0;
            while (pendingSpeechesRef.current.length > 0 && retryCount < 10) {
                 logDebug(`Waiting for queue to clear. Remaining: ${pendingSpeechesRef.current.length}`);
                 // processSpeechQueueが停止している場合は手動で再トリガー
                 if (!processingRef.current) {
                    processSpeechQueue();
                 }
                 await new Promise(resolve => setTimeout(resolve, 500));
                 retryCount++;
            }

            // ミーティングを終了（initiatorのときだけでなく、どのユーザーからでも可能にする）
            if (emitEvent) {
                try {
                    const response = await fetch(`/yoriai/api/meetings/${currentMeetingId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            endTime: new Date().toISOString()
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(`Failed to end meeting: ${errorData.error || response.statusText}`);
                    }
                } catch (apiError) {
                    console.error('API error ending meeting:', apiError);
                    // APIエラーでも処理は継続
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
            // 警告: キューが残っていた場合はログを出力
            if (pendingSpeechesRef.current.length > 0) {
                 console.warn(`WARNING: Stopping recording finished but speech queue (${pendingSpeechesRef.current.length} items) is NOT empty. Some data may be lost.`);
                 pendingSpeechesRef.current = []; // データロストを許容してキューをクリア
            }
        }
    };

    // クリーンアップ
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (err) {
                    // 既に停止しているか、エラーが発生した場合は無視
                }
                recognitionRef.current = null;
            }
            setIsRecording(false);
            isRecordingRef.current = false;
            if (meetingIdRef.current) {
                stopRecording(true);
            }
            // AudioContextのクリーンアップ
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(e => logDebug('Error closing AudioContext:', e.message));
                audioContextRef.current = null;
            }
        };
    }, []);

    return (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* ヘッダー部分 */}
            <div className="bg-blue-600 p-6">
                <div className="flex flex-col items-stretch gap-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-2xl font-bold text-white">会話の記録</h3>
                    </div>

                    {/* 録音状態の表示部分 */}
                    {isRecording ? (
                        <div className="bg-green-50 border-2 border-green-200 text-green-700 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-lg font-bold">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                <span>録音中です</span>
                            </div>
                            {recordingInitiator && (
                                <div className="mt-3 text-md">
                                    <span className="font-bold">開始した人:</span> {recordingInitiator}
                                </div>
                            )}
                            <div className="mt-2 text-md">
                                <span className="font-bold">処理待ち:</span> {pendingSpeechesRef.current.length} 件
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-100 text-gray-700 p-4 rounded-xl text-center">
                            <p className="text-md">会話は録音されていません</p>
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

            {/* 保存中のインジケーター */}
            {isSaving && (
                <div className="m-4 p-4 bg-blue-50 border-2 border-blue-200 text-blue-700 rounded-xl">
                    <div className="flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-lg font-medium">保存しています...</span>
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
                    {transcript.length === 0 && (
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
                                    録音を開始すると、ここに<br />会話が記録されます
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

MeetingRecorder.displayName = 'MeetingRecorder';

export default MeetingRecorder;