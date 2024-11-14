import { Suspense } from 'react';

function Loading() {
    return <div>Loading...</div>;
}

export default function RoomPage({ params }) {
    return (
        <Suspense fallback={<Loading />}>
            <RoomContent params={params} />
        </Suspense>
    );
}

async function RoomContent({ params }) {
    const roomId = await Promise.resolve(params.roomId);
    return <RoomClient roomId={roomId} />;
}