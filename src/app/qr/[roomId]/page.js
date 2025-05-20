'use client';
import { useParams, useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react'; // 正規のQRコードライブラリをインポート
import { useEffect, useState } from 'react';

export default function QRCodePage() {
    const params = useParams();
    const router = useRouter();
    const [roomId, setRoomId] = useState('');
    const [inviteUrl, setInviteUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (params.roomId) {
            setRoomId(params.roomId);
            setIsLoading(false);
        }
    }, [params]);

    useEffect(() => {
        if (roomId && typeof window !== 'undefined') {
            // 正しい招待URLを生成（クエリパラメータとして'room'を付与）
            const baseUrl = window.location.origin;
            setInviteUrl(`${baseUrl}/yoriai?room=${roomId}`);
        }
    }, [roomId]);

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

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-2xl font-bold text-gray-700">読み込み中...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">招待QRコード</h1>
                        <button
                            onClick={goBack}
                            className="text-gray-500 hover:text-gray-700"
                            aria-label="戻る"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="bg-white p-4 rounded-xl border-2 border-gray-200 mb-6">
                            {/* ライブラリによる正規のQRコード生成 */}
                            <QRCodeSVG
                                value={inviteUrl}
                                size={250}
                                bgColor={"#ffffff"}
                                fgColor={"#000000"}
                                level={"L"}
                                includeMargin={true}
                            />
                        </div>

                        <p className="text-gray-600 text-center mb-6">
                            このQRコードをスキャンすると、<br />ビデオ通話に直接参加できます
                        </p>

                        <div className="w-full mb-6">
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

                        <div className="w-full">
                            <button
                                onClick={goBack}
                                className="w-full py-3 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors"
                            >
                                ビデオ通話に戻る
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}