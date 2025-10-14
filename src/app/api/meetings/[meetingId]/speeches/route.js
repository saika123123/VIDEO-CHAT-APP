// src/app/api/meetings/[meetingId]/speeches/route.js

import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

// 特定の会議の議事録（Speech）を、ルームIDで権限チェックして取得
export async function GET(request, context) {
    const params = await Promise.resolve(context.params);
    const { meetingId } = params;

    const { searchParams } = new URL(request.url);
    const currentRoomId = searchParams.get('currentRoomId'); // ★ 現在のルームIDを取得

    if (!meetingId || !currentRoomId) {
        return NextResponse.json(
            { error: '必要な情報が不足しています (Meeting ID または Room ID)' },
            { status: 400 }
        );
    }

    try {
        // 会議情報と、その会議がどのルームに紐づいているかを確認
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
            select: { 
                roomId: true, 
                title: true, 
                startTime: true, 
                endTime: true 
            }
        });

        if (!meeting) {
            return NextResponse.json(
                { error: 'Meeting not found' },
                { status: 404 }
            );
        }
        
        // ★ 権限チェック: リクエストで渡されたルームIDと会議が紐づくルームIDが一致するか確認
        if (currentRoomId !== meeting.roomId) {
            return NextResponse.json(
                { error: 'この会議の議事録を閲覧する権限がありません。ルームを移動してください。' },
                { status: 403 }
            );
        }

        // 権限がある場合のみ、議事録を取得
        const speeches = await prisma.speech.findMany({
            where: { meetingId: meetingId },
            select: {
                id: true,
                content: true,
                timestamp: true,
                userId: true,
                user: { select: { name: true } }
            },
            orderBy: { timestamp: 'asc' }
        });

        return NextResponse.json({
            success: true,
            meetingInfo: {
                title: meeting.title,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                roomId: meeting.roomId
            },
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