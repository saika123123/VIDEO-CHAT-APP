'use client';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import BackgroundSelector from './BackgroundSelector';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
    ]
};

export default function VideoRoom({ roomId, userId }) {
    const [users, setUsers] = useState([]);
    const [background, setBackground] = useState('/backgrounds/default.jpg');
    const socketRef = useRef();
    const peersRef = useRef({});
    const localStreamRef = useRef();
    const [isConnecting, setIsConnecting] = useState(true);

    useEffect(() => {
        if (!roomId || !userId) return;

        navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        }).then(stream => {
            localStreamRef.current = stream;
            setIsConnecting(false);

            socketRef.current = io('http://localhost:3001', {
                query: { roomId, userId }
            });

            socketRef.current.on('users', (users) => {
                setUsers(users);

                users.forEach(user => {
                    if (user.userId !== userId && !peersRef.current[user.socketId]) {
                        const peer = createPeer(user.socketId);
                        peersRef.current[user.socketId] = peer;
                    }
                });
            });

            socketRef.current.on('offer', handleReceiveOffer);
            socketRef.current.on('answer', handleReceiveAnswer);
            socketRef.current.on('ice-candidate', handleNewICECandidate);
        }).catch(error => {
            console.error('Error accessing media devices:', error);
            setIsConnecting(false);
        });

        return () => {
            localStreamRef.current?.getTracks().forEach(track => track.stop());
            socketRef.current?.disconnect();
            Object.values(peersRef.current).forEach(peer => peer.close());
        };
    }, [roomId, userId]);

    function createPeer(targetSocketId) {
        const peer = new RTCPeerConnection(configuration);

        localStreamRef.current.getTracks().forEach(track => {
            peer.addTrack(track, localStreamRef.current);
        });

        peer.onicecandidate = ({ candidate }) => {
            if (candidate) {
                socketRef.current.emit('ice-candidate', {
                    candidate,
                    to: targetSocketId
                });
            }
        };

        peer.ontrack = (event) => {
            const stream = event.streams[0];
            const user = users.find(u => u.socketId === targetSocketId);
            if (user) {
                user.stream = stream;
                setUsers(prev => [...prev]);
            }
        };

        peer.createOffer()
            .then(offer => peer.setLocalDescription(offer))
            .then(() => {
                socketRef.current.emit('offer', {
                    offer: peer.localDescription,
                    to: targetSocketId
                });
            });

        return peer;
    }

    async function handleReceiveOffer({ offer, from }) {
        let peer = peersRef.current[from];
        if (!peer) {
            peer = new RTCPeerConnection(configuration);
            peersRef.current[from] = peer;

            localStreamRef.current.getTracks().forEach(track => {
                peer.addTrack(track, localStreamRef.current);
            });

            peer.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    socketRef.current.emit('ice-candidate', {
                        candidate,
                        to: from
                    });
                }
            };

            peer.ontrack = (event) => {
                const stream = event.streams[0];
                const user = users.find(u => u.socketId === from);
                if (user) {
                    user.stream = stream;
                    setUsers(prev => [...prev]);
                }
            };
        }

        await peer.setRemoteDescription(offer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socketRef.current.emit('answer', {
            answer,
            to: from
        });
    }

    function handleReceiveAnswer({ answer, from }) {
        const peer = peersRef.current[from];
        if (peer) {
            peer.setRemoteDescription(answer);
        }
    }

    function handleNewICECandidate({ candidate, from }) {
        const peer = peersRef.current[from];
        if (peer) {
            peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
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
            className="min-h-screen p-4"
            style={{
                backgroundImage: `url(${background})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            }}
        >
            <BackgroundSelector onSelect={setBackground} />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {/* 自分のビデオ */}
                <div className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden">
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
                        あなた
                    </div>
                </div>

                {/* 他の参加者のビデオ */}
                {users.map(user => (
                    user.userId !== userId && (
                        <div key={user.socketId} className="relative aspect-video bg-gray-200 rounded-lg overflow-hidden">
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
        </div>
    );
}
