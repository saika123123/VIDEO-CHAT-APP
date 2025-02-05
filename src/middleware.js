import { NextResponse } from 'next/server';

export function middleware(request) {
    // 静的ファイルとAPIリクエストはスキップ
    if (
        request.nextUrl.pathname.startsWith('/api/') ||
        request.nextUrl.pathname.startsWith('/_next/') ||
        request.nextUrl.pathname.startsWith('/backgrounds/') ||  // 背景画像へのアクセスを許可
        request.nextUrl.pathname === '/'
    ) {
        return NextResponse.next();
    }

    // ルームIDが存在する場合のみユーザーIDをチェック
    if (request.nextUrl.pathname.startsWith('/yoriai/') && request.nextUrl.pathname.length > 8) {
        const userId = request.nextUrl.searchParams.get('user');
        if (!userId && !request.nextUrl.pathname.startsWith('/yoriai/backgrounds/')) {
            const roomId = request.nextUrl.pathname.slice(8); // "/yoriai/" の長さ(8文字)を除去
            return NextResponse.redirect(new URL(`/yoriai/?room=${roomId}`, request.url));
        }
    }

    return NextResponse.next();
}

// マッチャーの設定を更新
export const config = {
    matcher: [
        // public内の静的ファイルを除外
        '/((?!api|_next/static|_next/image|favicon.ico|backgrounds/).*)'
    ]
};