
var assert = require('assert');
var num = require('../');

test('add', function() {
    assert.equal(num(0).add(0), '0');
    assert.equal(num(-0).add(0.0), '0');

    assert.equal(num(0.1).add(0.2), '0.3');

    // preserve precision
    assert.equal(num(1.2).add(-1.2), '0.0');

    // misc
    assert.equal(num(1.2).add(2.4), '3.6');

    // large numbers
    assert.equal(num('987654321987654321.12345678901').add(1000.012), '987654321987655321.13545678901');

    assert.equal(num('987654321987654321.12345678901').add('-987654321987654321.12345678901'), '0.00000000000');
});

test('add#constness', function() {
    var one = num(1.2);
    var two = num(-1.2);
    assert.equal(one, '1.2');
    assert.equal(two, '-1.2');

    one.add(two);
    assert.equal(one, '1.2');
    assert.equal(two, '-1.2');

    two.add(one);
    assert.equal(one, '1.2');
    assert.equal(two, '-1.2');
});
