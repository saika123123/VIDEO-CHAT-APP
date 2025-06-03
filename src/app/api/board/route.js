// src/app/api/board/route.js
import prisma from '@/lib/db';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

// 寄合一覧の取得
export async function GET() {
    try {
        // 全ての部屋を取得（作成日時順）
        const rooms = await prisma.room.findMany({
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                backgroundUrl: true,
                createdAt: true
            }
        });

        // ローカルストレージの情報を含めた形式で返す
        const meetings = rooms.map(room => ({
            roomId: room.id,
            name: null, // フロントエンドでローカルストレージから取得
            schedule: null, // フロントエンドでローカルストレージから取得
            createdAt: room.createdAt,
            backgroundUrl: room.backgroundUrl
        }));

        return NextResponse.json({
            success: true,
            meetings
        });

    } catch (error) {
        console.error('Failed to fetch meetings:', error);
        return NextResponse.json(
            {
                success: false,
                error: '寄合一覧の取得に失敗しました',
                details: error.message
            },
            { status: 500 }
        );
    }
}

// 新しい寄合の作成
export async function POST(request) {
    try {
        const body = await request.json();
        const { name, schedule } = body;

        if (!name || !name.trim()) {
            return NextResponse.json(
                {
                    success: false,
                    error: '寄合の名前は必須です'
                },
                { status: 400 }
            );
        }

        // セキュアなランダムIDを生成
        let roomId;
        let attempts = 0;
        const maxAttempts = 10;

        do {
            roomId = nanoid(12);
            
            // 既存のIDとの衝突をチェック
            const existingRoom = await prisma.room.findUnique({
                where: { id: roomId }
            });
            
            if (!existingRoom) break;
            
            attempts++;
            
            if (attempts >= maxAttempts) {
                throw new Error('ルームIDの生成に失敗しました。しばらく後に再試行してください。');
            }
        } while (attempts < maxAttempts);

        // 新しい部屋を作成
        const room = await prisma.room.create({
            data: {
                id: roomId,
                backgroundUrl: '/yoriai/backgrounds/default.jpg'
            }
        });

        console.log('Created new meeting room:', room);

        return NextResponse.json({
            success: true,
            roomId: room.id,
            name: name.trim(),
            schedule: schedule?.trim() || null,
            createdAt: room.createdAt,
            message: '新しい寄合を作成しました'
        });

    } catch (error) {
        console.error('Failed to create meeting:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || '寄合の作成に失敗しました',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            { status: 500 }
        );
    }
}