'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import BackgroundSelector from './BackgroundSelector';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
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
    setInterval(() => {
        hue = (hue + 1) % 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.fillText(new Date().toLocaleTimeString(), 20, 100);
        ctx.fillText(`User: ${userName}`, 20, 160);
    }, 1000 / 30);

    // 無音のオーディオトラックを追加
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const dst = oscillator.connect(audioCtx.createMediaStreamDestination());
    oscillator.start();

    // ビデオとオーディオを組み合わせる
    const audioTrack = dst.stream.getAudioTracks()[0];
    stream.addTrack(audioTrack);

    return stream;
};

export default function VideoRoom({ roomId, userId }) {
    const [users, setUsers] = useState([]);
    const [userName, setUserName] = useState('');
    const [background, setBackground] = useState('/backgrounds/default.jpg');
    const [deviceError, setDeviceError] = useState(null);
    const [showCopied, setShowCopied] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const socketRef = useRef();
    const peersRef = useRef({});
    const localStreamRef = useRef();

    // 招待URLをコピーする関数
    const copyInviteLink = () => {
        const url = `${window.location.origin}/${roomId}`;
        navigator.clipboard.writeText(url).then(() => {
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        });
    };

    // WebRTC Peer接続を作成する関数
    const createPeer = (targetSocketId, isInitiator = true) => {
        console.log('Creating peer for:', targetSocketId, 'isInitiator:', isInitiator);
        const peer = new RTCPeerConnection(configuration);
        
        // 保留中のICE candidateを保存
        peer.pendingIceCandidates = [];

        // ローカルストリームの追加
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                peer.addTrack(track, localStreamRef.current);
            });
        }

        // ICE candidate生成時
        peer.onicecandidate = ({ candidate }) => {
            if (candidate && socketRef.current) {
                console.log('Generated ICE candidate');
                socketRef.current.emit('ice-candidate', {
                    candidate,
                    to: targetSocketId
                });
            }
        };

        // ICE接続状態の変更
        peer.oniceconnectionstatechange = () => {
            console.log(`ICE connection state for ${targetSocketId}:`, peer.iceConnectionState);
        };

        // 接続状態の変更
        peer.onconnectionstatechange = () => {
            console.log(`Connection state for ${targetSocketId}:`, peer.connectionState);
        };

        // リモートストリームの受信
        peer.ontrack = (event) => {
            console.log('Received remote track');
            const remoteStream = event.streams[0];
            setUsers(prevUsers => {
                return prevUsers.map(user => {
                    if (user.socketId === targetSocketId) {
                        return { ...user, stream: remoteStream };
                    }
                    return user;
                });
            });
        };

        return peer;
    };

    // Socket.IO接続の初期化
    const initializeSocketConnection = () => {
        socketRef.current = io('http://localhost:3001', {
            query: { roomId, userId, userName }
        });

        // 参加者リストの受信
        socketRef.current.on('users', async (newUsers) => {
            console.log('Received users update:', newUsers);
            const filteredUsers = newUsers.filter(u => u.userId !== userId);
            setUsers(filteredUsers);

            // 新しい参加者に対してオファーを作成
            filteredUsers.forEach(user => {
                if (!peersRef.current[user.socketId]) {
                    const peer = createPeer(user.socketId, true);
                    peersRef.current[user.socketId] = peer;

                    peer.createOffer()
                        .then(offer => peer.setLocalDescription(offer))
                        .then(() => {
                            console.log('Sending offer to:', user.socketId);
                            socketRef.current.emit('offer', {
                                offer: peer.localDescription,
                                to: user.socketId
                            });
                        })
                        .catch(err => console.error('Error creating offer:', err));
                }
            });
        });

        // オファーの受信
        socketRef.current.on('offer', async ({ offer, from }) => {
            console.log('Received offer from:', from);
            try {
                const peer = createPeer(from, false);
                peersRef.current[from] = peer;

                await peer.setRemoteDescription(new RTCSessionDescription(offer));

                // 保留中のICE candidateを処理
                while (peer.pendingIceCandidates.length) {
                    const candidate = peer.pendingIceCandidates.shift();
                    await peer.addIceCandidate(candidate);
                }

                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);

                socketRef.current.emit('answer', {
                    answer: peer.localDescription,
                    to: from
                });
            } catch (err) {
                console.error('Error handling offer:', err);
            }
        });

        // アンサーの受信
        socketRef.current.on('answer', async ({ answer, from }) => {
            try {
                const peer = peersRef.current[from];
                if (peer) {
                    await peer.setRemoteDescription(new RTCSessionDescription(answer));
                    
                    // 保留中のICE candidateを処理
                    while (peer.pendingIceCandidates.length) {
                        const candidate = peer.pendingIceCandidates.shift();
                        await peer.addIceCandidate(candidate);
                    }
                }
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        });

        // ICE candidateの受信
        socketRef.current.on('ice-candidate', async ({ candidate, from }) => {
            try {
                const peer = peersRef.current[from];
                if (peer) {
                    const iceCandidate = new RTCIceCandidate(candidate);
                    if (peer.remoteDescription) {
                        await peer.addIceCandidate(iceCandidate);
                    } else {
                        // リモート記述が設定されるまで保留
                        peer.pendingIceCandidates.push(iceCandidate);
                    }
                }
            } catch (err) {
                console.error('Error handling ICE candidate:', err);
            }
        });

        // 切断の処理
        socketRef.current.on('user-disconnected', (disconnectedUserId) => {
            console.log('User disconnected:', disconnectedUserId);
            setUsers(prevUsers => {
                const updatedUsers = prevUsers.filter(user => user.userId !== disconnectedUserId);
                // Peerの接続をクリーンアップ
                Object.entries(peersRef.current).forEach(([socketId, peer]) => {
                    if (prevUsers.find(u => u.socketId === socketId && u.userId === disconnectedUserId)) {
                        peer.close();
                        delete peersRef.current[socketId];
                    }
                });
                return updatedUsers;
            });
        });
    };


     // メディアデバイスの初期化とSocket.IO接続の部分を修正
     useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            if (!roomId || !userId) return;

            try {
                let stream;
                
                if (process.env.NODE_ENV === 'development' && window.location.search.includes('test=true')) {
                    stream = createFakeStream(userName || 'テストユーザー');
                } else {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    console.log('Available devices:', devices);

                    stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: true
                    });
                }

                if (!mounted) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }

                console.log('Got local stream:', stream);
                localStreamRef.current = stream;
                setIsConnecting(false);
                initializeSocketConnection();

            } catch (error) {
                console.error('Error accessing media devices:', error);
                if (!mounted) return;
                setDeviceError('デバイスの接続に問題が発生しました: ' + error.message);
                setIsConnecting(false);
            }
        };

        initialize();

        return () => {
            mounted = false;
            if (localStreamRef.current) {
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

    // UI部分の処理
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

            {/* 参加者数 */}
            <div className="fixed top-4 left-4 z-10 bg-black/50 text-white px-4 py-2 rounded-lg">
                参加者: {users.length + 1}人
            </div>

            <BackgroundSelector onSelect={setBackground} />

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-16">
                {/* 自分のビデオ */}
                <div className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden shadow-lg">
                    <video
                        ref={ref => {
                            if (ref) ref.srcObject = localStreamRef.current;
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
                    user.userId !== userId && (
                        <div key={user.socketId} className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden shadow-lg">
                            <video
                                ref={ref => {
                                    if (ref && user.stream) ref.srcObject = user.stream;
                                }}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white">
                                {user.userName}
                            </div>
                        </div>
                    )
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

            {/* デバッグ情報 */}
            {process.env.NODE_ENV === 'development' && (
                <div className="fixed bottom-4 right-4 bg-black/50 text-white text-xs p-2 rounded-lg">
                    <div>Room ID: {roomId}</div>
                    <div>User ID: {userId}</div>
                    <div>Connected Peers: {Object.keys(peersRef.current).length}</div>
                    <div>Socket Connected: {socketRef.current?.connected ? 'Yes' : 'No'}</div>
                    <div>Test Mode: {window.location.search.includes('test=true') ? 'Yes' : 'No'}</div>
                </div>
            )}
        </div>
    );
}