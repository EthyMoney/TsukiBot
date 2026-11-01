'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ccxt = require('ccxt');

/* --------------------------------------------

    ccxt removes exchanges in patch releases (4.5.91 dropped bitmex, coinex and exmo), and
    main.js constructs its exchange clients at module scope. A missing one throws
    "ccxt.bitmex is not a constructor" the moment the bot starts, and PM2 restart-loops it.
    Nothing else here loads main.js, so a dependency bump that does this passes every other
    test. This reads the source and checks each exchange it constructs against the installed
    ccxt, so the bump fails here instead of in production.

  -------------------------------------------- */

const FILES = ['main.js', 'getCoinsCG.js', 'getCoinMeta.js', 'coingecko-onchain.js'];

test('every ccxt exchange the bot constructs exists in the installed ccxt', () => {
  const used = new Set();
  for (const file of FILES) {
    const full = path.join(__dirname, '..', file);
    if (!fs.existsSync(full)) continue;
    for (const match of fs.readFileSync(full, 'utf8').matchAll(/new ccxt\.([A-Za-z0-9_]+)\s*\(/g)) {
      used.add(match[1]);
    }
  }
  assert.ok(used.size > 0, 'expected main.js to construct at least one ccxt exchange');
  const missing = [...used].filter(name => typeof ccxt[name] !== 'function');
  assert.deepEqual(missing, [], `ccxt ${ccxt.version} no longer has: ${missing.join(', ')}`);
});
