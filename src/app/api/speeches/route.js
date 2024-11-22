import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const body = await req.json();
        const { meetingId, userId, content } = body;

        // 入力値の検証
        if (!meetingId || !userId || !content) {
            console.error('Missing required fields:', { meetingId, userId, content });
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // 会議の存在とアクティブ状態の確認
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId }
        });

        if (!meeting) {
            console.error('Meeting not found:', meetingId);
            return NextResponse.json(
                { error: 'Meeting not found' },
                { status: 404 }
            );
        }

        if (!meeting.isActive) {
            console.error('Meeting is not active:', meetingId);
            return NextResponse.json(
                { error: 'Meeting is not active' },
                { status: 400 }
            );
        }

        // ユーザーの存在確認
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.error('User not found:', userId);
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        console.log('Creating speech record:', {
            meetingId,
            userId,
            contentLength: content.length
        });

        // 発言の保存
        const speech = await prisma.speech.create({
            data: {
                meetingId,
                userId,
                content: content.trim()
            }
        });

        console.log('Created speech record:', speech);

        return NextResponse.json({
            id: speech.id,
            content: speech.content,
            timestamp: speech.timestamp,
            message: 'Speech saved successfully'
        });

    } catch (error) {
        console.error('Failed to save speech:', error);
        return NextResponse.json(
            {
                error: 'Failed to save speech',
                details: error.message
            },
            { status: 500 }
        );
    }
}