import { NextResponse } from 'next/server';

export function middleware(request) {
    // APIルートは除外
    if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    // _nextで始まるリクエストも除外（静的ファイル等）
    if (request.nextUrl.pathname.startsWith('/_next/')) {
        return NextResponse.next();
    }

    // ルートパスは除外
    if (request.nextUrl.pathname === '/') {
        return NextResponse.next();
    }

    // ビデオチャットルーム用のパスの場合のみユーザーIDをチェック
    const userId = request.nextUrl.searchParams.get('user');
    if (!userId) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

// ミドルウェアを適用するパスを設定
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};