// src/components/VideoRoom.js
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import MeetingRecorder from './MeetingRecorder';

// WebRTC設定の改善
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun.stunprotocol.org:3478' }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// 接続再試行の設定
const RECONNECTION_CONFIG = {
    maxRetries: 3,
    baseDelay: 1000,  // 1秒
    maxDelay: 10000   // 10秒
};

// カメラなしのユーザー用プレースホルダー生成関数
const createAudioOnlyPlaceholder = (userName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(5); // 低フレームレートで十分

    ctx.fillStyle = '#f3f4f6'; // bg-gray-100相当
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4b5563'; // text-gray-600相当
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(userName, canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('カメラOFF', canvas.width / 2, canvas.height / 2 + 30);

    return stream;
};

// メディア取得関数の定義（エラーハンドリング強化版）
const getMediaStream = async (cameraEnabled = true) => {
    try {
        const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };
        const constraints = {
            audio: audioConstraints,
            video: cameraEnabled ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } : false
        };
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
        console.error('Error accessing media devices with video:', err);
        if (cameraEnabled && (err.name === 'NotReadableError' || err.name === 'NotFoundError' || err.name === "OverconstrainedError" || err.name === "NotAllowedError")) {
            console.log('Camera failed, trying audio only...');
            try {
                // カメラエラーの場合、音声のみで再試行
                return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            } catch (audioErr) {
                console.error('Error accessing audio device:', audioErr);
                throw new Error(`音声デバイスへのアクセスに失敗しました: ${audioErr.message}`);
            }
        }
        throw new Error(`メディアデバイスへのアクセスに失敗しました: ${err.message}`);
    }
};

