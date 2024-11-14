import prisma from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // データベース接続テスト
        const roomCount = await prisma.room.count();
        const userCount = await prisma.user.count();
        
        return NextResponse.json({
            status: 'ok',
            connection: 'success',
            stats: {
                rooms: roomCount,
                users: userCount
            }
        });
    } catch (error) {
        console.error('Database Error:', error);
        
        return NextResponse.json({
            status: 'error',
            message: error.message,
            connection: 'failed'
        }, { status: 500 });
    }
}