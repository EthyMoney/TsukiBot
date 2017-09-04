
var assert = require('assert');
var num = require('../');

test('round', function() {
    assert.equal(num(123.999).round(30), '123.999');
    assert.equal(num(123.999).round(1), '124.0');
    assert.equal(num(123.450).round(1), '123.5');
    assert.equal(num(123.449).round(1), '123.4');
    assert.equal(num(123.495).round(2), '123.50');
    assert.equal(num(123.495).round(0), '123');
    assert.equal(num(123.500).round(0), '124');

    assert.equal(num(-123.999).round(30), '-123.999');
    assert.equal(num(-123.999).round(1), '-124.0');
    assert.equal(num(-123.450).round(1), '-123.5');
    assert.equal(num(-123.449).round(1), '-123.4');
    assert.equal(num(-123.495).round(2), '-123.50');
    assert.equal(num(-123.495).round(0), '-123');
    assert.equal(num(-123.500).round(0), '-124');

    assert.equal(num(0.999).round(30), '0.999');
    assert.equal(num(0.999).round(1), '1.0');
    assert.equal(num(0.450).round(1), '0.5');
    assert.equal(num(0.449).round(1), '0.4');
    assert.equal(num(0.495).round(2), '0.50');
    assert.equal(num(0.495).round(0), '0');

    assert.equal(num(-0.999).round(30), '-0.999');
    assert.equal(num(-0.999).round(1), '-1.0');
    assert.equal(num(-0.450).round(1), '-0.5');
    assert.equal(num(-0.449).round(1), '-0.4');
    assert.equal(num(-0.495).round(2), '-0.50');
    assert.equal(num(-0.495).round(0), '0');

    assert.equal(num('0.000').round(0), '0');
    assert.equal(num('0.000').round(1), '0.0');
});
