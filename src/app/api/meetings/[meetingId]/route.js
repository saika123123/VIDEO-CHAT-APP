import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PUT(req, context) {
    try {
        const { meetingId } = context.params; // awaitは不要です
        const { endTime } = await req.json();

        console.log(`Updating meeting ${meetingId} with endTime:`, endTime);

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
                details: error.message
            },
            { status: 500 }
        );
    }
}