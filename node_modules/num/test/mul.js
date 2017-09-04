
var assert = require('assert');
var num = require('../');

test('mul', function() {
    assert.equal(num.mul(1.2, 2.4), '2.88');
    assert.equal(num.mul(.2, 2.4), '0.48');
    assert.equal(num.mul(.2, 2), '0.4');
    assert.equal(num.mul(5, 2), '10');
    assert.equal(num.mul('123456789.32423455645', '123323.34343'), '15225104028597.7358269570716235');
});

