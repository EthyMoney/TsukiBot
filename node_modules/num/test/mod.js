
var assert = require('assert');
var num = require('../');

test('mod', function() {
    assert.equal(num('1').mod('0.01'), '0.00');
    assert.equal(num('1').mod('0.03'), '0.01');
    assert.equal(num('1.02').mod('0.01'), '0.00');
    assert.equal(num('1.001').mod('0.01'), '0.001');
});
