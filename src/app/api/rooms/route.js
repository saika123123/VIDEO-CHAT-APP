import prisma from '@/lib/db';
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
            let roomId = data.roomId;

            // 既存の部屋に参加する場合
            if (roomId) {
                room = await tx.room.findUnique({
                    where: { id: roomId }
                });

                if (!room) {
                    throw new Error('指定された部屋が見つかりません');
                }
            } else {
                // ルームID未指定の場合は簡単な番号を生成
                let counter = 1;
                do {
                    roomId = `room${counter}`;
                    room = await tx.room.findUnique({
                        where: { id: roomId }
                    });
                    counter++;
                } while (room);

                // 新しい部屋を作成
                room = await tx.room.create({
                    data: {
                        id: roomId,
                        backgroundUrl: '/backgrounds/default.jpg'
                    }
                });
            }

            // ユーザーを作成または取得
            let user;
            const userName = data.name.trim();

            // 同じ名前のユーザーが存在するかチェック
            const existingUser = await tx.user.findFirst({
                where: {
                    name: userName,
                    roomId: room.id
                }
            });

            if (existingUser) {
                throw new Error('この名前は既にこの部屋で使用されています');
            }

            // 新しいユーザーを作成
            user = await tx.user.create({
                data: {
                    id: userName,
                    name: userName,
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

        if (error.message === 'この名前は既にこの部屋で使用されています') {
            return NextResponse.json(
                { error: error.message },
                { status: 409 }
            );
        }

        if (error.message === '指定された部屋が見つかりません') {
            return NextResponse.json(
                { error: error.message },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'サーバーエラーが発生しました' },
            { status: 500 }
        );
    }
}