import prisma from '@/lib/db';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        // リクエストボディを取得
        const data = await req.json();
        console.log('Received request data:', data);  // デバッグログ追加

        if (!data?.name) {
            console.log('Validation failed: name is required');  // デバッグログ追加
            return NextResponse.json(
                { error: '名前は必須です' },
                { status: 400 }
            );
        }

        // トランザクションを使用してデータを作成
        const result = await prisma.$transaction(async (tx) => {
            // ルーム作成
            const room = await tx.room.create({
                data: {
                    id: nanoid(10),
                    backgroundUrl: '/backgrounds/default.jpg'
                }
            });
            console.log('Room created:', room);  // デバッグログ追加

            // ユーザー作成
            const user = await tx.user.create({
                data: {
                    name: data.name.trim(),
                    roomId: room.id
                }
            });
            console.log('User created:', user);  // デバッグログ追加

            return { room, user };
        });

        // 成功レスポンス
        const response = {
            roomId: result.room.id,
            userId: result.user.id
        };
        console.log('Sending response:', response);  // デバッグログ追加

        return NextResponse.json(response);

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'サーバーエラーが発生しました' },
            { status: 500 }
        );
    }
}