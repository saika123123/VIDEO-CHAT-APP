// src/app/board/page.js
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function BoardPage() {
    const [meetings, setMeetings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newMeetingName, setNewMeetingName] = useState('');
    const [newMeetingSchedule, setNewMeetingSchedule] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    // 寄合一覧を取得
    const fetchMeetings = async () => {
        try {
            const response = await fetch('/yoriai/api/board');
            const data = await response.json();
            if (response.ok) {
                // ローカルストレージから名前とスケジュール情報を取得
                const meetingsWithLocalData = (data.meetings || []).map(meeting => ({
                    ...meeting,
                    name: localStorage.getItem(`meeting_name_${meeting.roomId}`) || '無題の寄合',
                    schedule: localStorage.getItem(`meeting_schedule_${meeting.roomId}`) || null
                }));
                setMeetings(meetingsWithLocalData);
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
                    schedule: newMeetingSchedule.trim()
                })
            });

            const data = await response.json();
            if (response.ok) {
                // ローカルストレージに情報を保存
                localStorage.setItem(`meeting_name_${data.roomId}`, newMeetingName.trim());
                if (newMeetingSchedule.trim()) {
                    localStorage.setItem(`meeting_schedule_${data.roomId}`, newMeetingSchedule.trim());
                }

                setNewMeetingName('');
                setNewMeetingSchedule('');
                setShowCreateForm(false);
                fetchMeetings(); // 一覧を再取得
                alert('新しい寄合を作成しました！');
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
                        <div className="space-y-4">
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
            </div>
        </div>
    );
}