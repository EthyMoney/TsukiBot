var assert = require('assert');

var bigint = require('bigint');
var bignumber = require('bignumber');

var int = require('./');
var integer = require('./integer');

console.log('-------------------divide-----------------------');

console.time('int');
for (var i=0 ; i<10000 ; ++i) {
    var b = int('600536865543890090554497953596609').div(81);
}
console.timeEnd('int');

console.time('bignumber');
for (var i=0 ; i<10000 ; ++i) {
    var b = (new bignumber.BigInteger('600536865543890090554497953596609')).divide(new bignumber.BigInteger('81'));
}
console.timeEnd('bignumber');

console.time('bigint');
for (var i=0 ; i<10000 ; ++i) {
    var b = bigint('600536865543890090554497953596609').div(81);
}
console.timeEnd('bigint');

console.time('google integer');
for (var i=0 ; i<10000 ; ++i) {
    var b = integer.fromString('600536865543890090554497953596609').divide(integer.fromString('81'));
}
console.timeEnd('google integer');

console.log('---------------------multiply--------------------');

var expected = int('600536865543890090554497953596609').mul(512).toString();

console.time('int');
for (var i=0 ; i<10000 ; ++i) {
    var b = int('600536865543890090554497953596609').mul(512);
}
console.timeEnd('int');
assert.equal(b.toString(), expected);

console.time('bignumber');
for (var i=0 ; i<10000 ; ++i) {
    var b = (new bignumber.BigInteger('600536865543890090554497953596609')).multiply(new bignumber.BigInteger('512'));
}
console.timeEnd('bignumber');
assert.equal(b.toString(), expected);

console.time('bigint');
for (var i=0 ; i<10000 ; ++i) {
    var b = bigint('600536865543890090554497953596609').mul(512);
}
console.timeEnd('bigint');
assert.equal(b.toString(), expected);

console.time('google integer');
for (var i=0 ; i<10000 ; ++i) {
    var b = integer.fromString('600536865543890090554497953596609').multiply(integer.fromString('512'));
}
console.timeEnd('google integer');
assert.equal(b.toString(), expected);

console.log('---------------------sub------------------');

var expected = int('600536865543890090554497953596609').sub(1234567890);

console.time('int');
for (var i=0 ; i<10000 ; ++i) {
    var b = int('600536865543890090554497953596609').sub(1234567890);
}
console.timeEnd('int');
assert.equal(b.toString(), expected);

console.time('bignumber');
for (var i=0 ; i<10000 ; ++i) {
    var b = (new bignumber.BigInteger('600536865543890090554497953596609')).subtract(new bignumber.BigInteger('1234567890'));
}
console.timeEnd('bignumber');
assert.equal(b.toString(), expected);

console.time('bigint');
for (var i=0 ; i<10000 ; ++i) {
    var b = bigint('600536865543890090554497953596609').sub(1234567890);
}
console.timeEnd('bigint');
assert.equal(b.toString(), expected);

console.time('google integer');
for (var i=0 ; i<10000 ; ++i) {
    var b = integer.fromString('600536865543890090554497953596609').subtract(integer.fromString('1234567890'));
}
console.timeEnd('google integer');
assert.equal(b.toString(), expected);

console.log('---------------------add--------------------');

var expected = int('600536865543890090554497953596609').add(1234567890);

console.time('int');
for (var i=0 ; i<10000 ; ++i) {
    var b = int('600536865543890090554497953596609').add(1234567890);
}
console.timeEnd('int');
assert.equal(b.toString(), expected);

console.time('bignumber');
for (var i=0 ; i<10000 ; ++i) {
    var b = (new bignumber.BigInteger('600536865543890090554497953596609')).add(new bignumber.BigInteger('1234567890'));
}
console.timeEnd('bignumber');
assert.equal(b.toString(), expected);

console.time('bigint');
for (var i=0 ; i<10000 ; ++i) {
    var b = bigint('600536865543890090554497953596609').add(1234567890);
}
console.timeEnd('bigint');
assert.equal(b.toString(), expected);

console.time('google integer');
for (var i=0 ; i<10000 ; ++i) {
    var b = integer.fromString('600536865543890090554497953596609').add(integer.fromString('1234567890'));
}
console.timeEnd('google integer');
assert.equal(b.toString(), expected);

console.log('--------------------tostring-------------------');

var expected = int('117795427221045605920379092698938810948219889257420906951').toString(16);

console.time('int');
for (var i=0 ; i<100 ; ++i) {
    var b = int('117795427221045605920379092698938810948219889257420906951').toString(16);
}
console.timeEnd('int');
assert.equal(b.toString(), expected);

console.time('bigint');
for (var i=0 ; i<100 ; ++i) {
    var b = bigint('117795427221045605920379092698938810948219889257420906951').toString(16);
}
console.timeEnd('bigint');
assert.equal(b.toString(), expected);

console.time('google integer');
for (var i=0 ; i<100 ; ++i) {
    var b = integer.fromString('117795427221045605920379092698938810948219889257420906951').toString(16);
}
console.timeEnd('google integer');
assert.equal(b.toString(), expected);

console.time('bignumber');
for (var i=0 ; i<100 ; ++i) {
    var b = new bignumber.BigInteger('117795427221045605920379092698938810948219889257420906951').toString(16);
}
console.timeEnd('bignumber');
assert.equal(b.toString(), expected);
