// /src/app/api/meetings/[meetingId]/route.js

import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

// POSTメソッドの処理
export async function POST(request, context) {
    return await handleMeetingUpdate(request, context);
}

// PUTメソッドの処理
export async function PUT(request, context) {
    return await handleMeetingUpdate(request, context);
}

// 共通の処理関数
async function handleMeetingUpdate(request, context) {
    try {
        // パラメータを非同期で取得
        const params = await Promise.resolve(context.params);
        const { meetingId } = params;

        if (!meetingId) {
            throw new Error('Meeting ID is required');
        }

        const body = await request.json();
        const { endTime } = body;

        console.log(`Updating meeting ${meetingId} with endTime:`, endTime);

        // トランザクションを使用して安全に更新
        const result = await prisma.$transaction(async (tx) => {
            // ミーティングの存在確認
            const existingMeeting = await tx.meeting.findUnique({
                where: { id: meetingId }
            });

            if (!existingMeeting) {
                throw new Error('Meeting not found');
            }

            // ミーティングの更新
            return await tx.meeting.update({
                where: {
                    id: meetingId
                },
                data: {
                    endTime: new Date(endTime),
                    isActive: false
                }
            });
        });

        return NextResponse.json({
            success: true,
            meeting: {
                id: result.id,
                endTime: result.endTime,
                isActive: result.isActive
            },
            message: 'Meeting ended successfully'
        });

    } catch (error) {
        console.error('Failed to update meeting:', error);

        const statusCode = error.message === 'Meeting not found' ? 404 : 500;

        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to update meeting',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            { status: statusCode }
        );
    }
}

// OPTIONSメソッドの処理
export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Allow': 'POST, PUT, OPTIONS',
            'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
    });
}