// src/app/api/quiz/upload/route.js
import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';

// クイズデータを保存するファイルパス
const QUIZ_DATA_FILE = path.join(process.cwd(), 'src/lib/quizDataFromExcel.json');

export async function POST(req) {
    try {
        const body = await req.json();
        const { questions } = body;

        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return NextResponse.json(
                { error: 'クイズデータが不正です' },
                { status: 400 }
            );
        }

        // データの検証
        const validatedQuestions = validateQuestions(questions);

        // カテゴリごとに整理
        const organizedData = organizeQuestionsByCategory(validatedQuestions);

        // JSONファイルとして保存
        await fs.writeFile(
            QUIZ_DATA_FILE,
            JSON.stringify(organizedData, null, 2),
            'utf-8'
        );

        // quizData.jsファイルも更新（オプション）
        await updateQuizDataFile(organizedData);

        return NextResponse.json({
            success: true,
            message: `${questions.length}件のクイズデータを保存しました`,
            categories: Object.keys(organizedData),
            totalQuestions: questions.length
        });

    } catch (error) {
        console.error('Quiz upload error:', error);
        return NextResponse.json(
            { error: `クイズデータの保存に失敗しました: ${error.message}` },
            { status: 500 }
        );
    }
}

// クイズデータの検証
function validateQuestions(questions) {
    const validCategories = ['nostalgia', 'geography', 'proverbs', 'seasonal', 'history', 'food'];
    const validDifficulties = ['easy', 'normal', 'hard'];

    return questions.map((q, index) => {
        // カテゴリの検証
        if (!validCategories.includes(q.category)) {
            throw new Error(`問題${index + 1}: 無効なカテゴリ「${q.category}」`);
        }

        // 難易度の検証
        if (!validDifficulties.includes(q.difficulty)) {
            throw new Error(`問題${index + 1}: 無効な難易度「${q.difficulty}」`);
        }

        // 必須フィールドの検証
        if (!q.id || !q.question || !q.options || q.options.length !== 4) {
            throw new Error(`問題${index + 1}: 必須フィールドが不足しています`);
        }

        // 正解番号の検証
        if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer > 3) {
            throw new Error(`問題${index + 1}: 正解番号が無効です`);
        }

        return q;
    });
}

// カテゴリごとに問題を整理
function organizeQuestionsByCategory(questions) {
    const organized = {};

    questions.forEach(q => {
        if (!organized[q.category]) {
            organized[q.category] = [];
        }
        organized[q.category].push(q);
    });

    return organized;
}

// quizData.jsファイルを更新
async function updateQuizDataFile(organizedData) {
    const quizDataPath = path.join(process.cwd(), 'src/lib/quizData.js');

    // 既存のファイルを読み込み
    let fileContent = await fs.readFile(quizDataPath, 'utf-8');

    // QUIZ_QUESTIONSの部分を更新
    const newQuestionsData = `export const QUIZ_QUESTIONS = ${JSON.stringify(organizedData, null, 4)};`;

    // 正規表現でQUIZ_QUESTIONSの定義部分を置換
    fileContent = fileContent.replace(
        /export const QUIZ_QUESTIONS = \{[\s\S]*?\};/,
        newQuestionsData
    );

    // ファイルを書き戻し
    await fs.writeFile(quizDataPath, fileContent, 'utf-8');
}

// GET: 現在のクイズデータを取得
export async function GET() {
    try {
        // JSONファイルが存在する場合は読み込み
        try {
            const data = await fs.readFile(QUIZ_DATA_FILE, 'utf-8');
            const questions = JSON.parse(data);

            // フラット化して返す
            const flatQuestions = [];
            Object.entries(questions).forEach(([category, categoryQuestions]) => {
                categoryQuestions.forEach(q => {
                    flatQuestions.push({ ...q, category });
                });
            });

            return NextResponse.json({
                success: true,
                questions: flatQuestions,
                totalCount: flatQuestions.length
            });
        } catch (err) {
            // ファイルが存在しない場合は元のquizData.jsから読み込み
            const { QUIZ_QUESTIONS } = await import('@/lib/quizData');

            const flatQuestions = [];
            Object.entries(QUIZ_QUESTIONS).forEach(([category, categoryQuestions]) => {
                categoryQuestions.forEach(q => {
                    flatQuestions.push({ ...q, category });
                });
            });

            return NextResponse.json({
                success: true,
                questions: flatQuestions,
                totalCount: flatQuestions.length,
                source: 'original'
            });
        }
    } catch (error) {
        console.error('Error fetching quiz data:', error);
        return NextResponse.json(
            { error: 'クイズデータの取得に失敗しました' },
            { status: 500 }
        );
    }
}