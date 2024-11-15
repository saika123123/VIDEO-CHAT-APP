'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedRoomId = searchParams.get('room');

  const handleJoin = async (e) => {
    e.preventDefault();
    console.log('Form submitted');

    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // リクエストデータの準備
      const requestData = {
        name: name.trim()
      };

      // 招待された部屋のIDがある場合は追加
      if (invitedRoomId) {
        requestData.roomId = invitedRoomId;
      }

      console.log('Sending request:', requestData);

      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        cache: 'no-store'
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Raw response:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      console.log('Parsed response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'エラーが発生しました');
      }

      if (!data.roomId || !data.userId) {
        console.log('Invalid response format:', data);
        throw new Error('無効なレスポンス形式です');
      }

      // 成功時の遷移
      const newUrl = `/${data.roomId}?user=${data.userId}`;
      console.log('Navigating to:', newUrl);
      router.push(newUrl);

    } catch (err) {
      console.error('Error details:', err);
      setError(err.message || 'エラーが発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  // debug: マウント時とinvitedRoomIdの変更時にログを出力
  useEffect(() => {
    console.log('Current invitedRoomId:', invitedRoomId);
  }, [invitedRoomId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">
          ビデオ通話に参加
        </h1>

        {invitedRoomId && (
          <div className="mb-4 p-3 bg-blue-100 text-blue-700 rounded-lg text-center">
            招待された部屋に参加します
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-center">
            {error}
          </div>
        )}

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
              className="w-full p-3 border rounded-lg text-lg"
              placeholder="名前を入力してください"
              disabled={isLoading}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className={`
              w-full py-3 text-white rounded-lg text-lg font-semibold
              transition-colors
              ${isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }
            `}
          >
            {isLoading ? '接続中...' : '参加する'}
          </button>
        </form>

        {/* デバッグ情報（開発時のみ表示） */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-4 bg-gray-100 rounded text-sm">
            <p>Room ID: {invitedRoomId || 'なし'}</p>
            <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
            <p>Name: {name}</p>
          </div>
        )}
      </div>
    </div>
  );
}