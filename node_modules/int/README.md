[![Build Status](https://secure.travis-ci.org/shtylman/node-int.png)](http://travis-ci.org/shtylman/node-int)

### Don't let javascript numbers hold you back. Let your true large numbers shine!! ###

**int** is an arbitrary size integer library written in pure javascript. Why? Because I can and because you need it.

## quick and dirty ##

```
npm install int
```

```javascript
var int = require('int');

var large = int('1234567890').mul('1234567890');

// did it work?
console.log(large.toString());
//'1524157875019052100' hell yea

// other cool stuff
var add_me = int('123456').add('-123456');
var power_up = int(2).pow(10);

```

## api ##

Besides the **int** function, all of the other methods operate on the objects returned by **int**

### int (value) ###
> construct a new aribtrary precision integer

> valid values are native numbers, strings, or int objects. Anything after a decimal point will be discarded

### add (value) ###
> add {value} to our number and return a new int

### sub (value) ###
> subtract {value} from our number and return a new int

### mul (value) ###
> multiply our int by {value} and return a new int

### div (value) ###
> divide our int by {value} and return a new int (can truncate)

### pow (value) ###
> raise our int by {value} and return a new int

### mod (value) ###
> mod our int by {value} and return the new int

### neg ###
> return a new int that is the negative

### abs ###
> return a new int that is the absolute value

### cmp (value) ###
> compare our value to {value}

> return 0 if self and value are equal, -1 if self < value, 1 if self > value

### lt (value) ###
> return true if self < value

### lte (value) ###
> return true if self <= value

### gt (value) ###
> return true if self > value

### gte (value) ###
> return true if self >= value

### eq (value) ###
> return true if self == value

### ne (value) ###
> return true if self != value

## browser support

[![browser support](http://ci.testling.com/shtylman/node-int.png)](http://ci.testling.com/shtylman/node-int)
