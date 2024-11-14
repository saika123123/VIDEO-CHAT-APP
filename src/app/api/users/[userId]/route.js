import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req, { params }) {
    try {
        const { userId } = params;

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });

        if (!user) {
            return NextResponse.json(
                { error: 'ユーザーが見つかりません' },
                { status: 404 }
            );
        }

        return NextResponse.json({ name: user.name });

    } catch (error) {
        console.error('User fetch error:', error);
        return NextResponse.json(
            { error: 'サーバーエラーが発生しました' },
            { status: 500 }
        );
    }
}