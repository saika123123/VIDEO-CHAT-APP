'use client';
import { useEffect, useState } from 'react';

export default function BackgroundSelector({ onSelect, currentBackground }) {
    const [loadedImages, setLoadedImages] = useState({});

    // 絶対パスを使用する
    const backgrounds = [
        // フルURLパスを使用
        `${window.location.origin}/backgrounds/default.jpg`,
        `${window.location.origin}/backgrounds/living-room.jpg`,
        `${window.location.origin}/backgrounds/garden.jpg`,
    ];

    // プリロードと状態管理
    useEffect(() => {
        // クライアントサイドでのみ実行
        if (typeof window === 'undefined') return;

        backgrounds.forEach(bg => {
            const img = document.createElement('img');

            console.log('Attempting to load:', bg);

            img.onload = () => {
                console.log('Successfully loaded:', bg);
                setLoadedImages(prev => ({
                    ...prev,
                    [bg]: true
                }));
            };

            img.onerror = (error) => {
                console.error('Error loading image:', bg, error);
                // エラー時のフォールバック処理
                setLoadedImages(prev => ({
                    ...prev,
                    [bg]: false
                }));
            };

            img.src = bg;
        });
    }, []);

    const getDisplayPath = (fullPath) => {
        // UI表示用に短いパスを生成
        try {
            const url = new URL(fullPath);
            return url.pathname;
        } catch (e) {
            return fullPath;
        }
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-bold mb-4">背景を選択</h3>
            <div className="grid grid-cols-3 gap-4">
                {backgrounds.map((bg, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            console.log('Selecting background:', bg);
                            onSelect(getDisplayPath(bg)); // パスを相対パスに変換して保存
                        }}
                        className={`
                            relative h-20 rounded-lg overflow-hidden border-2
                            ${getDisplayPath(bg) === currentBackground ? 'border-blue-500' : 'border-gray-200'}
                            ${loadedImages[bg] === false ? 'opacity-50' : ''}
                            hover:border-blue-500 transition-colors
                        `}
                        disabled={loadedImages[bg] === false}
                    >
                        {loadedImages[bg] === false ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <span className="text-sm text-gray-500">読み込みエラー</span>
                            </div>
                        ) : (
                            <div className="w-full h-full relative">
                                <img
                                    src={bg}
                                    alt={`背景 ${index + 1}`}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            {/* 開発環境でのデバッグ情報 */}
            {process.env.NODE_ENV === 'development' && (
                <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                    <div>Current URL: {window.location.origin}</div>
                    <div>Current Background: {currentBackground}</div>
                    <div>Loaded Status:</div>
                    {Object.entries(loadedImages).map(([path, status]) => (
                        <div key={path}>
                            {getDisplayPath(path)}: {status ? '✅' : '❌'}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}