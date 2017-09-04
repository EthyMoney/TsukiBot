
var assert = require('assert');
var int = require('../');

test('build', function() {
    // zeros
    assert.equal(int(0), '0');
    assert.equal(int('0'), '0');

    assert.equal(int('-1'), '-1');
    assert.equal(int(-1), '-1');

    assert.equal(int('123456789012345678901234567890123456789'), '123456789012345678901234567890123456789');
});

test('set', function() {
    var n1 = int(1);

    assert.equal(n1, '1');
    assert.equal(n1.set(2), '2');
});
