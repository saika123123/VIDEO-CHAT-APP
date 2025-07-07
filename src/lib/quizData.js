// src/lib/quizData.js - クイズデータ管理

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

// クイズ問題データベース
export const QUIZ_QUESTIONS = {
    nostalgia: [
        {
            id: 'n001',
            question: '昭和の人気歌手「美空ひばり」の代表曲は？',
            options: ['津軽海峡冬景色', '川の流れのように', '津軽半島', '青春'],
            correctAnswer: 1,
            explanation: '「川の流れのように」は美空ひばりさんの代表曲の一つで、1989年にリリースされました。',
            difficulty: 'easy'
        },
        {
            id: 'n002',
            question: 'テレビ番組「8時だヨ!全員集合」で有名だったコメディグループは？',
            options: ['ドリフターズ', 'てんぷくトリオ', 'クレージーキャッツ', 'ハナ肇とクレージーキャッツ'],
            correctAnswer: 0,
            explanation: 'ドリフターズが1969年から1985年まで放送された人気番組でした。',
            difficulty: 'easy'
        },
        {
            id: 'n003',
            question: '昭和の名優「高倉健」が主演した代表的な映画は？',
            options: ['男はつらいよ', '幸福の黄色いハンカチ', '釣りバカ日誌', '学校'],
            correctAnswer: 1,
            explanation: '「幸福の黄色いハンカチ」は1977年の名作で、高倉健さんの代表作の一つです。',
            difficulty: 'normal'
        },
        {
            id: 'n004',
            question: '昭和のアニメ「サザエさん」の作者は？',
            options: ['手塚治虫', '長谷川町子', '藤子不二雄', '石ノ森章太郎'],
            correctAnswer: 1,
            explanation: '長谷川町子さんが作者で、1946年から新聞連載が始まりました。',
            difficulty: 'normal'
        },
        {
            id: 'n005',
            question: '昭和時代の人気テレビドラマ「水戸黄門」で黄門様を長年演じた俳優は？',
            options: ['東野英治郎', '西村晃', '佐野浅夫', '石坂浩二'],
            correctAnswer: 0,
            explanation: '東野英治郎さんが初代水戸黄門として親しまれました。',
            difficulty: 'hard'
        }
    ],
    geography: [
        {
            id: 'g001',
            question: '富士山があるのは静岡県と、もう一つはどこの県？',
            options: ['神奈川県', '山梨県', '長野県', '愛知県'],
            correctAnswer: 1,
            explanation: '富士山は静岡県と山梨県にまたがる日本最高峰の山です。',
            difficulty: 'easy'
        },
        {
            id: 'g002',
            question: '北海道の特産品として有名でないものは？',
            options: ['カニ', 'じゃがいも', 'みかん', '昆布'],
            correctAnswer: 2,
            explanation: 'みかんは温暖な地域の特産品で、北海道では生産されていません。',
            difficulty: 'easy'
        },
        {
            id: 'g003',
            question: '京都の有名な観光地「清水寺」がある地区は？',
            options: ['嵐山', '祇園', '東山', '金閣寺'],
            correctAnswer: 2,
            explanation: '清水寺は京都市東山区にある有名な仏教寺院です。',
            difficulty: 'normal'
        },
        {
            id: 'g004',
            question: '日本で一番面積が小さい都道府県は？',
            options: ['東京都', '大阪府', '香川県', '沖縄県'],
            correctAnswer: 2,
            explanation: '香川県は日本で最も面積が小さい県で、うどんでも有名です。',
            difficulty: 'normal'
        },
        {
            id: 'g005',
            question: '日本三景に含まれていない場所は？',
            options: ['松島', '天橋立', '宮島', '富士山'],
            correctAnswer: 3,
            explanation: '日本三景は松島（宮城）、天橋立（京都）、宮島（広島）です。',
            difficulty: 'hard'
        }
    ],
    proverbs: [
        {
            id: 'p001',
            question: '「猿も木から○○」何が入るでしょう？',
            options: ['飛ぶ', '落ちる', '降りる', '跳ねる'],
            correctAnswer: 1,
            explanation: '「猿も木から落ちる」は、上手な人でも失敗することがあるという意味です。',
            difficulty: 'easy'
        },
        {
            id: 'p002',
            question: '「石の上にも○年」何年でしょう？',
            options: ['一年', '二年', '三年', '五年'],
            correctAnswer: 2,
            explanation: '「石の上にも三年」は、どんなに辛くても辛抱強く続ければ成功するという意味です。',
            difficulty: 'easy'
        },
        {
            id: 'p003',
            question: '「七転び○起き」何が入るでしょう？',
            options: ['六', '七', '八', '九'],
            correctAnswer: 2,
            explanation: '「七転び八起き」は、何度失敗しても諦めずに立ち上がることの大切さを表します。',
            difficulty: 'normal'
        },
        {
            id: 'p004',
            question: '「花より○○」何が入るでしょう？',
            options: ['桜', '団子', '美人', '香り'],
            correctAnswer: 1,
            explanation: '「花より団子」は、風流より実利を重んじることを表します。',
            difficulty: 'normal'
        },
        {
            id: 'p005',
            question: '「急がば○○」何が入るでしょう？',
            options: ['走れ', '回れ', 'ゆっくり', '止まれ'],
            correctAnswer: 1,
            explanation: '「急がば回れ」は、急ぐときこそ安全確実な方法を取るべきという意味です。',
            difficulty: 'hard'
        }
    ],
    seasonal: [
        {
            id: 's001',
            question: '春の七草に含まれていないものはどれ？',
            options: ['せり', 'なずな', 'たんぽぽ', 'すずな'],
            correctAnswer: 2,
            explanation: 'たんぽぽは春の七草には含まれていません。春の七草は1月7日に食べる習慣があります。',
            difficulty: 'easy'
        },
        {
            id: 's002',
            question: '夏の風物詩でないものは？',
            options: ['花火', '風鈴', '雪だるま', 'かき氷'],
            correctAnswer: 2,
            explanation: '雪だるまは冬の風物詩です。夏は暑さを涼しくする物が風物詩になります。',
            difficulty: 'easy'
        },
        {
            id: 's003',
            question: '秋の味覚として有名でないものは？',
            options: ['栗', '柿', 'さんま', 'スイカ'],
            correctAnswer: 3,
            explanation: 'スイカは夏の代表的な果物です。秋は収穫の季節で様々な食材が旬を迎えます。',
            difficulty: 'normal'
        },
        {
            id: 's004',
            question: '冬至に食べる習慣があるものは？',
            options: ['かぼちゃ', 'スイカ', 'きゅうり', 'トマト'],
            correctAnswer: 0,
            explanation: '冬至にかぼちゃを食べると風邪をひかないという言い伝えがあります。',
            difficulty: 'normal'
        },
        {
            id: 's005',
            question: '「立春」はいつ頃？',
            options: ['1月上旬', '2月上旬', '3月上旬', '4月上旬'],
            correctAnswer: 1,
            explanation: '立春は2月4日頃で、暦の上で春が始まる日とされています。',
            difficulty: 'hard'
        }
    ],
    history: [
        {
            id: 'h001',
            question: '東京オリンピックが初めて開催されたのは？',
            options: ['1962年', '1964年', '1966年', '1968年'],
            correctAnswer: 1,
            explanation: '1964年の東京オリンピックは戦後復興の象徴的な出来事でした。',
            difficulty: 'easy'
        },
        {
            id: 'h002',
            question: '新幹線が開通したのは？',
            options: ['1962年', '1964年', '1966年', '1968年'],
            correctAnswer: 1,
            explanation: '1964年10月1日に東海道新幹線が開業し、「夢の超特急」と呼ばれました。',
            difficulty: 'normal'
        },
        {
            id: 'h003',
            question: '大阪万博が開催されたのは？',
            options: ['1968年', '1970年', '1972年', '1974年'],
            correctAnswer: 1,
            explanation: '1970年の大阪万博は「人類の進歩と調和」をテーマに開催されました。',
            difficulty: 'normal'
        },
        {
            id: 'h004',
            question: '昭和から平成に変わったのは？',
            options: ['1988年', '1989年', '1990年', '1991年'],
            correctAnswer: 1,
            explanation: '1989年1月8日に昭和天皇が崩御され、平成時代が始まりました。',
            difficulty: 'hard'
        },
        {
            id: 'h005',
            question: '戦後復興の象徴とされた建物は？',
            options: ['国会議事堂', '東京タワー', '皇居', '日本武道館'],
            correctAnswer: 1,
            explanation: '1958年に完成した東京タワーは戦後復興と高度経済成長の象徴でした。',
            difficulty: 'hard'
        }
    ],
    food: [
        {
            id: 'f001',
            question: '「おせち料理」を食べるのはいつ？',
            options: ['お盆', 'お正月', '節分', 'ひな祭り'],
            correctAnswer: 1,
            explanation: 'おせち料理は正月に食べる伝統的な日本料理です。',
            difficulty: 'easy'
        },
        {
            id: 'f002',
            question: '大阪名物として有名でないものは？',
            options: ['たこ焼き', 'お好み焼き', '明石焼き', 'もんじゃ焼き'],
            correctAnswer: 3,
            explanation: 'もんじゃ焼きは東京の下町の名物料理です。',
            difficulty: 'easy'
        },
        {
            id: 'f003',
            question: '「きりたんぽ」はどこの郷土料理？',
            options: ['青森県', '秋田県', '山形県', '岩手県'],
            correctAnswer: 1,
            explanation: 'きりたんぽは秋田県の代表的な郷土料理です。',
            difficulty: 'normal'
        },
        {
            id: 'f004',
            question: '「ちゃんこ鍋」と関係が深いスポーツは？',
            options: ['柔道', '相撲', '剣道', '空手'],
            correctAnswer: 1,
            explanation: 'ちゃんこ鍋は相撲部屋で力士が食べる料理として有名です。',
            difficulty: 'normal'
        },
        {
            id: 'f005',
            question: '「讃岐うどん」で有名な県は？',
            options: ['徳島県', '香川県', '愛媛県', '高知県'],
            correctAnswer: 1,
            explanation: '香川県は讃岐うどんで有名で、日本一面積が小さい県でもあります。',
            difficulty: 'hard'
        }
    ]
};

