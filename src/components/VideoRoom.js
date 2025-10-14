'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import MeetingRecorder from './MeetingRecorder';

// WebRTC設定の改善
const configuration = {
    iceServers: [
        // Google提供の無料STUNサーバーを追加
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },

        // Twilioの無料STUNサーバー
        { urls: 'stun:global.stun.twilio.com:3478' },

        // オープンソースのSTUNサーバー
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

// 背景画像のURLを生成する関数
const getBackgroundUrl = (path) => {
    if (path.startsWith('http')) return path;
    // パスに /yoriai/ が含まれていない場合は追加
    if (!path.startsWith('/yoriai/')) {
        return `${window.location.origin}/yoriai${path}`;
    }
    return `${window.location.origin}${path}`;
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

// カメラなしのユーザー用プレースホルダー生成関数
const createAudioOnlyPlaceholder = (userName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(5); // 低フレームレートで十分

    // 初期描画
    ctx.fillStyle = '#f3f4f6'; // bg-gray-100相当
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ユーザー名と「カメラOFF」の表示
    ctx.fillStyle = '#4b5563'; // text-gray-600相当
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(userName, canvas.width / 2, canvas.height / 2 - 30);

    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('カメラOFF', canvas.width / 2, canvas.height / 2 + 30);

    return stream;
};

// メディア取得関数の定義
const getMediaStream = async (cameraEnabled = true) => {
    try {
        // カメラとマイクのオプション
        const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        // カメラが有効な場合はビデオも要求
        const constraints = {
            audio: audioConstraints,
            video: cameraEnabled ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } : false
        };

        // メディア取得
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return stream;
    } catch (err) {
        console.error('Error accessing media devices:', err);

        // カメラエラーの場合、音声のみで再試行
        if (cameraEnabled && (
            err.name === 'NotFoundError' ||
            err.name === 'NotAllowedError' ||
            err.name === 'NotReadableError' ||
            err.name === 'OverconstrainedError'
        )) {
            console.log('Camera not available, trying audio only');
            return getMediaStream(false);  // カメラなしで再帰呼び出し
        }

        throw new Error(`デバイスへのアクセスに失敗しました: ${err.message}`);
    }
};

export default function VideoRoom({ roomId, userId }) {
    // State管理
    const [users, setUsers] = useState([]);
    const [userName, setUserName] = useState('');
    const [background, setBackground] = useState('/yoriai/backgrounds/default.jpg');
    const [deviceError, setDeviceError] = useState(null);
    const [showCopied, setShowCopied] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [debugInfo, setDebugInfo] = useState({});
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('initializing');
    const [showRecorder, setShowRecorder] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingInitiator, setRecordingInitiator] = useState(null);
    const [recordingErrorMessage, setRecordingErrorMessage] = useState(null);

    // Refs
    const socketRef = useRef();
    const peersRef = useRef({});
    const localStreamRef = useRef();
    const userNameFetchedRef = useRef(false);
    const makingOfferRef = useRef(false);
    const isSettingRemoteAnswerRef = useRef(false);
    const reconnectionAttemptsRef = useRef({});
    const isReconnectingRef = useRef(false);
    const meetingRecorderRef = useRef(null);
    const mountedRef = useRef(true);

    const router = useRouter();

    // 会話記録の開始/停止を切り替える関数
    const toggleRecording = async () => {
        if (!isAudioOn) {
            alert('録音を開始するにはマイクをオンにしてください');
            return;
        }

        console.log("現在の録音状態:", isRecording);

        try {
            setRecordingErrorMessage(null);

            if (isRecording) {
                // 録音停止
                console.log("録音停止を開始します");
                await meetingRecorderRef.current?.stopRecording();
                setIsRecording(false);
                console.log("録音停止しました");
            } else {
                // 録音開始
                console.log("録音開始を試みます");
                const success = await meetingRecorderRef.current?.startRecording();
                if (success) {
                    setIsRecording(true);
                    console.log("録音開始しました");
                } else {
                    console.error("録音開始に失敗しました");
                    setRecordingErrorMessage("録音の開始に失敗しました。マイクの設定を確認してください。");
                }
            }
        } catch (error) {
            console.error("録音操作中にエラーが発生しました:", error);
            setRecordingErrorMessage(`録音エラー: ${error.message}`);
        }
    };

    // ユーティリティ関数
    const calculateReconnectionDelay = (attempts) => {
        const delay = RECONNECTION_CONFIG.baseDelay * Math.pow(2, attempts);
        return Math.min(delay, RECONNECTION_CONFIG.maxDelay);
    };

    const updateDebugInfo = (info) => {
        setDebugInfo(prev => {
            const newInfo = { ...prev, ...info, timestamp: new Date().toISOString() };
            console.log('Debug info updated:', newInfo);
            return newInfo;
        });
    };

    const fetchUserName = async () => {
        try {
            const response = await fetch(`/yoriai/api/users/${userId}`);
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

    // グリッドレイアウトの計算関数
    const getGridLayout = () => {
        const totalParticipants = users.length + 1;

        // 縦画面と横画面で完全に異なるレイアウト戦略
        return {
            // 縦画面用のクラス
            portrait: totalParticipants === 1 ? 'grid-cols-1' :
                totalParticipants === 2 ? 'grid-cols-1' :
                    totalParticipants <= 4 ? 'grid-cols-2' :
                        totalParticipants <= 6 ? 'grid-cols-2' :
                            totalParticipants <= 9 ? 'grid-cols-3' : 'grid-cols-3',

            // 横画面用のクラス  
            landscape: totalParticipants === 1 ? 'grid-cols-1' :
                totalParticipants === 2 ? 'grid-cols-2' :
                    totalParticipants <= 4 ? 'grid-cols-2' :
                        totalParticipants <= 6 ? 'grid-cols-3' :
                            totalParticipants <= 9 ? 'grid-cols-3' :
                                totalParticipants <= 12 ? 'grid-cols-4' : 'grid-cols-4'
        };
    };
    // WebRTC接続管理
    const createPeer = (targetSocketId, isInitiator = true) => {
        console.log(`Creating peer connection for ${targetSocketId}, isInitiator: ${isInitiator}`);

        // 既存の接続のクリーンアップ
        if (peersRef.current[targetSocketId]) {
            cleanupPeerConnection(targetSocketId);
        }

        const peerConnection = new RTCPeerConnection(configuration);
        let iceCandidatesQueue = [];
        let connectionTimeout = null;
        let isReconnecting = false;

        // ICE候補のキュー処理
        const processIceCandidateQueue = async () => {
            while (iceCandidatesQueue.length > 0 && peerConnection.remoteDescription) {
                const candidate = iceCandidatesQueue.shift();
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('Successfully added queued ICE candidate');
                } catch (err) {
                    console.error('Error adding queued ICE candidate:', err);
                    updateDebugInfo({ iceCandidateError: err.message });
                }
            }
        };

        // 接続再試行の実装
        const restartConnection = async () => {
            if (isReconnecting) return;
            isReconnecting = true;

            try {
                const attempts = reconnectionAttemptsRef.current[targetSocketId] || 0;
                if (attempts >= RECONNECTION_CONFIG.maxRetries) {
                    console.log(`Max reconnection attempts reached for peer ${targetSocketId}`);
                    cleanupPeerConnection(targetSocketId);
                    return;
                }

                reconnectionAttemptsRef.current[targetSocketId] = attempts + 1;
                const delay = calculateReconnectionDelay(attempts);
                console.log(`Attempting reconnection ${attempts + 1}/${RECONNECTION_CONFIG.maxRetries} after ${delay}ms`);

                await new Promise(resolve => setTimeout(resolve, delay));

                if (peerConnection.connectionState !== 'closed') {
                    console.log('Creating restart offer');
                    const offer = await peerConnection.createOffer({ iceRestart: true });
                    await peerConnection.setLocalDescription(offer);
                    socketRef.current?.emit('offer', {
                        offer,
                        to: targetSocketId,
                        isRestart: true
                    });
                }
            } catch (err) {
                console.error('Error during connection restart:', err);
                updateDebugInfo({ restartError: err.message });
            } finally {
                isReconnecting = false;
            }
        };

        // 接続状態の監視
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state changed for ${targetSocketId}:`, peerConnection.connectionState);
            updateDebugInfo({ [`peerState_${targetSocketId}`]: peerConnection.connectionState });

            switch (peerConnection.connectionState) {
                case 'connected':
                    clearTimeout(connectionTimeout);
                    reconnectionAttemptsRef.current[targetSocketId] = 0;
                    setConnectionStatus('connected');
                    break;
                case 'failed':
                case 'disconnected':
                    console.log(`Connection ${peerConnection.connectionState} for peer ${targetSocketId}`);
                    setConnectionStatus('reconnecting');
                    restartConnection();
                    break;
                case 'closed':
                    clearTimeout(connectionTimeout);
                    setConnectionStatus('closed');
                    break;
            }
        };

        // ICE接続状態の監視
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`ICE connection state for ${targetSocketId}:`, peerConnection.iceConnectionState);
            updateDebugInfo({ [`iceState_${targetSocketId}`]: peerConnection.iceConnectionState });

            if (peerConnection.iceConnectionState === 'failed') {
                console.log('ICE connection failed, attempting restart...');
                restartConnection();
            }
        };

        // シグナリング状態の監視
        peerConnection.onsignalingstatechange = () => {
            console.log(`Signaling state for ${targetSocketId}:`, peerConnection.signalingState);
            updateDebugInfo({ [`signalingState_${targetSocketId}`]: peerConnection.signalingState });
        };

        // ICE候補の送信
        peerConnection.onicecandidate = ({ candidate }) => {
            if (candidate && socketRef.current?.connected) {
                console.log('Sending ICE candidate to', targetSocketId);
                socketRef.current.emit('ice-candidate', {
                    candidate,
                    to: targetSocketId
                });
            }
        };

        // メディアストリームの処理
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event);
            const remoteStream = event.streams[0];
            if (!remoteStream) {
                console.warn('No remote stream available in track event');
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

        // ネゴシエーションの処理
        peerConnection.onnegotiationneeded = async () => {
            try {
                if (makingOfferRef.current) return;
                makingOfferRef.current = true;

                console.log('Negotiation needed, creating offer...');
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                socketRef.current?.emit('offer', {
                    offer: peerConnection.localDescription,
                    to: targetSocketId
                });
            } catch (err) {
                console.error('Error during negotiation:', err);
                updateDebugInfo({ negotiationError: err.message });
            } finally {
                makingOfferRef.current = false;
            }
        };

        // ローカルストリームの追加
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                try {
                    peerConnection.addTrack(track, localStreamRef.current);
                } catch (err) {
                    console.error('Error adding track to peer:', err);
                    updateDebugInfo({ trackError: err.message });
                }
            });
        }

        return {
            peerConnection,
            close: () => {
                clearTimeout(connectionTimeout);
                peerConnection.close();
            },
            setLocalDescription: async (desc) => {
                try {
                    if (!desc || !desc.type) {
                        throw new Error('Invalid session description: missing type');
                    }

                    // シグナリング状態をチェック
                    const signalingState = peerConnection.signalingState;
                    console.log(`Current signaling state before setLocalDescription: ${signalingState}`);

                    // 適切な状態チェック
                    const isValidState = (desc.type === 'offer' &&
                        (signalingState === 'stable' || signalingState === 'have-local-offer')) ||
                        (desc.type === 'answer' &&
                            (signalingState === 'have-remote-offer' || signalingState === 'have-local-pranswer'));

                    if (!isValidState) {
                        console.warn(`Invalid state for setLocalDescription: ${signalingState}, type: ${desc.type}`);
                        return;
                    }

                    await peerConnection.setLocalDescription(desc);
                    console.log(`Successfully set local description, new state: ${peerConnection.signalingState}`);
                } catch (err) {
                    console.error('Error setting local description:', err);
                    updateDebugInfo({
                        localDescError: err.message,
                        signalingState: peerConnection.signalingState,
                        descType: desc?.type
                    });

                    // 特定のエラー状態での回復処理
                    if (err.name === 'InvalidStateError') {
                        try {
                            // シグナリング状態をリセット
                            if (peerConnection.signalingState !== 'stable') {
                                await peerConnection.setLocalDescription({ type: "rollback" });
                                console.log('Successfully rolled back signaling state');
                            }
                            // 再度ローカル記述を設定
                            await peerConnection.setLocalDescription(desc);
                        } catch (recoveryErr) {
                            console.error('Failed to recover from invalid state:', recoveryErr);
                        }
                    }
                }
            },
            setRemoteDescription: async (desc) => {
                try {
                    if (!desc || !desc.type) {
                        throw new Error('Invalid session description: missing type');
                    }

                    // シグナリング状態をチェック
                    const signalingState = peerConnection.signalingState;
                    console.log(`Current signaling state before setRemoteDescription: ${signalingState}`);

                    // 適切な状態チェック
                    const isValidState = (desc.type === 'offer' &&
                        (signalingState === 'stable' || signalingState === 'have-local-offer')) ||
                        (desc.type === 'answer' &&
                            (signalingState === 'have-local-offer' || signalingState === 'have-remote-pranswer'));

                    if (!isValidState) {
                        console.warn(`Invalid state for setRemoteDescription: ${signalingState}, type: ${desc.type}`);
                        return;
                    }

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(desc));
                    await processIceCandidateQueue();
                    console.log(`Successfully set remote description, new state: ${peerConnection.signalingState}`);
                } catch (err) {
                    console.error('Error setting remote description:', err);
                    updateDebugInfo({
                        remoteDescError: err.message,
                        signalingState: peerConnection.signalingState,
                        descType: desc?.type
                    });
                }
            },
            createAnswer: async () => {
                try {
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    return answer;
                } catch (err) {
                    console.error('Error creating answer:', err);
                    updateDebugInfo({ answerError: err.message });
                    throw err;
                }
            },
            addIceCandidate: async (candidate) => {
                try {
                    if (peerConnection.remoteDescription) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                        console.log('Successfully added ICE candidate');
                    } else {
                        console.log('Queueing ICE candidate');
                        iceCandidatesQueue.push(candidate);
                    }
                } catch (err) {
                    console.error('Error handling ICE candidate:', err);
                    updateDebugInfo({ iceCandidateError: err.message });
                }
            }
        };
    };

    const cleanupPeerConnection = (targetSocketId) => {
        const peer = peersRef.current[targetSocketId];
        if (peer) {
            if (peer.peerConnection) {
                peer.peerConnection.ontrack = null;
                peer.peerConnection.onicecandidate = null;
                peer.peerConnection.oniceconnectionstatechange = null;
                peer.peerConnection.onicegatheringstatechange = null;
                peer.peerConnection.onsignalingstatechange = null;
                peer.peerConnection.onconnectionstatechange = null;
                peer.peerConnection.onnegotiationneeded = null;
                peer.peerConnection.close();
            }
            delete peersRef.current[targetSocketId];
        }
    };


    // Socket.IO接続の初期化
    const initializeSocketConnection = (name) => {
        socketRef.current = io(window.location.origin, {
            path: '/yoriai/socket.io/',
            transports: ['polling', 'websocket'], // ポーリングとWebSocketの両方を許可
            secure: true,
            rejectUnauthorized: false,
            query: { roomId, userId, userName: name },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });

        socketRef.current.on('connect', () => {
            console.log('Connected to signaling server via:', socketRef.current.io.engine.transport.name);
            setConnectionStatus('connected');
            updateDebugInfo({
                socketConnected: true,
                transport: socketRef.current.io.engine.transport.name
            });
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            setConnectionStatus('error');
            updateDebugInfo({ socketError: error.message });
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

            // 新しいピア接続の作成
            const filteredUsers = newUsers.filter(u => u.userId !== userId);
            filteredUsers.forEach(user => {
                if (!peersRef.current[user.socketId]) {
                    peersRef.current[user.socketId] = createPeer(user.socketId, true);
                }
            });
        });

        socketRef.current.on('offer', async ({ offer, from, isRestart }) => {
            try {
                console.log(`Received ${isRestart ? 'restart' : ''} offer from:`, from);
                const peer = peersRef.current[from] || createPeer(from, false);
                peersRef.current[from] = peer;

                const readyForOffer =
                    !makingOfferRef.current &&
                    (peer.peerConnection.signalingState === "stable" || isSettingRemoteAnswerRef.current);

                const offerCollision = !readyForOffer;
                const ignoreOffer = !isRestart && offerCollision && socketRef.current.id < from;

                if (ignoreOffer) {
                    console.log('Ignoring colliding offer');
                    return;
                }

                isSettingRemoteAnswerRef.current = true;
                await peer.setRemoteDescription(offer);
                isSettingRemoteAnswerRef.current = false;

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socketRef.current.emit('answer', {
                    answer: peer.peerConnection.localDescription,
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

                if (peer.peerConnection.signalingState === "have-local-offer") {
                    await peer.setRemoteDescription(answer);
                } else {
                    console.warn('Unexpected signaling state for answer:', peer.peerConnection.signalingState);
                }
            } catch (err) {
                console.error('Error handling answer:', err);
                updateDebugInfo({ answerHandlingError: err.message });
            }
        });

        socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
            try {
                const peer = peersRef.current[from];
                if (peer) {
                    await peer.addIceCandidate(candidate);
                }
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
                updateDebugInfo({ iceCandidateError: err.message });
            }
        });

        socketRef.current.on('user-disconnected', (disconnectedUserId) => {
            console.log('User disconnected:', disconnectedUserId);
            setUsers(prevUsers => prevUsers.filter(user => user.userId !== disconnectedUserId));

            // クリーンアップ
            Object.entries(peersRef.current).forEach(([socketId, peer]) => {
                if (users.find(u => u.socketId === socketId && u.userId === disconnectedUserId)) {
                    cleanupPeerConnection(socketId);
                }
            });

            updateDebugInfo({ lastDisconnected: disconnectedUserId });
        });

        socketRef.current.on('disconnect', () => {
            console.log('Disconnected from signaling server');
            setConnectionStatus('disconnected');
            updateDebugInfo({ socketDisconnected: true });
        });
    };

    // カメラとマイクの制御
    const toggleCamera = () => {
        if (localStreamRef.current) {
            const videoTracks = localStreamRef.current.getVideoTracks();

            if (videoTracks.length > 0) {
                // カメラがある場合は有効/無効を切り替え
                videoTracks.forEach(track => {
                    track.enabled = !track.enabled;
                });
                setIsCameraOn(videoTracks[0].enabled);
            } else if (isCameraOn) {
                // 既にプレースホルダーを使用している場合
                setIsCameraOn(false);

                // 既存の接続にカメラOFFを通知する処理があれば実行
                // (必要に応じて実装)
            } else {
                // カメラをONにする場合、カメラへのアクセスを再試行
                navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    }
                })
                    .then(videoStream => {
                        const videoTrack = videoStream.getVideoTracks()[0];

                        // 音声トラックを保持したまま、新しいビデオトラックを追加
                        const newStream = new MediaStream();

                        // 既存の音声トラックを追加
                        localStreamRef.current.getAudioTracks().forEach(track => {
                            newStream.addTrack(track);
                        });

                        // 新しいビデオトラックを追加
                        newStream.addTrack(videoTrack);

                        // 既存のストリームを置き換え
                        videoStream.getVideoTracks().forEach(track => {
                            track.stop();  // 元のストリームのビデオトラックを停止
                        });

                        localStreamRef.current = newStream;

                        // 既存のピア接続にビデオトラックを追加
                        Object.values(peersRef.current).forEach(peer => {
                            const senders = peer.peerConnection.getSenders();
                            const videoSender = senders.find(sender =>
                                sender.track && sender.track.kind === 'video'
                            );

                            if (videoSender) {
                                videoSender.replaceTrack(videoTrack);
                            } else {
                                peer.peerConnection.addTrack(videoTrack, newStream);
                            }
                        });

                        setIsCameraOn(true);
                    })
                    .catch(err => {
                        console.error('カメラへのアクセスに失敗しました:', err);
                        alert('カメラの起動に失敗しました。設定を確認してください。');
                    });
            }
        }
    };

    // マイクをオフにする際の処理を修正
    const toggleAudio = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioOn(audioTrack.enabled);

                // マイクをオフにする際、録音中かつ自分が開始者なら警告を表示
                if (!audioTrack.enabled && isRecording) {
                    if (recordingInitiator === userName) {
                        if (window.confirm('録音中にマイクをオフにすると、あなたの音声は記録されなくなります。続けますか？')) {
                            // ユーザーが確認した場合は処理を続行
                        } else {
                            // キャンセルした場合はマイクを再度オンに
                            audioTrack.enabled = true;
                            setIsAudioOn(true);
                            return;
                        }
                    } else {
                        // 他の人が開始した録音の場合は警告のみ
                        alert('録音中にマイクをオフにすると、あなたの音声は記録されなくなります');
                    }
                }
            }
        }
    };

    // 部屋を退出する
    const leaveRoom = async () => {
        try {
            setConnectionStatus('disconnecting');

            // もし録音中なら、まず録音を停止して議事録を保存
            if (isRecording) {
                try {
                    await meetingRecorderRef.current?.stopRecording();
                    console.log("退出前に録音を停止しました");
                } catch (error) {
                    console.error("退出時の録音停止エラー:", error);
                    // エラーがあっても退出処理は続行
                }
            }

            // メディアストリームの停止
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }

            // WebRTC接続のクリーンアップ
            Object.keys(peersRef.current).forEach(socketId => {
                cleanupPeerConnection(socketId);
            });

            // Socket接続の切断
            if (socketRef.current) {
                socketRef.current.disconnect();
            }

            // ホームページへリダイレクト
            window.location.href = '/yoriai';
        } catch (error) {
            console.error('Error during room exit:', error);
            // エラーが発生してもホームページへ移動
            window.location.href = '/yoriai';
        }
    };

    // 初期化処理
    useEffect(() => {
        mountedRef.current = true;

        const initialize = async () => {
            if (!roomId || !userId || userNameFetchedRef.current) return;

            try {
                const name = await fetchUserName();
                if (!mountedRef.current) return;
                if (!name) throw new Error('ユーザー名の取得に失敗しました');

                let stream;
                if (process.env.NODE_ENV === 'development' && window.location.search.includes('test=true')) {
                    stream = createFakeStream(name);
                } else {
                    try {
                        // MediaAPIを使ってカメラとマイクにアクセス
                        stream = await getMediaStream();

                        // カメラのトラックがない場合はカメラOFFとして扱う
                        const hasVideoTrack = stream.getVideoTracks().length > 0;
                        setIsCameraOn(hasVideoTrack);

                        if (!hasVideoTrack) {
                            // カメラなしの場合は音声ストリームのみ使用し、プレースホルダーを作成
                            const audioStream = stream;
                            const placeholderStream = createAudioOnlyPlaceholder(name);

                            // オーディオトラックを追加
                            if (audioStream.getAudioTracks().length > 0) {
                                const audioTrack = audioStream.getAudioTracks()[0];
                                placeholderStream.addTrack(audioTrack);
                            }

                            stream = placeholderStream;
                        }
                    } catch (err) {
                        console.error('Error accessing media devices:', err);
                        throw new Error(`デバイスへのアクセスに失敗しました: ${err.message}`);
                    }
                }

                if (!mountedRef.current) {
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
                if (!mountedRef.current) return;
                setDeviceError(error.message);
                setIsConnecting(false);
                updateDebugInfo({ initError: error.message });
            }
        };

        initialize();

        return () => {
            mountedRef.current = false;
            if (localStreamRef.current) {
                if (localStreamRef.current.stopFakeStream) {
                    localStreamRef.current.stopFakeStream();
                }
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }

            Object.keys(peersRef.current).forEach(socketId => {
                cleanupPeerConnection(socketId);
            });

            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [roomId, userId]);

    // 招待URLのコピー機能
    const copyInviteLink = () => {
        const url = `${window.location.origin}/yoriai/?room=${roomId}`;
        navigator.clipboard.writeText(url).then(() => {
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        });
    };

    // 録音の開始/停止を処理するsocket.ioイベントリスナーを追加
    useEffect(() => {
        if (!socketRef.current) return;

        // 他の誰かが録音を開始した時のハンドラ
        const handleRecordingStarted = ({ meetingId, initiatorId, initiatorName }) => {
            console.log(`Recording started by ${initiatorName || initiatorId}`);
            setIsRecording(true);
            setRecordingInitiator(initiatorName || initiatorId);
            setRecordingErrorMessage(null);
        };

        // 他の誰かが録音を停止した時のハンドラ
        const handleRecordingStopped = ({ meetingId, initiatorId }) => {
            console.log(`Recording stopped by ${initiatorId}`);
            setIsRecording(false);
            setRecordingInitiator(null);
        };

        // 録音開始者が退出した場合のハンドラ
        const handleRecordingInitiatorLeft = ({ meetingId, formerInitiatorId, formerInitiatorName }) => {
            console.log(`Recording initiator ${formerInitiatorName} left, but recording continues`);
            setRecordingInitiator(`${formerInitiatorName}(退出済み)`);
        };

        // イベントリスナーの登録
        socketRef.current.on('recording-started', handleRecordingStarted);
        socketRef.current.on('recording-stopped', handleRecordingStopped);
        socketRef.current.on('recording-initiator-left', handleRecordingInitiatorLeft);

        return () => {
            if (socketRef.current) {
                socketRef.current.off('recording-started', handleRecordingStarted);
                socketRef.current.off('recording-stopped', handleRecordingStopped);
                socketRef.current.off('recording-initiator-left', handleRecordingInitiatorLeft);
            }
        };
    }, [socketRef?.current]);

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

                    {/* カメラなし参加オプション */}
                    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 
                                bg-white p-6 rounded-xl shadow-xl text-center max-w-md w-full">
                        <h3 className="text-xl font-bold mb-4">カメラへのアクセスが必要です</h3>
                        <p className="mb-6">
                            カメラとマイクへのアクセスを許可してください。
                            カメラがない場合は「音声のみで参加」を選択できます。
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={async () => {
                                    try {
                                        // 音声のみで参加
                                        const audioStream = await navigator.mediaDevices.getUserMedia({
                                            audio: true,
                                            video: false
                                        });

                                        if (!mountedRef.current) {
                                            audioStream.getTracks().forEach(track => track.stop());
                                            return;
                                        }

                                        // 音声ストリームをセット
                                        localStreamRef.current = audioStream;

                                        // プレースホルダーストリームを作成
                                        const placeholderStream = createAudioOnlyPlaceholder(userName || userId);

                                        // オーディオトラックを追加
                                        if (audioStream.getAudioTracks().length > 0) {
                                            const audioTrack = audioStream.getAudioTracks()[0];
                                            placeholderStream.addTrack(audioTrack);
                                        }

                                        // プレースホルダーストリームを設定
                                        localStreamRef.current = placeholderStream;
                                        setIsCameraOn(false);

                                        setIsConnecting(false);
                                        userNameFetchedRef.current = true;
                                        initializeSocketConnection(userName || userId);
                                    } catch (error) {
                                        console.error('音声デバイスへのアクセスエラー:', error);
                                        setDeviceError('マイクへのアクセスに失敗しました。設定を確認してください。');
                                        setIsConnecting(false);
                                    }
                                }}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 
                                       transition-colors shadow-md"
                            >
                                音声のみで参加
                            </button>
                            <button
                                onClick={() => window.location.href = '/yoriai/'}
                                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold 
                                       hover:bg-gray-300 transition-colors"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                </div>
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
            {/* ヘッダー部分 - 最小限に */}
            <div className="fixed top-1 left-1 z-10">
                <div className="bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-sm font-bold">
                    👥 {users.length + 1}人
                </div>
            </div>

            {/* ビデオグリッド - 画面いっぱいを活用 */}
            <div 
                className={`
                    grid gap-1 sm:gap-2 pt-8 pb-20 px-1 sm:px-2
                    portrait:${getGridLayout().portrait}
                    landscape:${getGridLayout().landscape}
                    h-screen overflow-hidden
                `}
                style={{ 
                    gridTemplateRows: 'repeat(auto-fit, minmax(0, 1fr))',
                    height: 'calc(100vh - 100px)'
                }}
            >
                {/* ローカルビデオ */}
                <div className="relative bg-gray-900 rounded-lg overflow-hidden shadow-lg">
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
                    {/* 名前ラベル - 下部に固定して顔に被らないように */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <div className="text-white text-xs sm:text-sm font-bold truncate">
                            あなた ({userName})
                        </div>
                        {/* ステータスアイコン - 右上に移動 */}
                        <div className="absolute top-2 right-2 flex gap-1">
                            {!isAudioOn && (
                                <div className="bg-red-500 p-1 rounded-full">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 14l2-2-2-2M21 12H9"/>
                                    </svg>
                                </div>
                            )}
                            {!isCameraOn && (
                                <div className="bg-red-500 p-1 rounded-full">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 14l2-2-2-2M21 12H9"/>
                                    </svg>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* リモートビデオ */}
                {users.map(user => (
                    <div key={user.socketId} className="relative bg-gray-900 rounded-lg overflow-hidden shadow-lg">
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
                        {/* 名前ラベル - 下部に固定 */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                            <div className="text-white text-xs sm:text-sm font-bold truncate">
                                {user.userName || '接続中...'}
                            </div>
                            {/* ステータスアイコン - 右上に移動 */}
                            <div className="absolute top-2 right-2 flex gap-1">
                                {user.isAudioOff && (
                                    <div className="bg-red-500 p-1 rounded-full">
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                                        </svg>
                                    </div>
                                )}
                                {user.isCameraOff && (
                                    <div className="bg-red-500 p-1 rounded-full">
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                                        </svg>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* コントロールパネル - 背景ボタンを削除 */}
            <div className="fixed bottom-2 left-1/2 transform -translate-x-1/2 z-20 w-full max-w-5xl px-2">
                <div className="flex justify-center items-center gap-1 sm:gap-2 bg-white/95 backdrop-blur-sm px-2 sm:px-3 py-2 sm:py-3 rounded-2xl shadow-xl">
                    {/* カメラボタン */}
                    <div className="flex flex-col items-center">
                        <button
                            onClick={toggleCamera}
                            className={`
                                w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center
                                ${isCameraOn ? 'bg-blue-600' : 'bg-red-600'} 
                                text-white shadow-lg transition-all duration-200
                            `}
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">
                            {isCameraOn ? 'カメラOFF' : 'カメラON'}
                        </span>
                    </div>

                    {/* マイクボタン */}
                    <div className="flex flex-col items-center">
                        <button
                            onClick={toggleAudio}
                            className={`
                                w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center
                                ${isAudioOn ? 'bg-blue-600' : 'bg-red-600'}
                                text-white shadow-lg transition-all duration-200
                            `}
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                />
                            </svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">
                            {isAudioOn ? 'マイクOFF' : 'マイクON'}
                        </span>
                    </div>

                    {/* 録音ボタン */}
                    <div className="flex flex-col items-center">
                        <button
                            onClick={toggleRecording}
                            className={`
                                w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center
                                ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-green-600'} 
                                text-white shadow-lg transition-all duration-200
                                ${!isAudioOn ? 'opacity-50' : ''}
                            `}
                            disabled={!isAudioOn}
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                />
                            </svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">
                            {isRecording ? '録音中' : '録音開始'}
                        </span>
                    </div>

                    <div className="flex flex-col items-center">
                    <button
                        onClick={() => router.push('/yoriai/minutes')}
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700"
                    >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                    </button>
                    <span className="text-xs font-bold text-gray-700 mt-1">議事録</span>
                </div>

                    {/* 退出ボタン */}
                    <div className="flex flex-col items-center">
                        <button
                            onClick={() => {
                                if (window.confirm('ビデオ通話を終了しますか？')) {
                                    leaveRoom();
                                }
                            }}
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                            </svg>
                        </button>
                        <span className="text-xs font-bold text-red-600 mt-1">退出</span>
                    </div>

                    {/* クイズボタン */}
                    <div className="flex flex-col items-center">
                        <button
                            onClick={() => window.open(`/yoriai/quiz/${roomId}?user=${userId}`, '_blank')}
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014.846 21H9.154a3.374 3.374 0 00-2.669-1.153l-.548-.547z"
                                />
                            </svg>
                        </button>
                        <span className="text-xs font-bold text-gray-700 mt-1">クイズ</span>
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
                    users={users}
                    socketRef={socketRef}
                />
            </div>
        </div>
    );
}