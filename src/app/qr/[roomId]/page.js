'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function QRCodePage() {
    const params = useParams();
    const router = useRouter();
    const [roomId, setRoomId] = useState('');
    const [inviteUrl, setInviteUrl] = useState('');
    const [qrImageUrl, setQrImageUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [meetingName, setMeetingName] = useState('');
    const [meetingSchedule, setMeetingSchedule] = useState('');
    const printSectionRef = useRef(null);

    useEffect(() => {
        if (params.roomId) {
            setRoomId(params.roomId);
            setIsLoading(false);
            
            // ローカルストレージから寄合の名前を読み込む
            const savedName = localStorage.getItem(`meeting_name_${params.roomId}`);
            if (savedName) {
                setMeetingName(savedName);
            }
            
            // ローカルストレージから開催時刻を読み込む
            const savedSchedule = localStorage.getItem(`meeting_schedule_${params.roomId}`);
            if (savedSchedule) {
                setMeetingSchedule(savedSchedule);
            }
        }
    }, [params]);

    useEffect(() => {
        if (roomId && typeof window !== 'undefined') {
            try {
                // 正しい招待URLを生成
                const baseUrl = window.location.origin;
                // URLに余計なスラッシュが入らないよう調整
                const fullUrl = `${baseUrl}/yoriai?room=${roomId}`;
                setInviteUrl(fullUrl);
                
                // QRコード画像URLを生成（QR Server APIを使用）
                const encodedUrl = encodeURIComponent(fullUrl);
                // 大きなサイズのQRコードを生成
                setQrImageUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedUrl}`);
            } catch (error) {
                console.error('QRコード生成エラー:', error);
            }
        }
    }, [roomId]);

    // 寄合の名前が変更されたときにローカルストレージに保存
    useEffect(() => {
        if (roomId && meetingName) {
            localStorage.setItem(`meeting_name_${roomId}`, meetingName);
        }
    }, [roomId, meetingName]);
    
    // 開催時刻が変更されたときにローカルストレージに保存
    useEffect(() => {
        if (roomId && meetingSchedule) {
            localStorage.setItem(`meeting_schedule_${roomId}`, meetingSchedule);
        }
    }, [roomId, meetingSchedule]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(inviteUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const goBack = () => {
        const userName = sessionStorage.getItem('userName') || '';
        router.push(`/yoriai/${roomId}?user=${userName}`);
    };

    // 印刷機能
    const handlePrint = () => {
        window.print();
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-2xl font-bold text-gray-700">読み込み中...</div>
            </div>
        );
    }

    return (
        <>
            {/* 通常のビュー（画面表示用） */}
            <div className="screen-only min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h1 className="text-2xl font-bold text-gray-800">招待QRコード</h1>
                            <button
                                onClick={goBack}
                                className="text-gray-500 hover:text-gray-700 print-hidden"
                                aria-label="戻る"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* 寄合の名前入力欄 */}
                        <div className="mb-4 print-hidden">
                            <label htmlFor="meetingName" className="block text-sm font-medium text-gray-700 mb-1">
                                寄合の名前（印刷時に表示されます）
                            </label>
                            <input
                                type="text"
                                id="meetingName"
                                value={meetingName}
                                onChange={(e) => setMeetingName(e.target.value)}
                                placeholder="例: 山田家の誕生日会"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        
                        {/* 開催時刻入力欄 */}
                        <div className="mb-4 print-hidden">
                            <label htmlFor="meetingSchedule" className="block text-sm font-medium text-gray-700 mb-1">
                                開催時刻（印刷時に表示されます）
                            </label>
                            <input
                                type="text"
                                id="meetingSchedule"
                                value={meetingSchedule}
                                onChange={(e) => setMeetingSchedule(e.target.value)}
                                placeholder="例: 毎週土曜12時から"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        <div className="flex flex-col items-center">
                            <div className="bg-white p-4 rounded-xl border-2 border-gray-200 mb-6">
                                {qrImageUrl ? (
                                    <img 
                                        src={qrImageUrl} 
                                        alt="招待QRコード" 
                                        width="250" 
                                        height="250"
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                        onError={() => {
                                            console.error('QRコード画像を読み込めませんでした');
                                        }}
                                    />
                                ) : (
                                    <div className="text-center text-gray-400">
                                        QRコード読み込み中...
                                    </div>
                                )}
                            </div>

                            <p className="text-gray-600 text-center mb-6">
                                このQRコードをスキャンすると、<br />ビデオ通話に直接参加できます
                            </p>

                            <div className="w-full mb-6 print-hidden">
                                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                                    <input
                                        type="text"
                                        value={inviteUrl}
                                        readOnly
                                        className="flex-1 py-3 px-4 text-gray-700 focus:outline-none bg-gray-50 text-sm"
                                    />
                                    <button
                                        onClick={copyToClipboard}
                                        className={`px-4 flex items-center justify-center font-medium ${copied ? 'bg-green-600' : 'bg-blue-600'
                                            } text-white`}
                                    >
                                        {copied ? (
                                            <>
                                                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                完了
                                            </>
                                        ) : 'URLをコピー'}
                                    </button>
                                </div>
                            </div>

                            {/* 印刷ボタン */}
                            <div className="w-full grid grid-cols-2 gap-4 print-hidden">
                                <button
                                    onClick={handlePrint}
                                    className="py-3 bg-purple-600 text-white rounded-lg text-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center"
                                >
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    印刷する
                                </button>
                                
                                <button
                                    onClick={goBack}
                                    className="py-3 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors"
                                >
                                    ビデオ通話に戻る
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 印刷用のレイアウト（印刷時のみ表示） */}
            <div ref={printSectionRef} className="print-only hidden">
                <div className="p-8 mx-auto max-w-2xl">
                    <h1 className="text-3xl font-bold text-center mb-6">
                        {meetingName || '寄合 (ビデオ通話)'}
                    </h1>
                    
                    {meetingSchedule && (
                        <h2 className="text-2xl text-center mb-6 text-gray-700">
                            {meetingSchedule}
                        </h2>
                    )}
                    
                    <div className="flex flex-col items-center mb-6">
                        <div className="border-4 border-gray-300 p-4 bg-white">
                            {qrImageUrl && (
                                <img 
                                    src={qrImageUrl} 
                                    alt="招待QRコード" 
                                    width="300" 
                                    height="300"
                                    style={{ width: '300px', height: '300px' }}
                                />
                            )}
                        </div>
                    </div>
                    
                    <div className="text-center">
                        <p className="text-xl mb-4">
                            このQRコードをスマートフォンなどで<br />スキャンしてください
                        </p>
                        <p className="text-lg mb-2">
                            ビデオ通話に直接参加できます
                        </p>
                        <p className="text-base mt-6 mb-2">
                            参加用URL:
                        </p>
                        <p className="text-sm break-all border p-2 bg-gray-50">
                            {inviteUrl}
                        </p>
                        {/* <p className="text-base mt-8">
                            ルームID: {roomId}
                        </p> */}
                    </div>
                </div>
            </div>

            {/* 印刷用のスタイル */}
            <style jsx global>{`
                @media print {
                    .print-hidden {
                        display: none !important;
                    }
                    .screen-only {
                        display: none !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        background: white;
                    }
                    @page {
                        size: A4;
                        margin: 1cm;
                    }
                }
                @media screen {
                    .print-only {
                        display: none !important;
                    }
                }
            `}</style>
        </>
    );
}