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

            // ユーザー名を処理
            const userName = data.name.trim();

            // 同じroomIdとuserIdの組み合わせで既存のユーザーを検索
            let user = await tx.user.findUnique({
                where: {
                    id: userName
                }
            });

            if (user) {
                // 既存のユーザーが存在する場合、roomIdを更新
                user = await tx.user.update({
                    where: {
                        id: userName
                    },
                    data: {
                        roomId: room.id
                    }
                });
            } else {
                // 新しいユーザーを作成
                user = await tx.user.create({
                    data: {
                        id: userName,
                        name: userName,
                        roomId: room.id
                    }
                });
            }

            return { room, user };
        });

        console.log('Created/Joined room and user:', result);

        return NextResponse.json({
            roomId: result.room.id,
            userId: result.user.id
        });

    } catch (error) {
        console.error('API Error:', error);

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