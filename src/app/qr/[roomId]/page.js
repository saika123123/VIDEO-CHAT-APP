'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// QRコード生成用のユーティリティ関数を含む
function QRCode() {
    // QRコードタイプ用の定数
    const QRErrorCorrectLevel = {
        L: 1,  // 7%の誤り訂正
        M: 0,  // 15%の誤り訂正
        Q: 3,  // 25%の誤り訂正
        H: 2   // 30%の誤り訂正
    };

    // QRコードの種類にあわせた行列のテーブル
    const QRPositionPattern = [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ];

    // ビットを数字に変換するテーブル
    const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    // QRコードのメイン生成クラス
    class QRCodeModel {
        constructor(typeNumber, errorCorrectLevel) {
            this.typeNumber = typeNumber;
            this.errorCorrectLevel = errorCorrectLevel;
            this.modules = null;
            this.moduleCount = 0;
            this.dataCache = null;
            this.dataList = [];
        }

        addData(data) {
            const newData = new QR8bitByte(data);
            this.dataList.push(newData);
            this.dataCache = null;
        }

        isDark(row, col) {
            if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
                return false;
            }
            return this.modules[row][col];
        }

        getModuleCount() {
            return this.moduleCount;
        }

        make() {
            // 最小のタイプのQRコードを生成
            this.makeImpl(false, this.getBestMaskPattern());
        }

        makeImpl(test, maskPattern) {
            this.moduleCount = this.typeNumber * 4 + 17;
            this.modules = new Array(this.moduleCount);
            for (let row = 0; row < this.moduleCount; row++) {
                this.modules[row] = new Array(this.moduleCount);
                for (let col = 0; col < this.moduleCount; col++) {
                    this.modules[row][col] = null;
                }
            }
            this.setupPositionProbePattern(0, 0);
            this.setupPositionProbePattern(this.moduleCount - 7, 0);
            this.setupPositionProbePattern(0, this.moduleCount - 7);
            this.setupPositionAdjustPattern();
            this.setupTimingPattern();
            this.setupTypeInfo(test, maskPattern);
            if (this.typeNumber >= 7) {
                this.setupTypeNumber(test);
            }
            if (this.dataCache == null) {
                this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
            }
            this.mapData(this.dataCache, maskPattern);
        }

        setupPositionProbePattern(row, col) {
            for (let r = -1; r <= 7; r++) {
                if (row + r <= -1 || this.moduleCount <= row + r) continue;
                for (let c = -1; c <= 7; c++) {
                    if (col + c <= -1 || this.moduleCount <= col + c) continue;
                    if ((0 <= r && r <= 6 && (c == 0 || c == 6)) || 
                        (0 <= c && c <= 6 && (r == 0 || r == 6)) || 
                        (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
                        this.modules[row + r][col + c] = true;
                    } else {
                        this.modules[row + r][col + c] = false;
                    }
                }
            }
        }

        getBestMaskPattern() {
            let minLostPoint = 0;
            let pattern = 0;
            for (let i = 0; i < 8; i++) {
                this.makeImpl(true, i);
                const lostPoint = this.getLostPoint();
                if (i == 0 || minLostPoint > lostPoint) {
                    minLostPoint = lostPoint;
                    pattern = i;
                }
            }
            return pattern;
        }

        setupTimingPattern() {
            for (let r = 8; r < this.moduleCount - 8; r++) {
                if (this.modules[r][6] != null) {
                    continue;
                }
                this.modules[r][6] = (r % 2 == 0);
            }
            for (let c = 8; c < this.moduleCount - 8; c++) {
                if (this.modules[6][c] != null) {
                    continue;
                }
                this.modules[6][c] = (c % 2 == 0);
            }
        }

        setupPositionAdjustPattern() {
            const pos = QRPositionPattern[this.typeNumber - 1];
            for (let i = 0; i < pos.length; i++) {
                for (let j = 0; j < pos.length; j++) {
                    const row = pos[i];
                    const col = pos[j];
                    if (this.modules[row][col] != null) {
                        continue;
                    }
                    for (let r = -2; r <= 2; r++) {
                        for (let c = -2; c <= 2; c++) {
                            if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) {
                                this.modules[row + r][col + c] = true;
                            } else {
                                this.modules[row + r][col + c] = false;
                            }
                        }
                    }
                }
            }
        }

        setupTypeNumber(test) {
            const bits = getTypeInfoBits(this.errorCorrectLevel);
            for (let i = 0; i < 18; i++) {
                const mod = (!test && ((bits >> i) & 1) == 1);
                this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
            }
            for (let i = 0; i < 18; i++) {
                const mod = (!test && ((bits >> i) & 1) == 1);
                this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
            }
        }

        setupTypeInfo(test, maskPattern) {
            const data = (this.errorCorrectLevel << 3) | maskPattern;
            const bits = getTypeInfoBits(data);
            for (let i = 0; i < 15; i++) {
                const mod = (!test && ((bits >> i) & 1) == 1);
                if (i < 6) {
                    this.modules[i][8] = mod;
                } else if (i < 8) {
                    this.modules[i + 1][8] = mod;
                } else {
                    this.modules[this.moduleCount - 15 + i][8] = mod;
                }
            }
            for (let i = 0; i < 15; i++) {
                const mod = (!test && ((bits >> i) & 1) == 1);
                if (i < 8) {
                    this.modules[8][this.moduleCount - i - 1] = mod;
                } else if (i < 9) {
                    this.modules[8][15 - i - 1 + 1] = mod;
                } else {
                    this.modules[8][15 - i - 1] = mod;
                }
            }
            this.modules[this.moduleCount - 8][8] = (!test);
        }

        mapData(data, maskPattern) {
            let inc = -1;
            let row = this.moduleCount - 1;
            let bitIndex = 7;
            let byteIndex = 0;
            for (let col = this.moduleCount - 1; col > 0; col -= 2) {
                if (col == 6) col--;
                while (true) {
                    for (let c = 0; c < 2; c++) {
                        if (this.modules[row][col - c] == null) {
                            let dark = false;
                            if (byteIndex < data.length) {
                                dark = (((data[byteIndex] >>> bitIndex) & 1) == 1);
                            }
                            const mask = getMask(maskPattern, row, col - c);
                            if (mask) {
                                dark = !dark;
                            }
                            this.modules[row][col - c] = dark;
                            bitIndex--;
                            if (bitIndex == -1) {
                                byteIndex++;
                                bitIndex = 7;
                            }
                        }
                    }
                    row += inc;
                    if (row < 0 || this.moduleCount <= row) {
                        row -= inc;
                        inc = -inc;
                        break;
                    }
                }
            }
        }

        getLostPoint() {
            let lostPoint = 0;
            // パターン1: 同じ色の5個以上のセルブロック
            for (let row = 0; row < this.moduleCount; row++) {
                for (let col = 0; col < this.moduleCount; col++) {
                    let sameCount = 0;
                    const dark = this.isDark(row, col);
                    for (let r = -1; r <= 1; r++) {
                        if (row + r < 0 || this.moduleCount <= row + r) {
                            continue;
                        }
                        for (let c = -1; c <= 1; c++) {
                            if (col + c < 0 || this.moduleCount <= col + c) {
                                continue;
                            }
                            if (r == 0 && c == 0) {
                                continue;
                            }
                            if (dark == this.isDark(row + r, col + c)) {
                                sameCount++;
                            }
                        }
                    }
                    if (sameCount > 5) {
                        lostPoint += (3 + sameCount - 5);
                    }
                }
            }
            // パターン2: 2x2の同色ブロック
            for (let row = 0; row < this.moduleCount - 1; row++) {
                for (let col = 0; col < this.moduleCount - 1; col++) {
                    let count = 0;
                    if (this.isDark(row, col)) count++;
                    if (this.isDark(row + 1, col)) count++;
                    if (this.isDark(row, col + 1)) count++;
                    if (this.isDark(row + 1, col + 1)) count++;
                    if (count == 0 || count == 4) {
                        lostPoint += 3;
                    }
                }
            }
            // パターン3: 特定のパターン
            for (let row = 0; row < this.moduleCount; row++) {
                for (let col = 0; col < this.moduleCount - 6; col++) {
                    if (this.isDark(row, col) && 
                        !this.isDark(row, col + 1) && 
                        this.isDark(row, col + 2) && 
                        this.isDark(row, col + 3) && 
                        this.isDark(row, col + 4) && 
                        !this.isDark(row, col + 5) && 
                        this.isDark(row, col + 6)) {
                        lostPoint += 40;
                    }
                }
            }
            for (let col = 0; col < this.moduleCount; col++) {
                for (let row = 0; row < this.moduleCount - 6; row++) {
                    if (this.isDark(row, col) && 
                        !this.isDark(row + 1, col) && 
                        this.isDark(row + 2, col) && 
                        this.isDark(row + 3, col) && 
                        this.isDark(row + 4, col) && 
                        !this.isDark(row + 5, col) && 
                        this.isDark(row + 6, col)) {
                        lostPoint += 40;
                    }
                }
            }
            // パターン4: 黒モジュールの比率
            let darkCount = 0;
            for (let col = 0; col < this.moduleCount; col++) {
                for (let row = 0; row < this.moduleCount; row++) {
                    if (this.isDark(row, col)) {
                        darkCount++;
                    }
                }
            }
            const ratio = Math.abs(100 * darkCount / this.moduleCount / this.moduleCount - 50) / 5;
            lostPoint += ratio * 10;
            return lostPoint;
        }

        static createData(typeNumber, errorCorrectLevel, dataList) {
            const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
            const buffer = new QRBitBuffer();
            for (let i = 0; i < dataList.length; i++) {
                const data = dataList[i];
                buffer.put(data.getMode(), 4);
                buffer.put(data.getLength(), data.getLengthInBits(typeNumber));
                data.write(buffer);
            }
            // 最大ビット数を計算
            let totalDataCount = 0;
            for (let i = 0; i < rsBlocks.length; i++) {
                totalDataCount += rsBlocks[i].dataCount;
            }
            if (buffer.getLengthInBits() > totalDataCount * 8) {
                throw new Error("データが多すぎます。(" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
            }
            // 終端子を追加
            if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
                buffer.put(0, 4);
            }
            // バイト境界に合わせて0を追加
            while (buffer.getLengthInBits() % 8 != 0) {
                buffer.putBit(false);
            }
            // パディングを追加
            while (true) {
                if (buffer.getLengthInBits() >= totalDataCount * 8) {
                    break;
                }
                buffer.put(0xEC, 8);
                if (buffer.getLengthInBits() >= totalDataCount * 8) {
                    break;
                }
                buffer.put(0x11, 8);
            }
            return QRCodeModel.createBytes(buffer, rsBlocks);
        }

        static createBytes(buffer, rsBlocks) {
            let offset = 0;
            let maxDcCount = 0;
            let maxEcCount = 0;
            const dcdata = new Array(rsBlocks.length);
            const ecdata = new Array(rsBlocks.length);
            for (let r = 0; r < rsBlocks.length; r++) {
                const dcCount = rsBlocks[r].dataCount;
                const ecCount = rsBlocks[r].totalCount - dcCount;
                maxDcCount = Math.max(maxDcCount, dcCount);
                maxEcCount = Math.max(maxEcCount, ecCount);
                dcdata[r] = new Array(dcCount);
                for (let i = 0; i < dcdata[r].length; i++) {
                    dcdata[r][i] = 0xff & buffer.buffer[i + offset];
                }
                offset += dcCount;
                const rsPoly = getErrorCorrectPolynomial(ecCount);
                const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
                const modPoly = rawPoly.mod(rsPoly);
                ecdata[r] = new Array(rsPoly.getLength() - 1);
                for (let i = 0; i < ecdata[r].length; i++) {
                    const modIndex = i + modPoly.getLength() - ecdata[r].length;
                    ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
                }
            }
            let totalCodeCount = 0;
            for (let i = 0; i < rsBlocks.length; i++) {
                totalCodeCount += rsBlocks[i].totalCount;
            }
            const data = new Array(totalCodeCount);
            let index = 0;
            for (let i = 0; i < maxDcCount; i++) {
                for (let r = 0; r < rsBlocks.length; r++) {
                    if (i < dcdata[r].length) {
                        data[index++] = dcdata[r][i];
                    }
                }
            }
            for (let i = 0; i < maxEcCount; i++) {
                for (let r = 0; r < rsBlocks.length; r++) {
                    if (i < ecdata[r].length) {
                        data[index++] = ecdata[r][i];
                    }
                }
            }
            return data;
        }
    }

    class QR8bitByte {
        constructor(data) {
            this.mode = 4;
            this.data = data;
        }

        getMode() {
            return this.mode;
        }

        getLength() {
            return this.data.length;
        }

        getLengthInBits(type) {
            if (type >= 1 && type < 10) {
                // 1 - 9
                return 8;
            } else if (type < 27) {
                // 10 - 26
                return 16;
            } else if (type < 41) {
                // 27 - 40
                return 16;
            } else {
                throw new Error("type:" + type);
            }
        }

        write(buffer) {
            for (let i = 0; i < this.data.length; i++) {
                buffer.put(this.data.charCodeAt(i), 8);
            }
        }
    }

    class QRRSBlock {
        constructor(totalCount, dataCount) {
            this.totalCount = totalCount;
            this.dataCount = dataCount;
        }

        static getRSBlocks(typeNumber, errorCorrectLevel) {
            const rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
            if (rsBlock === undefined) {
                throw new Error("不正なタイプまたは誤り訂正レベル:" + typeNumber + "," + errorCorrectLevel);
            }
            const length = rsBlock.length / 3;
            const list = [];
            for (let i = 0; i < length; i++) {
                const count = rsBlock[i * 3 + 0];
                const totalCount = rsBlock[i * 3 + 1];
                const dataCount = rsBlock[i * 3 + 2];
                for (let j = 0; j < count; j++) {
                    list.push(new QRRSBlock(totalCount, dataCount));
                }
            }
            return list;
        }

        static getRsBlockTable(typeNumber, errorCorrectLevel) {
            switch (errorCorrectLevel) {
                case QRErrorCorrectLevel.L:
                    return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
                case QRErrorCorrectLevel.M:
                    return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
                case QRErrorCorrectLevel.Q:
                    return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
                case QRErrorCorrectLevel.H:
                    return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
                default:
                    return undefined;
            }
        }
    }

    // 誤り訂正用のブロックテーブル
    QRRSBlock.RS_BLOCK_TABLE = [
        // L
        // M
        // Q
        // H
        // 1
        [1, 26, 19],
        [1, 26, 16],
        [1, 26, 13],
        [1, 26, 9],
        // 2
        [1, 44, 34],
        [1, 44, 28],
        [1, 44, 22],
        [1, 44, 16],
        // 3
        [1, 70, 55],
        [1, 70, 44],
        [2, 35, 17],
        [2, 35, 13],
        // 4
        [1, 100, 80],
        [2, 50, 32],
        [2, 50, 24],
        [4, 25, 9],
        // 5
        [1, 134, 108],
        [2, 67, 43],
        [2, 33, 15, 2, 34, 16],
        [2, 33, 11, 2, 34, 12],
        // 6
        [2, 86, 68],
        [4, 43, 27],
        [4, 43, 19],
        [4, 43, 15],
        // 7
        [2, 98, 78],
        [4, 49, 31],
        [2, 32, 14, 4, 33, 15],
        [4, 39, 13, 1, 40, 14],
        // 8
        [2, 121, 97],
        [2, 60, 38, 2, 61, 39],
        [4, 40, 18, 2, 41, 19],
        [4, 40, 14, 2, 41, 15],
        // 9
        [2, 146, 116],
        [3, 58, 36, 2, 59, 37],
        [4, 36, 16, 4, 37, 17],
        [4, 36, 12, 4, 37, 13],
        // 10
        [2, 86, 68, 2, 87, 69],
        [4, 69, 43, 1, 70, 44],
        [6, 43, 19, 2, 44, 20],
        [6, 43, 15, 2, 44, 16]
    ];

    class QRBitBuffer {
        constructor() {
            this.buffer = [];
            this.length = 0;
        }

        get(index) {
            const bufIndex = Math.floor(index / 8);
            return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) == 1;
        }

        put(num, length) {
            for (let i = 0; i < length; i++) {
                this.putBit(((num >>> (length - i - 1)) & 1) == 1);
            }
        }

        getLengthInBits() {
            return this.length;
        }

        putBit(bit) {
            const bufIndex = Math.floor(this.length / 8);
            if (this.buffer.length <= bufIndex) {
                this.buffer.push(0);
            }
            if (bit) {
                this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
            }
            this.length++;
        }
    }

    class QRPolynomial {
        constructor(num, shift) {
            if (num.length === undefined) {
                throw new Error(num.length + "/" + shift);
            }
            let offset = 0;
            while (offset < num.length && num[offset] === 0) {
                offset++;
            }
            this.num = new Array(num.length - offset + shift);
            for (let i = 0; i < num.length - offset; i++) {
                this.num[i] = num[i + offset];
            }
        }

        get(index) {
            return this.num[index];
        }

        getLength() {
            return this.num.length;
        }

        multiply(e) {
            const num = new Array(this.getLength() + e.getLength() - 1);
            for (let i = 0; i < num.length; i++) {
                num[i] = 0;
            }
            for (let i = 0; i < this.getLength(); i++) {
                for (let j = 0; j < e.getLength(); j++) {
                    num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
                }
            }
            return new QRPolynomial(num, 0);
        }

        mod(e) {
            if (this.getLength() - e.getLength() < 0) {
                return this;
            }
            const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
            const num = new Array(this.getLength());
            for (let i = 0; i < this.getLength(); i++) {
                num[i] = this.get(i);
            }
            for (let i = 0; i < e.getLength(); i++) {
                num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
            }
            return new QRPolynomial(num, 0).mod(e);
        }
    }

    const QRMath = {
        glog: function(n) {
            if (n < 1) {
                throw new Error("glog(" + n + ")");
            }
            return QRMath.LOG_TABLE[n];
        },
        gexp: function(n) {
            while (n < 0) {
                n += 255;
            }
            while (n >= 256) {
                n -= 255;
            }
            return QRMath.EXP_TABLE[n];
        },
        EXP_TABLE: new Array(256),
        LOG_TABLE: new Array(256)
    };

    for (let i = 0; i < 8; i++) {
        QRMath.EXP_TABLE[i] = 1 << i;
    }
    for (let i = 8; i < 256; i++) {
        QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    }
    for (let i = 0; i < 255; i++) {
        QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;
    }

    function getErrorCorrectPolynomial(errorCorrectLength) {
        let a = new QRPolynomial([1], 0);
        for (let i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
        }
        return a;
    }

    function getTypeInfoBits(errorCorrectLevel) {
        const d = errorCorrectLevel << 3;
        let buffer = d;
        for (let i = 0; i < 10; i++) {
            if (((buffer << i) & 0x400) != 0) {
                buffer ^= (G15 << i);
            }
        }
        return ((d << 10) | buffer) ^ G15_MASK;
    }

    function getMask(maskPattern, i, j) {
        switch (maskPattern) {
            case 0:
                return (i + j) % 2 == 0;
            case 1:
                return i % 2 == 0;
            case 2:
                return j % 3 == 0;
            case 3:
                return (i + j) % 3 == 0;
            case 4:
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
            case 5:
                return (i * j) % 2 + (i * j) % 3 == 0;
            case 6:
                return ((i * j) % 2 + (i * j) % 3) % 2 == 0;
            case 7:
                return ((i * j) % 3 + (i + j) % 2) % 2 == 0;
            default:
                throw new Error("マスクパターンが不正です: " + maskPattern);
        }
    }

    // QRコードを生成する関数
    function generateQRCode(text, typeNumber, errorCorrectLevel, moduleSize = 5) {
        typeNumber = typeNumber || 4;
        errorCorrectLevel = errorCorrectLevel || 'L';
        
        const _errorCorrectLevel = {'L': 1, 'M': 0, 'Q': 3, 'H': 2}[errorCorrectLevel];
        const qr = new QRCodeModel(typeNumber, _errorCorrectLevel);
        
        qr.addData(text);
        qr.make();
        
        let modules = [];
        const moduleCount = qr.getModuleCount();
        
        for (let row = 0; row < moduleCount; row++) {
            modules[row] = [];
            for (let col = 0; col < moduleCount; col++) {
                modules[row][col] = qr.isDark(row, col);
            }
        }
        
        return {
            modules: modules,
            moduleCount: moduleCount
        };
    }

    return {
        generateQRCode
    };
}

