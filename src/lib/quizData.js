// src/lib/quizData.js - 更新版（動的データ読み込み対応）

import fs from 'fs';
import path from 'path';

// クイズカテゴリの定義
export const QUIZ_CATEGORIES = {
    nostalgia: {
        id: 'nostalgia',
        name: '昔なつかし',
        icon: '🎵',
        description: '昭和の歌手、映画、テレビ番組など'
    },
    geography: {
        id: 'geography',
        name: '日本地理',
        icon: '🗾',
        description: '都道府県、観光地、特産品など'
    },
    proverbs: {
        id: 'proverbs',
        name: 'ことわざ',
        icon: '📚',
        description: '日本の伝統的なことわざや格言'
    },
    seasonal: {
        id: 'seasonal',
        name: '季節',
        icon: '🌸',
        description: '年中行事、旬の食べ物、季節の話題'
    },
    history: {
        id: 'history',
        name: '歴史',
        icon: '📜',
        description: '戦後復興、高度経済成長期の出来事'
    },
    food: {
        id: 'food',
        name: '料理・食べ物',
        icon: '🍱',
        description: '郷土料理、昔ながらの食べ物'
    }
};

// 難易度設定
export const DIFFICULTY_LEVELS = {
    easy: { id: 'easy', name: 'やさしい', icon: '😊', timeLimit: 45 },
    normal: { id: 'normal', name: 'ふつう', icon: '🤔', timeLimit: 30 },
    hard: { id: 'hard', name: 'むずかしい', icon: '🧠', timeLimit: 20 }
};

// デフォルトのクイズ問題データ
const DEFAULT_QUIZ_QUESTIONS = {
    nostalgia: [
        {
            id: 'n001',
            question: '昭和の人気歌手「美空ひばり」の代表曲は？',
            options: ['津軽海峡冬景色', '川の流れのように', '津軽半島', '青春'],
            correctAnswer: 1,
            explanation: '「川の流れのように」は美空ひばりさんの代表曲の一つで、1989年にリリースされました。',
            difficulty: 'easy'
        }
        // ... 他のデフォルト問題
    ],
    // ... 他のカテゴリ
};

// 動的にクイズデータを読み込む関数
function loadQuizQuestions() {
    try {
        // Excelからアップロードされたデータのパス
        const uploadedDataPath = path.join(process.cwd(), 'src/lib/quizDataFromExcel.json');
        
        // ファイルが存在するか確認
        if (fs.existsSync(uploadedDataPath)) {
            const data = fs.readFileSync(uploadedDataPath, 'utf-8');
            const uploadedQuestions = JSON.parse(data);
            
            // アップロードされたデータとデフォルトをマージ
            // （アップロードされたデータを優先）
            return {
                ...DEFAULT_QUIZ_QUESTIONS,
                ...uploadedQuestions
            };
        }
    } catch (error) {
        console.error('Error loading uploaded quiz data:', error);
    }
    
    // エラー時またはファイルが存在しない場合はデフォルトを返す
    return DEFAULT_QUIZ_QUESTIONS;
}

// エクスポート用のクイズ問題データ
export const QUIZ_QUESTIONS = loadQuizQuestions();

// クイズルームの状態管理
export const QUIZ_ROOM_STATUS = {
    WAITING: 'waiting',
    STARTING: 'starting',
    IN_PROGRESS: 'in_progress',
    QUESTION_TIME: 'question_time',
    ANSWER_TIME: 'answer_time',
    RESULT_TIME: 'result_time',
    FINISHED: 'finished'
};

// クイズ関連のユーティリティ関数
export const getQuestionsByCategory = (category, difficulty = null, count = 5) => {
    const questions = QUIZ_QUESTIONS[category] || [];

    let filteredQuestions = questions;
    if (difficulty) {
        filteredQuestions = questions.filter(q => q.difficulty === difficulty);
    }

    const shuffled = [...filteredQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

export const getMixedQuestions = (categories = null, difficulty = null, count = 10) => {
    const categoriesToUse = categories || Object.keys(QUIZ_QUESTIONS);
    const allQuestions = [];

    categoriesToUse.forEach(category => {
        if (QUIZ_QUESTIONS[category]) {
            const questions = QUIZ_QUESTIONS[category];
            if (difficulty) {
                allQuestions.push(...questions.filter(q => q.difficulty === difficulty));
            } else {
                allQuestions.push(...questions);
            }
        }
    });

    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

export const getRandomQuestions = (count = 5) => {
    return getMixedQuestions(null, null, count);
};

// スコア計算
export const calculateScore = (answers, questions) => {
    let correctCount = 0;
    let totalScore = 0;

    answers.forEach((answer, index) => {
        const question = questions[index];
        if (question && answer !== null && answer === question.correctAnswer) {
            correctCount++;
            switch (question.difficulty) {
                case 'easy': totalScore += 10; break;
                case 'normal': totalScore += 15; break;
                case 'hard': totalScore += 20; break;
                default: totalScore += 10;
            }
        }
    });

    return {
        correctCount,
        totalQuestions: questions.length,
        totalScore,
        percentage: Math.round((correctCount / questions.length) * 100)
    };
};