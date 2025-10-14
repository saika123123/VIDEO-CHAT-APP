'use client';
import { useEffect, useState } from 'react';

export default function MinutesClient({ meetingId }) {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchSpeeches() {
            try {
                const response = await fetch(`/yoriai/api/meetings/${meetingId}/speeches`);
                const result = await response.json();

                if (response.ok) {
                    setData(result);
                } else {
                    setError(result.error || '議事録の取得に失敗しました');
                }
            } catch (err) {
                setError('ネットワークエラーが発生しました');
                console.error('Error fetching speeches:', err);
            } finally {
                setIsLoading(false);
            }
        }

        if (meetingId) {
            fetchSpeeches();
        }
    }, [meetingId]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl">議事録詳細を読み込み中...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen p-8 bg-red-50 flex items-center justify-center">
                <div className="bg-white p-8 rounded-xl shadow-lg">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">エラー</h2>
                    <p className="text-lg text-gray-700">{error}</p>
                    <button 
                        onClick={() => window.history.back()}
                        className="mt-6 px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
                    >
                        戻る
                    </button>
                </div>
            </div>
        );
    }

    const { meetingInfo, speeches } = data;

    return (
        <div className="min-h-screen bg-white p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                <button 
                    onClick={() => window.history.back()}
                    className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-1"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    議事録一覧に戻る
                </button>

                <div className="bg-blue-50 p-6 rounded-2xl shadow-xl mb-8">
                    <h1 className="text-3xl font-bold text-blue-800 mb-3">
                        {meetingInfo.title || '無題の会議'}
                    </h1>
                    <p className="text-lg text-gray-700 mb-1">
                        開催日時: {new Date(meetingInfo.startTime).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
                        {meetingInfo.endTime && ` - ${new Date(meetingInfo.endTime).toLocaleTimeString('ja-JP', { timeStyle: 'short' })}`}
                    </p>
                    <p className="text-lg text-gray-700">
                        ルームID: <span className="font-mono bg-blue-100 px-2 py-0.5 rounded text-sm">{meetingInfo.roomId}</span>
                    </p>
                </div>

                <h2 className="text-2xl font-bold text-gray-800 mb-6">発言記録 ({speeches.length}件)</h2>

                <div className="space-y-6">
                    {speeches.length === 0 ? (
                        <div className="p-10 text-center bg-gray-50 rounded-xl">
                            <p className="text-xl text-gray-500">この会議では発言が記録されていません。</p>
                        </div>
                    ) : (
                        speeches.map((speech, index) => (
                            <div
                                key={speech.id}
                                className="bg-white p-4 sm:p-6 rounded-xl shadow-lg border-t-4 border-gray-200"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-lg font-bold text-blue-600">
                                        {speech.userName}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        {new Date(speech.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-lg text-gray-800 leading-relaxed">
                                    {speech.content}
                                </p>
                            </div>
                        ))
                    )}
                </div>
                
                <div className="mt-10 flex justify-center">
                    <button 
                        onClick={() => window.history.back()}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg"
                    >
                        議事録一覧に戻る
                    </button>
                </div>
            </div>
        </div>
    );
}