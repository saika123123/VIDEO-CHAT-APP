import './globals.css'

export const metadata = {
  title: 'ビデオ通話アプリ',
  description: '高齢者向けのシンプルなビデオ通話サービス',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
