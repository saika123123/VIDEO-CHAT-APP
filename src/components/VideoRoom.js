'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import BackgroundSelector from './BackgroundSelector';

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
    const socketRef = useRef();
    const peersRef = useRef({});
    const localStreamRef = useRef();
    const userNameFetchedRef = useRef(false);
    const makingOfferRef = useRef(false);
    const isSettingRemoteAnswerRef = useRef(false);

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
            <div className="fixed top-4 right-4 z-10">
                <button
                    onClick={copyInviteLink}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" />
                        <path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                    <span>{showCopied ? '招待URLをコピーしました！' : '招待URLをコピー'}</span>
                </button>
            </div>

            <div className="fixed top-4 left-4 z-10 bg-black/50 text-white px-4 py-2 rounded-lg">
                参加者: {users.length + 1}人
            </div>

            <BackgroundSelector onSelect={setBackground} />

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-16">
                <div className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden shadow-lg">
                    <video
                        ref={ref => {
                            if (ref) {
                                ref.srcObject = localStreamRef.current;
                                console.log('Local video element updated:', {
                                    hasStream: !!localStreamRef.current,
                                    streamTracks: localStreamRef.current?.getTracks().map(t => ({
                                        kind: t.kind,
                                        enabled: t.enabled,
                                        muted: t.muted
                                    }))
                                });
                            }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white">
                        あなた ({userName})
                    </div>
                </div>

                {users.map(user => (
                    <div key={user.socketId} className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden shadow-lg">
                        <video
                            ref={ref => {
                                if (ref && user.stream) {
                                    ref.srcObject = user.stream;
                                    console.log('Remote video element updated:', {
                                        userId: user.userId,
                                        hasStream: !!user.stream,
                                        streamTracks: user.stream?.getTracks().map(t => ({
                                            kind: t.kind,
                                            enabled: t.enabled,
                                            muted: t.muted
                                        }))
                                    });
                                }
                            }}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white">
                            {user.userName || '接続中...'}
                        </div>
                    </div>
                ))}
            </div>

            {users.length === 0 && (
                <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 px-6 py-3 rounded-lg shadow-lg">
                    <p className="text-center text-gray-800">
                        右上の「招待URLをコピー」ボタンをクリックして、他の参加者を招待できます
                    </p>
                </div>
            )}

            {process.env.NODE_ENV === 'development' && (
                <div className="fixed bottom-4 right-4 bg-black/50 text-white text-xs p-2 rounded-lg">
                    <div>Room ID: {roomId}</div>
                    <div>User ID: {userId}</div>
                    <div>User Name: {userName}</div>
                    <div>Connected Users: {users.length}</div>
                    <div>Users with Streams: {users.filter(u => u.stream).length}</div>
                    <div>Peer Connections: {Object.keys(peersRef.current).length}</div>
                    <div>Socket Connected: {socketRef.current?.connected ? 'Yes' : 'No'}</div>
                    <div>Test Mode: {window.location.search.includes('test=true') ? 'Yes' : 'No'}</div>
                    <div className="mt-2 font-bold">Connected Users:</div>
                    {users.map(user => (
                        <div key={user.socketId} className="ml-2">
                            {user.userName} ({user.stream ? '✓' : '×'})
                        </div>
                    ))}
                    <div className="mt-2 font-bold">Debug Info:</div>
                    <pre className="text-xs mt-1">
                        {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}