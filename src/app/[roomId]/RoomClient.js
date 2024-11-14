'use client';
import VideoRoom from '@/components/VideoRoom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function RoomClient({ roomId }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const userId = searchParams.get('user');

    useEffect(() => {
        if (!userId) {
            router.push('/');
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

    return (
        <div className="min-h-screen">
            <VideoRoom roomId={roomId} userId={userId} />
        </div>
    );
}