// src/app/api/meetings/all/route.js

import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

// 会議とその議事録の概要を、特定のルームIDでフィルタして取得
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const targetRoomId = searchParams.get('roomId'); // ★ ルームIDを取得

        if (!targetRoomId) {
             // ルームIDがない場合は空の結果を返す（権限がないとみなす）
            return NextResponse.json({ success: true, meetings: [] });
        }
        
        // 終了した会議（isActive: false）かつ議事録が1件以上あり、
        // かつ指定されたルームIDに紐づく会議のみを取得
        const meetings = await prisma.meeting.findMany({
            where: {
                isActive: false,
                roomId: targetRoomId, // ★ フィルタリング条件を追加
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
                _count: {
                    select: { speeches: true }
                }
            },
            orderBy: {
                endTime: 'desc'
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