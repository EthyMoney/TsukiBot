
var Int = function(num) {
    // can be called as a function
    if (!(this instanceof Int)) {
        return new Int(num);
    }

    var self = this;

    // copy existing Int object
    if (num instanceof Int){
        self._s = num._s;
        self._d = num._d.slice();
        return;
    }

    // sign
    self._s = ((num += '').charAt(0) === '-') ? 1 : 0;

    // digits
    self._d = [];

    // remove any leading - or + as well as other invalid characters
    num = num.replace(/[^\d]/g, '');

    // _d is the array of single digits making up the number
    var ln = num.length;
    for (var i=0 ; i<ln ; ++i) {
        self._d.push(+num[i]);
    }

    trim_zeros(self);

    // zeros are normalized to positive
    // TODO (shtylman) consider not doing this and only checking in toString?
    if (self._d.length === 0) {
        self._s = 0;
    }
};

/// add num and return new integer
Int.prototype.add = function(num) {
    var self = this;
    var num = ensure_int(num);

    if(self._s != num._s) {
        num._s ^= 1;
        var res = self.sub(num);
        num._s ^= 1;
        return res;
    }

    // a will be the smaller number
    if (self._d.length < num._d.length) {
        var a = self._d;
        var b = num._d;
        var out = Int(num);
    }
    else {
        var a = num._d;
        var b = self._d;
        var out = Int(self);
    }

    var la = a.length;
    var lb = b.length;

    // clone the larger number
    var res = out._d;

    var carry = 0;
    for (var i = lb - 1, j = la - 1; i >= 0, j >= 0 ; --i, --j) {
        res[i] += carry + a[j];
        carry = 0;

        if (res[i] >= 10) {
            res[i] -= 10;
            carry = 1;
        }
    }

    // carry the rest of the way
    for (; i >= 0 ; --i) {
        res[i] += carry;
        carry = 0;
        if (res[i] >= 10) {
            res[i] -= 10;
            carry = 1;
        }

        // no carry, rest of the number will be unchanged
        if (carry === 0) {
            break;
        }
    }

    // remaining carry?
    if (carry > 0) {
        res.unshift(1);
    }

    return out;
}

Int.prototype.sub = function(num) {
    var self = this;

    // some operations are destructive
    var num = Int(num);

    if(self._s != num._s) {
        num._s ^= 1;
        var res = this.add(num);
        num._s ^= 1;
        return res;
    }

    var s1 = self._s;
    var s2 = num._s;

    // make numbers positive for determining the greater one
    // in absolute terms
    self._s = num._s = 0;

    // make a the smaller number (abs value)
    var c = self.lt(num);
    var a = c ? self._d : num._d;
    var b = c ? num._d : self._d;

    // restore original signs
    self._s = s1;
    num._s = s2;

    var la = a.length;
    var lb = b.length;

    var out = Int((c) ? num : self);
    out._s = num._s & self._s; // ??
    var res = out._d;

    // basic subtraction for common size
    var borrow = 0;
    for (var i = lb - 1, j = la - 1; i >= 0, j >= 0 ; --i, --j) {
        res[i] -= a[j] + borrow;
        borrow = 0;

        if (res[i] < 0) {
            res[i] += 10;
            borrow = 1;
        }
    }

    // carry the rest of the way
    for (; i >= 0 ; --i) {
        res[i] -= borrow;
        borrow = 0;
        if (res[i] < 0) {
            res[i] += 10;
            borrow = 1;
        }

        // no carry, rest of the number will be unchanged
        if (borrow === 0) {
            break;
        }
    }

    // flip the sign if sub num was larger
    c && (out._s ^= 1);

    trim_zeros(out);

    // TODO the subtraction should just be smarter
    if (out._d.length === 0) {
        out._s = 0;
    }

    return out;
};

Int.prototype.mul = function(num) {
    var self = this;

    var r = self._d.length >= (num = Int(num))._d.length;
    var a = (r ? self : num)._d;
    var b = (r ? num : self)._d;

    var la = a.length;
    var lb = b.length;

    var sum = Int();
    var zeros = [];

    // loop for smaller number
    for (var i = lb - 1 ; i >= 0 ; --i) {
        var out = Int();

        // insert proper number of trailing 0s
        var val = out._d = out._d.concat(zeros);

        // reset carry
        var carry = 0;

        // top number
        for (var j = la - 1; j >= 0; --j) {
            // multiplication result
            var mul = b[i] * a[j] + carry;

            // this is the single digit we keep
            var res = mul % 10;

            // carry amount
            carry = Math.floor(mul / 10);

            // insert the number into our new integer
            val.unshift(res);
        }

        // apply any remaining carry
        if (carry) {
            val.unshift(carry);
        }

        sum = sum.add(out);
        zeros.push(0);
    }

    sum._s = self._s ^ num._s;
    return sum;
};

