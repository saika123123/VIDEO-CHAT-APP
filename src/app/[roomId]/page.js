import { Suspense } from 'react';
import RoomClient from './RoomClient';

function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-xl">Loading...</div>
        </div>
    );
}

// メインのページコンポーネント
export default async function RoomPage({ params }) {
    // Promise.allSettled を使って params を安全に処理
    const [paramResult] = await Promise.allSettled([
        Promise.resolve(params)
    ]);

    // params が正しく取得できない場合のフォールバック
    if (paramResult.status === 'rejected') {
        console.error('Failed to load params:', paramResult.reason);
        return <div>エラーが発生しました</div>;
    }

    const { roomId } = paramResult.value;

    return (
        <Suspense fallback={<Loading />}>
            <RoomClient roomId={roomId} />
        </Suspense>
    );
}

// ページパラメータの生成設定
export function generateStaticParams() {
    return [];
}