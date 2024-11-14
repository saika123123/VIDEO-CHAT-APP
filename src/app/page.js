'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleJoin = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('Sending request with name:', name.trim());

      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: name.trim() 
        })
      });

      // レスポンスのステータスとヘッダーをログ出力
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      const data = await response.json();
      console.log('Received response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'エラーが発生しました');
      }

      if (!data.roomId || !data.userId) {
        console.log('Invalid response format:', data);
        throw new Error('無効なレスポンス形式です');
      }

      // URLパラメータをエンコード
      const queryParams = new URLSearchParams({
        user: data.userId
      }).toString();

      // 成功時の遷移
      router.push(`/${data.roomId}?${queryParams}`);

    } catch (err) {
      console.error('Error details:', err);
      setError(err.message || 'エラーが発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          ビデオ通話に参加
        </h1>
        
        {/* エラーメッセージ表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-center">
            {error}
          </div>
        )}

        {/* 参加フォーム */}
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-lg mb-2">
              お名前
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border rounded-lg text-lg bg-white"
              placeholder="名前を入力してください"
              disabled={isLoading}
              required
              autoComplete="name"
              aria-label="お名前"
            />
          </div>

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className={`
              w-full py-3 text-white rounded-lg text-lg font-semibold
              transition-colors duration-200
              ${isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }
            `}
            aria-busy={isLoading}
          >
            {isLoading ? '接続中...' : '参加する'}
          </button>
        </form>

        {/* 補足情報 */}
        <p className="mt-4 text-sm text-gray-600 text-center">
          ビデオとマイクの使用許可が必要です
        </p>
      </div>
    </div>
  );
}