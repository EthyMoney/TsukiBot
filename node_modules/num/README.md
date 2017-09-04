[![Build Status](https://secure.travis-ci.org/shtylman/node-num.png)](http://travis-ci.org/shtylman/node-num)

### Unleash all the numbers!! ###

**num** is an arbitrary size fixed precision library written in pure javascript. Why? Because once you write one library you want to write all the libraries.

Looking for just integers? Check out [int](https://github.com/shtylman/node-int)

## quick and dirty ##

```
npm install num
```

```javascript
var num = require('num');

var foo = num('0.1').add('0.2');

// did it work?
console.log(foo.toString());
//'0.3' hell yea
```

## api ##

Besides the **num** function, all of the other methods operate on the objects returned by **num**

### num (value) ###
> construct a new decimal

> valid values are integers, numbers, or strings

### add (value) ###
> add {value} to our number and return a new num

### sub (value) ###
> subtract {value} from our number and return a new num

### mul (value) ###
> multiply our num by {value} and return a new num

### div (value) ###
> divide our num by {value} and return a new num

### neg ###
> return a new num that is the negative

### abs ###
> return new num that is the absolute value

### abs ###
> return a new num that is the absolute value

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

[![browser support](http://ci.testling.com/shtylman/node-num.png)](http://ci.testling.com/shtylman/node-num)
