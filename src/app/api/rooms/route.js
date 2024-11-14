import prisma from '@/lib/db';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

export const runtime = 'edge'; // エッジランタイムを使用

export async function POST(req) {
    try {
        const data = await req.json();

        if (!data || !data.name) {
            return new NextResponse(
                JSON.stringify({ error: '名前は必須です' }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
        }

        const roomId = nanoid(10);
        const room = await prisma.room.create({
            data: { id: roomId }
        });

        const user = await prisma.user.create({
            data: {
                name: data.name,
                roomId: room.id
            }
        });

        return new NextResponse(
            JSON.stringify({
                roomId: room.id,
                userId: user.id
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

    } catch (error) {
        console.error('API Error:', error);
        return new NextResponse(
            JSON.stringify({ error: 'サーバーエラーが発生しました' }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    }
}