import { Suspense } from 'react';
import QuizClient from './QuizClient';

function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-xl">クイズを読み込み中...</div>
        </div>
    );
}

export default async function QuizRoomPage({ params }) {
    const [paramResult] = await Promise.allSettled([
        Promise.resolve(params)
    ]);

    if (paramResult.status === 'rejected') {
        console.error('Failed to load params:', paramResult.reason);
        return <div>エラーが発生しました</div>;
    }

    const { roomId } = paramResult.value;

    return (
        <Suspense fallback={<Loading />}>
            <QuizClient roomId={roomId} />
        </Suspense>
    );
}

export function generateStaticParams() {
    return [];
}