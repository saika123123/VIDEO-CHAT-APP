'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import MobileParticipantsList from './MobileParticipantsList';

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

// ダミーのビデオストリームを生成する関数
const createDummyVideoStream = (userName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);

    // ユーザー名を表示するテキスト
    const drawInterval = setInterval(() => {
        // 背景を塗りつぶし
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 円を描画
        ctx.fillStyle = '#3B82F6'; // Tailwindのblue-500
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 60, 100, 0, 2 * Math.PI);
        ctx.fill();

        // 人型シルエットを描画
        ctx.fillStyle = '#ffffff';
        // 頭
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2 - 60, 50, 0, 2 * Math.PI);
        ctx.fill();
        // 胴体
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, canvas.height / 2 - 10);
        ctx.lineTo(canvas.width / 2, canvas.height / 2 + 80);
        ctx.lineWidth = 30;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // ユーザー名とデバイス状態のテキスト
        ctx.fillStyle = '#000000';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(userName, canvas.width / 2, canvas.height / 2 + 150);
        ctx.font = '24px Arial';
        ctx.fillText('カメラが接続されていません', canvas.width / 2, canvas.height / 2 + 190);
    }, 1000 / 30);

    stream.stopDummyStream = () => {
        clearInterval(drawInterval);
    };

    return stream;
};

// ダミーのオーディオストリームを生成する関数
const createDummyAudioStream = () => {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 0; // 無音
    const destination = oscillator.connect(audioContext.createMediaStreamDestination());
    oscillator.start();
    const stream = destination.stream;

    stream.stopDummyStream = () => {
        oscillator.stop();
        audioContext.close();
    };

    return stream;
};

// メディアデバイスの存在確認
async function checkMediaDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        const hasMicrophone = devices.some(device => device.kind === 'audioinput');
        return { hasCamera, hasMicrophone };
    } catch (error) {
        console.error('デバイス確認中にエラーが発生しました:', error);
        return { hasCamera: false, hasMicrophone: false };
    }
}