Int.prototype.div = function(num) {
    var self = this;

    // copy since we change sign of num
    var num = Int(num);

    if(num == '0') {
        throw new Error('Division by 0');
    }
    else if(self == '0') {
        return Int();
    }

    // copy since we do destructive things
    var numerator = self._d.slice();

    var quo = Int();
    quo._s = self._s ^ num._s;

    // normalize num to positive number
    var orig_s = num._s;
    num._s = 0;

    // remainder from previous calculation
    var rem = Int();

    while (numerator.length) {
        // long division
        // shift numbers off the numerator until we have achieved size
        // every number after the first causes a 0 to be inserted
        // numbers shifted in from the remainder should not cause 0 insertion

        var c = 0;
        while (numerator.length && rem.lt(num)) {
            if (c++ > 0) {
                quo._d.push(0);
            }

            // shift a number from numerator to our running num
            rem._d.push(numerator.shift());

            // important to trim here since 009 - N won't be done right otherwise
            trim_zeros(rem);
        }

        var count = 0;
        while(rem.gte(num) && ++count) {
            rem = rem.sub(num);
        }

        if (count === 0) {
            quo._d.push(0);
            break;
        }

        quo._d.push(count);
    }

    var rlen = rem._d.length;

    if (rlen > 1 || (quo._s && rlen > 0)) {
        rem = rem.add(5);
    }

    if (quo._s && (rlen !== rem._d.length || rem._d[0] >= 5)) {
        quo = quo.sub(1);
    }

    // put back the sign of num
    num._s = orig_s;

    return trim_zeros(quo);
};

Int.prototype.mod = function(num) {
    return this.sub(this.div(num).mul(num));
};

Int.prototype.pow = function(num) {
    var out = Int(this);
    if((num = (Int(num))) == 0) {
        return out.set(1);
    }

    for(var i = Math.abs(num); --i; out.set(out.mul(this)));
    return num < 0 ? out.set((Int(1)).div(out)) : out;
};

/// set this number to the value of num
Int.prototype.set = function(num) {
    this.constructor(num);
    return this;
};

/// -1 if self < n, 0 if self == n, 1 if self > n
Int.prototype.cmp = function(num) {
    var self = this;
    var num = ensure_int(num);

    if (self._s != num._s) {
        return self._s ? -1 : 1;
    }

    var a = self._d;
    var b = num._d;

    var la = a.length;
    var lb = b.length;

    if (la != lb) {
        return ((la > lb) ^ self._s) ? 1 : -1;
    }

    for (var i = 0; i < la; ++i) {
        if (a[i] != b[i]) {
            return ((a[i] > b[i]) ^ self._s) ? 1 : -1;
        }
    }

    // no differences
    return 0;
};

Int.prototype.neg = function() {
    var out = Int(this);
    out._s ^= 1;
    return out;
};

Int.prototype.abs = function() {
    var out = Int(this);
    out._s = 0;
    return out;
};

// alphabet for converting to a specific base
var alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

Int.prototype.valueOf = Int.prototype.toString = function(radix){
    var self = this;

    if (!radix || radix === 10) {
        return (self._s && self._d.length ? '-' : '') + ((self._d.length) ? self._d.join('') : '0');
    }

    if (radix < 2 || radix > 36) {
        throw RangeError('radix out of range: ' + radix);
    }

    var radix_pow = Math.pow(radix, 6);

    var rem = self;
    var result = '';
    while (true) {
        var div = rem.div(radix_pow);
        var int = rem.sub(div.mul(radix_pow));
        var digits = (+int.toString()).toString(radix);
        rem = div;

        if (rem.eq(0)) {
            return digits + result;
        }
        else {
            while (digits.length < 6) {
                digits = '0' + digits;
            }
            result = '' + digits + result;
        }
    }
};

Int.prototype.gt = function (num) {
    return this.cmp(num) > 0;
};

Int.prototype.gte = function (num) {
    return this.cmp(num) >= 0;
};

Int.prototype.eq = function (num) {
    return this.cmp(num) === 0;
};

Int.prototype.ne = function (num) {
    return this.cmp(num) !== 0;
};

Int.prototype.lt = function (num) {
    return this.cmp(num) < 0;
};

Int.prototype.lte = function (num) {
    return this.cmp(num) <= 0;
};

/// private api

function ensure_int(val) {
    if (val instanceof Int) {
        return val;
    }

    return Int(val);
}

/// remove leading 0's from the int
function trim_zeros(int) {
    while (int._d.length && int._d[0] === 0) {
        int._d.shift();
    }

    return int;
}

module.exports = Int;

