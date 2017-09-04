var assert = require('assert');
var int = require('../');

test('base16', function() {
    assert.equal(int('1').toString(16), '1');
    assert.equal(int('10').toString(16), 'a');
    assert.equal(int('16').toString(16), '10');

    assert.equal(int('140').toString(8), '214');

    assert.equal(int('948219889257420906951').toString(16), '336731c56534cf61c7');

    assert.equal(int('117795427221045605920379092698938810948219889257420906951').toString(16),
                 '4cdd775fcaac863e0ebac69ba1eaab1e666a835150f61c7');

    // base must be > 0 and <= 36
    assert.throws(function() {
        int('12345').toString(66)
    });
});
