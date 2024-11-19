'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import BackgroundSelector from './BackgroundSelector';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// テスト用のフェイクストリームを生成する関数
const createFakeStream = (userName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30); // 30fps

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
            oscillator.frequency.value = 0; // 無音
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
    const pendingCandidatesRef = useRef({});

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
        console.log('Fetching username for userId:', userId);
        try {
            const response = await fetch(`/api/users/${userId}`);
            console.log('Username API response:', response.status);
            const data = await response.json();
            console.log('Username data:', data);

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

    // WebRTC Peer接続を作成する関数
    const createPeer = (targetSocketId, isInitiator = true) => {
        console.log(`Creating peer connection for ${targetSocketId} (initiator: ${isInitiator})`);
        const peer = new RTCPeerConnection({
            ...configuration,
            sdpSemantics: 'unified-plan'
        });

        // トランスシーバーの事前設定
        peer.addTransceiver('video', {
            direction: 'sendrecv',
            streams: [localStreamRef.current]
        });
        peer.addTransceiver('audio', {
            direction: 'sendrecv',
            streams: [localStreamRef.current]
        });

        // SDP変換関数
        const modifySdp = (sdp) => {
            let lines = sdp.split('\n');
            let extensionMap = new Map();
            let modified = [];

            for (let line of lines) {
                // RTP拡張の重複を防ぐ
                if (line.includes('extmap')) {
                    const match = line.match(/extmap:(\d+)/);
                    if (match) {
                        const id = match[1];
                        const uri = line.split(' ')[2];
                        if (!extensionMap.has(uri)) {
                            extensionMap.set(uri, id);
                            modified.push(line);
                        }
                    } else {
                        modified.push(line);
                    }
                } else {
                    modified.push(line);
                }
            }

            return modified.join('\n');
        };

        // オファー作成の処理
        const createModifiedOffer = async () => {
            const offer = await peer.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            // SDPの修正
            offer.sdp = modifySdp(offer.sdp);

            await peer.setLocalDescription(offer);
            return offer;
        };

        // アンサー作成の処理
        const createModifiedAnswer = async () => {
            const answer = await peer.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            // SDPの修正
            answer.sdp = modifySdp(answer.sdp);

            await peer.setLocalDescription(answer);
            return answer;
        };

        // ICE candidate の処理
        const handleICECandidate = (event) => {
            if (event.candidate) {
                const { candidate } = event;

                // ICE candidateのufragを検証
                if (peer.localDescription && peer.localDescription.sdp.includes(candidate.ufrag)) {
                    if (peer.remoteDescription) {
                        socketRef.current.emit('ice-candidate', {
                            candidate,
                            to: targetSocketId
                        });
                    } else {
                        if (!pendingCandidatesRef.current[targetSocketId]) {
                            pendingCandidatesRef.current[targetSocketId] = [];
                        }
                        pendingCandidatesRef.current[targetSocketId].push(candidate);
                    }
                }
            }
        };

        peer.onicecandidate = handleICECandidate;

        // 接続状態の監視とリカバリ
        let connectionCheckTimer;
        peer.onconnectionstatechange = () => {
            console.log(`Connection state for ${targetSocketId}:`, peer.connectionState);
            updateDebugInfo({ [`peerState_${targetSocketId}`]: peer.connectionState });

            if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
                clearTimeout(connectionCheckTimer);
                connectionCheckTimer = setTimeout(async () => {
                    try {
                        if (isInitiator) {
                            const offer = await createModifiedOffer();
                            socketRef.current.emit('offer', {
                                offer,
                                to: targetSocketId
                            });
                        }
                    } catch (err) {
                        console.error('Connection recovery failed:', err);
                        updateDebugInfo({ recoveryError: err.message });
                    }
                }, 2000);
            }
        };

        peer.oniceconnectionstatechange = () => {
            console.log(`ICE state for ${targetSocketId}:`, peer.iceConnectionState);
            updateDebugInfo({ [`iceState_${targetSocketId}`]: peer.iceConnectionState });
        };

        // ネゴシエーションの処理
        peer.onnegotiationneeded = async () => {
            if (isInitiator && peer.signalingState === 'stable') {
                try {
                    const offer = await createModifiedOffer();
                    socketRef.current.emit('offer', {
                        offer,
                        to: targetSocketId
                    });
                } catch (err) {
                    console.error('Error during negotiation:', err);
                    updateDebugInfo({ negotiationError: err.message });
                }
            }
        };

        // シグナリングイベントハンドラ
        socketRef.current.on('offer', async ({ offer, from }) => {
            try {
                const peer = peersRef.current[from] || createPeer(from, false);
                peersRef.current[from] = peer;

                const modifiedOffer = new RTCSessionDescription({
                    type: offer.type,
                    sdp: modifySdp(offer.sdp)
                });

                await peer.setRemoteDescription(modifiedOffer);
                const answer = await createModifiedAnswer();

                socketRef.current.emit('answer', {
                    answer,
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
                if (peer && peer.signalingState === 'have-local-offer') {
                    const modifiedAnswer = new RTCSessionDescription({
                        type: answer.type,
                        sdp: modifySdp(answer.sdp)
                    });
                    await peer.setRemoteDescription(modifiedAnswer);
                }
            } catch (err) {
                console.error('Error handling answer:', err);
                updateDebugInfo({ answerHandlingError: err.message });
            }
        });

        return peer;
    };

    // Socket.IO接続の初期化
    const initializeSocketConnection = (name) => {
        console.log('Initializing socket connection with name:', name);

        socketRef.current = io('http://localhost:3001', {
            query: { roomId, userId, userName: name }
        });

        socketRef.current.on('connect', () => {
            console.log('Connected to signaling server');
            updateDebugInfo({ socketConnected: true });
        });

        // ユーザーリストの更新処理
        socketRef.current.on('users', async (newUsers) => {
            console.log('Received users update:', newUsers);
            updateDebugInfo({ connectedUsers: newUsers.length });

            const filteredUsers = newUsers.filter(u => u.userId !== userId);

            setUsers(prevUsers => {
                return filteredUsers.map(newUser => {
                    const existingUser = prevUsers.find(u => u.socketId === newUser.socketId);
                    return {
                        ...newUser,
                        stream: existingUser?.stream || null
                    };
                });
            });

            // 新しい接続を作成
            for (const user of filteredUsers) {
                if (!peersRef.current[user.socketId]) {
                    console.log('Creating new peer for user:', user.userName);
                    const peer = createPeer(user.socketId, true);
                    peersRef.current[user.socketId] = peer;
                    try {
                        const offer = await peer.createOffer();
                        await peer.setLocalDescription(offer);
                        socketRef.current.emit('offer', {
                            offer,
                            to: user.socketId
                        });
                    } catch (err) {
                        console.error('Error creating offer:', err);
                        updateDebugInfo({ offerError: err.message });
                    }
                }
            }
        });

        // オファーの受信と処理
        socketRef.current.on('offer', async ({ offer, from }) => {
            try {
                console.log('Received offer from:', from);
                let peer = peersRef.current[from];

                if (!peer) {
                    peer = createPeer(from, false);
                    peersRef.current[from] = peer;
                }

                await peer.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socketRef.current.emit('answer', {
                    answer,
                    to: from
                });

                // 保存していたICE candidatesを処理
                if (pendingCandidatesRef.current[from]) {
                    for (const candidate of pendingCandidatesRef.current[from]) {
                        await peer.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    delete pendingCandidatesRef.current[from];
                }
            } catch (err) {
                console.error('Error handling offer:', err);
                updateDebugInfo({ offerHandlingError: err.message });
            }
        });

        // アンサーの受信と処理
        socketRef.current.on('answer', async ({ answer, from }) => {
            try {
                console.log('Received answer from:', from);
                const peer = peersRef.current[from];

                if (peer && peer.signalingState === 'have-local-offer') {
                    await peer.setRemoteDescription(new RTCSessionDescription(answer));

                    // 保存していたICE candidatesを処理
                    if (pendingCandidatesRef.current[from]) {
                        for (const candidate of pendingCandidatesRef.current[from]) {
                            await peer.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                        delete pendingCandidatesRef.current[from];
                    }
                }
            } catch (err) {
                console.error('Error handling answer:', err);
                updateDebugInfo({ answerHandlingError: err.message });
            }
        });

        // ICE candidateの受信と処理
        socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
            try {
                const peer = peersRef.current[from];
                if (peer) {
                    if (peer.remoteDescription) {
                        await peer.addIceCandidate(new RTCIceCandidate(candidate));
                    } else {
                        if (!pendingCandidatesRef.current[from]) {
                            pendingCandidatesRef.current[from] = [];
                        }
                        pendingCandidatesRef.current[from].push(candidate);
                    }
                }
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
                updateDebugInfo({ iceCandidateError: err.message });
            }
        });

        // ユーザー切断の処理
        socketRef.current.on('user-disconnected', (disconnectedUserId) => {
            console.log('User disconnected:', disconnectedUserId);
            setUsers(prevUsers => {
                const updatedUsers = prevUsers.filter(user => user.userId !== disconnectedUserId);

                // Peer接続のクリーンアップ
                prevUsers.forEach(user => {
                    if (user.userId === disconnectedUserId) {
                        const peer = peersRef.current[user.socketId];
                        if (peer) {
                            peer.close();
                            delete peersRef.current[user.socketId];
                        }
                        delete pendingCandidatesRef.current[user.socketId];
                    }
                });

                return updatedUsers;
            });

            updateDebugInfo({ lastDisconnected: disconnectedUserId });
        });

        // 接続エラーの処理
        socketRef.current.on('error', (error) => {
            console.error('Socket error:', error);
            updateDebugInfo({ socketError: error.message });
        });

        // 再接続時の処理
        socketRef.current.on('reconnect', (attemptNumber) => {
            console.log('Reconnected after', attemptNumber, 'attempts');
            updateDebugInfo({ reconnected: true, attemptNumber });
        });
    };

    // 初期化とクリーンアップ
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
                    console.log('Using test mode with fake stream');
                    stream = createFakeStream(name);
                } else {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: true
                    });
                }

                if (!mounted) {
                    if (stream.getTracks) {
                        stream.getTracks().forEach(track => track.stop());
                    }
                    if (stream.stopFakeStream) {
                        stream.stopFakeStream();
                    }
                    return;
                }

                console.log('Got local media stream');
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

            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            Object.values(peersRef.current).forEach(peer => {
                peer.close();
            });
            peersRef.current = {};
            pendingCandidatesRef.current = {};
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

    // エラー表示
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

    // 接続中表示
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

    // メインのビデオチャットUI
    return (
        <div
            className="min-h-screen p-4"
            style={{
                backgroundImage: `url(${background})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            {/* 招待ボタン */}
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

            {/* 参加者数表示 */}
            <div className="fixed top-4 left-4 z-10 bg-black/50 text-white px-4 py-2 rounded-lg">
                参加者: {users.length + 1}人
            </div>

            {/* 背景選択コンポーネント */}
            <div className="fixed bottom-4 left-4 z-10">
                <BackgroundSelector onSelect={setBackground} />
            </div>

            {/* ビデオグリッド */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-16">
                {/* 自分のビデオ */}
                <div className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden shadow-lg">
                    <video
                        ref={ref => {
                            if (ref) {
                                ref.srcObject = localStreamRef.current;
                                ref.play().catch(error =>
                                    console.warn("Local video playback error:", error)
                                );
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

                {/* 他の参加者のビデオ */}
                {users.map(user => (
                    <div key={user.socketId} className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden shadow-lg">
                        <video
                            ref={ref => {
                                if (ref && user.stream) {
                                    ref.srcObject = user.stream;
                                    ref.play().catch(error =>
                                        console.warn(`Remote video playback error for ${user.userName}:`, error)
                                    );
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

            {/* 説明メッセージ */}
            {users.length === 0 && (
                <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 px-6 py-3 rounded-lg shadow-lg">
                    <p className="text-center text-gray-800">
                        右上の「招待URLをコピー」ボタンをクリックして、他の参加者を招待できます
                    </p>
                </div>
            )}

            {/* デバッグ情報表示 */}
            {process.env.NODE_ENV === 'development' && (
                <div className="fixed bottom-4 right-4 bg-black/50 text-white text-xs p-2 rounded-lg max-w-xs overflow-auto max-h-64">
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
                    <pre className="text-xs whitespace-pre-wrap">
                        {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}