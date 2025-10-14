import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

// すべての会議とその議事録の概要を取得
export async function GET() {
    try {
        // 終了した会議（isActive: false）かつ議事録が1件以上ある会議のみを取得
        const meetings = await prisma.meeting.findMany({
            where: {
                isActive: false,
                speeches: {
                    some: {}
                }
            },
            select: {
                id: true,
                title: true,
                startTime: true,
                endTime: true,
                roomId: true,
                room: {
                    select: {
                        backgroundUrl: true
                    }
                },
                // 議事録の数をカウント
                _count: {
                    select: { speeches: true }
                }
            },
            orderBy: {
                endTime: 'desc' // 新しい順に並べる
            }
        });

        return NextResponse.json({
            success: true,
            meetings
        });
    } catch (error) {
        console.error('Failed to fetch meeting list:', error);
        return NextResponse.json(
            {
                success: false,
                error: '会議一覧の取得に失敗しました',
                details: error.message
            },
            { status: 500 }
        );
    }
}