import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

// 特定の会議の議事録（Speech）をすべて取得
export async function GET(request, context) {
    const params = await Promise.resolve(context.params);
    const { meetingId } = params;

    if (!meetingId) {
        return NextResponse.json(
            { error: 'Meeting ID is required' },
            { status: 400 }
        );
    }

    try {
        const speeches = await prisma.speech.findMany({
            where: {
                meetingId: meetingId
            },
            select: {
                id: true,
                content: true,
                timestamp: true,
                userId: true,
                user: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                timestamp: 'asc' // 発言順に並べる
            }
        });

        const meetingInfo = await prisma.meeting.findUnique({
            where: { id: meetingId },
            select: { title: true, startTime: true, endTime: true, roomId: true }
        });

        if (!meetingInfo) {
            return NextResponse.json(
                { error: 'Meeting not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            meetingInfo,
            speeches: speeches.map(speech => ({
                id: speech.id,
                content: speech.content,
                timestamp: speech.timestamp,
                userId: speech.userId,
                userName: speech.user.name 
            }))
        });
    } catch (error) {
        console.error(`Failed to fetch speeches for meeting ${meetingId}:`, error);
        return NextResponse.json(
            { error: '議事録の取得に失敗しました', details: error.message },
            { status: 500 }
        );
    }
}