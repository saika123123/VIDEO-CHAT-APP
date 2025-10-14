// src/middleware.js
import { NextResponse } from 'next/server';

export function middleware(request) {
    
    // ★ 追加: 1. /?room=/minutes への誤ったリダイレクトを修正
    const roomQuery = request.nextUrl.searchParams.get('room');
    if (request.nextUrl.pathname === '/' && roomQuery === '/minutes') {
        // 正しいパス /yoriai/minutes にリダイレクト
        return NextResponse.redirect(new URL('/yoriai/minutes', request.url));
    }
    
    // 静的ファイルとAPIリクエストはスキップ
    if (
        request.nextUrl.pathname.startsWith('/api/') ||
        request.nextUrl.pathname.startsWith('/_next/') ||
        request.nextUrl.pathname.startsWith('/backgrounds/') ||  // 背景画像へのアクセスを許可
        request.nextUrl.pathname === '/' ||
        request.nextUrl.pathname === '/yoriai/board' ||  // 掲示板ページへのアクセスを許可
        request.nextUrl.pathname === '/board' ||  // 短縮パスも許可
        request.nextUrl.pathname === '/yoriai/minutes' || // ★ 2. 議事録一覧ページへのアクセスを許可
        request.nextUrl.pathname.startsWith('/yoriai/minutes/') // ★ 3. 議事録詳細ページへのアクセスを許可
    ) {
        return NextResponse.next();
    }

    // QRコードページへのアクセスは許可する
    if (request.nextUrl.pathname.includes('/qr/')) {
        return NextResponse.next();
    }

    // ルームIDが存在する場合のみユーザーIDをチェック
    if (request.nextUrl.pathname.length > 1) {
        const userId = request.nextUrl.searchParams.get('user');
        
        // パスが/backgrounds/で始まらない場合のみリダイレクトを行う
        if (!userId && !request.nextUrl.pathname.startsWith('/backgrounds/')) {
            const roomId = request.nextUrl.pathname.replace(/^\/yoriai\//, '');
            // 掲示板パス、QRコードパス、議事録パスでない場合のみリダイレクト
            if (roomId !== 'board' && !roomId.includes('qr') && !roomId.includes('minutes')) { // ★ 4. minutesパスをリダイレクト対象外に追加
                return NextResponse.redirect(new URL(`/yoriai/?room=${roomId}`, request.url));
            }
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