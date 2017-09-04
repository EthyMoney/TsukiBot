
var assert = require('assert');
var num = require('../');

test('precision', function() {
    assert.equal(num(1.999).set_precision(30), '1.999000000000000000000000000000');
    assert.equal(num(1.999).set_precision(1), '1.9');
    assert.equal(num(-1.999).set_precision(30), '-1.999000000000000000000000000000');
    assert.equal(num(-1.999).set_precision(1), '-2.0');
});

test('get_precision', function() {
    assert.equal(0, num('0').get_precision());
    assert.equal(2, num('0.20').get_precision());
    assert.equal(1, num('.5').get_precision());
});

