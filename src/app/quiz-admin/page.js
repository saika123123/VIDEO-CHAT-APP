// src/app/quiz-admin/page.js
'use client';
import dynamic from 'next/dynamic';

// クライアントサイドでのみレンダリング（XLSXライブラリの関係）
const QuizExcelManager = dynamic(
    () => import('@/components/QuizExcelManager'),
    { 
        ssr: false,
        loading: () => (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <div className="text-xl">管理画面を読み込み中...</div>
                </div>
            </div>
        )
    }
);

export default function QuizAdminPage() {
    return <QuizExcelManager />;
}