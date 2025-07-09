// src/lib/quizData.js - クイズデータ管理（大幅拡張版）

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
        // やさしい問題
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
            question: '昭和のアニメ「サザエさん」の作者は？',
            options: ['手塚治虫', '長谷川町子', '藤子不二雄', '石ノ森章太郎'],
            correctAnswer: 1,
            explanation: '長谷川町子さんが作者で、1946年から新聞連載が始まりました。',
            difficulty: 'easy'
        },
        {
            id: 'n004',
            question: '昭和の人気アニメ「鉄腕アトム」の作者は？',
            options: ['手塚治虫', '藤子不二雄', '石ノ森章太郎', '赤塚不二夫'],
            correctAnswer: 0,
            explanation: '手塚治虫さんが生み出した代表作で、日本初の本格的テレビアニメです。',
            difficulty: 'easy'
        },
        {
            id: 'n005',
            question: '「およげ！たいやきくん」を歌った歌手は？',
            options: ['子門真人', '水前寺清子', '橋幸夫', '西城秀樹'],
            correctAnswer: 0,
            explanation: '1975年に大ヒットし、子門真人さんが歌いました。',
            difficulty: 'easy'
        },
        {
            id: 'n006',
            question: '昭和の人気歌手「石原裕次郎」の代表曲は？',
            options: ['津軽海峡冬景色', '夜霧よ今夜もありがとう', '青春', '贈る言葉'],
            correctAnswer: 1,
            explanation: '「夜霧よ今夜もありがとう」は石原裕次郎さんの代表曲の一つです。',
            difficulty: 'easy'
        },
        // ふつう問題
        {
            id: 'n007',
            question: '昭和の名優「高倉健」が主演した代表的な映画は？',
            options: ['男はつらいよ', '幸福の黄色いハンカチ', '釣りバカ日誌', '学校'],
            correctAnswer: 1,
            explanation: '「幸福の黄色いハンカチ」は1977年の名作で、高倉健さんの代表作の一つです。',
            difficulty: 'normal'
        },
        {
            id: 'n008',
            question: '昭和時代の人気テレビドラマ「水戸黄門」で黄門様を長年演じた俳優は？',
            options: ['東野英治郎', '西村晃', '佐野浅夫', '石坂浩二'],
            correctAnswer: 0,
            explanation: '東野英治郎さんが初代水戸黄門として親しまれました。',
            difficulty: 'normal'
        },
        {
            id: 'n009',
            question: '昭和の人気歌手「森進一」の代表曲は？',
            options: ['津軽海峡冬景色', '襟裳岬', '青春', '津軽水郷'],
            correctAnswer: 1,
            explanation: '「襟裳岬」は森進一さんの代表曲で、1974年にリリースされました。',
            difficulty: 'normal'
        },
        {
            id: 'n010',
            question: '昭和のテレビ番組「ひょっこりひょうたん島」の脚本を書いたのは？',
            options: ['井上ひさし', '筒井康隆', '星新一', '小松左京'],
            correctAnswer: 0,
            explanation: '井上ひさしさんが脚本を手がけた人気人形劇でした。',
            difficulty: 'normal'
        },
        {
            id: 'n011',
            question: '昭和の人気映画「男はつらいよ」シリーズの主人公の名前は？',
            options: ['車寅次郎', '車虎太郎', '車寅太郎', '車虎次郎'],
            correctAnswer: 0,
            explanation: '車寅次郎（フーテンの寅さん）として親しまれました。',
            difficulty: 'normal'
        },
        {
            id: 'n012',
            question: '昭和の人気歌手「山口百恵」の引退コンサートで歌った最後の曲は？',
            options: ['津軽海峡冬景色', 'ありがとうあなた', 'さくらんぼの実る頃', '一恵'],
            correctAnswer: 1,
            explanation: '1980年の引退コンサートで「ありがとうあなた」を歌いました。',
            difficulty: 'normal'
        },
        // むずかしい問題
        {
            id: 'n013',
            question: '昭和の映画監督「黒澤明」が手がけた作品でないものは？',
            options: ['七人の侍', '用心棒', '東京物語', '隠し砦の三悪人'],
            correctAnswer: 2,
            explanation: '「東京物語」は小津安二郎監督の代表作です。',
            difficulty: 'hard'
        },
        {
            id: 'n014',
            question: '昭和の作家「太宰治」の代表作でないものは？',
            options: ['人間失格', '斜陽', '雪国', '津軽'],
            correctAnswer: 2,
            explanation: '「雪国」は川端康成の代表作です。',
            difficulty: 'hard'
        },
        {
            id: 'n015',
            question: '昭和の漫画「巨人の星」の主人公の父親の職業は？',
            options: ['大工', '左官', '鳶職', '畳職人'],
            correctAnswer: 1,
            explanation: '星一徹は左官職人として描かれていました。',
            difficulty: 'hard'
        },
        {
            id: 'n016',
            question: '昭和の歌手「中島みゆき」のデビュー曲は？',
            options: ['時代', 'ひとり上手', 'アザミ嬢のララバイ', 'アンプラフド'],
            correctAnswer: 3,
            explanation: '1975年に「アンプラフド」でデビューしました。',
            difficulty: 'hard'
        },
        {
            id: 'n017',
            question: '昭和のテレビドラマ「太陽にほえろ！」で「マカロニ」刑事を演じた俳優は？',
            options: ['松田優作', '沖雅也', '萩原健一', '小野寺昭'],
            correctAnswer: 3,
            explanation: '小野寺昭さんが「マカロニ」刑事を演じました。',
            difficulty: 'hard'
        }
    ],
    geography: [
        // やさしい問題
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
            question: '日本で一番面積が小さい都道府県は？',
            options: ['東京都', '大阪府', '香川県', '沖縄県'],
            correctAnswer: 2,
            explanation: '香川県は日本で最も面積が小さい県で、うどんでも有名です。',
            difficulty: 'easy'
        },
        {
            id: 'g004',
            question: '沖縄県の県庁所在地は？',
            options: ['那覇市', '沖縄市', '宜野湾市', '浦添市'],
            correctAnswer: 0,
            explanation: '那覇市が沖縄県の県庁所在地です。',
            difficulty: 'easy'
        },
        {
            id: 'g005',
            question: '青森県の特産品として有名なものは？',
            options: ['みかん', 'りんご', 'ぶどう', 'もも'],
            correctAnswer: 1,
            explanation: '青森県はりんごの生産量日本一で有名です。',
            difficulty: 'easy'
        },
        {
            id: 'g006',
            question: '東京スカイツリーがある区は？',
            options: ['台東区', '墨田区', '江東区', '葛飾区'],
            correctAnswer: 1,
            explanation: '東京スカイツリーは墨田区にあります。',
            difficulty: 'easy'
        },
        // ふつう問題
        {
            id: 'g007',
            question: '京都の有名な観光地「清水寺」がある地区は？',
            options: ['嵐山', '祇園', '東山', '金閣寺'],
            correctAnswer: 2,
            explanation: '清水寺は京都市東山区にある有名な仏教寺院です。',
            difficulty: 'normal'
        },
        {
            id: 'g008',
            question: '日本三景に含まれていない場所は？',
            options: ['松島', '天橋立', '宮島', '富士山'],
            correctAnswer: 3,
            explanation: '日本三景は松島（宮城）、天橋立（京都）、宮島（広島）です。',
            difficulty: 'normal'
        },
        {
            id: 'g009',
            question: '熊本県のマスコットキャラクター「くまモン」が生まれた年は？',
            options: ['2008年', '2009年', '2010年', '2011年'],
            correctAnswer: 2,
            explanation: 'くまモンは2010年に誕生しました。',
            difficulty: 'normal'
        },
        {
            id: 'g010',
            question: '岐阜県の白川郷で有名な建築様式は？',
            options: ['入母屋造り', '合掌造り', '寄棟造り', '切妻造り'],
            correctAnswer: 1,
            explanation: '白川郷は合掌造りの集落で世界遺産に登録されています。',
            difficulty: 'normal'
        },
        {
            id: 'g011',
            question: '鹿児島県の桜島は何という湾にある？',
            options: ['鹿児島湾', '薩摩湾', '錦江湾', '大隅湾'],
            correctAnswer: 2,
            explanation: '桜島は錦江湾にある活火山です。',
            difficulty: 'normal'
        },
        {
            id: 'g012',
            question: '石川県金沢市の有名な庭園は？',
            options: ['兼六園', '偕楽園', '後楽園', '栗林公園'],
            correctAnswer: 0,
            explanation: '兼六園は日本三名園の一つです。',
            difficulty: 'normal'
        },
        // むずかしい問題
        {
            id: 'g013',
            question: '本州で最も面積が大きい県は？',
            options: ['岩手県', '福島県', '長野県', '新潟県'],
            correctAnswer: 0,
            explanation: '岩手県は本州最大の面積を誇ります。',
            difficulty: 'hard'
        },
        {
            id: 'g014',
            question: '日本の最南端の島は？',
            options: ['与那国島', '波照間島', '沖ノ鳥島', '南鳥島'],
            correctAnswer: 2,
            explanation: '沖ノ鳥島が日本の最南端です。',
            difficulty: 'hard'
        },
        {
            id: 'g015',
            question: '富山県の薬売りで有名な「越中○○」の○○は？',
            options: ['富山', '薬売り', '万金丹', '反魂丹'],
            correctAnswer: 2,
            explanation: '越中万金丹（えっちゅうまんきんたん）として有名でした。',
            difficulty: 'hard'
        },
        {
            id: 'g016',
            question: '四国で最も人口が多い県は？',
            options: ['香川県', '愛媛県', '徳島県', '高知県'],
            correctAnswer: 1,
            explanation: '愛媛県が四国で最も人口が多い県です。',
            difficulty: 'hard'
        },
        {
            id: 'g017',
            question: '日本で最も深い湖は？',
            options: ['琵琶湖', '田沢湖', '摩周湖', '十和田湖'],
            correctAnswer: 1,
            explanation: '田沢湖は水深423.4mで日本最深の湖です。',
            difficulty: 'hard'
        }
    ],
    proverbs: [
        // やさしい問題
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
            question: '「花より○○」何が入るでしょう？',
            options: ['桜', '団子', '美人', '香り'],
            correctAnswer: 1,
            explanation: '「花より団子」は、風流より実利を重んじることを表します。',
            difficulty: 'easy'
        },
        {
            id: 'p004',
            question: '「犬も歩けば○○に当たる」何が入るでしょう？',
            options: ['幸運', '棒', '災難', '人'],
            correctAnswer: 1,
            explanation: '「犬も歩けば棒に当たる」は、出歩けば思わぬ災難に遭うという意味です。',
            difficulty: 'easy'
        },
        {
            id: 'p005',
            question: '「早起きは○○の得」何が入るでしょう？',
            options: ['一文', '三文', '五文', '十文'],
            correctAnswer: 1,
            explanation: '「早起きは三文の得」は、早起きすると良いことがあるという意味です。',
            difficulty: 'easy'
        },
        {
            id: 'p006',
            question: '「鬼に○○」何が入るでしょう？',
            options: ['角', '金棒', '牙', '力'],
            correctAnswer: 1,
            explanation: '「鬼に金棒」は、強いものがさらに強くなることを表します。',
            difficulty: 'easy'
        },
        // ふつう問題
        {
            id: 'p007',
            question: '「七転び○起き」何が入るでしょう？',
            options: ['六', '七', '八', '九'],
            correctAnswer: 2,
            explanation: '「七転び八起き」は、何度失敗しても諦めずに立ち上がることの大切さを表します。',
            difficulty: 'normal'
        },
        {
            id: 'p008',
            question: '「急がば○○」何が入るでしょう？',
            options: ['走れ', '回れ', 'ゆっくり', '止まれ'],
            correctAnswer: 1,
            explanation: '「急がば回れ」は、急ぐときこそ安全確実な方法を取るべきという意味です。',
            difficulty: 'normal'
        },
        {
            id: 'p009',
            question: '「能ある鷹は○○を隠す」何が入るでしょう？',
            options: ['羽', '爪', '嘴', '目'],
            correctAnswer: 1,
            explanation: '「能ある鷹は爪を隠す」は、本当に優秀な人は自分の才能をひけらかさないという意味です。',
            difficulty: 'normal'
        },
        {
            id: 'p010',
            question: '「井の中の蛙○○を知らず」何が入るでしょう？',
            options: ['世界', '大海', '空', '陸'],
            correctAnswer: 1,
            explanation: '「井の中の蛙大海を知らず」は、狭い見識で物事を判断してはいけないという意味です。',
            difficulty: 'normal'
        },
        {
            id: 'p011',
            question: '「類は○○を呼ぶ」何が入るでしょう？',
            options: ['類', '友', '仲間', '似た者'],
            correctAnswer: 1,
            explanation: '「類は友を呼ぶ」は、似た者同士が自然と集まることを表します。',
            difficulty: 'normal'
        },
        {
            id: 'p012',
            question: '「○○は身を助ける」何が入るでしょう？',
            options: ['知識', '技術', '芸', '勉強'],
            correctAnswer: 2,
            explanation: '「芸は身を助ける」は、身につけた技能は生活の支えになるという意味です。',
            difficulty: 'normal'
        },
        // むずかしい問題
        {
            id: 'p013',
            question: '「柳に○○」何が入るでしょう？',
            options: ['雪', '風', '雨', '花'],
            correctAnswer: 1,
            explanation: '「柳に風」は、相手の攻撃を受け流すことを表します。',
            difficulty: 'hard'
        },
        {
            id: 'p014',
            question: '「○○の耳に念仏」何が入るでしょう？',
            options: ['犬', '猫', '馬', '牛'],
            correctAnswer: 2,
            explanation: '「馬の耳に念仏」は、何を言っても効果がないことを表します。',
            difficulty: 'hard'
        },
        {
            id: 'p015',
            question: '「覆水○○に返らず」何が入るでしょう？',
            options: ['器', '盆', '皿', '桶'],
            correctAnswer: 1,
            explanation: '「覆水盆に返らず」は、一度してしまったことは取り返しがつかないという意味です。',
            difficulty: 'hard'
        },
        {
            id: 'p016',
            question: '「○○に真珠」何が入るでしょう？',
            options: ['犬', '猫', '豚', '馬'],
            correctAnswer: 2,
            explanation: '「豚に真珠」は、価値のわからない者に貴重なものを与えても無駄という意味です。',
            difficulty: 'hard'
        },
        {
            id: 'p017',
            question: '「○○も過ぎれば毒となる」何が入るでしょう？',
            options: ['薬', '水', '食事', '運動'],
            correctAnswer: 0,
            explanation: '「薬も過ぎれば毒となる」は、良いものでも度を過ぎると害になるという意味です。',
            difficulty: 'hard'
        }
    ],
    seasonal: [
        // やさしい問題
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
            difficulty: 'easy'
        },
        {
            id: 's004',
            question: '冬至に食べる習慣があるものは？',
            options: ['かぼちゃ', 'スイカ', 'きゅうり', 'トマト'],
            correctAnswer: 0,
            explanation: '冬至にかぼちゃを食べると風邪をひかないという言い伝えがあります。',
            difficulty: 'easy'
        },
        {
            id: 's005',
            question: '七夕の日はいつ？',
            options: ['7月6日', '7月7日', '7月8日', '8月7日'],
            correctAnswer: 1,
            explanation: '七夕は7月7日です。織姫と彦星の伝説で有名です。',
            difficulty: 'easy'
        },
        {
            id: 's006',
            question: 'お月見をするのはいつ？',
            options: ['7月', '8月', '9月', '10月'],
            correctAnswer: 2,
            explanation: '十五夜のお月見は9月（旧暦8月15日）に行われます。',
            difficulty: 'easy'
        },
        // ふつう問題
        {
            id: 's007',
            question: '「立春」はいつ頃？',
            options: ['1月上旬', '2月上旬', '3月上旬', '4月上旬'],
            correctAnswer: 1,
            explanation: '立春は2月4日頃で、暦の上で春が始まる日とされています。',
            difficulty: 'normal'
        },
        {
            id: 's008',
            question: '端午の節句で食べる伝統的な食べ物は？',
            options: ['桜餅', '柏餅', 'ちまき', 'おはぎ'],
            correctAnswer: 2,
            explanation: '端午の節句（5月5日）にはちまきや柏餅を食べる習慣があります。',
            difficulty: 'normal'
        },
        {
            id: 's009',
            question: '秋の彼岸に食べる伝統的なお菓子は？',
            options: ['桜餅', 'ぼたもち', 'おはぎ', 'かしわもち'],
            correctAnswer: 2,
            explanation: '秋の彼岸にはおはぎ、春の彼岸にはぼたもちを食べる習慣があります。',
            difficulty: 'normal'
        },
        {
            id: 's010',
            question: '夏の土用の丑の日に食べるものは？',
            options: ['うなぎ', 'そうめん', 'かき氷', 'すいか'],
            correctAnswer: 0,
            explanation: '土用の丑の日にうなぎを食べると夏バテしないという習慣があります。',
            difficulty: 'normal'
        },
        {
            id: 's011',
            question: '節分で豆をまく理由は？',
            options: ['豊作を願う', '鬼を追い払う', '幸運を呼ぶ', '健康を祈る'],
            correctAnswer: 1,
            explanation: '「鬼は外、福は内」と言いながら豆をまいて鬼を追い払います。',
            difficulty: 'normal'
        },
        {
            id: 's012',
            question: '七五三のお参りをする年齢でないものは？',
            options: ['3歳', '5歳', '6歳', '7歳'],
            correctAnswer: 2,
            explanation: '七五三は3歳、5歳、7歳の子供の成長を祝う行事です。',
            difficulty: 'normal'
        },
        // むずかしい問題
        {
            id: 's013',
            question: '二十四節気の中で、昼と夜の長さが同じになる日は？',
            options: ['春分・秋分', '夏至・冬至', '立春・立秋', '大暑・大寒'],
            correctAnswer: 0,
            explanation: '春分の日と秋分の日は昼と夜の長さがほぼ同じになります。',
            difficulty: 'hard'
        },
        {
            id: 's014',
            question: '旧暦で「葉月」と呼ばれるのは何月？',
            options: ['6月', '7月', '8月', '9月'],
            correctAnswer: 2,
            explanation: '葉月は旧暦の8月で、木の葉が落ちる季節という意味です。',
            difficulty: 'hard'
        },
        {
            id: 's015',
            question: '「小寒」と「大寒」のうち、より寒いとされるのは？',
            options: ['小寒', '大寒', '同じ', '年による'],
            correctAnswer: 1,
            explanation: '大寒は一年で最も寒い時期とされています。',
            difficulty: 'hard'
        },
        {
            id: 's016',
            question: '春の花「桜」の開花を表す気象用語は？',
            options: ['桜前線', '開花宣言', '満開宣言', '桜開花線'],
            correctAnswer: 0,
            explanation: '桜前線は桜の開花時期が南から北へ移っていく様子を表します。',
            difficulty: 'hard'
        },
        {
            id: 's017',
            question: '「雑節」に含まれないものは？',
            options: ['節分', '彼岸', '土用', '立春'],
            correctAnswer: 3,
            explanation: '立春は二十四節気の一つで、雑節ではありません。',
            difficulty: 'hard'
        }
    ],
    history: [
        // やさしい問題
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
            difficulty: 'easy'
        },
        {
            id: 'h003',
            question: '戦後復興の象徴とされた建物は？',
            options: ['国会議事堂', '東京タワー', '皇居', '日本武道館'],
            correctAnswer: 1,
            explanation: '1958年に完成した東京タワーは戦後復興と高度経済成長の象徴でした。',
            difficulty: 'easy'
        },
        {
            id: 'h004',
            question: '昭和から平成に変わったのは？',
            options: ['1988年', '1989年', '1990年', '1991年'],
            correctAnswer: 1,
            explanation: '1989年1月8日に昭和天皇が崩御され、平成時代が始まりました。',
            difficulty: 'easy'
        },
        {
            id: 'h005',
            question: '戦後の食糧難を救った「ララ物資」はどこの国からの援助？',
            options: ['アメリカ', 'イギリス', 'フランス', 'カナダ'],
            correctAnswer: 0,
            explanation: 'ララ物資はアメリカからの緊急援助物資でした。',
            difficulty: 'easy'
        },
        {
            id: 'h006',
            question: '日本が国連に加盟したのは？',
            options: ['1954年', '1955年', '1956年', '1957年'],
            correctAnswer: 2,
            explanation: '日本は1956年12月18日に国連に加盟しました。',
            difficulty: 'easy'
        },
        // ふつう問題
        {
            id: 'h007',
            question: '大阪万博が開催されたのは？',
            options: ['1968年', '1970年', '1972年', '1974年'],
            correctAnswer: 1,
            explanation: '1970年の大阪万博は「人類の進歩と調和」をテーマに開催されました。',
            difficulty: 'normal'
        },
        {
            id: 'h008',
            question: '日本の高度経済成長期はいつ頃？',
            options: ['1950年代前半', '1950年代後半〜1970年代前半', '1970年代後半', '1980年代'],
            correctAnswer: 1,
            explanation: '1950年代後半から1970年代前半にかけて日本は高度経済成長を遂げました。',
            difficulty: 'normal'
        },
        {
            id: 'h009',
            question: '「所得倍増計画」を提唱した総理大臣は？',
            options: ['岸信介', '池田勇人', '佐藤栄作', '田中角栄'],
            correctAnswer: 1,
            explanation: '池田勇人首相が1960年に所得倍増計画を発表しました。',
            difficulty: 'normal'
        },
        {
            id: 'h010',
            question: '沖縄が本土復帰したのは？',
            options: ['1970年', '1971年', '1972年', '1973年'],
            correctAnswer: 2,
            explanation: '沖縄は1972年5月15日に本土復帰しました。',
            difficulty: 'normal'
        },
        {
            id: 'h011',
            question: '札幌オリンピックが開催されたのは？',
            options: ['1970年', '1972年', '1974年', '1976年'],
            correctAnswer: 1,
            explanation: '1972年に札幌で冬季オリンピックが開催されました。',
            difficulty: 'normal'
        },
        {
            id: 'h012',
            question: '「三種の神器」と呼ばれた家電でないものは？',
            options: ['テレビ', '洗濯機', '冷蔵庫', 'エアコン'],
            correctAnswer: 3,
            explanation: '三種の神器は白黒テレビ、洗濯機、冷蔵庫でした。',
            difficulty: 'normal'
        },
        // むずかしい問題
        {
            id: 'h013',
            question: '「神武景気」と呼ばれた好景気はいつ？',
            options: ['1954〜1957年', '1958〜1961年', '1962〜1965年', '1966〜1970年'],
            correctAnswer: 0,
            explanation: '神武景気は1954年から1957年まで続いた戦後初の長期好景気でした。',
            difficulty: 'hard'
        },
        {
            id: 'h014',
            question: '日本住宅公団が設立されたのは？',
            options: ['1953年', '1954年', '1955年', '1956年'],
            correctAnswer: 2,
            explanation: '1955年に住宅不足解消のため日本住宅公団が設立されました。',
            difficulty: 'hard'
        },
        {
            id: 'h015',
            question: '「岩戸景気」の名前の由来は？',
            options: ['神話の天岩戸', '岩戸という地名', '岩戸という人名', '岩のように固い景気'],
            correctAnswer: 0,
            explanation: '天岩戸から天照大神が出てきたように、日本経済が飛躍的に発展したことから名付けられました。',
            difficulty: 'hard'
        },
        {
            id: 'h016',
            question: '東海道新幹線の愛称「ひかり」が決まったのはいつ？',
            options: ['1962年', '1963年', '1964年', '1965年'],
            correctAnswer: 1,
            explanation: '1963年に公募により「ひかり」という愛称が決定しました。',
            difficulty: 'hard'
        },
        {
            id: 'h017',
            question: '「日本列島改造論」を提唱した総理大臣は？',
            options: ['佐藤栄作', '田中角栄', '三木武夫', '福田赳夫'],
            correctAnswer: 1,
            explanation: '田中角栄首相が1972年に「日本列島改造論」を発表しました。',
            difficulty: 'hard'
        }
    ],
    food: [
        // やさしい問題
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
            question: '「讃岐うどん」で有名な県は？',
            options: ['徳島県', '香川県', '愛媛県', '高知県'],
            correctAnswer: 1,
            explanation: '香川県は讃岐うどんで有名で、日本一面積が小さい県でもあります。',
            difficulty: 'easy'
        },
        {
            id: 'f004',
            question: '北海道の名物「ジンギスカン」は何の肉？',
            options: ['牛肉', '豚肉', '羊肉', '鶏肉'],
            correctAnswer: 2,
            explanation: 'ジンギスカンは羊肉を使った北海道の名物料理です。',
            difficulty: 'easy'
        },
        {
            id: 'f005',
            question: '「きりたんぽ」はどこの郷土料理？',
            options: ['青森県', '秋田県', '山形県', '岩手県'],
            correctAnswer: 1,
            explanation: 'きりたんぽは秋田県の代表的な郷土料理です。',
            difficulty: 'easy'
        },
        {
            id: 'f006',
            question: '沖縄料理の「ゴーヤチャンプルー」の「ゴーヤ」は何？',
            options: ['野菜', '魚', '肉', '調味料'],
            correctAnswer: 0,
            explanation: 'ゴーヤは苦瓜という野菜です。',
            difficulty: 'easy'
        },
        // ふつう問題
        {
            id: 'f007',
            question: '「ちゃんこ鍋」と関係が深いスポーツは？',
            options: ['柔道', '相撲', '剣道', '空手'],
            correctAnswer: 1,
            explanation: 'ちゃんこ鍋は相撲部屋で力士が食べる料理として有名です。',
            difficulty: 'normal'
        },
        {
            id: 'f008',
            question: '「ほうとう」はどこの郷土料理？',
            options: ['群馬県', '栃木県', '山梨県', '長野県'],
            correctAnswer: 2,
            explanation: 'ほうとうは山梨県の代表的な郷土料理です。',
            difficulty: 'normal'
        },
        {
            id: 'f009',
            question: '「いしかわ」の「加賀野菜」でないものは？',
            options: ['金時草', '加賀れんこん', '五郎島金時', '飛騨牛'],
            correctAnswer: 3,
            explanation: '飛騨牛は岐阜県の特産品です。',
            difficulty: 'normal'
        },
        {
            id: 'f010',
            question: '「博多ラーメン」の特徴は？',
            options: ['醤油ベース', '味噌ベース', '豚骨ベース', '塩ベース'],
            correctAnswer: 2,
            explanation: '博多ラーメンは豚骨ベースの白濁したスープが特徴です。',
            difficulty: 'normal'
        },
        {
            id: 'f011',
            question: '「信州そば」で有名な県は？',
            options: ['群馬県', '栃木県', '山梨県', '長野県'],
            correctAnswer: 3,
            explanation: '信州（長野県）はそばの名産地として有名です。',
            difficulty: 'normal'
        },
        {
            id: 'f012',
            question: '「わんこそば」で有名な県は？',
            options: ['青森県', '秋田県', '岩手県', '宮城県'],
            correctAnswer: 2,
            explanation: 'わんこそばは岩手県の名物料理です。',
            difficulty: 'normal'
        },
        // むずかしい問題
        {
            id: 'f013',
            question: '「三大珍味」に含まれないものは？',
            options: ['うに', 'このわた', 'からすみ', 'いくら'],
            correctAnswer: 3,
            explanation: '日本三大珍味は、うに、このわた、からすみです。',
            difficulty: 'hard'
        },
        {
            id: 'f014',
            question: '「越前そば」で有名な県は？',
            options: ['石川県', '富山県', '福井県', '新潟県'],
            correctAnswer: 2,
            explanation: '越前そばは福井県の代表的な郷土料理です。',
            difficulty: 'hard'
        },
        {
            id: 'f015',
            question: '「しもつかれ」はどこの郷土料理？',
            options: ['群馬県', '栃木県', '茨城県', '埼玉県'],
            correctAnswer: 1,
            explanation: 'しもつかれは栃木県の伝統的な郷土料理です。',
            difficulty: 'hard'
        },
        {
            id: 'f016',
            question: '「ちしゃなます」の「ちしゃ」とは何？',
            options: ['魚の名前', '野菜の名前', '調味料の名前', '調理法の名前'],
            correctAnswer: 1,
            explanation: 'ちしゃはレタスの古い呼び名です。',
            difficulty: 'hard'
        },
        {
            id: 'f017',
            question: '「へぎそば」で有名な県は？',
            options: ['群馬県', '栃木県', '新潟県', '長野県'],
            correctAnswer: 2,
            explanation: 'へぎそばは新潟県の特産品で、海藻をつなぎに使用します。',
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