'use client';
import MultiplayerQuiz from '@/components/quiz/MultiplayerQuiz';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function QuizClient({ roomId }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const userId = searchParams.get('user');

    useEffect(() => {
        if (!userId) {
            router.push('/yoriai');
            return;
        }
    }, [userId, router]);

    if (!userId) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl">Loading...</div>
            </div>
        );
    }

    // ユーザー名を取得（簡易版 - 実際はAPIから取得）
    const userName = localStorage.getItem(`user_${userId}`) || userId;

    return (
        <div className="min-h-screen">
            <MultiplayerQuiz roomId={roomId} userId={userId} userName={userName} />
        </div>
    );
}