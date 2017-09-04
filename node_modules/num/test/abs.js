
var assert = require('assert');
var num = require('../');

test('abs', function() {
    assert.equal(num(-1).abs(), '1');
    assert.equal(num(0).sub(3).abs(), '3');

    assert.equal(num(44).abs(), '44');
    assert.equal(num(-2).abs().add(2), '4');
});

