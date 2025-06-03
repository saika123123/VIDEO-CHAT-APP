// src/app/api/board/[id]/route.js
import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

// 寄合（部屋）の削除
export async function DELETE(request, context) {
    try {
        // パラメータを非同期で取得
        const params = await Promise.resolve(context.params);
        const { id: roomId } = params;

        if (!roomId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'ルームIDが必要です'
                },
                { status: 400 }
            );
        }

        console.log(`Attempting to delete room: ${roomId}`);

        // トランザクションを使用して関連データを安全に削除
        const result = await prisma.$transaction(async (tx) => {
            // 部屋の存在確認
            const room = await tx.room.findUnique({
                where: { id: roomId },
                include: {
                    users: true,
                    meetings: {
                        include: {
                            speeches: true
                        }
                    }
                }
            });

            if (!room) {
                throw new Error('指定された寄合が見つかりません');
            }

            // 関連データの削除（外部キー制約のため順序が重要）
            
            // 1. Speechesを削除
            for (const meeting of room.meetings) {
                await tx.speech.deleteMany({
                    where: { meetingId: meeting.id }
                });
            }

            // 2. Meetingsを削除
            await tx.meeting.deleteMany({
                where: { roomId: roomId }
            });

            // 3. Usersのroom関連付けを解除
            await tx.user.updateMany({
                where: { roomId: roomId },
                data: { roomId: null }
            });

            // 4. 最後にRoomを削除
            await tx.room.delete({
                where: { id: roomId }
            });

            return {
                deletedRoom: room,
                deletedMeetings: room.meetings.length,
                deletedSpeeches: room.meetings.reduce((total, meeting) => total + meeting.speeches.length, 0),
                updatedUsers: room.users.length
            };
        });

        console.log('Successfully deleted room and related data:', result);

        return NextResponse.json({
            success: true,
            message: '寄合を削除しました',
            details: {
                roomId: roomId,
                deletedMeetings: result.deletedMeetings,
                deletedSpeeches: result.deletedSpeeches,
                updatedUsers: result.updatedUsers
            }
        });

    } catch (error) {
        console.error('Failed to delete meeting:', error);

        const statusCode = error.message === '指定された寄合が見つかりません' ? 404 : 500;

        return NextResponse.json(
            {
                success: false,
                error: error.message || '寄合の削除に失敗しました',
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
            'Allow': 'DELETE, OPTIONS',
            'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
    });
}