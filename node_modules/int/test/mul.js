
var assert = require('assert');
var int = require('../');

test('mul#sign', function() {
    assert.equal(int(1).mul(1)._s, 0);
    assert.equal(int(-1).mul(1)._s, 1);
    assert.equal(int(-1).mul(-1)._s, 0);
    assert.equal(int(1).mul(-1)._s, 1);
});

test('mul', function() {
    // validate
    for (var i=0 ; i<1000 ; ++i) {
        for (var j=1 ; j<10 ; ++j) {
            assert.equal(int(i).mul(j), i * j + '');
            assert.equal(int(-i).mul(j), -i * j + '');
            assert.equal(int(-i).mul(-j), -i * -j + '');
        }
    }

    assert.equal(int(1234).mul(1234), '1522756');
    assert.equal(int('1234567890').mul('1234567890'), '1524157875019052100');

    var n1 = int(1);
    for (var i = 0; i<10 ; ++i, n1=n1.mul(2));
    assert.equal(n1, '1024');
});

