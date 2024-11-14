import { NextResponse } from 'next/server';

export function middleware(request) {
    // ユーザーIDが無い場合はトップページにリダイレクト
    const userId = request.nextUrl.searchParams.get('user');
    if (!userId && !request.nextUrl.pathname.startsWith('/_next') && request.nextUrl.pathname !== '/') {
        return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
}