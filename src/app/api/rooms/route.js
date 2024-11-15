import prisma from '@/lib/db';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const data = await req.json();
        console.log('Received request:', data);

        if (!data?.name) {
            return NextResponse.json(
                { error: '名前は必須です' },
                { status: 400 }
            );
        }

        // トランザクションで処理
        const result = await prisma.$transaction(async (tx) => {
            let room;

            // 既存の部屋に参加する場合
            if (data.roomId) {
                room = await tx.room.findUnique({
                    where: { id: data.roomId }
                });

                if (!room) {
                    throw new Error('指定された部屋が見つかりません');
                }
            } else {
                // 新しい部屋を作成
                room = await tx.room.create({
                    data: {
                        id: nanoid(10),
                        backgroundUrl: '/backgrounds/default.jpg'
                    }
                });
            }

            // ユーザーを作成
            const user = await tx.user.create({
                data: {
                    id: nanoid(10),
                    name: data.name.trim(),
                    roomId: room.id
                }
            });

            return { room, user };
        });

        console.log('Created/Joined room and user:', result);

        return NextResponse.json({
            roomId: result.room.id,
            userId: result.user.id
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: error.message || 'サーバーエラーが発生しました' },
            { status: 500 }
        );
    }
}