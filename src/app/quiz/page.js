'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function QuizMenuPage() {
    const [joinRoomId, setJoinRoomId] = useState('');
    const [userName, setUserName] = useState('');
    const router = useRouter();

    const joinQuiz = () => {
        if (!joinRoomId || !userName) {
            alert('ルームIDとお名前を入力してください');
            return;
        }

        // ユーザー名を保存
        const userId = Date.now().toString();
        localStorage.setItem(`user_${userId}`, userName);

        router.push(`/yoriai/quiz/${joinRoomId}?user=${userId}`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
            <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                    <h1 className="text-4xl font-bold mb-6 text-gray-800">
                        🧠 みんなでクイズ
                    </h1>
                    
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xl font-bold mb-3 text-gray-700">
                                お名前
                            </label>
                            <input
                                type="text"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                className="w-full p-4 border-2 border-gray-300 rounded-xl text-lg"
                                placeholder="お名前を入力してください"
                            />
                        </div>

                        <div>
                            <label className="block text-xl font-bold mb-3 text-gray-700">
                                ルームID
                            </label>
                            <input
                                type="text"
                                value={joinRoomId}
                                onChange={(e) => setJoinRoomId(e.target.value)}
                                className="w-full p-4 border-2 border-gray-300 rounded-xl text-lg"
                                placeholder="参加するルームIDを入力"
                            />
                        </div>

                        <button
                            onClick={joinQuiz}
                            className="w-full py-4 bg-purple-600 text-white rounded-xl text-xl font-bold 
                                     hover:bg-purple-700 transition-colors shadow-lg"
                        >
                            🚀 クイズに参加
                        </button>

                        <div className="text-center">
                            <button
                                onClick={() => router.push('/yoriai')}
                                className="text-blue-600 hover:text-blue-800 text-lg"
                            >
                                ← ホームに戻る
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}