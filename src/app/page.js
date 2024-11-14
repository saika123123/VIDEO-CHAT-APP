'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleJoin = async (e) => {
    e.preventDefault(); // フォームのデフォルトの送信を防ぐ

    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // APIをテストする
      const testResponse = await fetch('/api/rooms', { method: 'GET' });
      if (!testResponse.ok) {
        throw new Error('APIサーバーに接続できません');
      }

      // メインのリクエスト
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'エラーが発生しました');
      }

      const data = await response.json();
      if (data.roomId && data.userId) {
        router.push(`/${data.roomId}?user=${data.userId}`);
      } else {
        throw new Error('無効なレスポンス形式です');
      }

    } catch (err) {
      console.error('Error:', err);
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
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-center">
            {error}
          </div>
        )}
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-lg mb-2">お名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border rounded-lg text-lg"
              placeholder="名前を入力してください"
              disabled={isLoading}
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="w-full py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold
              hover:bg-blue-700 transition-colors disabled:bg-gray-400"
          >
            {isLoading ? '接続中...' : '参加する'}
          </button>
        </form>
      </div>
    </div>
  );
}