// src/components/QuizExcelManager.js
'use client';
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

// Excelテンプレートのダウンロード用データ
const TEMPLATE_DATA = [
    {
        id: 'sample001',
        category: 'nostalgia',
        question: '昭和の人気歌手「美空ひばり」の代表曲は？',
        option1: '津軽海峡冬景色',
        option2: '川の流れのように',
        option3: '津軽半島',
        option4: '青春',
        correctAnswer: 2,
        explanation: '「川の流れのように」は美空ひばりさんの代表曲の一つで、1989年にリリースされました。',
        difficulty: 'easy'
    }
];

// カテゴリのマッピング
const CATEGORY_MAP = {
    'nostalgia': '昔なつかし',
    'geography': '日本地理',
    'proverbs': 'ことわざ',
    'seasonal': '季節',
    'history': '歴史',
    'food': '料理・食べ物'
};

const DIFFICULTY_MAP = {
    'easy': 'やさしい',
    'normal': 'ふつう',
    'hard': 'むずかしい'
};

export default function QuizExcelManager() {
    const [uploadedData, setUploadedData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const fileInputRef = useRef(null);

    // Excelテンプレートをダウンロード
    const downloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(TEMPLATE_DATA);

        const wscols = [
            { wch: 15 }, { wch: 15 }, { wch: 50 }, { wch: 30 }, { wch: 30 },
            { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 50 }, { wch: 10 }
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'クイズデータ');

        const infoData = [
            ['カテゴリID', 'カテゴリ名'],
            ['nostalgia', '昔なつかし'],
            ['geography', '日本地理'],
            ['proverbs', 'ことわざ'],
            ['seasonal', '季節'],
            ['history', '歴史'],
            ['food', '料理・食べ物'],
            ['', ''],
            ['難易度ID', '難易度名'],
            ['easy', 'やさしい'],
            ['normal', 'ふつう'],
            ['hard', 'むずかしい'],
            ['', ''],
            ['正解番号', '説明'],
            ['1', '選択肢1が正解'],
            ['2', '選択肢2が正解'],
            ['3', '選択肢3が正解'],
            ['4', '選択肢4が正解']
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
        XLSX.utils.book_append_sheet(wb, wsInfo, '説明');

        XLSX.writeFile(wb, 'クイズテンプレート.xlsx');
    };

    // Excelファイルを読み込み
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);

            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            const validatedData = validateQuizData(jsonData);

            setUploadedData(validatedData);
            setSuccess(`${validatedData.length}件のクイズデータを読み込みました`);
        } catch (err) {
            setError(`ファイルの読み込みに失敗しました: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // データの検証
    const validateQuizData = (data) => {
        const validated = [];
        const errors = [];

        data.forEach((row, index) => {
            const rowNum = index + 2;

            if (!row.id) {
                errors.push(`行${rowNum}: IDが入力されていません`);
                return;
            }
            if (!row.category || !Object.keys(CATEGORY_MAP).includes(row.category)) {
                errors.push(`行${rowNum}: 無効なカテゴリです`);
                return;
            }
            if (!row.question) {
                errors.push(`行${rowNum}: 問題文が入力されていません`);
                return;
            }
            if (!row.option1 || !row.option2 || !row.option3 || !row.option4) {
                errors.push(`行${rowNum}: 選択肢が不足しています`);
                return;
            }
            if (!row.correctAnswer || row.correctAnswer < 1 || row.correctAnswer > 4) {
                errors.push(`行${rowNum}: 正解番号が無効です（1-4を入力）`);
                return;
            }
            if (!row.difficulty || !Object.keys(DIFFICULTY_MAP).includes(row.difficulty)) {
                errors.push(`行${rowNum}: 無効な難易度です`);
                return;
            }

            validated.push({
                id: row.id,
                category: row.category,
                question: row.question,
                options: [row.option1, row.option2, row.option3, row.option4],
                correctAnswer: row.correctAnswer - 1,
                explanation: row.explanation || '',
                difficulty: row.difficulty
            });
        });

        if (errors.length > 0) {
            throw new Error(errors.join('\n'));
        }

        return validated;
    };

    // データをサーバーに保存
    const saveToServer = async () => {
        if (!uploadedData || uploadedData.length === 0) {
            setError('保存するデータがありません');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/yoriai/api/quiz/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: uploadedData })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'サーバーエラー');
            }

            setSuccess('クイズデータを保存しました！');

            setTimeout(() => {
                setSuccess(null);
            }, 3000);
        } catch (err) {
            setError(`保存に失敗しました: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 現在のデータをExcelでダウンロード
    const downloadCurrentData = () => {
        if (!uploadedData || uploadedData.length === 0) {
            setError('ダウンロードするデータがありません');
            return;
        }

        const exportData = uploadedData.map(item => ({
            id: item.id,
            category: item.category,
            question: item.question,
            option1: item.options[0],
            option2: item.options[1],
            option3: item.options[2],
            option4: item.options[3],
            correctAnswer: item.correctAnswer + 1,
            explanation: item.explanation,
            difficulty: item.difficulty
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'クイズデータ');
        XLSX.writeFile(wb, `クイズデータ_${new Date().toLocaleDateString('ja-JP')}.xlsx`);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">
                            🎯 クイズ管理画面
                        </h1>
                        <p className="text-lg text-gray-600">
                            Excelファイルでクイズの問題を管理できます
                        </p>
                    </div>

                    <div className="mb-8 bg-blue-50 rounded-xl p-6">
                        <h2 className="text-xl font-bold text-blue-800 mb-4">📋 使い方</h2>
                        <ol className="space-y-2 text-blue-700">
                            <li>1. まず「テンプレートをダウンロード」ボタンからExcelファイルをダウンロード</li>
                            <li>2. Excelファイルに問題を入力（カテゴリや難易度は説明シートを参照）</li>
                            <li>3. 入力が終わったらファイルを保存</li>
                            <li>4. 「ファイルを選択」ボタンから保存したファイルをアップロード</li>
                            <li>5. 内容を確認して「サーバーに保存」ボタンをクリック</li>
                        </ol>
                    </div>

                    <div className="flex flex-wrap gap-4 mb-8">
                        <button
                            onClick={downloadTemplate}
                            className="px-6 py-3 bg-green-600 text-white rounded-xl text-lg font-bold 
                       hover:bg-green-700 transition-colors shadow-lg flex items-center gap-2"
                        >
                            <span>📥</span>
                            テンプレートをダウンロード
                        </button>

                        <div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isLoading}
                                className="px-6 py-3 bg-blue-600 text-white rounded-xl text-lg font-bold 
                         hover:bg-blue-700 transition-colors shadow-lg flex items-center gap-2
                         disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                <span>📁</span>
                                ファイルを選択
                            </button>
                        </div>

                        {uploadedData && uploadedData.length > 0 && (
                            <>
                                <button
                                    onClick={saveToServer}
                                    disabled={isLoading}
                                    className="px-6 py-3 bg-purple-600 text-white rounded-xl text-lg font-bold 
                           hover:bg-purple-700 transition-colors shadow-lg flex items-center gap-2
                           disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                    <span>💾</span>
                                    サーバーに保存
                                </button>

                                <button
                                    onClick={downloadCurrentData}
                                    className="px-6 py-3 bg-gray-600 text-white rounded-xl text-lg font-bold 
                           hover:bg-gray-700 transition-colors shadow-lg flex items-center gap-2"
                                >
                                    <span>📤</span>
                                    現在のデータをダウンロード
                                </button>
                            </>
                        )}
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-100 border-2 border-red-300 text-red-700 rounded-xl">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">❌</span>
                                <pre className="whitespace-pre-wrap">{error}</pre>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="mb-6 p-4 bg-green-100 border-2 border-green-300 text-green-700 rounded-xl">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">✅</span>
                                {success}
                            </div>
                        </div>
                    )}

                    {isLoading && (
                        <div className="mb-6 p-4 bg-blue-100 border-2 border-blue-300 text-blue-700 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                処理中...
                            </div>
                        </div>
                    )}

                    {uploadedData && uploadedData.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                📊 読み込んだデータ（{uploadedData.length}件）
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="border p-2 text-left">ID</th>
                                            <th className="border p-2 text-left">カテゴリ</th>
                                            <th className="border p-2 text-left">難易度</th>
                                            <th className="border p-2 text-left">問題文</th>
                                            <th className="border p-2 text-center">正解</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {uploadedData.slice(0, 10).map((item, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="border p-2">{item.id}</td>
                                                <td className="border p-2">
                                                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                                                        {CATEGORY_MAP[item.category]}
                                                    </span>
                                                </td>
                                                <td className="border p-2">
                                                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                                                        {DIFFICULTY_MAP[item.difficulty]}
                                                    </span>
                                                </td>
                                                <td className="border p-2">{item.question}</td>
                                                <td className="border p-2 text-center">
                                                    {item.correctAnswer + 1}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {uploadedData.length > 10 && (
                                    <p className="text-center text-gray-600 mt-4">
                                        他 {uploadedData.length - 10} 件のデータがあります
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}