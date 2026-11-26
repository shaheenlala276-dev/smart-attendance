/* Smart Attendance - Phase 2: students, permanent QR codes, ID cards.
   Uses the existing IndexedDB stores: students, classes, sections, auditLogs, attendance. */
/* ---- Bundled QR library (built in, so no separate file can go missing). Original MIT notice kept below. ---- */
/*! QRCode for JavaScript
 * Copyright (c) 2009 Kazuhiko Arase (http://www.d-project.com/)
 * Licensed under the MIT license: http://www.opensource.org/licenses/mit-license.php
 * The word "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
 *
 * This file bundles the original QR encoder modules (unchanged) for use in a browser without a build step,
 * and exposes the qrcode(typeNumber, errorCorrectionLevel) function used by Smart Attendance:
 *   var qr = qrcode(0, 'M'); qr.addData(text); qr.make(); qr.getModuleCount(); qr.isDark(row, col);
 */
(function (global) {
  'use strict';
  var defs = {}, cache = {};
  function def(name, fn) { defs[name] = fn; }
  function req(path) {
    var name = path.replace(/^\.\//, '');
    if (cache[name]) return cache[name].exports;
    var m = { exports: {} }; cache[name] = m; defs[name](m, m.exports, req); return m.exports;
  }
  def('QRMode', function (module, exports, require) {
module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

  });
  def('QRErrorCorrectLevel', function (module, exports, require) {
module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


  });
  def('QRMaskPattern', function (module, exports, require) {
module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

  });
  def('QRMath', function (module, exports, require) {
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;

  });
  def('QRPolynomial', function (module, exports, require) {
var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;

  });
  def('QRRSBlock', function (module, exports, require) {
var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

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
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;

  });
  def('QRUtil', function (module, exports, require) {
var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
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
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;

  });
  def('QR8bitByte', function (module, exports, require) {
var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;

  });
  def('QRBitBuffer', function (module, exports, require) {
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;

  });
  def('index', function (module, exports, require) {
//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
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
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
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

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;

  });
  var QRCode = req('./index'), LEVELS = { L: 1, M: 0, Q: 3, H: 2 };
  global.qrcode = function (typeNumber, errorCorrectionLevel) {
    var level = LEVELS[errorCorrectionLevel || 'M'];
    if (level === undefined) throw new Error('Unknown error correction level: ' + errorCorrectionLevel);
    var q = new QRCode(typeNumber > 0 ? typeNumber : -1, level);
    return {
      addData: function (data) { q.addData(String(data)); },
      make: function () { q.make(); },
      getModuleCount: function () { return q.getModuleCount(); },
      isDark: function (row, col) { return q.isDark(row, col); }
    };
  };
})(typeof self !== 'undefined' ? self : this);
/* ---- end of bundled QR library ---- */

const PAGE_SIZE = 20;
const ST = { q: '', cls: '', sec: '', status: '', page: 1, sel: new Set() };
let D = null; // cached {students, classes, sections, cn, sn}
const clean = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
const low = s => clean(s).toLowerCase();
const rollKey = (classId, roll) => classId + '|' + low(roll);
const auditOp = (action, id) => ({ store: 'auditLogs', value: { id: uid(), at: new Date().toISOString(), action, entity: 'student', entityId: id, details: null, by: 'admin' } });
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

async function loadAll() {
  const [students, classes, sections] = await Promise.all([DB.getAll('students'), DB.getAll('classes'), DB.getAll('sections')]);
  const cm = new Map(classes.map(c => [c.id, c])), sm = new Map(sections.map(s => [s.id, s]));
  const cn = id => (cm.get(id) || {}).name || '-', sn = id => (sm.get(id) || {}).name || '-';
  students.sort((a, b) => cn(a.classId).localeCompare(cn(b.classId), undefined, { numeric: true }) || sn(a.sectionId).localeCompare(sn(b.sectionId)) || String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }));
  return { students, classes, sections, cn, sn };
}
const newQr = () => { const used = new Set(D.students.map(s => s.qrId)); let q; do { q = uid(); } while (used.has(q)); return q; };

