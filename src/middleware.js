import { NextResponse } from 'next/server';

export function middleware(request) {
    // APIリクエストはスキップ
    if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    // 静的ファイルはスキップ
    if (request.nextUrl.pathname.startsWith('/_next/')) {
        return NextResponse.next();
    }

    // ルートページはスキップ
    if (request.nextUrl.pathname === '/') {
        return NextResponse.next();
    }

    // ルームIDが存在する場合はユーザーIDのチェックのみ行う
    if (request.nextUrl.pathname.length > 1) {  // ルームIDが存在する
        const userId = request.nextUrl.searchParams.get('user');
        if (!userId) {
            // ルームIDはそのままで、ルートページにリダイレクト
            const roomId = request.nextUrl.pathname.slice(1);
            return NextResponse.redirect(new URL(`/?room=${roomId}`, request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};