'use client';
import { useRouter } from 'next/navigation';

export default function InvitationButton({ roomId, userName }) {
    const router = useRouter();

    // QRコードページに移動する関数
    const navigateToQRPage = () => {
        // ユーザー名をセッションストレージに保存して、QRページからの戻り時に使用
        if (userName) {
            sessionStorage.setItem('userName', userName);
        }

        // QRコードページへ移動（絶対パスで指定する）
        if (typeof window !== 'undefined') {
            const baseUrl = window.location.origin;
            window.location.href = `${baseUrl}/yoriai/qr/${roomId}`;
        }
    };

    return (
        <div className="flex flex-col items-center">
            <button
                onClick={navigateToQRPage}
                className="
          p-3 md:p-6 rounded-full bg-indigo-600 text-white 
          hover:bg-indigo-700 active:bg-indigo-800 transition-colors
          shadow-lg
          flex flex-col items-center gap-2
        "
                aria-label="招待QRコードを表示"
            >
                <svg className="w-6 h-6 md:w-10 md:h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                    />
                </svg>
            </button>
            <span className="mt-1 md:mt-2 text-sm md:text-lg font-bold">招待する</span>
        </div>
    );
}