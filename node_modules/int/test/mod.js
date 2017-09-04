
var assert = require('assert');
var int = require('../');

test('mod', function() {
    // validate
    for (var i=0 ; i<1000 ; ++i) {
        for (var j=1 ; j<10 ; ++j) {
            assert.equal(int(i).mod(j), i % j + '');
            // TODO negative mods
        }
    }

    assert.equal(int('862400965').mod(16).toString(), '5');
});
