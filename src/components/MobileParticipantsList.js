import { useEffect, useState } from 'react';

export default function MobileParticipantsList({ users, userName, isOpen, onClose }) {
    const [startX, setStartX] = useState(null);
    const [currentX, setCurrentX] = useState(null);
    const [isSwiping, setIsSwiping] = useState(false);

    // スワイプ関連の処理
    const handleTouchStart = (e) => {
        setStartX(e.touches[0].clientX);
        setIsSwiping(true);
    };

    const handleTouchMove = (e) => {
        if (isSwiping) {
            setCurrentX(e.touches[0].clientX);
        }
    };

    const handleTouchEnd = () => {
        if (isSwiping && startX && currentX) {
            // 右から左へのスワイプでリストを閉じる
            if (currentX - startX < -50) {
                onClose();
            }
        }
        setIsSwiping(false);
        setStartX(null);
        setCurrentX(null);
    };

    // ESCキーでも閉じられるようにする
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    // トランスフォームの計算（スワイプアニメーション用）
    const calculateTransform = () => {
        if (!isOpen) return 'translateX(-100%)';
        if (isSwiping && startX && currentX) {
            const diff = currentX - startX;
            if (diff < 0) {
                return `translateX(${diff}px)`;
            }
        }
        return 'translateX(0)';
    };

    return (
        <div
            className={`fixed inset-0 z-30 ${isOpen ? 'visible' : 'invisible'}`}
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-black/40" />

            <div
                className="absolute top-0 left-0 bottom-0 w-3/4 bg-white shadow-lg transition-transform duration-300 ease-in-out"
                style={{ transform: calculateTransform() }}
                onClick={e => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div className="p-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold">参加者リスト</h2>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-gray-200"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="space-y-3">
                        {/* 自分 */}
                        <div className="flex items-center p-3 bg-blue-50 rounded-lg">
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold mr-3">
                                {userName.substring(0, 1).toUpperCase()}
                            </div>
                            <div>
                                <div className="font-medium">{userName} <span className="text-sm text-gray-500">(あなた)</span></div>
                            </div>
                        </div>

                        {/* 他の参加者 */}
                        {users.map(user => (
                            <div key={user.socketId} className="flex items-center p-3 bg-gray-50 rounded-lg">
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold mr-3">
                                    {user.userName ? user.userName.substring(0, 1).toUpperCase() : '?'}
                                </div>
                                <div>
                                    <div className="font-medium">{user.userName || '接続中...'}</div>
                                </div>
                            </div>
                        ))}

                        {users.length === 0 && (
                            <div className="text-center py-4 text-gray-500">
                                他の参加者はいません
                            </div>
                        )}
                    </div>

                    <div className="mt-8 text-sm text-gray-500">
                        <p>右から左へスワイプで閉じる</p>
                    </div>
                </div>
            </div>
        </div>
    );
}