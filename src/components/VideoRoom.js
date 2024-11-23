'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import BackgroundSelector from './BackgroundSelector';
import MeetingRecorder from './MeetingRecorder';

// WebRTC設定
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// メディア制約
const mediaConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    },
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
    }
};

// テスト用のフェイクストリームを生成する関数
const createFakeStream = (userName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    let hue = 0;
    const drawInterval = setInterval(() => {
        hue = (hue + 1) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.fillText(new Date().toLocaleTimeString(), 20, 100);
        ctx.fillText(`User: ${userName}`, 20, 160);
    }, 1000 / 30);

    stream.stopFakeStream = () => {
        clearInterval(drawInterval);
    };

    let audioCtx;
    let audioTrack;

    const initAudio = () => {
        if (!audioCtx) {
            audioCtx = new AudioContext();
            const oscillator = audioCtx.createOscillator();
            oscillator.frequency.value = 0;
            const dst = oscillator.connect(audioCtx.createMediaStreamDestination());
            oscillator.start();
            audioTrack = dst.stream.getAudioTracks()[0];
            stream.addTrack(audioTrack);
        }
    };

    document.addEventListener('click', initAudio, { once: true });

    return stream;
};

export default function VideoRoom({ roomId, userId }) {
    const [users, setUsers] = useState([]);
    const [userName, setUserName] = useState('');
    const [background, setBackground] = useState('/backgrounds/default.jpg');
    const [deviceError, setDeviceError] = useState(null);
    const [showCopied, setShowCopied] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [debugInfo, setDebugInfo] = useState({});
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const socketRef = useRef();
    const peersRef = useRef({});
    const localStreamRef = useRef();
    const userNameFetchedRef = useRef(false);
    const makingOfferRef = useRef(false);
    const isSettingRemoteAnswerRef = useRef(false);

    // カメラのオン/オフを切り替え
    const toggleCamera = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOn(videoTrack.enabled);
            }
        }
    };

    // マイクのオン/オフを切り替え
    const toggleAudio = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioOn(audioTrack.enabled);
            }
        }
    };

    // 退出処理
    const leaveRoom = async () => {
        try {
            // もし録音中なら、まず録音を停止して議事録を保存
            if (meetingRecorderRef.current?.endMeeting) {
                await meetingRecorderRef.current.endMeeting();
            }
    
            // メディアストリームの停止
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
    
            // WebRTC接続のクリーンアップ
            Object.values(peersRef.current).forEach(peer => peer.close());
    
            // Socket接続の切断
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
    
            // ホームページへリダイレクト
            window.location.href = '/';
        } catch (error) {
            console.error('Error during room exit:', error);
            // エラーが発生してもホームページへ移動
            window.location.href = '/';
        }
    };

    // グリッドレイアウトの計算
    const getGridLayout = () => {
        const totalParticipants = users.length + 1;
        if (totalParticipants <= 2) {
            return 'grid-cols-1 md:grid-cols-2';
        } else if (totalParticipants <= 4) {
            return 'grid-cols-2';
        } else if (totalParticipants <= 6) {
            return 'grid-cols-2 md:grid-cols-3';
        } else {
            return 'grid-cols-2 md:grid-cols-4';
        }
    };

    // デバッグ情報を更新する関数
    const updateDebugInfo = (info) => {
        setDebugInfo(prev => {
            const newInfo = { ...prev, ...info };
            console.log('Debug info updated:', newInfo);
            return newInfo;
        });
    };

    // ユーザー名を取得する関数
    const fetchUserName = async () => {
        try {
            const response = await fetch(`/api/users/${userId}`);
            const data = await response.json();

            if (response.ok && data.name) {
                setUserName(data.name);
                updateDebugInfo({ userName: data.name });
                return data.name;
            }
            throw new Error(data.error || 'ユーザー名の取得に失敗しました');
        } catch (error) {
            console.error('Error fetching username:', error);
            updateDebugInfo({ userNameError: error.message });
            return null;
        }
    };
    // createPeer関数の定義
    const createPeer = (targetSocketId, isInitiator = true) => {
        console.log(`Creating peer connection for ${targetSocketId}, isInitiator: ${isInitiator}`);

        if (peersRef.current[targetSocketId]) {
            peersRef.current[targetSocketId].close();
            delete peersRef.current[targetSocketId];
        }

        const peer = new RTCPeerConnection(configuration);
        let makingOffer = false;
        let ignoreOffer = false;
        let isSettingRemoteAnswer = false;

        peer.onconnectionstatechange = () => {
            console.log(`Connection state for ${targetSocketId}:`, peer.connectionState);
            updateDebugInfo({ [`peerState_${targetSocketId}`]: peer.connectionState });
        };

        peer.oniceconnectionstatechange = () => {
            console.log(`ICE state for ${targetSocketId}:`, peer.iceConnectionState);
            updateDebugInfo({ [`iceState_${targetSocketId}`]: peer.iceConnectionState });
        };

        peer.onicecandidate = ({ candidate }) => {
            if (candidate && socketRef.current?.connected) {
                console.log('Sending ICE candidate:', candidate);
                socketRef.current.emit('ice-candidate', {
                    candidate,
                    to: targetSocketId
                });
            }
        };

        peer.ontrack = (event) => {
            console.log('ontrack event:', event);
            const remoteStream = event.streams[0];
            if (!remoteStream) {
                console.warn('No remote stream available');
                return;
            }

            setUsers(prevUsers => {
                const existingUserIndex = prevUsers.findIndex(u => u.socketId === targetSocketId);
                if (existingUserIndex >= 0) {
                    if (prevUsers[existingUserIndex].stream?.id === remoteStream.id) {
                        return prevUsers;
                    }
                    const updatedUsers = [...prevUsers];
                    updatedUsers[existingUserIndex] = {
                        ...updatedUsers[existingUserIndex],
                        stream: remoteStream
                    };
                    return updatedUsers;
                }
                return [...prevUsers, {
                    socketId: targetSocketId,
                    stream: remoteStream,
                    userId: null,
                    userName: 'Connecting...'
                }];
            });
        };

        // ネゴシエーション処理の改善
        peer.onnegotiationneeded = async () => {
            try {
                if (makingOfferRef.current) return;
                makingOfferRef.current = true;

                await peer.setLocalDescription();

                socketRef.current.emit('offer', {
                    offer: peer.localDescription,
                    to: targetSocketId
                });
            } catch (err) {
                console.error('Negotiation failed:', err);
            } finally {
                makingOfferRef.current = false;
            }
        };

        // メディアストリームの追加
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                try {
                    peer.addTrack(track, localStreamRef.current);
                } catch (err) {
                    console.error('Error adding track:', err);
                }
            });
        }

        return peer;
    };


    const initializeSocketConnection = (name) => {
        socketRef.current = io('http://localhost:3001', {
            query: { roomId, userId, userName: name }
        });

        socketRef.current.on('connect', () => {
            console.log('Connected to signaling server');
            updateDebugInfo({ socketConnected: true });
        });

        socketRef.current.on('users', (newUsers) => {
            console.log('Received users update:', newUsers);
            updateDebugInfo({ connectedUsers: newUsers.length });

            setUsers(prevUsers => {
                const filteredUsers = newUsers.filter(u => u.userId !== userId);
                const updatedUsers = filteredUsers.map(newUser => {
                    const existingUser = prevUsers.find(u => u.socketId === newUser.socketId);
                    return {
                        ...newUser,
                        stream: existingUser?.stream || null
                    };
                });
                return updatedUsers;
            });

            const filteredUsers = newUsers.filter(u => u.userId !== userId);
            filteredUsers.forEach(user => {
                if (!peersRef.current[user.socketId]) {
                    peersRef.current[user.socketId] = createPeer(user.socketId, true);
                }
            });
        });

        socketRef.current.on('offer', async ({ offer, from }) => {
            try {
                const peer = peersRef.current[from] || createPeer(from, false);
                peersRef.current[from] = peer;

                const readyForOffer =
                    !makingOfferRef.current &&
                    (peer.signalingState === "stable" || isSettingRemoteAnswerRef.current);

                const offerCollision = !readyForOffer;
                const ignoreOffer = offerCollision && socketRef.current.id < from;

                if (ignoreOffer) {
                    console.log('Ignoring colliding offer');
                    return;
                }

                isSettingRemoteAnswerRef.current = true;
                await peer.setRemoteDescription(new RTCSessionDescription(offer));
                isSettingRemoteAnswerRef.current = false;

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socketRef.current.emit('answer', {
                    answer: peer.localDescription,
                    to: from
                });
            } catch (err) {
                console.error('Error handling offer:', err);
                updateDebugInfo({ offerHandlingError: err.message });
            }
        });

        socketRef.current.on('answer', async ({ answer, from }) => {
            try {
                const peer = peersRef.current[from];
                if (!peer) {
                    console.warn('No peer connection found for answer');
                    return;
                }

                if (peer.signalingState === "have-local-offer") {
                    await peer.setRemoteDescription(new RTCSessionDescription(answer));
                } else {
                    console.warn('Unexpected signaling state for answer:', peer.signalingState);
                }
            } catch (err) {
                console.error('Error handling answer:', err);
                updateDebugInfo({ answerHandlingError: err.message });
            }
        });
        socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
            try {
                const peer = peersRef.current[from];
                if (peer && peer.remoteDescription && peer.remoteDescription.type) {
                    await peer.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
                updateDebugInfo({ iceCandidateError: err.message });
            }
        });

        socketRef.current.on('user-disconnected', (disconnectedUserId) => {
            console.log('User disconnected:', disconnectedUserId);
            setUsers(prevUsers => prevUsers.filter(user => user.userId !== disconnectedUserId));

            Object.entries(peersRef.current).forEach(([socketId, peer]) => {
                if (users.find(u => u.socketId === socketId && u.userId === disconnectedUserId)) {
                    peer.close();
                    delete peersRef.current[socketId];
                }
            });

            updateDebugInfo({ lastDisconnected: disconnectedUserId });
        });
    };

    // useEffect for initialization
    useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            if (!roomId || !userId || userNameFetchedRef.current) return;

            try {
                const name = await fetchUserName();
                if (!mounted) return;
                if (!name) throw new Error('ユーザー名の取得に失敗しました');

                let stream;
                if (process.env.NODE_ENV === 'development' && window.location.search.includes('test=true')) {
                    stream = createFakeStream(name);
                } else {
                    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
                }

                if (!mounted) {
                    if (stream.stopFakeStream) stream.stopFakeStream();
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                console.log('Local stream obtained:', stream);
                localStreamRef.current = stream;

                setIsConnecting(false);
                userNameFetchedRef.current = true;

                initializeSocketConnection(name);
            } catch (error) {
                console.error('Initialization error:', error);
                if (!mounted) return;
                setDeviceError(error.message);
                setIsConnecting(false);
                updateDebugInfo({ initError: error.message });
            }
        };

        initialize();

        return () => {
            mounted = false;
            if (localStreamRef.current) {
                if (localStreamRef.current.stopFakeStream) {
                    localStreamRef.current.stopFakeStream();
                }
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }

            Object.values(peersRef.current).forEach(peer => {
                peer.close();
            });
            peersRef.current = {};

            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [roomId, userId]);

    // 招待URLのコピー機能
    const copyInviteLink = () => {
        const url = `${window.location.origin}/?room=${roomId}`;
        navigator.clipboard.writeText(url).then(() => {
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        });
    };

    if (deviceError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-red-600">
                        デバイスエラー
                    </h2>
                    <p className="text-gray-700 mb-4">{deviceError}</p>
                    <div className="space-y-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                            再試行
                        </button>
                        <button
                            onClick={() => window.history.back()}
                            className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                        >
                            戻る
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isConnecting) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="mb-4 text-xl">接続中...</div>
                    <div className="text-sm text-gray-600">
                        カメラとマイクの使用許可が必要です
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen p-4"
            style={{
                backgroundImage: `url(${background})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            {/* ヘッダー部分 */}
            <div className="fixed top-4 left-4 z-10 flex items-center gap-4">
                <div className="bg-black/50 text-white px-4 py-2 rounded-lg">
                    参加者: {users.length + 1}人
                </div>
                <button
                    onClick={copyInviteLink}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                    </svg>
                    <span>{showCopied ? 'コピーしました！' : '招待URLをコピー'}</span>
                </button>
            </div>

            {/* ビデオグリッド */}
            <div className={`grid ${getGridLayout()} gap-4 mt-16 max-w-7xl mx-auto`}>
                {/* ローカルビデオ */}
                <div className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                    <video
                        ref={ref => {
                            if (ref) {
                                ref.srcObject = localStreamRef.current;
                            }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                        <div className="bg-black/50 px-2 py-1 rounded text-white">
                            あなた ({userName})
                        </div>
                        <div className="flex gap-1">
                            {!isAudioOn && (
                                <div className="bg-red-500/80 px-2 py-1 rounded-lg text-white text-sm flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                        />
                                    </svg>
                                    ミュート
                                </div>
                            )}
                            {!isCameraOn && (
                                <div className="bg-red-500/80 px-2 py-1 rounded-lg text-white text-sm flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M15 13l-3 3m0 0l-3-3m3 3v-6m0 0l-3 3m3-3l3 3"
                                        />
                                    </svg>
                                    カメラOFF
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* リモートビデオ */}
                {users.map(user => (
                    <div key={user.socketId} className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                        <video
                            ref={ref => {
                                if (ref && user.stream) {
                                    ref.srcObject = user.stream;
                                }
                            }}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                            <div className="bg-black/50 px-2 py-1 rounded text-white">
                                {user.userName || '接続中...'}
                            </div>
                            <div className="flex gap-1">
                                {user.isAudioOff && (
                                    <div className="bg-red-500/80 px-2 py-1 rounded-lg text-white text-sm flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                        </svg>
                                        ミュート
                                    </div>
                                )}
                                {user.isCameraOff && (
                                    <div className="bg-red-500/80 px-2 py-1 rounded-lg text-white text-sm flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M15 13l-3 3m0 0l-3-3m3 3v-6m0 0l-3 3m3-3l3 3"
                                            />
                                        </svg>
                                        カメラOFF
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* コントロールパネル */}
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-20">
                <div className="flex items-center gap-4 bg-black/50 px-6 py-3 rounded-full">
                    <button
                        onClick={toggleCamera}
                        className={`p-3 rounded-full ${isCameraOn ? 'bg-blue-600' : 'bg-red-600'} text-white hover:opacity-90 transition-opacity`}
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                    </button>

                    <button
                        onClick={toggleAudio}
                        className={`p-3 rounded-full ${isAudioOn ? 'bg-blue-600' : 'bg-red-600'} text-white hover:opacity-90 transition-opacity`}
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                            />
                        </svg>
                    </button>

                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-3 rounded-full bg-gray-600 text-white hover:opacity-90 transition-opacity"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                        </svg>
                    </button>

                    <div className="w-px h-8 bg-gray-400/50 mx-2" />

                    <button
                        onClick={leaveRoom}
                        className="p-3 rounded-full bg-red-600 text-white hover:opacity-90 transition-opacity"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            {/* 背景選択 */}
            {showSettings && (
                <div className="fixed bottom-24 right-4 z-10">
                    <BackgroundSelector onSelect={setBackground} />
                </div>
            )}
            {/* 議事録コンポーネント */}
            <MeetingRecorder
                roomId={roomId}
                userId={userId}
                userName={userName}
                isAudioOn={isAudioOn}
            />
            {/* 招待案内 */}
            {users.length === 0 && (
                <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-white/90 px-6 py-3 rounded-lg shadow-lg">
                    <p className="text-center text-gray-800">
                        右上の「招待URLをコピー」ボタンをクリックして、他の参加者を招待できます
                    </p>
                </div>
            )}

            {/* デバッグ情報（開発環境のみ） */}
            {process.env.NODE_ENV === 'development' && (
                <div className="fixed bottom-4 right-4 bg-black/50 text-white text-xs p-2 rounded-lg">
                    <div>Room ID: {roomId}</div>
                    <div>User ID: {userId}</div>
                    <div>User Name: {userName}</div>
                    <div>Connected Users: {users.length}</div>
                    <div>Camera: {isCameraOn ? 'ON' : 'OFF'}</div>
                    <div>Audio: {isAudioOn ? 'ON' : 'OFF'}</div>
                    <div>Peer Connections: {Object.keys(peersRef.current).length}</div>
                </div>
            )}
        </div>
    );
}