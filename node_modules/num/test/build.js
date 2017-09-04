
var assert = require('assert');
var num = require('../');

test('build', function() {

    // zeros
    assert.equal(num(0), '0');
    assert.equal(num('0'), '0');
    assert.equal(num('0.'), '0');
    assert.equal(num('.0'), '0.0');
    assert.equal(num('0.000'), '0.000');
    assert.equal(num('-.00'), '0.00');

    // whole number
    assert.equal(num(5), '5');
    assert.equal(num(-5), '-5');
    assert.equal(num('5'), '5');
    assert.equal(num('-5'), '-5');

    // misc
    assert.equal(num(1.2), '1.2');
    assert.equal(num(.2), '0.2');
    assert.equal(num(-.2), '-0.2');
    assert.equal(num(-1.2), '-1.2');
    assert.equal(num('0.001'), '0.001');
    assert.equal(num('0.001234'), '0.001234');
    assert.equal(num(123), '123');
    assert.equal(num(-234), '-234');

    // large numbers
    assert.equal(num('987654321987654321'), '987654321987654321');
    assert.equal(num('-987654321987654321.12345678901'), '-987654321987654321.12345678901');
    assert.equal(num('987654321987654321.12345678901'), '987654321987654321.12345678901');
    assert.equal(num('-.000098765432198765432112345678901'), '-0.000098765432198765432112345678901');
});

test('build#precision', function() {
    assert.equal(num(15, 1), '1.5');
    assert.equal(num(1234567890, 5), '12345.67890');
    assert.equal(num(-122, 4), '-0.0122');
});

