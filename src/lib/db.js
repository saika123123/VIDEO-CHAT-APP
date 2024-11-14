import { PrismaClient } from '@prisma/client';

// グローバルスコープでPrismaClientのインスタンスを保持
let prisma;

// 開発環境でのホットリロード時に複数のインスタンスが作成されるのを防ぐ
if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient({
        log: ['query', 'error', 'warn'],
    });
} else {
    if (!global.prisma) {
        global.prisma = new PrismaClient({
            log: ['query', 'error', 'warn'],
        });
    }
    prisma = global.prisma;
}

export default prisma;