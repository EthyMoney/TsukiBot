
var assert = require('assert');
var num = require('../');

test('sub', function() {
    assert.equal(num.sub(0, 0), '0');
    assert.equal(num.sub('0', '-0'), '0');

    assert.equal(num.sub('1.0', '-1.0'), '2.0');

    assert.equal(num('987654321987654321.12345678901').sub(100.012), '987654321987654221.11145678901');
    assert.equal(num(100.012).sub(num('987654321987654321.12345678901')), '-987654321987654221.11145678901');
});

test('sub#constness', function() {
    var one = num(1.2);
    var two = num(-1.2);
    assert.equal(one, '1.2');
    assert.equal(two, '-1.2');

    one.sub(two);
    assert.equal(one, '1.2');
    assert.equal(two, '-1.2');

    two.sub(one);
    assert.equal(one, '1.2');
    assert.equal(two, '-1.2');
});