/* ---------- QR (uses lib/qrcode.js: QRCode for JavaScript by Kazuhiko Arase, MIT) ---------- */
/* The QR code is always drawn from the student's saved random qrId, so it is the same every time. */
function qrMatrix(text) {
  if (typeof qrcode === 'undefined') throw new Error('The QR library did not start. Close and reopen the app, then try again.');
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}
function qrSvg(text) {
  let q; try { q = qrMatrix(text); } catch (e) { return `<div class="qrerr">QR code could not be drawn. ${esc(e.message)}</div>`; }
  const n = q.n, m = 4; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.dark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  const w = n + 2 * m;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges" role="img" aria-label="Student QR code"><rect width="${w}" height="${w}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
const stuClass = s => D.cn(s.classId) + (D.sn(s.sectionId) ? ' - ' + D.sn(s.sectionId) : '');
function qrCardHtml(s) {
  return `<div class="qrcard"><div class="qrbox">${qrSvg(s.qrId)}</div><b>${esc(s.name)}</b><span>Roll No: ${esc(s.roll)}</span>${s.regNo ? `<span>Reg No: ${esc(s.regNo)}</span>` : ''}<span>Class: ${esc(stuClass(s))}</span></div>`;
}
/* Sharp PNG with the student's name, roll number and class written below the QR code. */
function qrPngBlob(s) {
  const q = qrMatrix(s.qrId), quiet = 4, px = Math.max(8, Math.floor(480 / (q.n + 2 * quiet))), qw = (q.n + 2 * quiet) * px, pad = 36, W = Math.max(qw + 2 * pad, 560), H = pad + qw + 150;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#000';
  const ox = Math.round((W - qw) / 2), oy = pad;
  for (let r = 0; r < q.n; r++) for (let c = 0; c < q.n; c++) if (q.dark(r, c)) x.fillRect(ox + (c + quiet) * px, oy + (r + quiet) * px, px, px);
  x.textAlign = 'center'; const cx = W / 2, line = (t, size, bold, y) => { let f = size; do { x.font = `${bold ? 'bold ' : ''}${f}px system-ui,Arial,sans-serif`; f--; } while (x.measureText(t).width > W - 2 * pad && f > 12); x.fillText(t, cx, y); };
  line(s.name, 34, true, oy + qw + 44); line(`Roll No: ${s.roll}${s.regNo ? '   Reg No: ' + s.regNo : ''}`, 26, false, oy + qw + 82); line(`Class: ${stuClass(s)}`, 26, false, oy + qw + 116);
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Could not create the PNG.')), 'image/png'));
}
async function downloadQr(s) {
  try {
    const blob = await qrPngBlob(s), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = ('QR-' + s.name + '-' + s.roll).replace(/[^\w\u0600-\u06FF.-]+/g, '_') + '.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('QR code saved as a PNG picture.', 'ok');
  } catch (e) { toast('Could not save the QR code: ' + e.message, 'err'); }
}
function printQr(s) {
  const old = document.getElementById('qr-print'); if (old) old.remove();
  const el = document.createElement('div'); el.id = 'qr-print';
  el.innerHTML = `<div class="qrp"><div class="qrp-h">${esc((typeof institution !== 'undefined' && institution && institution.name) || '')}</div>${qrCardHtml(s)}</div>`;
  document.body.appendChild(el); document.body.classList.add('qr-printing');
  const done = () => { el.remove(); document.body.classList.remove('qr-printing'); window.removeEventListener('afterprint', done); window.removeEventListener('pointerdown', done); };
  window.addEventListener('afterprint', done); window.addEventListener('pointerdown', done);
  setTimeout(() => window.print(), 150);
}

/* ---------- small UI helpers ---------- */
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(m); return m;
}
function confirmBox(title, msg, ok, danger) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p>${esc(msg)}</p><div class="actions"><button class="btn ${danger ? 'danger' : ''}" data-r="1" type="button">${esc(ok)}</button><button class="btn ghost" data-r="0" type="button">Cancel</button></div>`);
    m.onclick = e => { const b = e.target.closest('[data-r]'); if (b || e.target === m) { m.remove(); res(!!b && b.dataset.r === '1'); } };
  });
}
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Use a JPG, PNG or WebP photo.'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 400 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read.')); };
    img.src = url;
  });
}
const initials = n => clean(n).split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const backToList = v => (location.hash === '#idcards' ? viewIdCards(v) : viewStudents(v));

/* ---------- list page (also used for the ID cards page) ---------- */
async function viewStudents(v) { D = await loadAll(); drawPage(v, 'students'); }
async function viewIdCards(v) { D = await loadAll(); drawPage(v, 'cards'); }

function filtered() {
  const q = low(ST.q);
  return D.students.filter(s => (!ST.cls || s.classId === ST.cls) && (!ST.sec || s.sectionId === ST.sec) && (!ST.status || s.status === ST.status) &&
    (!q || low(s.name).includes(q) || low(s.roll).includes(q) || low(s.fatherName).includes(q)));
}
function secOptions() {
  return D.sections.filter(s => !ST.cls || s.classId === ST.cls).map(s => `<option value="${s.id}" ${ST.sec === s.id ? 'selected' : ''}>${esc(ST.cls ? s.name : D.cn(s.classId) + ' ' + s.name)}</option>`).join('');
}

function drawPage(v, mode) {
  const st = D.students, act = st.filter(s => s.status === 'Active').length;
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const byClass = D.classes.map(c => [c.name, st.filter(s => s.classId === c.id).length]).filter(x => x[1]).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  const cards = mode === 'cards';
  v.innerHTML = `<div class="head"><div><h1>${cards ? 'QR Codes and ID Cards' : 'Students'}</h1>
    <p class="sub">${cards ? 'Select students, preview their ID cards, then print.' : 'Register students, view QR codes and print ID cards.'}</p></div>
    ${cards ? '' : '<button class="btn" data-act="add" type="button">Add student</button>'}</div>
    ${cards ? '' : `<div class="grid">${stat(st.length, 'Total')}${stat(act, 'Active')}${stat(st.length - act, 'Inactive')}</div>
    <div class="chips" style="margin-top:12px">${byClass.map(c => `<span class="pill">${esc(c[0])}: ${c[1]}</span>`).join('')}</div>`}
    <div class="card toolbar">
      <input id="q" type="search" placeholder="Search name, father or roll number" value="${esc(ST.q)}" aria-label="Search students">
      <select id="fc" aria-label="Filter by class"><option value="">All classes</option>${D.classes.map(c => `<option value="${c.id}" ${ST.cls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="fs" aria-label="Filter by section"><option value="">All sections</option>${secOptions()}</select>
      <select id="ft" aria-label="Filter by status"><option value="">Any status</option><option ${ST.status === 'Active' ? 'selected' : ''}>Active</option><option ${ST.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select>
    </div>
    <div class="actions" id="bulk" style="margin:0 0 12px"></div>
    <div id="list"></div><div class="pager" id="pager"></div>`;
  v.onclick = e => handleAct(v, e);
  v.onchange = e => {
    const c = e.target.closest('[data-sel]');
    if (c) { c.checked ? ST.sel.add(c.dataset.sel) : ST.sel.delete(c.dataset.sel); drawBulk(cards); }
  };
  $('#q').oninput = e => { ST.q = e.target.value; ST.page = 1; drawList(cards); };
  $('#fc').onchange = e => { ST.cls = e.target.value; ST.sec = ''; ST.page = 1; $('#fs').innerHTML = '<option value="">All sections</option>' + secOptions(); drawList(cards); };
  $('#fs').onchange = e => { ST.sec = e.target.value; ST.page = 1; drawList(cards); };
  $('#ft').onchange = e => { ST.status = e.target.value; ST.page = 1; drawList(cards); };
  drawList(cards);
}

function drawBulk(cards) {
  const n = ST.sel.size;
  $('#bulk').innerHTML = `<button class="btn" data-act="printsel" type="button" ${n ? '' : 'disabled'}>Preview and print ID cards (${n})</button>
    <button class="btn ghost" data-act="selall" type="button">Select all shown</button>
    ${n ? '<button class="btn ghost" data-act="clrsel" type="button">Clear selection</button>' : ''}
    ${cards ? '<p class="note" style="width:100%;margin:0">Cards of inactive students are printable, but the scanner will reject them.</p>' : ''}`;
}

function drawList(cards) {
  const all = filtered(), pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (ST.page > pages) ST.page = pages;
  const rows = all.slice((ST.page - 1) * PAGE_SIZE, ST.page * PAGE_SIZE);
  drawBulk(cards);
  if (!rows.length) {
    $('#list').innerHTML = `<div class="card empty"><h2>${D.students.length ? 'No students match' : 'No students yet'}</h2><p>${D.students.length ? 'Change the search or filters.' : 'Add your first student to create their permanent QR code.'}</p></div>`;
    $('#pager').innerHTML = ''; return;
  }
  $('#list').innerHTML = rows.map(s => `<div class="srow">
    <label class="chk"><input type="checkbox" data-sel="${s.id}" aria-label="Select ${esc(s.name)}" ${ST.sel.has(s.id) ? 'checked' : ''}></label>
    <div class="av">${s.photo ? `<img src="${s.photo}" alt="">` : esc(initials(s.name))}</div>
    <div class="si"><b>${esc(s.name)}</b><span>Father: ${esc(s.fatherName)}</span><span>Roll ${esc(s.roll)}, ${esc(D.cn(s.classId))} ${esc(D.sn(s.sectionId))}${s.department ? ', ' + esc(s.department) : ''}</span></div>
    <div class="tags"><span class="pill ${s.status === 'Active' ? 'ok' : 'bad'}">${esc(s.status)}</span><span class="pill ${s.qrId ? 'ok' : 'bad'}">${s.qrId ? 'QR ready' : 'No QR'}</span></div>
    <div class="acts"><button class="btn ghost sm" data-act="view" data-id="${s.id}" type="button">View</button>
    ${cards ? '' : `<button class="btn ghost sm" data-act="edit" data-id="${s.id}" type="button">Edit</button>`}
    <button class="btn ghost sm" data-act="qr" data-id="${s.id}" type="button">QR</button>
    <button class="btn ghost sm" data-act="card" data-id="${s.id}" type="button">ID card</button>
    ${cards ? '' : `<button class="btn ghost sm" data-act="del" data-id="${s.id}" type="button">Delete</button>`}</div></div>`).join('');
  $('#pager').innerHTML = pages > 1 ? `<button class="btn ghost sm" data-act="prev" type="button" ${ST.page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${ST.page} of ${pages}</span><button class="btn ghost sm" data-act="next" type="button" ${ST.page === pages ? 'disabled' : ''}>Next</button>` : `<span class="note">${all.length} student${all.length === 1 ? '' : 's'}</span>`;
}

async function handleAct(v, e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, cards = location.hash === '#idcards';
  try {
    if (a === 'add') return viewForm(v, null);
    if (a === 'edit') return viewForm(v, id);
    if (a === 'view') return viewProfile(v, id);
    if (a === 'qr') return showQr(v, id);
    if (a === 'qrpng' || a === 'qrprint') { const st = D.students.find(x => x.id === id); if (!st) return; return a === 'qrpng' ? downloadQr(st) : printQr(st); }
    if (a === 'card') return previewCards(v, [id]);
    if (a === 'del') return doDelete(v, id);
    if (a === 'prev') { ST.page--; return drawList(cards); }
    if (a === 'next') { ST.page++; return drawList(cards); }
    if (a === 'clrsel') { ST.sel.clear(); return drawList(cards); }
    if (a === 'selall') { filtered().forEach(s => ST.sel.add(s.id)); return drawList(cards); }
    if (a === 'printsel') return previewCards(v, [...ST.sel]);
  } catch (err) { toast(err.message, 'err'); }
}

/* ---------- add / edit form ---------- */
async function viewForm(v, id) {
  D = await loadAll();
  const s = id ? D.students.find(x => x.id === id) : null;
  if (id && !s) { toast('Student not found.', 'err'); return viewStudents(v); }
  const i = s || {}; let photo = i.photo || '';
  const fld = (k, label, val, attrs) => `<div><label for="${k}">${label}</label><input id="${k}" value="${esc(val)}" ${attrs || ''}><div class="err" id="e-${k}"></div></div>`;
  const phHtml = () => photo ? `<img src="${photo}" alt="Student photo">` : 'No photo';
  v.innerHTML = `<h1>${s ? 'Edit student' : 'Add student'}</h1><p class="sub">${s ? 'The QR code stays the same when you save changes.' : 'A permanent QR code is created when you save.'}</p>
  <form class="card" id="sf" novalidate>
    <div class="row">${fld('n', 'Full name *', i.name, 'maxlength="100" autocomplete="off"')}${fld('fa', "Father's name *", i.fatherName, 'maxlength="100" autocomplete="off"')}</div>
    <div class="row">${fld('roll', 'Roll number *', i.roll, 'maxlength="20" autocomplete="off"')}${fld('reg', 'Registration number', i.regNo, 'maxlength="40" autocomplete="off"')}</div>
    <div class="row">${fld('cls', 'Class *', s ? D.cn(s.classId) : '', 'maxlength="40" list="dl-c" placeholder="e.g. 9 or Nursery" autocomplete="off"')}${fld('sec', 'Section *', s ? D.sn(s.sectionId) : '', 'maxlength="20" list="dl-s" placeholder="e.g. A" autocomplete="off"')}</div>
    <datalist id="dl-c">${D.classes.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
    <datalist id="dl-s">${[...new Set(D.sections.map(x => x.name))].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="row"><input type="hidden" id="dep" value="${esc(i.department)}">
      <div><label for="adm">Admission date *</label><input id="adm" type="date" value="${esc(i.admissionDate || todayStr())}"><div class="err" id="e-adm"></div></div></div>
    <div class="row">${fld('phone', 'Phone', i.phone, 'type="tel" maxlength="20"')}${fld('em', 'Email', i.email, 'type="email" maxlength="100"')}</div>
    ${fld('ad', 'Address', i.address, 'maxlength="200"')}
    <div class="row"><div><label for="st">Status</label><select id="st"><option ${i.status !== 'Inactive' ? 'selected' : ''}>Active</option><option ${i.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select></div>
      <div><label for="photo">Photo (optional)</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp"><div class="err" id="e-photo"></div></div></div>
    <div style="display:flex;gap:12px;align-items:center;margin-top:10px"><div class="pf-photo" id="phv" style="width:70px;height:90px">${phHtml()}</div><button class="btn ghost sm" id="rmph" type="button">Remove photo</button></div>
    <div class="actions"><button class="btn" id="save" type="submit">${s ? 'Save changes' : 'Save student'}</button><button class="btn ghost" data-act="cancel" type="button">Cancel</button></div>
  </form>`;
  v.onchange = null;
  v.onclick = e => { if (e.target.closest('[data-act=cancel]')) backToList(v); };
  $('#rmph').onclick = () => { photo = ''; $('#phv').innerHTML = phHtml(); $('#photo').value = ''; };
  $('#photo').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { photo = await readPhoto(f); $('#phv').innerHTML = phHtml(); $('#e-photo').textContent = ''; }
    catch (err) { $('#e-photo').textContent = err.message; e.target.value = ''; }
  };
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const g = k => clean($('#' + k).value);
    const f = { n: g('n'), fa: g('fa'), roll: g('roll'), reg: g('reg'), cls: g('cls'), sec: g('sec'), dep: g('dep'), adm: $('#adm').value, st: $('#st').value, phone: g('phone'), em: g('em'), ad: g('ad') };
    const btn = $('#save'); btn.disabled = true;
    try {
      D = await loadAll();
      const er = {};
      if (!f.n) er.n = 'Enter the full name.';
      if (!f.fa) er.fa = "Enter the father's name.";
      if (!f.roll) er.roll = 'Enter the roll number.';
      if (!f.cls) er.cls = 'Enter the class.';
      if (!f.sec) er.sec = 'Enter the section.';
      if (!f.adm) er.adm = 'Choose the admission date.';
      if (f.em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.em)) er.em = 'Enter a valid email address.';
      if (f.phone && !/^[0-9+\-\s()]{7,20}$/.test(f.phone)) er.phone = 'Enter a valid phone number.';
      const ec = D.classes.find(c => low(c.name) === low(f.cls));
      const classId = ec ? ec.id : uid();
      if (ec) {
        if (f.roll && D.students.some(x => x.id !== i.id && x.classId === classId && low(x.roll) === low(f.roll))) er.roll = `Roll number ${f.roll} is already used in class ${ec.name}.`;
        if (f.n && f.fa && D.students.some(x => x.id !== i.id && x.classId === classId && low(x.name) === low(f.n) && low(x.fatherName) === low(f.fa))) er.n = "A student with this name and father's name already exists in this class.";
      }
      if (f.reg && D.students.some(x => x.id !== i.id && x.regNo && low(x.regNo) === low(f.reg))) er.reg = 'This registration number is already used.';
      document.querySelectorAll('.err').forEach(x => x.textContent = '');
      const keys = Object.keys(er);
      if (keys.length) { keys.forEach(k => { const el = $('#e-' + k); if (el) el.textContent = er[k]; }); const first = $('#' + keys[0]); if (first) first.focus(); toast('Fix the highlighted fields.', 'err'); return; }
      const now = new Date().toISOString(), ops = [];
      if (!ec) ops.push({ store: 'classes', value: { id: classId, name: f.cls, createdAt: now } });
      let sec = ec ? D.sections.find(x => x.classId === classId && low(x.name) === low(f.sec)) : null;
      if (!sec) { sec = { id: uid(), classId, name: f.sec, createdAt: now }; ops.push({ store: 'sections', value: sec }); }
      const rec = { id: i.id || uid(), qrId: i.qrId || newQr(), name: f.n, fatherName: f.fa, roll: f.roll, rollKey: rollKey(classId, f.roll), regNo: f.reg || null,
        classId, sectionId: sec.id, department: f.dep, admissionDate: f.adm, phone: f.phone, email: f.em, address: f.ad, photo, status: f.st,
        createdAt: i.createdAt || now, updatedAt: now, qrCreatedAt: i.qrCreatedAt || now };
      ops.push({ store: 'students', value: rec }, auditOp(s ? 'update' : 'create', rec.id));
      await DB.putMany(ops);
      toast(s ? 'Changes saved.' : 'Student saved. QR code created.', 'ok');
      D = await loadAll(); backToList(v);
      if (!s) showQr(v, rec.id);
    } catch (err) {
      toast(err && err.name === 'ConstraintError' ? 'This roll number, registration number or QR already exists. Nothing was saved.' : 'Could not save: ' + (err.message || err), 'err');
    } finally { btn.disabled = false; }
  };
}

