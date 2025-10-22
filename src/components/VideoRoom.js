'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import MeetingRecorder from './MeetingRecorder';

// WebRTC設定を改善
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
};

// カメラOFF時のプレースホルダーを描画する関数
const createPlaceholderStream = (userName) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ユーザー名
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(userName, canvas.width / 2, canvas.height / 2 - 20);
    
    // カメラOFF表示
    ctx.font = '24px sans-serif';
    ctx.fillText('カメラOFF', canvas.width / 2, canvas.height / 2 + 20);

    return canvas.captureStream();
};


export default function VideoRoom({ roomId, userId }) {
    // State管理
    const [users, setUsers] = useState([]);
    const [userName, setUserName] = useState('');
    const [isConnecting, setIsConnecting] = useState(true);
    const [deviceError, setDeviceError] = useState(null);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isAudioOn, setIsAudioOn] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingInitiator, setRecordingInitiator] = useState(null);

    // Ref管理
    const socketRef = useRef();
    const peersRef = useRef({});
    const localStreamRef = useRef();
    const meetingRecorderRef = useRef(null);

    // ユーザー名を取得する関数
    const fetchUserName = async () => {
        try {
            const response = await fetch(`/yoriai/api/users/${userId}`);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'ユーザー情報の取得に失敗しました');
            }
            const data = await response.json();
            setUserName(data.name);
            return data.name;
        } catch (error) {
            console.error('Error fetching username:', error);
            setDeviceError(error.message);
            return null;
        }
    };

    // メディアストリームを取得する関数
    const getMediaStream = async (requestedCamera = true) => {
        try {
            const constraints = {
                audio: { echoCancellation: true, noiseSuppression: true },
                video: requestedCamera ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (!stream.getVideoTracks().length && requestedCamera) {
                // カメラを要求したのにビデオトラックがない場合（物理的にカメラがないなど）
                console.warn('Video track not available, creating placeholder.');
                const placeholderStream = createPlaceholderStream(userName || userId);
                stream.getAudioTracks().forEach(track => placeholderStream.addTrack(track));
                localStreamRef.current = placeholderStream;
                setIsCameraOn(false);
            } else {
                localStreamRef.current = stream;
                setIsCameraOn(stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled);
            }

            setIsAudioOn(stream.getAudioTracks().length > 0 && stream.getAudioTracks()[0].enabled);
            setIsConnecting(false);
            return localStreamRef.current;

        } catch (err) {
            console.error('Error accessing media devices:', err);
            // ユーザーがカメラを拒否した場合、音声のみで再試行
            if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
                console.log('Trying audio-only fallback...');
                return getMediaStream(false);
            }
            setDeviceError('カメラまたはマイクへのアクセスに失敗しました。ブラウザの設定でアクセスを許可してください。');
            setIsConnecting(false);
            return null;
        }
    };
    
    // Peer接続を安全に破棄する関数
    const cleanupPeerConnection = (socketId) => {
        if (peersRef.current[socketId]) {
            peersRef.current[socketId].ontrack = null;
            peersRef.current[socketId].onicecandidate = null;
            peersRef.current[socketId].onconnectionstatechange = null;
            peersRef.current[socketId].close();
            delete peersRef.current[socketId];
            console.log(`Cleaned up peer connection for ${socketId}`);
        }
    };
    
    // 初期化処理
    useEffect(() => {
        const initialize = async () => {
            const name = await fetchUserName();
            if (!name) return;

            const stream = await getMediaStream();
            if (!stream) return;

            // Socket.IOサーバーに接続
            socketRef.current = io(window.location.origin, {
                path: '/yoriai/socket.io/',
                query: { roomId, userId, userName: name },
                transports: ['websocket', 'polling'],
            });

            // --- Socket.IOイベントハンドラ ---

            socketRef.current.on('connect', () => {
                console.log('Connected to signaling server with socket ID:', socketRef.current.id);
            });

            // 新しいユーザーリストを受信したときの処理
            socketRef.current.on('users', (otherUsers) => {
                console.log('Received users list:', otherUsers);
                const newUsers = otherUsers.filter(user => user.socketId !== socketRef.current.id);
                setUsers(newUsers);

                // 新規参加者に対してPeer接続を作成
                newUsers.forEach(user => {
                    if (!peersRef.current[user.socketId]) {
                        createPeer(user.socketId, true); // こちらがInitiator
                    }
                });

                // 既に存在しないユーザーのPeer接続をクリーンアップ
                const newSocketIds = new Set(newUsers.map(u => u.socketId));
                Object.keys(peersRef.current).forEach(socketId => {
                    if (!newSocketIds.has(socketId)) {
                        cleanupPeerConnection(socketId);
                    }
                });
            });

            // WebRTCオファーを受信
            socketRef.current.on('offer', async ({ offer, from }) => {
                console.log(`Received offer from ${from}`);
                const peer = createPeer(from, false); // 相手がInitiator
                await peer.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                socketRef.current.emit('answer', { answer: peer.localDescription, to: from });
            });

            // WebRTCアンサーを受信
            socketRef.current.on('answer', ({ answer, from }) => {
                console.log(`Received answer from ${from}`);
                peersRef.current[from]?.setRemoteDescription(new RTCSessionDescription(answer));
            });
            
            // ICE候補を受信
            socketRef.current.on('ice-candidate', ({ candidate, from }) => {
                peersRef.current[from]?.addIceCandidate(new RTCIceCandidate(candidate));
            });

            // ユーザーの切断を処理
            socketRef.current.on('user-disconnected', (disconnectedSocketId) => {
                console.log(`User disconnected: ${disconnectedSocketId}`);
                cleanupPeerConnection(disconnectedSocketId);
                setUsers(prev => prev.filter(user => user.socketId !== disconnectedSocketId));
            });

            // 録音イベントのハンドリング
            socketRef.current.on('recording-started', ({ initiatorName }) => {
                setIsRecording(true);
                setRecordingInitiator(initiatorName);
            });
            socketRef.current.on('recording-stopped', () => {
                setIsRecording(false);
                setRecordingInitiator(null);
            });
        };

        initialize();

        // コンポーネントがアンマウントされる際のクリーンアップ処理
        return () => {
            console.log("Cleaning up VideoRoom component...");
            localStreamRef.current?.getTracks().forEach(track => track.stop());
            Object.values(peersRef.current).forEach(peer => peer.close());
            socketRef.current?.disconnect();
        };
    }, [roomId, userId]);

    // Peer接続を作成する関数
    const createPeer = (targetSocketId, isInitiator) => {
        // 既に存在する場合は再利用
        if (peersRef.current[targetSocketId]) {
            console.log(`Reusing peer connection for ${targetSocketId}`);
            return peersRef.current[targetSocketId];
        }

        console.log(`Creating new peer for ${targetSocketId}, initiator: ${isInitiator}`);
        const peer = new RTCPeerConnection(configuration);

        // ローカルのメディアトラックをPeer接続に追加
        localStreamRef.current.getTracks().forEach(track => {
            peer.addTrack(track, localStreamRef.current);
        });

        // ICE候補が見つかったら相手に送信
        peer.onicecandidate = event => {
            if (event.candidate) {
                socketRef.current.emit('ice-candidate', { candidate: event.candidate, to: targetSocketId });
            }
        };

        // 相手のメディアストリームを受信したときの処理
        peer.ontrack = event => {
            console.log(`Received track from ${targetSocketId}`);
            setUsers(prevUsers => 
                prevUsers.map(u => 
                    u.socketId === targetSocketId ? { ...u, stream: event.streams[0] } : u
                )
            );
        };
        
        // 接続状態の監視
        peer.onconnectionstatechange = () => {
            console.log(`Connection state for ${targetSocketId}: ${peer.connectionState}`);
            if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected' || peer.connectionState === 'closed') {
                // 接続が切れたらクリーンアップ
                cleanupPeerConnection(targetSocketId);
                setUsers(prev => prev.filter(user => user.socketId !== targetSocketId));
            }
        };

        peersRef.current[targetSocketId] = peer;
        return peer;
    };
    
    // --- UI操作の関数 ---
    const toggleCamera = () => {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsCameraOn(videoTrack.enabled);
        }
    };

    const toggleAudio = () => {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsAudioOn(audioTrack.enabled);
        }
    };
    
    const toggleRecording = async () => {
        if (isRecording) {
            await meetingRecorderRef.current?.stopRecording();
        } else {
            await meetingRecorderRef.current?.startRecording();
        }
    };

    const leaveRoom = () => {
        if (window.confirm('ビデオ通話を終了しますか？')) {
            window.location.href = '/yoriai';
        }
    };

    // --- レンダリング ---
    if (isConnecting) return <div className="min-h-screen flex items-center justify-center text-xl">接続中...</div>;
    if (deviceError) return <div className="min-h-screen flex items-center justify-center text-xl text-red-500">エラー: {deviceError}</div>;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-2">
            {/* ビデオグリッド */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 h-[calc(100vh-100px)]">
                {/* 自分のビデオ */}
                <div className="relative bg-black rounded-lg overflow-hidden">
                    <video 
                        ref={ref => { if (ref) ref.srcObject = localStreamRef.current; }} 
                        autoPlay 
                        muted 
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded">
                        {userName} (あなた)
                    </div>
                </div>

                {/* 他の参加者のビデオ */}
                {users.map(user => (
                    <div key={user.socketId} className="relative bg-black rounded-lg overflow-hidden">
                        <video 
                            ref={ref => { if (ref) ref.srcObject = user.stream; }} 
                            autoPlay 
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded">
                            {user.userName}
                        </div>
                    </div>
                ))}
            </div>

            {/* コントロールパネル */}
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/20 backdrop-blur-md p-3 rounded-full">
                <button onClick={toggleAudio} className={`p-3 rounded-full ${isAudioOn ? 'bg-blue-500' : 'bg-red-500'} text-white`}>
                    {/* マイクアイコン */}
                </button>
                <button onClick={toggleCamera} className={`p-3 rounded-full ${isCameraOn ? 'bg-blue-500' : 'bg-red-500'} text-white`}>
                    {/* カメラアイコン */}
                </button>
                <button onClick={toggleRecording} className={`p-3 rounded-full ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-green-500'} text-white`}>
                    {isRecording ? '録音停止' : '録音開始'}
                </button>
                <button onClick={leaveRoom} className="p-3 rounded-full bg-gray-700 text-white">
                    退出
                </button>
            </div>
            
            {/* 録音コンポーネント（UIには表示しない） */}
            <div className="hidden">
                <MeetingRecorder
                    ref={meetingRecorderRef}
                    roomId={roomId}
                    userId={userId}
                    userName={userName}
                    isAudioOn={isAudioOn}
                    socketRef={socketRef}
                />
            </div>
        </div>
    );
}