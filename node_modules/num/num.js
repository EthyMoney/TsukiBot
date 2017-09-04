var int = require('int');

function Num(num, prec) {
    if (!(this instanceof Num)) {
        return new Num(num, prec);
    }

    var self = this;
    if (num instanceof Num) {
        self._int = int(num._int);
        self._precision = num._precision;
        return self;
    }

    // convert to a string
    num = '' + num;

    // find Num point
    var dec = num.indexOf('.');

    if (dec >= 0) {
        // take out the Num point
        num = num.replace('.', '');
        var precision = num.length - dec;
    }
    else {
        var precision = 0;
    }

    this._int = int(num);
    this._precision = prec || precision;
}

// TODO (shtylman) cleanup
Num.prototype.toString = function() {

    var num_str = this._int.toString();

    // 0 precision, just return the int
    if (this._precision <= 0) {
        return num_str;
    }

    // if number is negative, store that and make it positive
    var neg = false;
    if (num_str.charAt(0) === '-') {
        // negative
        neg = true;
        num_str = num_str.slice(1);
    }

    // find index where to add the decimal point
    var idx = num_str.length - this._precision;

    // insert the proper number of 0s after the .
    if(idx < 0) {
        var zeros = new Array(-idx + 1).join('0');
        idx = 0;
    } else {
        var zeros = '';
    }

    // make sure there's always a number before the .
    var before_dot = idx > 0 ? num_str.slice(0, idx) : '0';

    return (neg ? '-' : '') + before_dot + '.' + zeros + num_str.slice(idx);
};

Num.prototype.valueOf = Num.prototype.toString;
Num.prototype.toJSON = Num.prototype.toString;

/// return {int} the precision
Num.prototype.get_precision = function() {
    return this._precision;
};

/// setting precision to < current precision will floor, NOT round
/// modifies this object
Num.prototype.set_precision = function(precision) {
    var self = this;
    var precision_diff = precision - self._precision;

    if (precision_diff > 0) {
        self._int = self._int.mul(int(10).pow(precision_diff));
    }
    else if(precision_diff < 0) {
        self._int = self._int.div(int(10).pow(-precision_diff));
    }

    self._precision += precision_diff;
    return self;
};

/// returns a copy
Num.prototype.round = function(precision) {
    var copy = Num(this);

    if (precision >= copy._precision) {
        return copy;
    }

    var num_str = copy._int.toString();

    // the index to check for rounding
    var idx = num_str.length - copy._precision + precision;

    // the number to check for rounding
    var n = num_str[idx] - 0;

    var neg = num_str[0] === '-';

    copy.set_precision(precision);

    if ((neg && n < 5) || (!neg && n >= 5)) {
        copy._int = copy._int.add(1);
    }

    return copy;
};

/// returns new Num, -this
Num.prototype.neg = function() {
    return new Num(this._int.neg(), this._precision);
};

/// returns new Num, absolute value of this
Num.prototype.abs = function() {
    return new Num(this._int.abs(), this._precision);
};

/// returns a + b
/// a, b can each be either a Num, String, or Number
/// will return a new Num with the greatest precision of the operands
Num.add = function(a, b) {
    a = ensure_num(a);
    b = ensure_num(b);

    var precision = Math.max(a._precision, b._precision);
    var a = Num(a);
    a.set_precision(precision);
    var b = Num(b);
    b.set_precision(precision);

    // the integer result
    var num_res = a._int.add(b._int);

    return new Num(num_res, precision);
};

/// returns a - b
/// a, b can each be either a Num, String, or Number
/// will return a new Num with the greatest precision of the operands
Num.sub = function(a, b) {
    b = Num(b); // convert/copy before modifying
    b._int = b._int.neg(); // negate
    return Num.add(a, b);
};

/// returns a * b
/// a, b can each be either a Num, String, or Number
/// will return a new Num with precision = a.precision + b.precision
Num.mul = function(a, b) {
    a = ensure_num(a);
    b = ensure_num(b);
    return new Num(a._int.mul(b._int), a._precision + b._precision);
};

Num.div = function(a, b) {
    a = ensure_num(a);
    b = ensure_num(b);

    var a_int = a._int;

    var precision = b._precision;
    for (var i=0 ; i<precision ; ++i) {
        a_int = a_int.mul(10);
    }

    return Num(a_int.div(b._int), a._precision);
};

Num.mod = function(a, b) {
    a = ensure_num(a);
    b = ensure_num(b);

    var prec_a = a._precision;
    var prec_b = b._precision;
    var a = a._int;
    var b = b._int;

    while (prec_a < prec_b) {
        a = a.mul(10);
        prec_a += 1;
    }

    while (prec_b < prec_a) {
        b = b.mul(10);
        prec_b += 1;
    }

    return Num(a.mod(b), prec_a);
};

/// returns < 0 if a < b, 0 if a == b, > 0 if a > b
Num.cmp = function(a, b) {

    // make copies cause we modify precision
    var a = Num(a);
    var b = Num(b);

    if (a._int._s != b._int._s) {
        return a._int._s ? -1 : 1;
    }

    // normalize the two numbers
    var precision = Math.max(a._precision, b._precision);
    a.set_precision(precision);
    b.set_precision(precision);

    return a._int.cmp(b._int);
};

Num.eq = function(a, b) {
    return Num.cmp(a, b) === 0;
};

Num.gt = function(a, b) {
    return Num.cmp(a, b) > 0;
};

Num.gte = function(a, b) {
    return Num.cmp(a, b) >= 0;
};

Num.lt = function(a, b) {
    return Num.cmp(a, b) < 0;
};

Num.lte = function(a, b) {
    return Num.cmp(a, b) <= 0;
};

// add all the static methods in Num to Num's prototype
(function() {
    function add_method(name) {
        Num.prototype[name] = function(b) {
            return Num[name](this, b);
        }
    }

    for(var i in Num) {
        add_method(i);
    }
})();

/// box the value into a Num if it isn't
function ensure_num(val) {
    if (val instanceof Num) {
        return val;
    }

    return Num(val);
}

module.exports = Num;
