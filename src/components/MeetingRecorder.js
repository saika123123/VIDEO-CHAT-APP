'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

// AudioWorkletプロセッサのコードを文字列として定義
const keepAliveProcessor = `
  class KeepAliveProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
      // This function being called keeps the microphone active.
      return true;
    }
  }
  registerProcessor('keep-alive-processor', KeepAliveProcessor);
`;

const MeetingRecorder = forwardRef(({ roomId, userId, userName, isAudioOn, localStream, socketRef, onLocalSpeech, recognitionLang = 'ja-JP' }, ref) => {
    // State
    const [isRecording, setIsRecording] = useState(false);
    const [meetingId, setMeetingId] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isInitiator, setIsInitiator] = useState(false);
    const [recordingInitiator, setRecordingInitiator] = useState(null);

    // Refs
    const recognitionRef = useRef(null);
    const meetingIdRef = useRef(null);
    const processingRef = useRef(false);
    const pendingSpeechesRef = useRef([]);
    const isRecordingRef = useRef(false);
    const manualStopRef = useRef(false);
    
    // ★ ミュート状態をRefで管理（コールバック内で最新の値を参照するため）
    const isAudioOnRef = useRef(isAudioOn);
    
    // ★ エコー対策：他人の発言を受信した時刻を記録
    const lastRemoteSpeechTimeRef = useRef(0);
    
    // Web Audio API Refs
    const audioContextRef = useRef(null);
    const mediaStreamSourceRef = useRef(null);
    const audioWorkletNodeRef = useRef(null);

    const logDebug = (message, data = null) => {
        const timestamp = new Date().toISOString();
        console.log(`★ [MeetingRecorder ${timestamp}] ${message}`, data || '');
    };

    // isAudioOnプロップスの変更をRefに反映
    useEffect(() => {
        isAudioOnRef.current = isAudioOn;
        logDebug(`Audio state changed: ${isAudioOn ? 'UNMUTED' : 'MUTED'}`);
        
        // 録音中であれば、ミュート状態に合わせて認識を開始/停止
        if (isRecordingRef.current) {
            if (isAudioOn) {
                // ミュート解除：認識再開
                if (recognitionRef.current) {
                    try { recognitionRef.current.start(); } catch(e) { /* 既に開始されている場合は無視 */ }
                } else {
                    initializeSpeechRecognition();
                    try { recognitionRef.current.start(); } catch(e) {}
                }
            } else {
                // ミュート：認識停止
                if (recognitionRef.current) {
                    recognitionRef.current.stop();
                }
            }
        }
    }, [isAudioOn]); // initializeSpeechRecognition は依存配列に入れない（無限ループ防止）

    const resumeAudioContext = useCallback(async () => {
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            logDebug('Resuming AudioContext...');
            await audioContextRef.current.resume();
        }
    }, []);

    useImperativeHandle(ref, () => ({
        startRecording: async () => {
            await resumeAudioContext();
            try {
                if (!isAudioOn) throw new Error('マイクがミュートされています');
                if (!localStream || localStream.getAudioTracks().length === 0) {
                    throw new Error('有効な音声ストリームがありません。');
                }
                await startRecording();
                return true;
            } catch (error) {
                console.error('録音開始エラー:', error);
                setError(error.message);
                return false;
            }
        },
        stopRecording: () => stopRecording(true),
        isCurrentlyRecording: () => isRecording
    }));

    const activateMicrophone = useCallback(async () => {
        try {
            if (!localStream) throw new Error("Local stream is not available.");
            await resumeAudioContext();

            mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(localStream);
            
            const workletURL = URL.createObjectURL(new Blob([keepAliveProcessor], { type: 'application/javascript' }));
            await audioContextRef.current.audioWorklet.addModule(workletURL);

            audioWorkletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'keep-alive-processor');
            
            mediaStreamSourceRef.current.connect(audioWorkletNodeRef.current);
            audioWorkletNodeRef.current.connect(audioContextRef.current.destination);

            logDebug('Microphone activated using existing stream.');
        } catch (err) {
            console.error("マイクの有効化に失敗:", err);
            throw new Error(`マイクの処理開始に失敗しました: ${err.message}`);
        }
    }, [resumeAudioContext, localStream]);

    const deactivateMicrophone = useCallback(() => {
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if(audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }
        logDebug('Audio processing for recorder deactivated.');
    }, []);
    
    const saveSpeechToQueue = useCallback((content, speakerId, speakerName) => {
        if (!content || !content.trim() || !meetingIdRef.current) return;
        pendingSpeechesRef.current.push({ content: content.trim(), timestamp: new Date().toISOString(), userId: speakerId, userName: speakerName, retryCount: 0 });
        processSpeechQueue();
    }, []);

    const processSpeechQueue = useCallback(async () => {
        if (pendingSpeechesRef.current.length === 0 || processingRef.current || !meetingIdRef.current) return;
        processingRef.current = true;
        const currentSpeech = pendingSpeechesRef.current[0];
        try {
            const response = await fetch('/yoriai/api/speeches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meetingId: meetingIdRef.current, userId: currentSpeech.userId, content: currentSpeech.content })
            });
            if (!response.ok) throw new Error(`Failed to save speech: ${response.statusText}`);
            const data = await response.json();
            setTranscript(prev => [...prev, { id: data.id, ...currentSpeech }]);
            pendingSpeechesRef.current.shift();
            setError(null);
        } catch (error) {
            console.error('Failed to save speech:', error);
            currentSpeech.retryCount = (currentSpeech.retryCount || 0) + 1;
            if (currentSpeech.retryCount >= 3) {
                pendingSpeechesRef.current.shift();
                setError(`音声の保存に失敗しました...`);
            }
        } finally {
            processingRef.current = false;
            if (pendingSpeechesRef.current.length > 0) setTimeout(processSpeechQueue, 500);
        }
    }, []);
    
    const handleSpeechResult = useCallback((event) => {
        if (!isRecordingRef.current) return;
        
        // ★ 対策1: ミュート中は結果を無視する
        if (!isAudioOnRef.current) {
            logDebug('Ignored speech result because mic is muted.');
            return;
        }

        // ★ 対策2: エコー対策（直近3000ms以内に他人の発言を受信していたら無視）
        const timeSinceLastRemote = Date.now() - lastRemoteSpeechTimeRef.current;
        if (timeSinceLastRemote < 3000) {
            logDebug(`Echo cancellation: Ignored local speech due to recent remote speech (${timeSinceLastRemote}ms ago)`);
            return;
        }

        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal && event.results[i][0].transcript.trim()) {
                const transcriptText = event.results[i][0].transcript.trim();
                logDebug(`Final result: ${transcriptText}`);
                
                if (socketRef.current) {
                    socketRef.current.emit('speech-data', { content: transcriptText, userId, userName });
                }
                
                // 自分の発言は保存する
                saveSpeechToQueue(transcriptText, userId, userName);
                
                // 自分の発言を親コンポーネント（字幕用）に通知
                if (onLocalSpeech) {
                    onLocalSpeech(transcriptText);
                }
            }
        }
    }, [userId, userName, saveSpeechToQueue, socketRef, onLocalSpeech]);

    const initializeSpeechRecognition = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) throw new Error('このブラウザは音声認識に対応していません。');

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        // 言語設定を適用
        recognition.lang = recognitionLang;

        recognition.onstart = () => logDebug(`Speech recognition started (${recognitionLang})`);
        
        recognition.onend = () => {
            logDebug('Speech recognition ended.');
            // ★ 対策1の補強: ミュート中でない場合のみ再起動する
            if (!manualStopRef.current && isRecordingRef.current && isAudioOnRef.current) {
                logDebug('Restarting recognition...');
                setTimeout(() => {
                    if (recognitionRef.current) recognitionRef.current.start();
                }, 100);
            }
        };
        recognition.onerror = (event) => {
            logDebug(`Recognition error: ${event.error}`);
            if (event.error === 'no-speech') {
                logDebug('"no-speech" error. Will restart via onend.');
            } else if (event.error === 'audio-capture' || event.error === 'not-allowed') {
                setError('マイクへのアクセスに問題があります。設定を確認してください。');
                stopRecording(true);
            } else {
                 // 軽微なエラーは無視して継続
            }
        };
        recognition.onresult = handleSpeechResult;
        recognitionRef.current = recognition;
    }, [handleSpeechResult, recognitionLang]);

    // 言語設定が変更されたら音声認識を再起動
    useEffect(() => {
        if (recognitionRef.current && recognitionRef.current.lang !== recognitionLang) {
            logDebug(`Language changed to ${recognitionLang}. Restarting recognition...`);
            
            if (isRecordingRef.current && isAudioOnRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current.onend = null; // 既存のハンドラを無効化
                initializeSpeechRecognition(); // 新しい設定で初期化
                recognitionRef.current.start();
            } else {
                recognitionRef.current = null; 
            }
        }
    }, [recognitionLang, initializeSpeechRecognition]);

    const startRecording = async () => {
        logDebug('Attempting to start recording...');
        setIsSaving(true);
        manualStopRef.current = false;

        try {
            await activateMicrophone();

            const response = await fetch('/yoriai/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId })
            });
            if (!response.ok) throw new Error('ミーティングの作成に失敗しました');
            
            const data = await response.json();
            logDebug('Meeting created:', data);
            
            meetingIdRef.current = data.meetingId;
            setMeetingId(data.meetingId);
            setIsInitiator(true);
            setRecordingInitiator(userName);

            if (socketRef.current) {
                socketRef.current.emit('recording-start', { meetingId: data.meetingId, initiatorId: userId, initiatorName: userName, roomId });
            }

            if (!recognitionRef.current) {
                initializeSpeechRecognition();
            }
            
            setIsRecording(true);
            isRecordingRef.current = true;
            
            // マイクがONの場合のみ認識開始
            if (isAudioOn) {
                recognitionRef.current.start();
            }

        } catch (error) {
            console.error('Failed to start recording:', error);
            setError(error.message);
            setIsRecording(false);
            isRecordingRef.current = false;
            deactivateMicrophone();
        } finally {
            setIsSaving(false);
        }
    };

    const stopRecording = async (emitEvent = true) => {
        logDebug('Stopping recording');
        if (!isRecordingRef.current && !manualStopRef.current) return;

        manualStopRef.current = true;
        isRecordingRef.current = false;
        setIsRecording(false);
        
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        
        deactivateMicrophone();

        const currentMeetingId = meetingIdRef.current;
        if (emitEvent && socketRef.current && currentMeetingId) {
            socketRef.current.emit('recording-stop', { meetingId: currentMeetingId, initiatorId: userId, roomId });
        }
        
        setIsSaving(true);
        let retryCount = 0;
        while (pendingSpeechesRef.current.length > 0 && retryCount < 20) {
             await new Promise(resolve => setTimeout(resolve, 500));
             retryCount++;
        }
        
        if (emitEvent && currentMeetingId) {
            try {
                await fetch(`/yoriai/api/meetings/${currentMeetingId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endTime: new Date().toISOString() })
                });
            } catch (apiError) {
                console.error('API error ending meeting:', apiError);
            }
        }

        logDebug('Meeting ended');
        setMeetingId(null);
        meetingIdRef.current = null;
        setIsInitiator(false);
        setRecordingInitiator(null);
        setIsSaving(false);
        pendingSpeechesRef.current = [];
    };
    
    useEffect(() => {
        const initAudio = () => {
            if (!audioContextRef.current) {
                try {
                    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) {
                    setError("このブラウザは音声機能に対応していません。");
                }
            }
        };
        initAudio();

        const handleFirstInteraction = () => resumeAudioContext();
        window.addEventListener('click', handleFirstInteraction, { once: true });
        window.addEventListener('keydown', handleFirstInteraction, { once: true });

        return () => {
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('keydown', handleFirstInteraction);
            if (isRecordingRef.current) {
                stopRecording(true);
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(e => logDebug('Error closing AudioContext:', e.message));
            }
        };
    }, [resumeAudioContext]);
    
    useEffect(() => {
        if (!socketRef.current) return;

        const handleRecordingStart = async ({ meetingId: remoteMeetingId, initiatorId, initiatorName }) => {
            logDebug(`Received recording start from ${initiatorName}`);
            setRecordingInitiator(initiatorName);
            setMeetingId(remoteMeetingId);
            meetingIdRef.current = remoteMeetingId;
            setIsRecording(true);
            isRecordingRef.current = true;
            manualStopRef.current = false;

            if (initiatorId !== userId && isAudioOn) {
                try {
                    await activateMicrophone();
                    if (!recognitionRef.current) initializeSpeechRecognition();
                    recognitionRef.current.start();
                } catch (error) {
                    setError(`録音開始に失敗: ${error.message}`);
                }
            }
        };

        const handleRecordingStop = ({ meetingId: remoteMeetingId }) => {
            if (meetingIdRef.current === remoteMeetingId) stopRecording(false);
        };
        
        const handleRemoteSpeech = ({ content, userId: speakerId, userName: speakerName }) => {
            if (isRecordingRef.current) {
                // ★ 対策2の準備: 他人の発言を受信した時刻を記録
                lastRemoteSpeechTimeRef.current = Date.now();

                // 重複保存防止のため、ここでは保存せず画面表示の更新のみ行う
                setTranscript(prev => [...prev, { 
                    id: Date.now().toString(), 
                    userId: speakerId, 
                    userName: speakerName, 
                    content, 
                    timestamp: new Date().toISOString() 
                }]);
            }
        };

        socketRef.current.on('recording-started', handleRecordingStart);
        socketRef.current.on('recording-stopped', handleRecordingStop);
        socketRef.current.on('speech-data', handleRemoteSpeech);

        return () => {
            if (socketRef.current) {
                socketRef.current.off('recording-started');
                socketRef.current.off('recording-stopped');
                socketRef.current.off('speech-data');
            }
        };
    }, [socketRef, isAudioOn, initializeSpeechRecognition, saveSpeechToQueue, userId, activateMicrophone]);

    return (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-blue-600 p-6">
                <div className="flex flex-col items-stretch gap-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-2xl font-bold text-white">会話の記録</h3>
                    </div>
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

            {isSaving && (
                <div className="m-4 p-4 bg-blue-50 border-2 border-blue-200 text-blue-700 rounded-xl">
                    <div className="flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-lg font-medium">保存しています...</span>
                    </div>
                </div>
            )}

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