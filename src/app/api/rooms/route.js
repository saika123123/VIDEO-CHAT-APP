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
                // 新しい部屋を作成する場合 - セキュアなランダムIDを生成
                let attempts = 0;
                const maxAttempts = 10; // 無限ループを防ぐ
                
                do {
                    // nanoidを使用してセキュアなランダムIDを生成
                    // 長さ12文字のランダムID（URLセーフな文字を使用）
                    roomId = nanoid(12);
                    
                    // 既存のIDとの衝突をチェック
                    room = await tx.room.findUnique({
                        where: { id: roomId }
                    });
                    
                    attempts++;
                    
                    if (attempts >= maxAttempts) {
                        throw new Error('部屋IDの生成に失敗しました。しばらく後に再試行してください。');
                    }
                } while (room);

                console.log(`Generated secure room ID: ${roomId}`);

                // 新しい部屋を作成
                room = await tx.room.create({
                    data: {
                        id: roomId,
                        backgroundUrl: '/yoriai/backgrounds/default.jpg'
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