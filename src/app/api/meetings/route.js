import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const body = await req.json();
        const { roomId } = body;

        if (!roomId) {
            console.error('Missing roomId in request');
            return NextResponse.json(
                { error: 'Room ID is required' },
                { status: 400 }
            );
        }

        // ルームの存在確認
        const room = await prisma.room.findUnique({
            where: { id: roomId }
        });

        if (!room) {
            console.error('Room not found:', roomId);
            return NextResponse.json(
                { error: 'Room not found' },
                { status: 404 }
            );
        }

        // アクティブな会議の確認
        const existingMeeting = await prisma.meeting.findFirst({
            where: {
                roomId,
                isActive: true
            }
        });

        if (existingMeeting) {
            console.log('Found existing active meeting:', existingMeeting);
            return NextResponse.json({
                meetingId: existingMeeting.id,
                startTime: existingMeeting.startTime,
                message: 'Using existing active meeting'
            });
        }

        console.log('Creating new meeting for room:', roomId);

        const meeting = await prisma.meeting.create({
            data: {
                roomId,
                isActive: true,
                startTime: new Date(),
                title: `Meeting ${new Date().toLocaleString('ja-JP')}`
            }
        });

        console.log('Created meeting:', meeting);

        return NextResponse.json({
            meetingId: meeting.id,
            startTime: meeting.startTime,
            title: meeting.title,
            message: 'Meeting created successfully'
        });

    } catch (error) {
        console.error('Failed to create meeting:', error);
        return NextResponse.json(
            {
                error: 'Failed to create meeting',
                details: error.message
            },
            { status: 500 }
        );
    }
}