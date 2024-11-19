'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import BackgroundSelector from './BackgroundSelector';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// テスト用のフェイクストリームを生成する関数
const createFakeStream = (userName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30); // 30fps

    // テスト用の描画アニメーション
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

    // コンポーネントのアンマウント時にインターバルをクリアするための関数を追加
    stream.stopFakeStream = () => {
        clearInterval(drawInterval);
    };

    // 無音のオーディオトラックを追加（ユーザージェスチャー後に実行）
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

    // ユーザージェスチャーを待つ
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
        const peer = new RTCPeerConnection(configuration);

        // 接続状態の監視
        peer.onconnectionstatechange = () => {
            console.log(`Connection state for ${targetSocketId}:`, peer.connectionState);
            updateDebugInfo({ [`peerState_${targetSocketId}`]: peer.connectionState });
        };

        // ICE接続状態の監視
        peer.oniceconnectionstatechange = () => {
            console.log(`ICE state for ${targetSocketId}:`, peer.iceConnectionState);
            updateDebugInfo({ [`iceState_${targetSocketId}`]: peer.iceConnectionState });
        };

        // ICE candidate の生成と送信
        peer.onicecandidate = ({ candidate }) => {
            if (candidate && socketRef.current?.connected) {
                console.log('Sending ICE candidate to:', targetSocketId);
                socketRef.current.emit('ice-candidate', {
                    candidate,
                    to: targetSocketId
                });
            }
        };

        // リモートストリームの受信
        peer.ontrack = (event) => {
            console.log('Received remote track from:', targetSocketId);
            const remoteStream = event.streams[0];

            setUsers(prevUsers => {
                const updatedUsers = prevUsers.map(user => {
                    if (user.socketId === targetSocketId) {
                        console.log('Updating stream for user:', user.userName);
                        return { ...user, stream: remoteStream };
                    }
                    return user;
                });

                // ユーザーが見つからない場合は追加
                if (!updatedUsers.find(u => u.socketId === targetSocketId)) {
                    console.log('Adding new user with stream');
                    updatedUsers.push({
                        socketId: targetSocketId,
                        stream: remoteStream,
                        userId: null,
                        userName: 'Connecting...'
                    });
                }

                console.log('Users after stream update:', updatedUsers);
                updateDebugInfo({ activeStreams: updatedUsers.filter(u => u.stream).length });
                return updatedUsers;
            });
        };

        // ローカルストリームの追加
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                console.log('Adding local track to peer:', track.kind);
                peer.addTrack(track, localStreamRef.current);
            });
        }

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

        socketRef.current.on('users', (newUsers) => {
            console.log('Received users update:', newUsers);
            updateDebugInfo({ connectedUsers: newUsers.length });

            setUsers(prevUsers => {
                // 自分以外のユーザーをフィルタリング
                const filteredUsers = newUsers.filter(u => u.userId !== userId);

                // 既存のストリーム情報を保持しながら更新
                const updatedUsers = filteredUsers.map(newUser => {
                    const existingUser = prevUsers.find(u => u.socketId === newUser.socketId);
                    return {
                        ...newUser,
                        stream: existingUser?.stream || null,
                        userName: newUser.userName
                    };
                });

                console.log('Updated users with preserved streams:', updatedUsers);
                return updatedUsers;
            });

            // 新しい参加者それぞれに対してPeer接続を確立
            const filteredUsers = newUsers.filter(u => u.userId !== userId);
            filteredUsers.forEach(user => {
                if (!peersRef.current[user.socketId]) {
                    console.log('Creating new peer for user:', user.userName);
                    const peer = createPeer(user.socketId, true);
                    peersRef.current[user.socketId] = peer;

                    peer.createOffer()
                        .then(offer => {
                            console.log('Created offer for:', user.userName);
                            return peer.setLocalDescription(offer);
                        })
                        .then(() => {
                            console.log('Sending offer to:', user.userName);
                            socketRef.current.emit('offer', {
                                offer: peer.localDescription,
                                to: user.socketId
                            });
                        })
                        .catch(err => {
                            console.error('Error in offer creation:', err);
                            updateDebugInfo({ offerError: err.message });
                        });
                }
            });
        });
        // オファーの受信と処理
        socketRef.current.on('offer', async ({ offer, from }) => {
            console.log('Received offer from:', from);
            try {
                const peer = createPeer(from, false);
                peersRef.current[from] = peer;

                await peer.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socketRef.current.emit('answer', {
                    answer: answer,
                    to: from
                });
            } catch (err) {
                console.error('Error handling offer:', err);
                updateDebugInfo({ offerHandlingError: err.message });
            }
        });

        // アンサーの受信と処理
        socketRef.current.on('answer', async ({ answer, from }) => {
            console.log('Received answer from:', from);
            try {
                const peer = peersRef.current[from];
                if (peer) {
                    await peer.setRemoteDescription(new RTCSessionDescription(answer));
                }
            } catch (err) {
                console.error('Error handling answer:', err);
                updateDebugInfo({ answerHandlingError: err.message });
            }
        });

        // ICE candidateの受信と処理
        socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
            console.log('Received ICE candidate from:', from);
            try {
                const peer = peersRef.current[from];
                if (peer) {
                    await peer.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
                updateDebugInfo({ iceCandidateError: err.message });
            }
        });

        // 切断処理
        socketRef.current.on('user-disconnected', (disconnectedUserId) => {
            console.log('User disconnected:', disconnectedUserId);
            setUsers(prevUsers => {
                const updatedUsers = prevUsers.filter(user => user.userId !== disconnectedUserId);
                return updatedUsers;
            });

            // Peer接続のクリーンアップ
            Object.entries(peersRef.current).forEach(([socketId, peer]) => {
                if (users.find(u => u.socketId === socketId && u.userId === disconnectedUserId)) {
                    peer.close();
                    delete peersRef.current[socketId];
                }
            });

            updateDebugInfo({ lastDisconnected: disconnectedUserId });
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

                // テストモードの確認
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
                    stream.getTracks().forEach(track => track.stop());
                    if (stream.stopFakeStream) stream.stopFakeStream();
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
            <BackgroundSelector onSelect={setBackground} />

            {/* ビデオグリッド */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-16">
                {/* 自分のビデオ */}
                <div className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden shadow-lg">
                    <video
                        ref={ref => {
                            if (ref) {
                                ref.srcObject = localStreamRef.current;
                                console.log('Set local video stream:', !!localStreamRef.current);
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
                                    console.log('Set remote video stream for:', user.userName);
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