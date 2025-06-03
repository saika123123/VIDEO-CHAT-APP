// src/components/BoardNavigation.js - VideoRoomで使用する掲示板ナビゲーション
'use client';
import { useRouter } from 'next/navigation';

export default function BoardNavigation() {
    const router = useRouter();

    const goToBoard = () => {
        if (window.confirm('掲示板に移動しますか？（現在のビデオ通話は終了されます）')) {
            router.push('/yoriai/board');
        }
    };

    return (
        <div className="flex flex-col items-center">
            <button
                onClick={goToBoard}
                className="
                    p-2 md:p-4 rounded-full bg-indigo-600 text-white 
                    hover:bg-indigo-700 active:bg-indigo-800 transition-colors
                    shadow-lg
                    flex flex-col items-center gap-1
                "
                aria-label="掲示板に移動"
            >
                <svg className="w-5 h-5 md:w-8 md:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                </svg>
            </button>
            <span className="mt-1 text-xs md:text-sm font-bold">掲示板</span>
        </div>
    );
}