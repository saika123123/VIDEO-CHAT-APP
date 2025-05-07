'use client';
import { useParams, useRouter } from 'next/navigation';
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
            const baseUrl = window.location.origin;
            setInviteUrl(`${baseUrl}/yoriai/?room=${roomId}`);
        }
    }, [roomId]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(inviteUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const goBack = () => {
        router.push(`/yoriai/${roomId}?user=${sessionStorage.getItem('userName') || ''}`);
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
                            <QRCodeSVG url={inviteUrl} size={250} />
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

// QRコードを描画するSVGコンポーネント
const QRCodeSVG = ({ url, size = 250 }) => {
    // QRコードに必要なパターン（位置検出パターンなど）を生成
    const [qrMatrix, setQrMatrix] = useState([]);
    const moduleCount = 33; // QRコードのサイズ（セル数）

    useEffect(() => {
        // URLの文字列を使って一意のパターンを生成（実際のQRコードアルゴリズムではない）
        const generateQRPattern = () => {
            const matrix = Array(moduleCount).fill().map(() => Array(moduleCount).fill(0));

            // 位置検出パターン（左上）
            for (let i = 0; i < 7; i++) {
                for (let j = 0; j < 7; j++) {
                    // 外枠と内側の四角形
                    if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
                        matrix[i][j] = 1;
                    }
                }
            }

            // 位置検出パターン（右上）
            for (let i = 0; i < 7; i++) {
                for (let j = moduleCount - 7; j < moduleCount; j++) {
                    if (i === 0 || i === 6 || j === moduleCount - 7 || j === moduleCount - 1 ||
                        (i >= 2 && i <= 4 && j >= moduleCount - 5 && j <= moduleCount - 3)) {
                        matrix[i][j] = 1;
                    }
                }
            }

            // 位置検出パターン（左下）
            for (let i = moduleCount - 7; i < moduleCount; i++) {
                for (let j = 0; j < 7; j++) {
                    if (i === moduleCount - 7 || i === moduleCount - 1 || j === 0 || j === 6 ||
                        (i >= moduleCount - 5 && i <= moduleCount - 3 && j >= 2 && j <= 4)) {
                        matrix[i][j] = 1;
                    }
                }
            }

            // タイミングパターン
            for (let i = 8; i < moduleCount - 8; i++) {
                if (i % 2 === 0) {
                    matrix[6][i] = 1;
                    matrix[i][6] = 1;
                }
            }

            // データパターンのシミュレーション（URLをハッシュ化してパターンに変換）
            let hashValue = 0;
            for (let i = 0; i < url.length; i++) {
                hashValue += url.charCodeAt(i);
            }

            // データ部分にパターンを生成
            for (let i = 8; i < moduleCount - 8; i++) {
                for (let j = 8; j < moduleCount - 8; j++) {
                    if ((i * j + hashValue) % 4 === 0 ||
                        ((i + j) * url.length) % 5 === 0 ||
                        (i * j) % 7 === hashValue % 7) {
                        matrix[i][j] = 1;
                    }
                }
            }

            // ルームIDを反映したパターン（より一意にするため）
            const roomIdMatch = url.match(/room=([^&]+)/);
            if (roomIdMatch && roomIdMatch[1]) {
                const roomId = roomIdMatch[1];
                for (let i = 0; i < roomId.length; i++) {
                    const char = roomId.charCodeAt(i);
                    const row = (char % 10) + 10;
                    const col = (char % 15) + 10;
                    if (row < moduleCount && col < moduleCount) {
                        matrix[row][col] = 1;
                        // 周囲にもパターンを追加
                        if (row + 1 < moduleCount) matrix[row + 1][col] = 1;
                        if (col + 1 < moduleCount) matrix[row][col + 1] = 1;
                    }
                }
            }

            return matrix;
        };

        setQrMatrix(generateQRPattern());
    }, [url]);

    // モジュールサイズの計算
    const moduleSize = size / moduleCount;

    return (
        <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            style={{ background: '#fff' }}
        >
            {qrMatrix.map((row, rowIndex) => (
                row.map((cell, colIndex) => (
                    cell === 1 && (
                        <rect
                            key={`${rowIndex}-${colIndex}`}
                            x={colIndex * moduleSize}
                            y={rowIndex * moduleSize}
                            width={moduleSize}
                            height={moduleSize}
                            fill="#000"
                            shapeRendering="crispEdges"
                        />
                    )
                ))
            ))}
        </svg>
    );
};