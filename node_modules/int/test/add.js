
var assert = require('assert');
var int = require('../');

test('add#sign', function() {
    assert.ok(int(-1).add(1).eq(0));

    // simple arithmatic
    assert.equal(int(0).add(0)._s, 0);
    assert.equal(int(1).add(0)._s, 0);

    // two negative numbers should end up negative
    assert.ok(int(-1).add(-1).lt(0));

    // should equate to zero regardless of sign
    assert.ok(int(-1).add(1).eq(0));
    assert.ok(int(1).add(-1).eq(0));
});

test('add', function() {

    // different ways to add
    assert.equal(int().add(int(1)), '1');
    assert.equal(int().add(1), '1');
    assert.equal(int().add('1'), '1');

    assert.equal(int(123456789).add(1), 123456790);
    assert.equal(int('123456789012345678901234567890123456789').add(1), '123456789012345678901234567890123456790');

    // validate
    for (var i=0 ; i<1000 ; ++i) {
        for (var j=0 ; j<10 ; ++j) {
            assert.equal(int(i).add(j), i + j + '');
            assert.equal(int(-i).add(j), -i + j + '');
            assert.equal(int(i).add(-j), i + - j + '');
            assert.equal(int(-i).add(-j), -i + - j + '');
        }
    }
});

// test that add does not perturb argument
test('add#constness', function() {
    var one = int(1);
    var none = int(-1);

    one.add(none);
    assert.equal(one, '1');
    assert.equal(none, '-1');

    none.add(one);
    assert.equal(one, '1');
    assert.equal(none, '-1');
});

