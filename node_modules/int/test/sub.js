
var assert = require('assert');
var int = require('../');

test('sub', function() {

    assert.equal(int(0).sub(0), 0);
    assert.equal(int(1).sub(1), 0);
    assert.equal(int(0).sub(0)._d.length, 0);

    assert.equal(int(100).sub(9), 91);
    assert.equal(int(9).sub(100), -91);

    assert.equal(int(90).sub(100), -10);
    assert.equal(int(-99).sub(-99), 0);

    assert.equal(int(-99).sub(1), -100);
    assert.equal(int(-1).sub(99), -100);

    assert.equal(int(82).sub(73), 9);

    assert.equal(int('782910138827292261791972728324982').sub('182373273283402171237474774728373'), '600536865543890090554497953596609');
});

// test that sub does not perturb argument
test('sub#constness', function() {
    var one = int(1);
    var none = int(-1);

    one.sub(none);
    assert.equal(one, '1');
    assert.equal(none, '-1');

    none.sub(one);
    assert.equal(one, '1');
    assert.equal(none, '-1');
});
