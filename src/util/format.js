/* ------------------------------------------------------------------------
 *
 *                        TsukiBot - src/util/format.js
 *
 * Pure formatting and string helpers, extracted from main.js.
 *
 * This is the first step of breaking main.js apart, and it starts here on
 * purpose: these functions close over nothing and touch no global state, so
 * moving them carries no behavioral risk and they become unit-testable
 * immediately. Everything else in main.js still reads shared cache globals,
 * which is what makes the rest of the split the harder job.
 *
 * Nothing in this file may import Discord, the caches, or the API clients.
 * If a helper needs any of those, it does not belong here.
 *
 * ------------------------------------------------------------------------ */

'use strict';

/**
 * Shortens a number to 2 decimal places, but only once it is large enough that
 * the extra precision stops being meaningful. Small values (sub-10) keep their
 * full precision, which is what makes low-priced tokens readable.
 * @param {number|string} x
 * @returns {number|string} the value with at most 2 decimals, or unchanged
 */
function trimDecimalPlaces(x) {
  if (x > 10 && x.toString().indexOf('.') !== -1) {
    x = parseFloat(x);
    return x.toFixed(2); //shorten the decimal places
  }
  else {
    return x;
  }
}

/**
 * Adds thousands separators, trimming decimals first.
 * @param {number|string} x
 * @returns {string}
 */
function numberWithCommas(x) {
  x = trimDecimalPlaces(x);
  let parts = x.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * Compacts a large number to a k/m/b/t suffixed string, e.g. 1234567 -> "1.2m".
 * @param {number|null} num
 * @param {number} [fixed] extra decimal places to keep
 * @returns {string|null} null only when num is null
 */
function abbreviateNumber(num, fixed) {
  if (num === null) { return null; } // terminate early
  if (num === 0) { return '0'; } // terminate early
  fixed = (!fixed || fixed < 0) ? 0 : fixed; // number of decimal places to show
  const b = (num).toPrecision(2).split('e'), // get power
    k = b.length === 1 ? 0 : Math.floor(Math.min(b[1].slice(1), 14) / 3), // floor at decimals, ceiling at trillions
    c = k < 1 ? num.toFixed(0 + fixed) : (num / Math.pow(10, k * 3)).toFixed(1 + fixed), // divide by power
    d = c < 0 ? c : Math.abs(c), // enforce -0 is 0
    e = d + ['', 'k', 'm', 'b', 't'][k]; // append power
  return e;
}

/**
 * Formats a USD amount for display, keeping more precision below $1 so that
 * sub-cent tokens do not all render as "$0.00".
 * @param {number|null|undefined} value
 * @returns {string}
 */
function formatUsd(value) {
  if (value == null || isNaN(value)) return 'n/a';
  if (value >= 1) return '$' + numberWithCommas(Number(value).toFixed(2));
  return '$' + trimDecimalPlaces(Number(value).toFixed(8));
}

/**
 * Formats a plain money amount, always to two decimals.
 *
 * Distinct from formatUsd on purpose: that one keeps up to eight decimals below a dollar so
 * sub-cent coin *prices* stay readable, which is wrong for a portfolio total or a 24h change
 * (a 25 cent move should read "$0.25", not "$0.25032095").
 *
 * @param {number|null|undefined} value
 * @returns {string}
 */
function formatUsdAmount(value) {
  if (value == null || isNaN(value)) return 'n/a';
  return '$' + numberWithCommas(Number(value).toFixed(2));
}

/**
 * Splits a string on spaces, except inside square brackets.
 * @param {string} input
 * @returns {string[]}
 */
function respectBracketsSpaceSplit(input) {
  let i = 0, stack = [], parts = [], part = '';
  while (i < input.length) {
    let c = input[i]; i++;  // get character
    if (c == ' ' && stack.length == 0) {
      parts.push(part.replace(/"/g, '\\"'));  // append part
      part = '';  // reset part accumulator
      continue;
    }
    if (c == '[') stack.push(c);  // begin square brace
    else if (c == ']' && stack[stack.length - 1] == '[') stack.pop();  // end square brace
    part += c; // append character to current part
  }
  if (part.length > 0) parts.push(part.replace(/"/g, '\\"'));  // append remaining part
  return parts;
}

/**
 * Breaks a string into chunks of at most `len` characters without splitting a
 * word. Used to stay under Discord's message and embed field size limits.
 * @param {string} str
 * @param {number} len
 * @returns {string[]}
 */
function chunkString(str, len) {
  const input = respectBracketsSpaceSplit(str.trim());
  let [index, output] = [0, []];
  output[index] = '';
  input.forEach(word => {
    let temp = `${output[index]} ${word}`.trim();
    if (temp.length <= len) {
      output[index] = temp;
    } else {
      index++;
      output[index] = word;
    }
  });
  return output;
}

/**
 * True when the string contains only ASCII letters and digits. An empty string
 * returns true, matching the original behavior callers rely on.
 * @param {string} str
 * @returns {boolean}
 */
function isAlphaNumeric(str) {
  let code, i, len;
  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
      !(code > 64 && code < 91) && // upper alpha (A-Z)
      !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
}

/**
 * Loose URL check used to validate tag links.
 * @param {string} str
 * @returns {boolean}
 */
function validURL(str) {
  const pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
    '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
  return !!pattern.test(str);
}

/**
 * @param {string} string
 * @returns {string}
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  abbreviateNumber,
  capitalizeFirstLetter,
  chunkString,
  formatUsd,
  formatUsdAmount,
  isAlphaNumeric,
  numberWithCommas,
  respectBracketsSpaceSplit,
  sleep,
  trimDecimalPlaces,
  validURL
};
