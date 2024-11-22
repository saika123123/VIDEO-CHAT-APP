import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req) {
    console.log('★POST /api/speeches received');
    try {
        const body = await req.json();
        console.log('★Request body:', body);

        const { meetingId, userId, content } = body;

        // バリデーションのログ
        console.log('★Validation check:', {
            hasMeetingId: !!meetingId,
            hasUserId: !!userId,
            hasContent: !!content
        });

        // 会議の存在確認
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId }
        });
        console.log('★Meeting found:', meeting);

        // ユーザーの存在確認
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        console.log('★User found:', user);

        // Speech作成の試行
        console.log('★Attempting to create speech record');
        const speech = await prisma.speech.create({
            data: {
                meetingId,
                userId,
                content: content.trim()
            }
        });
        console.log('★Speech created:', speech);

        return NextResponse.json({
            id: speech.id,
            content: speech.content,
            timestamp: speech.timestamp,
            message: 'Speech saved successfully'
        });

    } catch (error) {
        console.error('★Error in POST /api/speeches:', error);
        return NextResponse.json(
            { error: 'Failed to save speech', details: error.message },
            { status: 500 }
        );
    }
}