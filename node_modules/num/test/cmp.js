
var assert = require('assert');
var num = require('../');

test('lt', function() {
    assert.ok(num(0).gte(0));

    assert.ok(num(-1.2).lt(2));
    assert.ok(num(-1.2).lt(0));

    assert.ok(num(-1.2).lt(-1));

    assert.ok(num(0.001).lt(0.10001));
});

test('lte', function() {
    assert.ok(num(-1.2).lte(-1.2));
});

test('gt', function() {
    assert.ok(num(1.2).gt(0));
    assert.ok(num(-1).gt(-5.12345));

    assert.ok(num(0.001).gt(0.00001));
});

