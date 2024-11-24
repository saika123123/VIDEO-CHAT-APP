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
    if (request.nextUrl.pathname.length > 1) {
        const userId = request.nextUrl.searchParams.get('user');
        // パスが/backgrounds/で始まらない場合のみリダイレクトを行う
        if (!userId && !request.nextUrl.pathname.startsWith('/backgrounds/')) {
            const roomId = request.nextUrl.pathname.slice(1);
            return NextResponse.redirect(new URL(`/?room=${roomId}`, request.url));
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