export default function QRCodePage() {
    const params = useParams();
    const router = useRouter();
    const [roomId, setRoomId] = useState('');
    const [inviteUrl, setInviteUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [qrModules, setQrModules] = useState(null);
    const [moduleCount, setModuleCount] = useState(0);

    useEffect(() => {
        if (params.roomId) {
            setRoomId(params.roomId);
            setIsLoading(false);
        }
    }, [params]);

    useEffect(() => {
        if (roomId && typeof window !== 'undefined') {
            // 正しい招待URLを生成（クエリパラメータとして'room'を付与）
            const baseUrl = window.location.origin;
            const fullUrl = `${baseUrl}/yoriai?room=${roomId}`;
            setInviteUrl(fullUrl);
            
            // QRコード生成
            const qrCode = QRCode();
            const { modules, moduleCount } = qrCode.generateQRCode(fullUrl, 4, 'M');
            setQrModules(modules);
            setModuleCount(moduleCount);
        }
    }, [roomId]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(inviteUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const goBack = () => {
        const userName = sessionStorage.getItem('userName') || '';
        router.push(`/yoriai/${roomId}?user=${userName}`);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-2xl font-bold text-gray-700">読み込み中...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">招待QRコード</h1>
                        <button
                            onClick={goBack}
                            className="text-gray-500 hover:text-gray-700"
                            aria-label="戻る"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="bg-white p-4 rounded-xl border-2 border-gray-200 mb-6">
                            {qrModules && (
                                <div 
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(${moduleCount}, 6px)`,
                                        gridTemplateRows: `repeat(${moduleCount}, 6px)`,
                                        gap: '0px',
                                        background: 'white',
                                        padding: '10px'
                                    }}
                                >
                                    {qrModules.map((row, rowIndex) => 
                                        row.map((cell, colIndex) => (
                                            <div 
                                                key={`${rowIndex}-${colIndex}`}
                                                style={{
                                                    backgroundColor: cell ? 'black' : 'white',
                                                    width: '6px',
                                                    height: '6px'
                                                }}
                                            />
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        <p className="text-gray-600 text-center mb-6">
                            このQRコードをスキャンすると、<br />ビデオ通話に直接参加できます
                        </p>

                        <div className="w-full mb-6">
                            <div className="flex rounded-lg overflow-hidden border border-gray-300">
                                <input
                                    type="text"
                                    value={inviteUrl}
                                    readOnly
                                    className="flex-1 py-3 px-4 text-gray-700 focus:outline-none bg-gray-50 text-sm"
                                />
                                <button
                                    onClick={copyToClipboard}
                                    className={`px-4 flex items-center justify-center font-medium ${copied ? 'bg-green-600' : 'bg-blue-600'
                                        } text-white`}
                                >
                                    {copied ? (
                                        <>
                                            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            完了
                                        </>
                                    ) : 'URLをコピー'}
                                </button>
                            </div>
                        </div>

                        <div className="w-full">
                            <button
                                onClick={goBack}
                                className="w-full py-3 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors"
                            >
                                ビデオ通話に戻る
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}