// クイズ関連のユーティリティ関数
export const getQuestionsByCategory = (category, difficulty = null, count = 5) => {
    const questions = QUIZ_QUESTIONS[category] || [];

    let filteredQuestions = questions;
    if (difficulty) {
        filteredQuestions = questions.filter(q => q.difficulty === difficulty);
    }

    // ランダムに指定数の問題を選択
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

    // ランダムに指定数の問題を選択
    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
};

export const getRandomQuestions = (count = 5) => {
    return getMixedQuestions(null, null, count);
};

// クイズルームの状態管理
export const QUIZ_ROOM_STATUS = {
    WAITING: 'waiting',     // 参加者待ち
    STARTING: 'starting',   // 開始準備中
    IN_PROGRESS: 'in_progress', // 進行中
    QUESTION_TIME: 'question_time', // 問題表示中
    ANSWER_TIME: 'answer_time',     // 回答時間
    RESULT_TIME: 'result_time',     // 結果表示中
    FINISHED: 'finished'    // 終了
};

// スコア計算
export const calculateScore = (answers, questions) => {
    let correctCount = 0;
    let totalScore = 0;

    answers.forEach((answer, index) => {
        const question = questions[index];
        if (question && answer !== null && answer === question.correctAnswer) {
            correctCount++;
            // 難易度に応じて得点を変える
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