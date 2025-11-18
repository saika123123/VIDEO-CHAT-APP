import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { text, targetLang = 'en' } = await request.json();
        
        if (!text) {
            return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 });
        }

        // Google Translate API (GTX - 非公式) を使用
        // 注意: 本番環境や商用利用の場合は、公式のGoogle Cloud Translation APIやDeepL APIを使用してください。
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('翻訳サービスへの接続に失敗しました');
        }
        
        const data = await response.json();
        
        // レスポンス構造から翻訳テキストを結合
        const translatedText = data[0] ? data[0].map(item => item[0]).join('') : '';
        
        return NextResponse.json({ 
            originalText: text,
            translatedText: translatedText 
        });

    } catch (error) {
        console.error('Translation error:', error);
        return NextResponse.json({ error: '翻訳に失敗しました' }, { status: 500 });
    }
}