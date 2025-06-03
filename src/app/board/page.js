// src/app/board/page.js
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function BoardPage() {
    const [meetings, setMeetings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showQRCode, setShowQRCode] = useState(false);
    const [currentStep, setCurrentStep] = useState(1); // 1: 基本情報, 2: QRコード表示
    const [newMeetingName, setNewMeetingName] = useState('');
    const [newMeetingSchedule, setNewMeetingSchedule] = useState('');
    const [newMeetingUrl, setNewMeetingUrl] = useState('');
    const [createdMeeting, setCreatedMeeting] = useState(null);
    const [error, setError] = useState('');
    const router = useRouter();

    // 掲示板で作成された寄合のIDリストを取得
    const getBoardCreatedMeetings = () => {
        try {
            const stored = localStorage.getItem('board_created_meetings');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    };

    // 掲示板で作成された寄合のIDリストを保存
    const saveBoardCreatedMeeting = (roomId) => {
        try {
            const existing = getBoardCreatedMeetings();
            if (!existing.includes(roomId)) {
                existing.push(roomId);
                localStorage.setItem('board_created_meetings', JSON.stringify(existing));
            }
        } catch (error) {
            console.error('Failed to save board created meeting:', error);
        }
    };

    // 掲示板で作成された寄合のIDリストから削除
    const removeBoardCreatedMeeting = (roomId) => {
        try {
            const existing = getBoardCreatedMeetings();
            const filtered = existing.filter(id => id !== roomId);
            localStorage.setItem('board_created_meetings', JSON.stringify(filtered));
        } catch (error) {
            console.error('Failed to remove board created meeting:', error);
        }
    };

    // 寄合一覧を取得（掲示板作成のもののみ）
    const fetchMeetings = async () => {
        try {
            const boardCreatedIds = getBoardCreatedMeetings();
            
            if (boardCreatedIds.length === 0) {
                setMeetings([]);
                setIsLoading(false);
                return;
            }

            const response = await fetch('/yoriai/api/board');
            const data = await response.json();
            if (response.ok) {
                // 掲示板で作成された寄合のみフィルター
                const boardMeetings = (data.meetings || [])
                    .filter(meeting => boardCreatedIds.includes(meeting.roomId))
                    .map(meeting => ({
                        ...meeting,
                        name: localStorage.getItem(`meeting_name_${meeting.roomId}`) || '無題の寄合',
                        schedule: localStorage.getItem(`meeting_schedule_${meeting.roomId}`) || null,
                        url: localStorage.getItem(`meeting_url_${meeting.roomId}`) || null
                    }));
                
                setMeetings(boardMeetings);
            } else {
                setError(data.error || '寄合一覧の取得に失敗しました');
            }
        } catch (err) {
            setError('ネットワークエラーが発生しました');
            console.error('Error fetching meetings:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 新しい寄合を作成
    const createMeeting = async () => {
        if (!newMeetingName.trim()) {
            alert('寄合の名前を入力してください');
            return;
        }

        try {
            const response = await fetch('/yoriai/api/board', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newMeetingName.trim(),
                    schedule: newMeetingSchedule.trim(),
                    url: newMeetingUrl.trim()
                })
            });

            const data = await response.json();
            if (response.ok) {
                // ローカルストレージに情報を保存
                localStorage.setItem(`meeting_name_${data.roomId}`, newMeetingName.trim());
                if (newMeetingSchedule.trim()) {
                    localStorage.setItem(`meeting_schedule_${data.roomId}`, newMeetingSchedule.trim());
                }
                if (newMeetingUrl.trim()) {
                    localStorage.setItem(`meeting_url_${data.roomId}`, newMeetingUrl.trim());
                }
                
                // 掲示板作成リストに追加
                saveBoardCreatedMeeting(data.roomId);
                
                // QRコード表示用の状態を設定
                setCreatedMeeting({
                    roomId: data.roomId,
                    name: newMeetingName.trim(),
                    schedule: newMeetingSchedule.trim(),
                    url: newMeetingUrl.trim()
                });
                
                // QRコード表示ステップに移行
                setCurrentStep(2);
                setShowQRCode(true);
                
            } else {
                alert(data.error || '寄合の作成に失敗しました');
            }
        } catch (err) {
            alert('寄合の作成中にエラーが発生しました');
            console.error('Error creating meeting:', err);
        }
    };

    // 寄合を削除
    const deleteMeeting = async (roomId, meetingName) => {
        if (!window.confirm(`「${meetingName}」を削除しますか？`)) {
            return;
        }

        try {
            const response = await fetch(`/yoriai/api/board/${roomId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // ローカルストレージからも削除
                localStorage.removeItem(`meeting_name_${roomId}`);
                localStorage.removeItem(`meeting_schedule_${roomId}`);
                localStorage.removeItem(`meeting_url_${roomId}`);
                
                // 掲示板作成リストからも削除
                removeBoardCreatedMeeting(roomId);
                
                fetchMeetings(); // 一覧を再取得
                alert('寄合を削除しました');
            } else {
                const data = await response.json();
                alert(data.error || '削除に失敗しました');
            }
        } catch (err) {
            alert('削除中にエラーが発生しました');
            console.error('Error deleting meeting:', err);
        }
    };

    // QRコードページへ移動
    const viewQRCode = (roomId) => {
        router.push(`/yoriai/qr/${roomId}`);
    };

    // 寄合に参加
    const joinMeeting = (roomId) => {
        router.push(`/yoriai?room=${roomId}`);
    };

    // 作成フォームをリセット
    const resetCreateForm = () => {
        setNewMeetingName('');
        setNewMeetingSchedule('');
        setNewMeetingUrl('');
        setShowCreateForm(false);
        setShowQRCode(false);
        setCurrentStep(1);
        setCreatedMeeting(null);
        fetchMeetings();
    };

    // QRコードを印刷
    const printQRCode = () => {
        window.print();
    };

    // URLをコピー
    const copyInviteUrl = () => {
        if (createdMeeting) {
            const inviteUrl = `${window.location.origin}/yoriai?room=${createdMeeting.roomId}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
                alert('招待URLをコピーしました！');
            });
        }
    };

    useEffect(() => {
        fetchMeetings();
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="text-3xl font-bold text-gray-700 mb-4">読み込み中...</div>
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
            <div className="max-w-6xl mx-auto">
                {/* ヘッダー */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
                        🏠 寄合掲示板
                    </h1>
                    <p className="text-xl md:text-2xl text-gray-600">
                        開催中の寄合を確認して参加しましょう
                    </p>
                </div>

                {/* エラーメッセージ */}
                {error && (
                    <div className="mb-6 p-4 bg-red-100 border-2 border-red-300 text-red-700 rounded-xl text-center text-xl">
                        {error}
                    </div>
                )}

                {/* QRコード表示モード */}
                {showQRCode && createdMeeting && (
                    <div className="mb-8 bg-white rounded-2xl shadow-xl p-8 border-2 border-green-200">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-6 text-green-700">
                                🎉 寄合を作成しました！
                            </h2>
                            
                            {/* 寄合情報 */}
                            <div className="mb-8 p-6 bg-gray-50 rounded-xl">
                                <h3 className="text-2xl font-bold text-gray-800 mb-4">
                                    {createdMeeting.name}
                                </h3>
                                {createdMeeting.schedule && (
                                    <p className="text-xl text-gray-600 mb-2">
                                        🕐 {createdMeeting.schedule}
                                    </p>
                                )}
                                {createdMeeting.url && (
                                    <p className="text-lg text-blue-600 mb-2">
                                        🌐 {createdMeeting.url}
                                    </p>
                                )}
                            </div>

                            {/* QRコード */}
                            <div className="mb-8">
                                <div className="inline-block p-6 bg-white rounded-2xl shadow-lg border-2 border-gray-200">
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${window.location.origin}/yoriai?room=${createdMeeting.roomId}`)}`}
                                        alt="寄合参加用QRコード"
                                        className="mx-auto"
                                        width="250"
                                        height="250"
                                    />
                                </div>
                                <p className="text-lg text-gray-600 mt-4">
                                    📱 このQRコードをスキャンして寄合に参加
                                </p>
                            </div>

                            {/* アクションボタン */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <button
                                    onClick={copyInviteUrl}
                                    className="px-6 py-4 bg-blue-600 text-white rounded-xl text-lg font-bold 
                                             hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="text-xl">📋</span>
                                    URLをコピー
                                </button>
                                <button
                                    onClick={() => viewQRCode(createdMeeting.roomId)}
                                    className="px-6 py-4 bg-purple-600 text-white rounded-xl text-lg font-bold 
                                             hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="text-xl">🖨️</span>
                                    印刷用表示
                                </button>
                                <button
                                    onClick={resetCreateForm}
                                    className="px-6 py-4 bg-green-600 text-white rounded-xl text-lg font-bold 
                                             hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="text-xl">✅</span>
                                    完了
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 通常の表示モード */}
                {!showQRCode && (
                    <>
                        {/* ナビゲーションボタン */}
                        <div className="flex flex-col md:flex-row gap-4 mb-8 justify-center">
                            <button
                                onClick={() => setShowCreateForm(!showCreateForm)}
                                className="px-8 py-4 bg-green-600 text-white rounded-xl text-xl font-bold 
                                         hover:bg-green-700 transition-colors shadow-lg flex items-center justify-center gap-3"
                            >
                                <span className="text-2xl">➕</span>
                                新しい寄合を作る
                            </button>
                            <button
                                onClick={() => router.push('/yoriai')}
                                className="px-8 py-4 bg-blue-600 text-white rounded-xl text-xl font-bold 
                                         hover:bg-blue-700 transition-colors shadow-lg flex items-center justify-center gap-3"
                            >
                                <span className="text-2xl">🏠</span>
                                ホームに戻る
                            </button>
                            <button
                                onClick={() => fetchMeetings()}
                                className="px-8 py-4 bg-purple-600 text-white rounded-xl text-xl font-bold 
                                         hover:bg-purple-700 transition-colors shadow-lg flex items-center justify-center gap-3"
                            >
                                <span className="text-2xl">🔄</span>
                                更新
                            </button>
                        </div>

                        {/* 新規作成フォーム */}
                        {showCreateForm && (
                            <div className="mb-8 bg-white rounded-2xl shadow-xl p-6 border-2 border-green-200">
                                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
                                    🆕 新しい寄合を作成
                                </h2>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-xl font-bold text-gray-700 mb-2">
                                            寄合の名前 *
                                        </label>
                                        <input
                                            type="text"
                                            value={newMeetingName}
                                            onChange={(e) => setNewMeetingName(e.target.value)}
                                            placeholder="例: 山田家の誕生日会"
                                            className="w-full p-4 border-2 border-gray-300 rounded-xl text-lg focus:border-green-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xl font-bold text-gray-700 mb-2">
                                            開催時刻（任意）
                                        </label>
                                        <input
                                            type="text"
                                            value={newMeetingSchedule}
                                            onChange={(e) => setNewMeetingSchedule(e.target.value)}
                                            placeholder="例: 毎週土曜日 12時から"
                                            className="w-full p-4 border-2 border-gray-300 rounded-xl text-lg focus:border-green-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xl font-bold text-gray-700 mb-2">
                                            詳細URL（任意）
                                        </label>
                                        <input
                                            type="url"
                                            value={newMeetingUrl}
                                            onChange={(e) => setNewMeetingUrl(e.target.value)}
                                            placeholder="例: https://example.com/meeting-info"
                                            className="w-full p-4 border-2 border-gray-300 rounded-xl text-lg focus:border-green-500 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={createMeeting}
                                            className="flex-1 px-6 py-4 bg-green-600 text-white rounded-xl text-xl font-bold 
                                                     hover:bg-green-700 transition-colors"
                                        >
                                            作成する
                                        </button>
                                        <button
                                            onClick={() => setShowCreateForm(false)}
                                            className="flex-1 px-6 py-4 bg-gray-400 text-white rounded-xl text-xl font-bold 
                                                     hover:bg-gray-500 transition-colors"
                                        >
                                            キャンセル
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 寄合一覧 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {meetings.length === 0 ? (
                                <div className="col-span-full text-center py-16">
                                    <div className="text-6xl mb-4">📋</div>
                                    <h3 className="text-2xl font-bold text-gray-500 mb-2">
                                        まだ寄合がありません
                                    </h3>
                                    <p className="text-xl text-gray-400">
                                        「新しい寄合を作る」ボタンから作成してください
                                    </p>
                                </div>
                            ) : (
                                meetings.map((meeting) => (
                                    <div
                                        key={meeting.roomId}
                                        className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-6 hover:shadow-xl transition-shadow"
                                    >
                                        {/* 寄合情報 */}
                                        <div className="mb-6">
                                            <h3 className="text-2xl font-bold text-gray-800 mb-2 line-clamp-2">
                                                {meeting.name || '無題の寄合'}
                                            </h3>
                                            {meeting.schedule && (
                                                <p className="text-lg text-gray-600 mb-2">
                                                    🕐 {meeting.schedule}
                                                </p>
                                            )}
                                            {meeting.url && (
                                                <p className="text-sm text-blue-600 mb-2 break-all">
                                                    🌐 <a href={meeting.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                                        {meeting.url}
                                                    </a>
                                                </p>
                                            )}
                                            <p className="text-base text-gray-500">
                                                作成日: {new Date(meeting.createdAt).toLocaleDateString('ja-JP')}
                                            </p>
                                        </div>

                                        {/* QRコード表示エリア */}
                                        <div className="mb-6 bg-gray-50 rounded-xl p-4 text-center">
                                            <div className="text-lg font-bold text-gray-700 mb-3">
                                                📱 QRコード
                                            </div>
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/yoriai?room=${meeting.roomId}`)}`}
                                                alt="QRコード"
                                                className="mx-auto rounded-lg shadow-sm"
                                                width="150"
                                                height="150"
                                            />
                                            <p className="text-sm text-gray-500 mt-2">
                                                スマホでスキャンして参加
                                            </p>
                                        </div>

                                        {/* アクションボタン */}
                                        <div className="space-y-3">
                                            <button
                                                onClick={() => joinMeeting(meeting.roomId)}
                                                className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl text-lg font-bold 
                                                         hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <span className="text-xl">🎥</span>
                                                参加する
                                            </button>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => viewQRCode(meeting.roomId)}
                                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-base font-bold 
                                                             hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <span>📋</span>
                                                    QR印刷
                                                </button>
                                                <button
                                                    onClick={() => deleteMeeting(meeting.roomId, meeting.name)}
                                                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-base font-bold 
                                                             hover:bg-red-700 transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <span>🗑️</span>
                                                    削除
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}