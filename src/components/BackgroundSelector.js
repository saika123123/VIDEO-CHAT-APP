'use client';

export default function BackgroundSelector({ onSelect }) {
    const backgrounds = [
        '/backgrounds/default.jpg',
        '/backgrounds/living-room.jpg',
        '/backgrounds/garden.jpg',
    ];

    return (
        <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-bold mb-4">背景を選択</h3>
            <div className="grid grid-cols-3 gap-4">
                {backgrounds.map((bg, index) => (
                    <button
                        key={index}
                        onClick={() => onSelect(bg)}
                        className="relative h-20 rounded-lg overflow-hidden border-2 hover:border-blue-500"
                    >
                        <img
                            src={bg}
                            alt={`背景 ${index + 1}`}
                            className="w-full h-full object-cover"
                        />
                    </button>
                ))}
            </div>
        </div>
    );
}