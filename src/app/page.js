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
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim()
        }),
        cache: 'no-store'
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Response parsing error:', parseError);
        console.log('Raw response:', await response.text());
        throw new Error('レスポンスの解析に失敗しました');
      }

      if (!response.ok) {
        throw new Error(data.error || 'エラーが発生しました');
      }

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
            className={`w-full py-3 text-white rounded-lg text-lg font-semibold
              ${isLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} 
              transition-colors`}
          >
            {isLoading ? '接続中...' : '参加する'}
          </button>
        </form>
      </div>
    </div>
  );
}