export default function VideoRoom({ roomId, userId }) {
    // State管理
    const [users, setUsers] = useState([]);
    const [userName, setUserName] = useState('');
    const [background, setBackground] = useState('/yoriai/backgrounds/default.jpg');
    const [deviceError, setDeviceError] = useState(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [debugInfo, setDebugInfo] = useState({});
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('initializing');
    const [showRecorder, setShowRecorder] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingInitiator, setRecordingInitiator] = useState(null);

    // Refs
    const socketRef = useRef();
    const peersRef = useRef({});
    const localStreamRef = useRef();
    const meetingRecorderRef = useRef(null);
    const mountedRef = useRef(true);

    const toggleRecording = async () => {
        if (!isAudioOn) {
            alert('録音を開始するにはマイクをオンにしてください');
            return;
        }
        try {
            if (isRecording) {
                await meetingRecorderRef.current?.stopRecording();
            } else {
                await meetingRecorderRef.current?.startRecording();
            }
        } catch (error) {
            console.error("録音操作中にエラーが発生しました:", error);
        }
    };

    const updateDebugInfo = (info) => {
        setDebugInfo(prev => {
            const newInfo = { ...prev, ...info, timestamp: new Date().toISOString() };
            console.log('Debug info updated:', newInfo);
            return newInfo;
        });
    };

    // グリッドレイアウトの計算関数
    const getGridLayout = () => {
        const totalParticipants = users.length + 1;
        return {
            portrait: totalParticipants <= 4 ? 'grid-cols-2' : 'grid-cols-3',
            landscape: totalParticipants <= 6 ? 'grid-cols-3' : 'grid-cols-4'
        };
    };

    const cleanupPeerConnection = (socketId) => {
        if (peersRef.current[socketId]) {
            peersRef.current[socketId].close();
            delete peersRef.current[socketId];
        }
    };

    const createPeer = useCallback((targetSocketId, isInitiator) => {
        if (peersRef.current[targetSocketId]) {
            cleanupPeerConnection(targetSocketId);
        }

        const peer = new RTCPeerConnection(configuration);

        peer.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socketRef.current.emit('ice-candidate', { candidate, to: targetSocketId });
            }
        };

        peer.ontrack = (event) => {
            setUsers(prev => prev.map(user => 
                user.socketId === targetSocketId ? { ...user, stream: event.streams[0] } : user
            ));
        };
        
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                peer.addTrack(track, localStreamRef.current);
            });
        }

        if (isInitiator) {
            peer.onnegotiationneeded = async () => {
                try {
                    const offer = await peer.createOffer();
                    await peer.setLocalDescription(offer);
                    socketRef.current.emit('offer', { offer, to: targetSocketId });
                } catch(err) {
                    console.error("Offer creation failed:", err);
                }
            };
        }

        peersRef.current[targetSocketId] = peer;
        return peer;
    }, []);

    // 初期化処理
    useEffect(() => {
        mountedRef.current = true;

        const initialize = async () => {
            if (!roomId || !userId) return;

            try {
                const response = await fetch(`/yoriai/api/users/${userId}`);
                const data = await response.json();
                if (!mountedRef.current) return;
                const name = data.name || userId;
                setUserName(name);

                let stream;
                try {
                    stream = await getMediaStream();
                } catch (err) {
                    if (mountedRef.current) {
                        setDeviceError(err.message);
                        setIsConnecting(false);
                    }
                    return;
                }

                if (!mountedRef.current) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                if (stream.getVideoTracks().length === 0) {
                    setIsCameraOn(false);
                    const placeholderStream = createAudioOnlyPlaceholder(name);
                    stream.getAudioTracks().forEach(track => placeholderStream.addTrack(track));
                    localStreamRef.current = placeholderStream;
                } else {
                    localStreamRef.current = stream;
                }

                setIsConnecting(false);

                socketRef.current = io(window.location.origin, {
                    path: '/yoriai/socket.io/',
                    query: { roomId, userId, userName: name },
                });

                socketRef.current.on('users', (newUsers) => {
                    const filtered = newUsers.filter(u => u.userId !== userId);
                    setUsers(prev => {
                        const updated = filtered.map(newUser => {
                            const existing = prev.find(p => p.socketId === newUser.socketId);
                            return { ...newUser, stream: existing ? existing.stream : null };
                        });
                        return updated;
                    });
                    filtered.forEach(user => {
                        createPeer(user.socketId, true);
                    });
                });

                socketRef.current.on('offer', async ({ offer, from }) => {
                    const peer = createPeer(from, false);
                    await peer.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    socketRef.current.emit('answer', { answer, to: from });
                });

                socketRef.current.on('answer', async ({ answer, from }) => {
                    await peersRef.current[from]?.setRemoteDescription(new RTCSessionDescription(answer));
                });

                socketRef.current.on('ice-candidate', ({ candidate, from }) => {
                    peersRef.current[from]?.addIceCandidate(new RTCIceCandidate(candidate));
                });

                socketRef.current.on('user-disconnected', (disconnectedUserId) => {
                     setUsers(prev => prev.filter(u => {
                         if (u.userId === disconnectedUserId) {
                             cleanupPeerConnection(u.socketId);
                             return false;
                         }
                         return true;
                     }));
                });

                socketRef.current.on('recording-started', ({ initiatorName }) => {
                    setIsRecording(true);
                    setRecordingInitiator(initiatorName);
                });
        
                socketRef.current.on('recording-stopped', () => {
                    setIsRecording(false);
                    setRecordingInitiator(null);
                });

            } catch (error) {
                if (mountedRef.current) {
                    setDeviceError(error.message);
                    setIsConnecting(false);
                }
            }
        };

        initialize();

        return () => {
            mountedRef.current = false;
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            Object.keys(peersRef.current).forEach(cleanupPeerConnection);
        };
    }, [roomId, userId, createPeer]);

    const toggleCamera = () => { /* ... 実装は変更なし ... */ };
    const toggleAudio = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
                setIsAudioOn(track.enabled);
            });
        }
    };
    const leaveRoom = () => {
        if (window.confirm('ビデオ通話を終了しますか？')) {
            window.location.href = '/yoriai';
        }
    };

    if (deviceError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-700 p-4">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-4">エラーが発生しました</h2>
                    <p>{deviceError}</p>
                    <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded">
                        再読み込み
                    </button>
                </div>
            </div>
        );
    }

    if (isConnecting) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl">接続中...</div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen p-1 sm:p-2"
            style={{
                backgroundImage: `url(${background})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            <div 
                className={`
                    grid gap-1 sm:gap-2 pt-8 pb-20 px-1 sm:px-2
                    portrait:${getGridLayout().portrait}
                    landscape:${getGridLayout().landscape}
                    h-screen overflow-hidden
                `}
                style={{ height: 'calc(100vh - 100px)' }}
            >
                {/* ローカルビデオ */}
                <div className="relative bg-gray-900 rounded-lg overflow-hidden shadow-lg">
                    <video
                        ref={ref => { if (ref) { ref.srcObject = localStreamRef.current; }}}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <div className="text-white text-xs sm:text-sm font-bold truncate">
                            あなた ({userName})
                        </div>
                    </div>
                </div>

                {/* リモートビデオ */}
                {users.map(user => (
                    <div key={user.socketId} className="relative bg-gray-900 rounded-lg overflow-hidden shadow-lg">
                        <video
                            ref={ref => { if (ref && user.stream) { ref.srcObject = user.stream; }}}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                            <div className="text-white text-xs sm:text-sm font-bold truncate">
                                {user.userName || '接続中...'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* コントロールパネル */}
            <div className="fixed bottom-2 left-1/2 transform -translate-x-1/2 z-20 w-full max-w-5xl px-2">
                <div className="flex justify-center items-center gap-1 sm:gap-2 bg-white/95 backdrop-blur-sm px-2 sm:px-3 py-2 sm:py-3 rounded-2xl shadow-xl">
                    <div className="flex flex-col items-center">
                        <button onClick={toggleCamera} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${isCameraOn ? 'bg-blue-600' : 'bg-red-600'} text-white shadow-lg`}>
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">{isCameraOn ? 'カメラOFF' : 'カメラON'}</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <button onClick={toggleAudio} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${isAudioOn ? 'bg-blue-600' : 'bg-red-600'} text-white shadow-lg`}>
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">{isAudioOn ? 'マイクOFF' : 'マイクON'}</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <button onClick={toggleRecording} disabled={!isAudioOn} className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-green-600'} text-white shadow-lg disabled:opacity-50`}>
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">{isRecording ? '録音中' : '録音開始'}</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <button onClick={() => window.location.href = `/yoriai/minutes?roomId=${roomId}`} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">議事録</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <button onClick={leaveRoom} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg">
                             <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        </button>
                        <span className="text-xs font-bold text-red-600 mt-1">退出</span>
                    </div>
                </div>
            </div>

            {/* 録音機能コンポーネント */}
            <div className="hidden">
                <MeetingRecorder
                    ref={meetingRecorderRef}
                    roomId={roomId}
                    userId={userId}
                    userName={userName}
                    isAudioOn={isAudioOn}
                    localStream={localStreamRef.current}
                    socketRef={socketRef}
                />
            </div>
        </div>
    );
}