'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MinutesListPage() {
    const [meetings, setMeetings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const router = useRouter();

    useEffect(() => {
        async function fetchMeetings() {
            try {
                const response = await fetch('/yoriai/api/meetings/all');
                const data = await response.json();

                if (response.ok) {
                    setMeetings(data.meetings || []);
                } else {
                    setError(data.error || '会議一覧の取得に失敗しました');
                }
            } catch (err) {
                setError('ネットワークエラーが発生しました');
                console.error('Error fetching meetings:', err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchMeetings();
    }, []);

    const goToMinutesDetail = (meetingId) => {
        router.push(`/yoriai/minutes/${meetingId}`);
    };
    
    const goBack = () => {
        router.push('/yoriai');
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl">会議履歴を読み込み中...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">
                        📜 議事録アーカイブ
                    </h1>
                    <button
                        onClick={goBack}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        ホームに戻る
                    </button>
                </div>
                
                {error && (
                    <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
                        エラー: {error}
                    </div>
                )}

                {meetings.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl shadow-lg">
                        <p className="text-2xl font-bold text-gray-500 mb-2">
                            議事録がまだありません
                        </p>
                        <p className="text-lg text-gray-400">
                            ビデオ通話中に録音を開始すると、ここに記録されます。
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {meetings.map((meeting) => (
                            <div
                                key={meeting.id}
                                onClick={() => goToMinutesDetail(meeting.id)}
                                className="bg-white p-5 rounded-xl shadow-md border-l-4 border-blue-500 cursor-pointer hover:shadow-lg transition-shadow"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-800 mb-1">
                                            {meeting.title || '無題の会議'}
                                        </h2>
                                        <p className="text-sm text-gray-600">
                                            開催日時: {new Date(meeting.startTime).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
                                            {meeting.endTime && ` - ${new Date(meeting.endTime).toLocaleTimeString('ja-JP', { timeStyle: 'short' })}`}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-blue-600">
                                            {meeting._count.speeches}
                                        </div>
                                        <p className="text-sm text-gray-500">発言数</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}