/* ---------- profile, QR, delete ---------- */
async function viewProfile(v, id) {
  D = await loadAll();
  const s = D.students.find(x => x.id === id); if (!s) return viewStudents(v);
  const row = (k, val) => val ? `<dt>${k}</dt><dd>${esc(val)}</dd>` : '';
  v.innerHTML = `<h1>${esc(s.name)}</h1><div class="card"><div style="display:flex;gap:16px;flex-wrap:wrap"><div class="pf-photo">${s.photo ? `<img src="${s.photo}" alt="Student photo">` : 'No photo'}</div>
    <div class="pf-qr"><div class="qrbox">${qrSvg(s.qrId)}</div><span class="note">Student QR code</span></div>
    <dl>${row('Father', s.fatherName)}${row('Roll number', s.roll)}${row('Registration', s.regNo)}${row('Class', D.cn(s.classId))}${row('Section', D.sn(s.sectionId))}${row('Admitted', s.admissionDate)}${row('Phone', s.phone)}${row('Email', s.email)}${row('Address', s.address)}${row('Status', s.status)}${row('QR created', new Date(s.qrCreatedAt).toLocaleDateString())}</dl></div>
    <div class="actions">${location.hash === '#idcards' ? '' : '<button class="btn" data-act="edit" data-id="' + s.id + '" type="button">Edit</button>'}<button class="btn ghost" data-act="qr" data-id="${s.id}" type="button">View QR</button><button class="btn ghost" data-act="qrpng" data-id="${s.id}" type="button">Download QR (PNG)</button><button class="btn ghost" data-act="qrprint" data-id="${s.id}" type="button">Print QR</button><button class="btn ghost" data-act="card" data-id="${s.id}" type="button">ID card</button><button class="btn ghost" data-act="back" type="button">Back</button></div></div>`;
  v.onchange = null;
  v.onclick = e => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'back') backToList(v); else handleAct(v, e); };
}

