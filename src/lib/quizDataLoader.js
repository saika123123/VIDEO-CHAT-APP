// src/lib/quizDataLoader.js
import fs from 'fs/promises';
import path from 'path';
import { QUIZ_QUESTIONS as DEFAULT_QUESTIONS } from './quizData';

// サーバーサイドでクイズデータを読み込む
export async function loadQuizQuestions() {
    try {
        // Excelからアップロードされたデータがあるか確認
        const uploadedDataPath = path.join(process.cwd(), 'src/lib/quizDataFromExcel.json');

        try {
            const data = await fs.readFile(uploadedDataPath, 'utf-8');
            const uploadedQuestions = JSON.parse(data);

            // アップロードされたデータとデフォルトデータをマージ
            // （アップロードされたデータを優先）
            return {
                ...DEFAULT_QUESTIONS,
                ...uploadedQuestions
            };
        } catch (err) {
            // ファイルが存在しない場合はデフォルトを使用
            return DEFAULT_QUESTIONS;
        }
    } catch (error) {
        console.error('Error loading quiz questions:', error);
        return DEFAULT_QUESTIONS;
    }
}

// クライアントサイド用のAPI
export async function fetchQuizQuestions() {
    try {
        const response = await fetch('/yoriai/api/quiz/upload');
        if (!response.ok) {
            throw new Error('Failed to fetch quiz questions');
        }

        const data = await response.json();

        // APIレスポンスをQUIZ_QUESTIONS形式に変換
        const organized = {};
        data.questions.forEach(q => {
            if (!organized[q.category]) {
                organized[q.category] = [];
            }
            organized[q.category].push(q);
        });

        return organized;
    } catch (error) {
        console.error('Error fetching quiz questions:', error);
        // エラー時はデフォルトを返す
        return DEFAULT_QUESTIONS;
    }
}