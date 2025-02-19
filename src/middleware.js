import { NextResponse } from 'next/server';

export function middleware(request) {
    const basePath = '/yoriai';

    // 静的ファイルとAPIリクエストはスキップ
    if (
        request.nextUrl.pathname.startsWith(`${basePath}/api/`) ||
        request.nextUrl.pathname.startsWith(`${basePath}/_next/`) ||
        request.nextUrl.pathname.startsWith(`${basePath}/backgrounds/`) ||
        request.nextUrl.pathname === `${basePath}/` ||
        request.nextUrl.pathname === basePath
    ) {
        return NextResponse.next();
    }

    // ルームIDが存在する場合のみユーザーIDをチェック
    if (request.nextUrl.pathname.length > basePath.length + 1) {
        const userId = request.nextUrl.searchParams.get('user');
        // パスが/backgrounds/で始まらない場合のみリダイレクトを行う
        if (!userId && !request.nextUrl.pathname.startsWith(`${basePath}/backgrounds/`)) {
            const roomId = request.nextUrl.pathname.slice(basePath.length + 1);
            return NextResponse.redirect(new URL(`${basePath}/?room=${roomId}`, request.url));
        }
    }

    return NextResponse.next();
}

// マッチャーの設定を更新
export const config = {
    matcher: [
        // public内の静的ファイルを除外
        '/yoriai/((?!api|_next/static|_next/image|favicon.ico|backgrounds/).*)'
    ]
};