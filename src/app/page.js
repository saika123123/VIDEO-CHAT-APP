// src/app/page.js - 掲示板へのリンクを追加
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function HomeContent() {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedRoomId = searchParams.get('room');

  // QRコード経由の場合、自動的にユーザー名を生成
  useEffect(() => {
    const generateRandomAnimalName = () => {
      // 動物の名前の配列
      const animalNames = [
        'クマ', 'ウサギ', 'キツネ', 'タヌキ', 'ネコ', 'イヌ', 'パンダ', 
        'ゾウ', 'キリン', 'ライオン', 'トラ', 'サル', 'リス', 'ハムスター', 
        'ペンギン', 'カメ', 'コアラ', 'カンガルー', 'シカ', 'キツネ',
        'カバ', 'サイ', 'ヒツジ', 'ウマ', 'ヒヨコ', 'ニワトリ', 'アヒル'
      ];
      
      // 形容詞の配列
      const adjectives = [
        '茶色い', '白い', '黒い', '赤い', '青い', '黄色い', '緑の'
      ];
      
      // ランダムに形容詞と動物名を選ぶ
      const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
      const randomAnimal = animalNames[Math.floor(Math.random() * animalNames.length)];
      
      // 動物の名前を生成（例: 「元気なウサギ」）
      return `${randomAdjective}${randomAnimal}`;
    };
    
    if (invitedRoomId) {
      // QRコード経由の場合、ランダムに動物の名前を生成
      setName(generateRandomAnimalName());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitedRoomId]);

  const handleJoin = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const requestData = {
        name: name.trim()
      };

      if (invitedRoomId) {
        requestData.roomId = invitedRoomId;
      }

      const response = await fetch('/yoriai/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        cache: 'no-store'
      });

      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('サーバーからの応答を解析できませんでした');
      }

      if (!response.ok) {
        throw new Error(data.error || 'エラーが発生しました');
      }

      if (!data.roomId || !data.userId) {
        throw new Error('無効なレスポンス形式です');
      }

      router.push(`/yoriai/${data.roomId}?user=${data.userId}`);

    } catch (err) {
      setError(err.message || 'エラーが発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  // 掲示板ページへ移動
  const goToBoard = () => {
    router.push('/yoriai/board');
  };

  useEffect(() => {
    console.log('Current invitedRoomId:', invitedRoomId);
  }, [invitedRoomId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md mx-4">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">
          🏠 寄合ビデオ通話
        </h1>

        {invitedRoomId && (
          <div className="mb-6 p-4 bg-blue-100 text-blue-700 rounded-xl text-center text-lg">
            📧 招待された寄合に参加します
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-xl text-center text-lg">
            ⚠️ {error}
          </div>
        )}

        {!invitedRoomId && (
          <div className="mb-6">
            <button
              onClick={goToBoard}
              className="w-full py-4 bg-purple-600 text-white rounded-xl text-xl font-bold 
                       hover:bg-purple-700 transition-colors shadow-lg flex items-center justify-center gap-3"
            >
              <span className="text-2xl">📋</span>
              寄合掲示板を見る
            </button>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-xl font-bold mb-3 text-gray-700">
              お名前
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-4 border-2 border-gray-300 rounded-xl text-lg 
                       focus:border-blue-500 focus:outline-none"
              placeholder="名前を入力してください"
              disabled={isLoading}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className={`
             w-full py-4 text-white rounded-xl text-xl font-bold
             transition-colors shadow-lg flex items-center justify-center gap-3
             ${isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }
           `}
          >
            {isLoading ? (
              <>
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                接続中...
              </>
            ) : (
              <>
                <span className="text-2xl">🎥</span>
                {invitedRoomId ? '寄合に参加する' : '新しい寄合を始める'}
              </>
            )}
          </button>
        </form>

        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 p-4 bg-gray-100 rounded-xl text-sm text-gray-600">
            <p>Room ID: {invitedRoomId || 'なし'}</p>
            <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
            <p>Name: {name}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">読み込み中...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}

export default Home;