export default function VideoRoom({ roomId, userId }) {
    // State管理
    const [users, setUsers] = useState([]);
    const [userName, setUserName] = useState('');
    const [background, setBackground] = useState('/yoriai/backgrounds/default.jpg');
    const [deviceStatus, setDeviceStatus] = useState({
        hasCamera: null,
        hasMicrophone: null,
        errorMessage: null
    });
    const [showCopied, setShowCopied] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [debugInfo, setDebugInfo] = useState({});
    const [isCameraOn, setIsCameraOn] = useState(false); // デフォルトはオフに変更
    const [isAudioOn, setIsAudioOn] = useState(false); // デフォルトはオフに変更
    const [showSettings, setShowSettings] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('initializing');
    const [showRecorder, setShowRecorder] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingInitiator, setRecordingInitiator] = useState(null);
    const [orientation, setOrientation] = useState('portrait'); // 'portrait' または 'landscape'
    const [isMobile, setIsMobile] = useState(false);
    const [showControls, setShowControls] = useState(true); // コントロールの表示/非表示
    const [lastTap, setLastTap] = useState(0); // ダブルタップ検出用
    const [showParticipantsList, setShowParticipantsList] = useState(false);

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

    // 会話記録の開始/停止を切り替える関数
    const toggleRecording = async () => {
        if (!isAudioOn) {
            alert('録音を開始するにはマイクをオンにしてください');
            return;
        }

        console.log("現在の録音状態:", isRecording); // デバッグ用

        try {
            if (isRecording) {
                // 録音停止
                await meetingRecorderRef.current?.stopRecording();
                setIsRecording(false);
                console.log("録音停止しました"); // デバッグ用
            } else {
                // 録音開始
                const success = await meetingRecorderRef.current?.startRecording();
                if (success) {
                    setIsRecording(true);
                    console.log("録音開始しました"); // デバッグ用
                } else {
                    console.error("録音開始に失敗しました"); // デバッグ用
                }
            }
        } catch (error) {
            console.error("録音操作中にエラーが発生しました:", error); // デバッグ用
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
        const totalParticipants = users.length + 1;  // 自分を含めた参加者数

        // モバイル端末の場合
        if (isMobile) {
            // 縦向きの場合
            if (orientation === 'portrait') {
                return 'grid-cols-1';  // 1列に表示
            } else {
                // 横向きの場合、参加者数に応じたグリッド
                if (totalParticipants <= 2) {
                    return 'grid-cols-2';
                } else if (totalParticipants <= 4) {
                    return 'grid-cols-2';
                } else {
                    return 'grid-cols-3';
                }
            }
        }

        // デスクトップの場合
        if (totalParticipants <= 2) {
            return 'grid-cols-1 md:grid-cols-2';
        } else if (totalParticipants <= 4) {
            return 'grid-cols-2';
        } else if (totalParticipants <= 6) {
            return 'grid-cols-2 md:grid-cols-3';
        } else if (totalParticipants <= 9) {
            return 'grid-cols-3';
        } else if (totalParticipants <= 12) {
            return 'grid-cols-3 md:grid-cols-4';
        } else if (totalParticipants <= 16) {
            return 'grid-cols-4';
        } else {
            return 'grid-cols-4 md:grid-cols-5';
        }
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
        // カメラがない場合、トグルできないことを表示
        if (!deviceStatus.hasCamera) {
            alert('このデバイスにはカメラが接続されていません');
            return;
        }

        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOn(videoTrack.enabled);
            }
        }
    };

    const toggleAudio = () => {
        // マイクがない場合、トグルできないことを表示
        if (!deviceStatus.hasMicrophone) {
            alert('このデバイスにはマイクが接続されていません');
            return;
        }

        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioOn(audioTrack.enabled);

                // マイクをオフにする際、録音中なら停止する
                if (!audioTrack.enabled && isRecording) {
                    toggleRecording();
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
                await meetingRecorderRef.current?.stopRecording();
            }

            // メディアストリームの停止
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                if (localStreamRef.current.stopDummyStream) {
                    localStreamRef.current.stopDummyStream();
                }
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
            window.location.href = '/yoriai/';
        } catch (error) {
            console.error('Error during room exit:', error);
            // エラーが発生してもホームページへ移動
            window.location.href = '/yoriai/';
        }
    };

    // 初期化処理
    useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            if (!roomId || !userId || userNameFetchedRef.current) return;

            try {
                const name = await fetchUserName();
                if (!mounted) return;
                if (!name) throw new Error('ユーザー名の取得に失敗しました');

                // デバイスのチェック
                const { hasCamera, hasMicrophone } = await checkMediaDevices();
                setDeviceStatus({ hasCamera, hasMicrophone, errorMessage: null });
                console.log('デバイス状態:', { hasCamera, hasMicrophone });

                let stream;

                // テスト環境はフェイクストリームを使用
                if (process.env.NODE_ENV === 'development' && window.location.search.includes('test=true')) {
                    stream = createDummyVideoStream(name);
                    console.log('テスト用ダミーストリームを作成しました');
                } else {
                    try {
                        // カメラ・マイクが利用可能な場合は実際のデバイスを使用
                        if (hasCamera || hasMicrophone) {
                            const constraints = {
                                audio: hasMicrophone ? mediaConstraints.audio : false,
                                video: hasCamera ? mediaConstraints.video : false
                            };

                            stream = await navigator.mediaDevices.getUserMedia(constraints);
                            console.log('実際のメディアデバイスを取得しました:', constraints);

                            // デフォルトでデバイスをオンに設定
                            if (hasCamera) setIsCameraOn(true);
                            if (hasMicrophone) setIsAudioOn(true);
                        } else {
                            // どちらのデバイスもない場合はダミーストリームを作成
                            console.log('メディアデバイスが見つかりません。ダミーストリームを作成します。');

                            // ビデオ用のダミーストリーム
                            const videoStream = createDummyVideoStream(name);

                            // オーディオ用のダミーストリーム
                            const audioStream = createDummyAudioStream();

                            // 2つのストリームをマージ
                            stream = new MediaStream();
                            videoStream.getTracks().forEach(track => stream.addTrack(track));
                            audioStream.getTracks().forEach(track => stream.addTrack(track));

                            // ダミーストリームの停止関数を保存
                            stream.stopDummyStream = () => {
                                videoStream.stopDummyStream();
                                audioStream.stopDummyStream();
                            };
                        }
                    } catch (err) {
                        console.error('メディアデバイスへのアクセスに失敗しました:', err);
                        // エラーが発生した場合、ダミーストリームで代替
                        console.log('エラーが発生したためダミーストリームを作成します');
                        const videoStream = createDummyVideoStream(name);
                        const audioStream = createDummyAudioStream();

                        stream = new MediaStream();
                        videoStream.getTracks().forEach(track => stream.addTrack(track));
                        audioStream.getTracks().forEach(track => stream.addTrack(track));

                        stream.stopDummyStream = () => {
                            videoStream.stopDummyStream();
                            audioStream.stopDummyStream();
                        };

                        // デバイスステータスを更新
                        setDeviceStatus(prev => ({
                            ...prev,
                            errorMessage: `デバイスへのアクセスに失敗しました: ${err.message}`
                        }));
                    }
                }

                if (!mounted) {
                    if (stream.stopDummyStream) stream.stopDummyStream();
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

                // エラーメッセージを更新するが、参加は継続
                setDeviceStatus(prev => ({
                    ...prev,
                    errorMessage: `初期化エラー: ${error.message}`
                }));

                // ダミーストリームを作成して接続を継続
                const name = await fetchUserName() || userId;
                const videoStream = createDummyVideoStream(name);
                const audioStream = createDummyAudioStream();

                const combinedStream = new MediaStream();
                videoStream.getTracks().forEach(track => combinedStream.addTrack(track));
                audioStream.getTracks().forEach(track => combinedStream.addTrack(track));

                combinedStream.stopDummyStream = () => {
                    videoStream.stopDummyStream();
                    audioStream.stopDummyStream();
                };

                localStreamRef.current = combinedStream;
                setIsConnecting(false);
                userNameFetchedRef.current = true;

                initializeSocketConnection(name);

                updateDebugInfo({ initError: error.message });
            }
        };

        initialize();

        return () => {
            mounted = false;
            if (localStreamRef.current) {
                if (localStreamRef.current.stopDummyStream) {
                    localStreamRef.current.stopDummyStream();
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

    // モバイル向けタッチイベント処理
    const handleTouchStart = (e) => {
        // ダブルタップでコントロールの表示/非表示を切り替え
        const now = Date.now();
        if (now - lastTap < 300) { // 300ms以内の2回タップをダブルタップと判定
            setShowControls(!showControls);
        }
        setLastTap(now);
    };

    // モバイル向けビデオストリーム制約の改善
    const getMobileMediaConstraints = () => {
        // モバイル向けに軽量化された設定
        if (isMobile) {
            return {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: {
                    width: { ideal: 640 },  // 低解像度
                    height: { ideal: 480 },
                    frameRate: { ideal: 15 } // 低フレームレート
                }
            };
        }
        return mediaConstraints; // 既存の設定
    };

    // 画面の向きを検出する
    useEffect(() => {
        const detectMobile = () => {
            const userAgent = navigator.userAgent.toLowerCase();
            const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|windows phone/i;
            setIsMobile(mobileRegex.test(userAgent));
        };

        const handleOrientationChange = () => {
            if (window.matchMedia("(orientation: portrait)").matches) {
                setOrientation('portrait');
            } else {
                setOrientation('landscape');
            }
        };

        detectMobile();
        handleOrientationChange();

        window.addEventListener('resize', handleOrientationChange);
        return () => {
            window.removeEventListener('resize', handleOrientationChange);
        };
    }, []);

    // 録音の開始/停止を処理するsocket.ioイベントリスナーを追加
    useEffect(() => {
        if (!socketRef.current) return;

        // 他の誰かが録音を開始した時のハンドラ
        const handleRecordingStarted = ({ meetingId, initiatorName }) => {
            console.log(`Recording started by ${initiatorName}`);
            setIsRecording(true);
            setRecordingInitiator(initiatorName);
        };

        // 他の誰かが録音を停止した時のハンドラ
        const handleRecordingStopped = () => {
            console.log('Recording stopped');
            setIsRecording(false);
            setRecordingInitiator(null);
        };

        // イベントリスナーの登録
        socketRef.current.on('recording-started', handleRecordingStarted);
        socketRef.current.on('recording-stopped', handleRecordingStopped);

        return () => {
            if (socketRef.current) {
                socketRef.current.off('recording-started', handleRecordingStarted);
                socketRef.current.off('recording-stopped', handleRecordingStopped);
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
            onTouchStart={isMobile ? handleSwipeStart : undefined}
            onTouchMove={isMobile ? handleSwipeMove : undefined}
            onTouchEnd={isMobile ? handleSwipeEnd : undefined}
        >
            {/* スワイプジェスチャーのヒント表示 */}
            {isMobile && showSwipeTips && (
                <div className="fixed inset-x-0 top-12 z-30 flex justify-center">
                    <div className="bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-xs">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold">スワイプでコントロール</h3>
                            <button
                                onClick={() => {
                                    setShowSwipeTips(false);
                                    localStorage.setItem('swipeTipsDismissed', 'true');
                                }}
                                className="text-white"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <ul className="text-sm space-y-1">
                            <li className="flex items-center">
                                <span className="mr-2">👉</span> 右スワイプ: 参加者リスト
                            </li>
                            <li className="flex items-center">
                                <span className="mr-2">👈</span> 左スワイプ: 設定メニュー
                            </li>
                            <li className="flex items-center">
                                <span className="mr-2">👇</span> 下スワイプ: コントロールの表示
                            </li>
                            <li className="flex items-center">
                                <span className="mr-2">👆</span> 上スワイプ: コントロールの非表示
                            </li>
                        </ul>
                    </div>
                </div>
            )}

            {/* ネットワーク接続状態の通知 */}
            {isMobile && !networkStatus.isOnline && (
                <div className="fixed top-14 inset-x-0 z-30 flex justify-center">
                    <div className="bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg max-w-xs flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                        <span>ネットワーク接続が切断されました。再接続中...</span>
                    </div>
                </div>
            )}

            {/* 弱いネットワーク接続の通知 */}
            {isMobile && networkStatus.isOnline && networkStatus.connectionType &&
                (networkStatus.connectionType === 'slow-2g' || networkStatus.connectionType === '2g') && (
                    <div className="fixed top-14 inset-x-0 z-30 flex justify-center">
                        <div className="bg-yellow-600 text-white px-4 py-2 rounded-lg shadow-lg max-w-xs flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                            </svg>
                            <span>ネットワーク接続が弱いため、ビデオ品質を下げています</span>
                        </div>
                    </div>
                )}

            {/* ヘッダー部分 */}
            {isMobile ? (
                /* モバイル向けヘッダー */
                <div className="fixed top-0 left-0 right-0 z-10 bg-black/60 px-2 py-2 flex justify-between items-center">
                    <div className="flex items-center">
                        <button
                            onClick={() => setShowParticipantsList(true)}
                            className="text-white flex items-center"
                        >
                            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                />
                            </svg>
                            <span className="text-white text-sm">
                                参加者: {users.length + 1}人
                            </span>
                        </button>
                    </div>

                    {/* 接続状態インジケーター */}
                    <div className="text-white text-xs flex items-center">
                        {connectionStatus === 'connected' ? (
                            <>
                                <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                                <span>接続済み</span>
                            </>
                        ) : connectionStatus === 'reconnecting' ? (
                            <>
                                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-1"></div>
                                <span>再接続中...</span>
                            </>
                        ) : (
                            <>
                                <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
                                <span>接続エラー</span>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                /* デスクトップ向けヘッダー */
                <div className="fixed top-2 md:top-6 left-2 md:left-6 z-10 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-6">
                    <div className="bg-white/90 text-gray-800 px-3 md:px-6 py-2 md:py-4 rounded-xl shadow-lg">
                        <div className="text-base md:text-xl font-bold">
                            参加者: {users.length + 1}人
                        </div>
                    </div>
                </div>
            )}

            {/* ビデオグリッド */}
            <div
                className={`grid ${getGridLayout()} gap-2 ${isMobile ? 'mt-10' : 'mt-20 md:mt-24'} max-w-7xl mx-auto`}
                onTouchStart={handleTouchStart}
            >
                {/* ローカルビデオ */}
                <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-lg h-auto">
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
                    <div className={`absolute bottom-2 left-2 right-2 flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}>
                        <div className="bg-black/70 px-2 py-1 rounded-lg text-white">
                            あなた ({userName})
                        </div>
                        <div className="flex gap-1">
                            {!isAudioOn && (
                                <div className="bg-red-500 px-2 py-1 rounded-lg text-white flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                        />
                                    </svg>
                                    {!isMobile && <span>ミュート中</span>}
                                </div>
                            )}
                            {!isCameraOn && (
                                <div className="bg-red-500 px-2 py-1 rounded-lg text-white flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M15 13l-3 3m0 0l-3-3m3 3v-6m0 0l-3 3m3-3l3 3"
                                        />
                                    </svg>
                                    {!isMobile && <span>カメラOFF</span>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* リモートビデオ */}
                {users.map(user => (
                    <div key={user.socketId} className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-lg h-auto">
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
                        <div className={`absolute bottom-2 left-2 right-2 flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}>
                            <div className="bg-black/70 px-2 py-1 rounded-lg text-white">
                                {user.userName || '接続中...'}
                            </div>
                            <div className="flex gap-1">
                                {user.isAudioOff && (
                                    <div className="bg-red-500 px-2 py-1 rounded-lg text-white flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                        </svg>
                                    </div>
                                )}
                                {user.isCameraOff && (
                                    <div className="bg-red-500 px-2 py-1 rounded-lg text-white flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M15 13l-3 3m0 0l-3-3m3 3v-6m0 0l-3 3m3-3l3 3"
                                            />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* モバイル向けコントロールパネル */}
            {isMobile && showControls && (
                <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/70 py-2">
                    <div className="flex justify-around items-center">
                        {/* カメラボタン */}
                        <button
                            onClick={toggleCamera}
                            className={`
                                p-3 rounded-full 
                                ${isCameraOn ? 'bg-blue-600' : 'bg-red-600'} 
                                text-white
                            `}
                            aria-label={isCameraOn ? 'カメラをオフにする' : 'カメラをオンにする'}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </button>

                        {/* マイクボタン */}
                        <button
                            onClick={toggleAudio}
                            className={`
                                p-3 rounded-full
                                ${isAudioOn ? 'bg-blue-600' : 'bg-red-600'}
                                text-white
                            `}
                            aria-label={isAudioOn ? 'マイクをオフにする' : 'マイクをオンにする'}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                />
                            </svg>
                        </button>

                        {/* 録音ボタン */}
                        <button
                            onClick={toggleRecording}
                            className={`
                                p-3 rounded-full 
                                ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-green-600'} 
                                text-white
                            `}
                            disabled={!isAudioOn}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                />
                            </svg>
                        </button>

                        {/* 背景設定ボタン */}
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="p-3 rounded-full bg-gray-600 text-white"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                        </button>

                        {/* 退出ボタン */}
                        <button
                            onClick={() => {
                                if (window.confirm('ビデオ通話を終了しますか？')) {
                                    leaveRoom();
                                }
                            }}
                            className="p-3 rounded-full bg-red-600 text-white"
                            aria-label="ビデオ通話を終了する"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* ステータスインジケーター */}
                    {isRecording && (
                        <div className="mt-1 flex justify-center items-center">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
                            <span className="text-white text-xs">録音中</span>
                        </div>
                    )}
                </div>
            )}

            {/* デスクトップ向けコントロールパネル */}
            {!isMobile && (
                <div className="fixed bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 z-20 w-full max-w-5xl px-2">
                    <div className="flex flex-wrap justify-center items-center gap-2 md:gap-6 bg-white/90 px-2 md:px-8 py-3 md:py-6 rounded-2xl shadow-lg">
                        {/* カメラボタン */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={toggleCamera}
                                className={`
                                    p-3 md:p-6 rounded-full 
                                    ${isCameraOn ? 'bg-blue-600' : 'bg-red-600'} 
                                    text-white hover:opacity-90 transition-opacity
                                    shadow-lg
                                    flex flex-col items-center gap-2
                                `}
                                aria-label={isCameraOn ? 'カメラをオフにする' : 'カメラをオンにする'}
                            >
                                <svg className="w-6 h-6 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>
                            <span className="mt-1 md:mt-2 text-sm md:text-lg font-bold">
                                {isCameraOn ? 'カメラを消す' : 'カメラをつける'}
                            </span>
                        </div>

                        {/* マイクボタン */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={toggleAudio}
                                className={`
                                    p-3 md:p-6 rounded-full
                                    ${isAudioOn ? 'bg-blue-600' : 'bg-red-600'}
                                    text-white hover:opacity-90 transition-opacity
                                    shadow-lg
                                    flex flex-col items-center gap-2
                                `}
                                aria-label={isAudioOn ? 'マイクをオフにする' : 'マイクをオンにする'}
                            >
                                <svg className="w-6 h-6 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                    />
                                </svg>
                            </button>
                            <span className="mt-1 md:mt-2 text-sm md:text-lg font-bold">
                                {isAudioOn ? 'マイクを消す' : 'マイクをつける'}
                            </span>
                        </div>

                        {/* 会話記録ボタン - 直接録音開始/停止機能 */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={toggleRecording}
                                className={`
                                    p-3 md:p-6 rounded-full 
                                    ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-green-600'} 
                                    text-white hover:opacity-90 transition-opacity shadow-lg
                                    flex flex-col items-center gap-2
                                `}
                                disabled={!isAudioOn}
                            >
                                <svg className="w-6 h-6 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                    />
                                </svg>
                            </button>
                            <span className="mt-1 md:mt-2 text-sm md:text-lg font-bold">
                                {isRecording ? '録音中' : '録音開始'}
                            </span>
                            {isRecording && recordingInitiator && (
                                <span className="text-xs text-red-600 font-medium">
                                    {recordingInitiator === userName ? 'あなたが開始' : `${recordingInitiator}が開始`}
                                </span>
                            )}
                        </div>

                        {/* 背景設定ボタン */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="
                                    p-3 md:p-6 rounded-full bg-gray-600 text-white 
                                    hover:opacity-90 transition-opacity shadow-lg
                                    flex flex-col items-center gap-2
                                "
                            >
                                <svg className="w-6 h-6 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>
                            <span className="mt-1 md:mt-2 text-sm md:text-lg font-bold">背景を変える</span>
                        </div>

                        {/* 区切り線 */}
                        <div className="hidden md:block h-16 md:h-24 w-px bg-gray-300 mx-2 md:mx-4" />

                        {/* 退出ボタン */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={() => {
                                    if (window.confirm('ビデオ通話を終了しますか？')) {
                                        leaveRoom();
                                    }
                                }}
                                className="
                                    p-3 md:p-6 rounded-full bg-red-600 text-white 
                                    hover:opacity-90 transition-opacity shadow-lg
                                    flex flex-col items-center gap-2
                                "
                                aria-label="ビデオ通話を終了する"
                            >
                                <svg className="w-6 h-6 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                    />
                                </svg>
                            </button>
                            <span className="mt-1 md:mt-2 text-sm md:text-lg font-bold text-red-600">退出する</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 背景選択パネル */}
            {showSettings && (
                <div className={`fixed z-20 bg-white/90 rounded-lg shadow-lg ${isMobile ? 'bottom-16 left-2 right-2' : 'bottom-36 right-6 max-w-full w-64 md:w-auto'
                    }`}>
                    <div className="p-3">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-bold">背景を選択</h3>
                            {isMobile && (
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="p-1 bg-gray-200 rounded-full"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        <BackgroundSelector
                            onSelect={(bg) => {
                                setBackground(bg);
                                if (isMobile) setShowSettings(false);
                            }}
                            currentBackground={background}
                        />
                    </div>
                </div>
            )}

            {/* 録音機能のためのコンポーネント - 非表示で機能のみ使用 */}
            <div className="hidden" style={{ display: 'none' }} aria-hidden="true">
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

            {/* モバイル向け参加者リスト */}
            {isMobile && (
                <MobileParticipantsList
                    users={users}
                    userName={userName}
                    isOpen={showParticipantsList}
                    onClose={() => setShowParticipantsList(false)}
                />
            )}
        </div>
    );
}