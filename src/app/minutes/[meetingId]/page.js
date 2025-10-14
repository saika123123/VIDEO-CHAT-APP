import { Suspense } from 'react';
import MinutesClient from './MinutesClient';

function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-xl">議事録詳細を読み込み中...</div>
        </div>
    );
}

export default async function MinutesPage({ params }) {
    const [paramResult] = await Promise.allSettled([
        Promise.resolve(params)
    ]);

    if (paramResult.status === 'rejected') {
        console.error('Failed to load params:', paramResult.reason);
        return <div>エラーが発生しました</div>;
    }

    const { meetingId } = paramResult.value;

    return (
        <Suspense fallback={<Loading />}>
            <MinutesClient meetingId={meetingId} />
        </Suspense>
    );
}

export function generateStaticParams() {
    return [];
}