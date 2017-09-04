
var assert = require('assert');
var int = require('../');

test('lt', function() {
    assert.ok(int(-1).lt(int(0)));
    assert.ok(int(-2).lt(-1));
});

test('gt', function() {
    assert.ok(int(1).gt(int(0)));
    assert.ok(int(0).gt(int(-1)));
});

test('lte', function() {
    assert.ok(int(0).lte(int(2)));
    assert.ok(int(2).lte(int(2)));
    assert.ok(int(-2).lte(int(-2)));
});

test('gte', function() {
    assert.ok(int(1).gte(int(1)));
});

test('eq', function() {
    assert.ok(int(0).eq(int(-0)));
    assert.ok(int(1).eq(int(1)));
    assert.ok(int(123).eq(int(123)));
});

test('ne', function() {
    assert.ok(int(1).ne(int(0)));
});
