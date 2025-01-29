'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

function HomeContent() {
 const [name, setName] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState('');
 const router = useRouter();
 const searchParams = useSearchParams();
 const invitedRoomId = searchParams.get('room');

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

     const response = await fetch('/api/rooms', {
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

     router.push(`/${data.roomId}?user=${data.userId}`);

   } catch (err) {
     setError(err.message || 'エラーが発生しました。もう一度お試しください。');
   } finally {
     setIsLoading(false);
   }
 };

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

function Home() {
 return (
   <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-xl">Loading...</div></div>}>
     <HomeContent />
   </Suspense>
 );
}

export default Home;
