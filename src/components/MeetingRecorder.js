// src/components/MeetingRecorder.js

'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

const MeetingRecorder = forwardRef(({ roomId, userId, userName, isAudioOn, users, socketRef }, ref) => {
    // State管理
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const [isInitiator, setIsInitiator] = useState(false);
    const [recordingInitiator, setRecordingInitiator] = useState(null);

    // Ref管理
    const recognitionRef = useRef(null);
    const meetingIdRef = useRef(null);
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
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            hasAudioAccessRef.current = true;
            logDebug('Audio access granted');
            return true;
        } catch (error) {
            logDebug('Audio access denied:', error.message);
            throw new Error(`マイクへのアクセスが許可されていません: ${error.message}`);
        }
    };

    // 音声認識の結果を処理 (修正)
    const handleSpeechResult = useCallback((event) => {
        if (!isRecordingRef.current || !meetingIdRef.current) return;

        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                const transcript = event.results[i][0].transcript.trim();
                if (transcript && socketRef.current) {
                    logDebug(`Emitting speech data: ${transcript}`);
                    // ★ 変更点: meetingIdをペイロードに追加
                    socketRef.current.emit('speech-data', {
                        content: transcript,
                        userId,
                        userName,
                        meetingId: meetingIdRef.current
                    });
                }
            }
        }
    }, [userId, userName, socketRef]);

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
            if (isRecordingRef.current && meetingIdRef.current) {
                try {
                    setTimeout(() => {
                        if (isRecordingRef.current && meetingIdRef.current) {
                            try {
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
            if (event.error === 'no-speech') {
                logDebug(`Recognition error (ignored): ${event.error}. Please check mic.`);
                setError('マイクが音声を拾えていないようです。ブラウザのマイク許可と音量をご確認ください。');
                setTimeout(() => setError(null), 5000); 
                return; 
            }
            
            console.error('Speech recognition error:', event);
            logDebug(`Recognition error: ${event.error}`);
            
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

    // Socket.IOイベントハンドラの設定 (修正)
    useEffect(() => {
        if (!socketRef.current) return;
        localSocketRef.current = socketRef.current;

        const handleRecordingStart = async ({ meetingId: remoteMeetingId, initiatorId, initiatorName }) => {
            logDebug(`Received recording start from ${initiatorName || initiatorId}`);

            setRecordingInitiator(initiatorName || initiatorId);
            setMeetingId(remoteMeetingId);
            meetingIdRef.current = remoteMeetingId;
            setIsRecording(true);
            isRecordingRef.current = true;

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

        const handleRecordingStop = async ({ meetingId: remoteMeetingId, initiatorId }) => {
            logDebug(`Received recording stop from ${initiatorId} for meeting ${remoteMeetingId}`);
            if (meetingIdRef.current && meetingIdRef.current === remoteMeetingId) {
                await stopRecording(false);
            } else {
                logDebug('Received stop event for different meeting, ignoring');
            }
        };

        // ★★★ 新しい発言データを受信するハンドラ ★★★
        const handleNewSpeech = (speech) => {
            console.log('Received new speech from server:', speech);
            setTranscript(prev => [...prev, speech]);
        };
        
        const handleSpeechError = ({ message }) => {
            setError(message);
        };
        
        localSocketRef.current.on('recording-started', handleRecordingStart);
        localSocketRef.current.on('recording-stopped', handleRecordingStop);
        localSocketRef.current.on('new-speech', handleNewSpeech); // ★ 新しいイベントをリッスン
        localSocketRef.current.on('speech-error', handleSpeechError);

        return () => {
            if (localSocketRef.current) {
                localSocketRef.current.off('recording-started', handleRecordingStart);
                localSocketRef.current.off('recording-stopped', handleRecordingStop);
                localSocketRef.current.off('new-speech', handleNewSpeech); // ★ リスナーをクリーンアップ
                localSocketRef.current.off('speech-error', handleSpeechError);
            }
        };
    }, [socketRef?.current, isAudioOn, initializeSpeechRecognition, userId, userName]);

    // 録音開始
    const startRecording = async () => {
        try {
            logDebug('Starting new recording session');

            if (!isAudioOn) {
                throw new Error('マイクがミュートされています');
            }

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

            setMeetingId(data.meetingId);
            meetingIdRef.current = data.meetingId;
            setIsInitiator(true);
            setRecordingInitiator(userName);

            if (socketRef.current) {
                socketRef.current.emit('recording-start', {
                    meetingId: data.meetingId,
                    initiatorId: userId,
                    initiatorName: userName,
                    roomId: roomId
                });
            }

            if (!recognitionRef.current) {
                recognitionRef.current = initializeSpeechRecognition();
            }

            setIsRecording(true);
            isRecordingRef.current = true;

            try {
                recognitionRef.current.start();
                logDebug('Recognition started successfully');
            } catch (err) {
                 logDebug('Failed to call recognition.start() locally (likely started by remote event):', err.message);
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
            setIsRecording(false);
            isRecordingRef.current = false;

            if (emitEvent && socketRef.current) {
                socketRef.current.emit('recording-stop', {
                    meetingId: currentMeetingId,
                    initiatorId: userId,
                    roomId: roomId
                });
            }

            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                    logDebug('Recognition stopped');
                } catch (err) {
                    logDebug('Error stopping recognition:', err.message);
                }
            }

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
                }
            }

            logDebug('Meeting ended successfully');

            setMeetingId(null);
            meetingIdRef.current = null;
            recognitionRef.current = null;
            setIsInitiator(false);
            setRecordingInitiator(null);
            setTranscript([]); // 議事録をクリア
        } catch (error) {
            console.error('Error during stop recording:', error);
            setError(`Failed to stop recording: ${error.message}`);
        }
    };

    // クリーンアップ
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (err) {
                    // Ignore error
                }
                recognitionRef.current = null;
            }
            setIsRecording(false);
            isRecordingRef.current = false;
            if (meetingIdRef.current) {
                stopRecording(true);
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(e => logDebug('Error closing AudioContext:', e.message));
                audioContextRef.current = null;
            }
        };
    }, []);

    return (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* ... (UI部分は変更なし) ... */}
        </div>
    );
});

MeetingRecorder.displayName = 'MeetingRecorder';

export default MeetingRecorder;