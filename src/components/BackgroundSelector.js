'use client';
import { useEffect, useState } from 'react';

export default function BackgroundSelector({ onSelect, currentBackground }) {
    const [loadedImages, setLoadedImages] = useState({});
    const [error, setError] = useState(null);

    // 相対パスを使用
    const backgrounds = [
        '/backgrounds/default.jpg',
        '/backgrounds/living-room.jpg',
        '/backgrounds/garden.jpg',
    ];

    // プリロードと状態管理
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const loadImage = (path) => {
            return new Promise((resolve, reject) => {
                const img = new Image();

                img.onload = () => {
                    console.log('Successfully loaded:', path);
                    setLoadedImages(prev => ({
                        ...prev,
                        [path]: true
                    }));
                    resolve(true);
                };

                img.onerror = (error) => {
                    console.error('Error loading image:', path, error);
                    setLoadedImages(prev => ({
                        ...prev,
                        [path]: false
                    }));
                    reject(error);
                };

                // 画像のキャッシュを防ぐためにタイムスタンプを追加
                const timestamp = new Date().getTime();
                img.src = `${path}?t=${timestamp}`;
            });
        };

        // すべての背景画像を読み込む
        const loadAllImages = async () => {
            try {
                await Promise.all(backgrounds.map(loadImage));
            } catch (err) {
                setError('一部の背景画像の読み込みに失敗しました');
                console.error('Failed to load some images:', err);
            }
        };

        loadAllImages();
    }, []);

    return (
        <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-bold mb-4">背景を選択</h3>
            {error && (
                <div className="mb-4 p-2 bg-red-100 text-red-600 rounded">
                    {error}
                </div>
            )}
            <div className="grid grid-cols-3 gap-4">
                {backgrounds.map((bg, index) => (
                    <button
                        key={index}
                        onClick={() => onSelect(bg)}
                        className={`
                            relative h-20 rounded-lg overflow-hidden border-2
                            ${bg === currentBackground ? 'border-blue-500' : 'border-gray-200'}
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

            {process.env.NODE_ENV === 'development' && (
                <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                    <div>Current Background: {currentBackground}</div>
                    <div>Loaded Status:</div>
                    {Object.entries(loadedImages).map(([path, status]) => (
                        <div key={path}>
                            {path}: {status ? '✅' : '❌'}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}