function showQr(v, id) {
  const s = D.students.find(x => x.id === id); if (!s) return;
  const m = modal(`<h2>Student QR code</h2>${qrCardHtml(s)}
    <p class="note" style="text-align:center">The QR holds only a random ID, never personal details. Editing the profile does not change it.</p>
    <div class="actions"><button class="btn" data-m="print" type="button">Print QR</button><button class="btn" data-m="png" type="button">Download PNG</button><button class="btn ghost" data-m="card" type="button">Print ID card</button><button class="btn ghost" data-m="regen" type="button">Regenerate QR</button><button class="btn ghost" data-m="x" type="button">Close</button></div>`);
  m.onclick = async e => {
    const b = e.target.closest('[data-m]'); if (!b && e.target !== m) return;
    const k = b ? b.dataset.m : 'x';
    if (k === 'x') return m.remove();
    if (k === 'print') return printQr(s);
    if (k === 'png') return downloadQr(s);
    if (k === 'card') { m.remove(); return previewCards(v, [id]); }
    if (k === 'regen') {
      if (!await confirmBox('Regenerate QR code?', 'The old QR code and any printed ID card will stop working. Print a new card afterwards.', 'Regenerate', true)) return;
      try {
        D = await loadAll();
        const cur = D.students.find(x => x.id === id);
        await DB.putMany([{ store: 'students', value: { ...cur, qrId: newQr(), qrCreatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, auditOp('regenerate_qr', id)]);
        toast('New QR code created.', 'ok'); m.remove(); route();
      } catch (err) { toast('Could not regenerate: ' + err.message, 'err'); }
    }
  };
}

async function doDelete(v, id) {
  const s = D.students.find(x => x.id === id); if (!s) return;
  const n = await DB.countByIndex('attendance', 'studentId', id);
  if (n > 0) { toast(`${s.name} has ${n} attendance record(s). Mark the student Inactive instead of deleting.`, 'err'); return; }
  if (!await confirmBox('Delete student?', `${s.name} will be deleted permanently and their QR code will stop working. This cannot be undone.`, 'Delete', true)) return;
  await DB.putMany([{ store: 'students', del: id }, auditOp('delete', id)]);
  ST.sel.delete(id); toast('Student deleted.', 'ok'); viewStudents(v);
}

/* ---------- ID cards ---------- */
function cardHtml(s) {
  const inst = institution || {}, contact = [inst.address, inst.phone].filter(Boolean).join(', ');
  const line = (k, val) => val ? `<div><b>${k}:</b> ${esc(val)}</div>` : '';
  return `<div class="idc"><div class="idc-h">${inst.logo ? `<img src="${inst.logo}" alt="">` : ''}<div><b>${esc(inst.name || 'School')}</b>${contact ? `<small>${esc(contact)}</small>` : ''}</div></div>
    <div class="idc-b"><div class="idc-p">${s.photo ? `<img src="${s.photo}" alt="">` : '<svg viewBox="0 0 24 24" width="60%" fill="#999" aria-hidden="true"><circle cx="12" cy="8" r="4.5"/><path d="M3 22c0-5 4-8 9-8s9 3 9 8z"/></svg>'}</div>
    <div class="idc-d"><span class="nm">${esc(s.name)}</span>${line('Father', s.fatherName)}${line('Roll', s.roll)}${line('Reg', s.regNo)}${line('Class', D.cn(s.classId) + ' ' + D.sn(s.sectionId))}${line('Dept', s.department)}</div>
    <div class="idc-q">${qrSvg(s.qrId)}<small>Scan for Attendance</small></div></div></div>`;
}

async function previewCards(v, ids) {
  D = await loadAll();
  const list = ids.map(id => D.students.find(s => s.id === id)).filter(Boolean);
  if (!list.length) { toast('Select at least one student.', 'err'); return; }
  let html; try { html = list.map(cardHtml).join(''); } catch (err) { toast(err.message, 'err'); return; }
  v.innerHTML = `<div class="head no-print"><div><h1>ID card preview</h1><p class="sub">${list.length} card${list.length === 1 ? '' : 's'}. Print on A4 or card stock at 100% scale.</p></div>
    <div class="actions" style="margin:0"><button class="btn" data-act="print" type="button">Print</button><button class="btn ghost" data-act="back" type="button">Back</button></div></div><div class="sheet">${html}</div>`;
  v.onchange = null;
  v.onclick = e => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'print') window.print(); if (b.dataset.act === 'back') backToList(v); };
  window.scrollTo(0, 0);
}
