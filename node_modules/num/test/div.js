
var assert = require('assert');
var num = require('../');

test('div', function() {
    assert.equal(num('498.00000').div(4.95), '100.60606');

    assert.equal(num('1.0').div(2), '0.5');
    assert.equal(num('1.00').div(20), '0.05');

    // TODO what should this really do?
    assert.equal(num('1.0').div(3), '0.3');
    assert.equal(num('1.000').div('3'), '0.333');
});

