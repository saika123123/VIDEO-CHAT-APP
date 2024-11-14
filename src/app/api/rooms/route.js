import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

// 新しいPrismaClientインスタンスを作成
const prisma = new PrismaClient();

export async function POST(req) {
    try {
        // リクエストボディを取得
        const data = await req.json();

        if (!data?.name) {
            return NextResponse.json({
                error: '名前は必須です'
            }, {
                status: 400
            });
        }

        // ルームを作成
        const room = await prisma.room.create({
            data: {
                id: nanoid(10)
            }
        });

        // ユーザーを作成
        const user = await prisma.user.create({
            data: {
                name: data.name,
                roomId: room.id
            }
        });

        // 成功レスポンス
        return NextResponse.json({
            roomId: room.id,
            userId: user.id
        }, {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });

    } catch (error) {
        console.error('API Error:', error);

        return NextResponse.json({
            error: 'サーバーエラーが発生しました'
        }, {
            status: 500
        });
    } finally {
        await prisma.$disconnect();
    }
}

// GET メソッドのテスト用エンドポイント
export async function GET() {
    return NextResponse.json({
        status: 'ok'
    }, {
        status: 200
    });
}