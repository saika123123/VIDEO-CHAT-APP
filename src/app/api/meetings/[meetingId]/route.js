import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PUT(request, context) {
    const params = await Promise.resolve(context.params);

    try {
        const { meetingId } = params;
        const { endTime } = await request.json();

        console.log(`Updating meeting ${meetingId} with endTime:`, endTime);

        // ミーティングの存在確認
        const existingMeeting = await prisma.meeting.findUnique({
            where: { id: meetingId }
        });

        if (!existingMeeting) {
            return NextResponse.json(
                { error: 'Meeting not found' },
                { status: 404 }
            );
        }

        // ミーティングの更新
        const meeting = await prisma.meeting.update({
            where: {
                id: meetingId
            },
            data: {
                endTime: new Date(endTime),
                isActive: false
            }
        });

        console.log('Updated meeting:', meeting);

        return NextResponse.json({
            id: meeting.id,
            endTime: meeting.endTime,
            message: 'Meeting ended successfully'
        });

    } catch (error) {
        console.error('Failed to update meeting:', error);
        return NextResponse.json(
            {
                error: 'Failed to update meeting',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

export async function GET(request, context) {
    const params = await Promise.resolve(context.params);

    try {
        const { meetingId } = params;

        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
            include: {
                speeches: {
                    include: {
                        user: true
                    },
                    orderBy: {
                        timestamp: 'asc'
                    }
                }
            }
        });

        if (!meeting) {
            return NextResponse.json(
                { error: 'Meeting not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(meeting);

    } catch (error) {
        console.error('Failed to fetch meeting:', error);
        return NextResponse.json(
            {
                error: 'Failed to fetch meeting',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}