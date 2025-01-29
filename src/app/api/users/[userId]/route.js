import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request, context) {
    const params = await Promise.resolve(context.params);

    try {
        const { userId } = params;

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });

        if (!user) {
            // ユーザーが見つからない場合は、新しいユーザーを作成
            const newUser = await prisma.user.create({
                data: {
                    id: userId,
                    name: userId // ユーザーIDをそのまま名前として使用
                }
            });
            return NextResponse.json({ name: newUser.name });
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
