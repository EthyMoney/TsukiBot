/* ------------------------------------------------------------------------
 *
 *                     TsukiBot - src/feature-health.js
 *
 * Tells the owner, as it happens, when one feature has stopped working.
 *
 * The usage watchdog looks at the error rate across every command, and the
 * daily error summary reads failed commands and the error log. Neither sees a
 * feature that fails after its command has already returned: /c queues a
 * render and finishes, so telemetry records success, and when the render
 * fails the user gets an apology and nothing else is written anywhere. In
 * November 2026 every chart failed for two days and the owner heard about it
 * from a user.
 *
 * So features report their own outcomes here. Consecutive hard failures (the
 * feature broke) or a longer run of soft ones (could be bad input, could be a
 * broken upstream) send the owner a DM; the next success after an alert sends
 * a recovery note. A self-test can raise an alert on a single failure, since
 * nobody typed anything wrong for it to be blamed on.
 *
 * Alerts repeat at most every `realertHours` while a feature stays broken.
 * State is in memory: a restart forgets it, which is fine, because a restart
 * is also when the self-test runs again.
 *
 * Delivery and the clock are injected so tests need no Discord client.
 *
 * ------------------------------------------------------------------------ */

'use strict';

const { EmbedBuilder } = require('discord.js');

const COLOR_CRITICAL = '#ff5a76';
const COLOR_RECOVERED = '#3ddc84';

const DEFAULTS = {
  failuresToAlert: 3,      // consecutive hard failures
  softFailuresToAlert: 6,  // consecutive failures of any kind, when some were soft
  realertHours: 6
};

/**
 * @param {object} deps
 * @param {(payload: object) => Promise<any>} deps.send   DMs the owner(s)
 * @param {(msg: string) => void} [deps.log]
 * @param {(msg: string) => void} [deps.logError]         should land in the error log, so the daily summary sees it
 * @param {() => number} [deps.now]
 * @param {Partial<typeof DEFAULTS>} [deps.config]
 */
function createFeatureHealth({ send, log = () => {}, logError = () => {}, now = Date.now, config = {} }) {
  const cfg = { ...DEFAULTS, ...config };
  const state = new Map(); // feature -> { hard, soft, total, lastDetail, alertedAt, firstFailureAt }

  const get = (feature) => {
    if (!state.has(feature)) {
      state.set(feature, { hard: 0, soft: 0, total: 0, lastDetail: null, alertedAt: null, firstFailureAt: null });
    }
    return state.get(feature);
  };

  const deliver = (payload, what) => Promise.resolve()
    .then(() => send(payload))
    .catch(err => logError(`Feature health: could not send ${what}: ` + (err && err.message ? err.message : err)));

  function alertEmbed(feature, s, selfTest) {
    const since = s.firstFailureAt ? `<t:${Math.floor(s.firstFailureAt / 1000)}:R>` : 'recently';
    return new EmbedBuilder()
      .setTitle(`⚠️ ${feature} is failing`)
      .setColor(COLOR_CRITICAL)
      .setDescription(
        (selfTest
          ? `The scheduled self-test of **${feature}** failed.`
          : `**${s.total}** ${feature} request${s.total === 1 ? '' : 's'} in a row failed, starting ${since}.`) +
        (s.lastDetail ? `\n\n**Last error**\n\`\`\`\n${String(s.lastDetail).slice(0, 900)}\n\`\`\`` : '') +
        '\nUsers are getting an error message instead of a result.')
      .setFooter({ text: `TsukiBot feature health · repeats every ${cfg.realertHours}h while it stays broken` });
  }

  /**
   * Records a failure. Returns true when this call sent an alert.
   * @param {string} feature  short name shown to the owner, e.g. "/c chart"
   * @param {{detail?: any, soft?: boolean, selfTest?: boolean}} [options]
   *   soft: the failure may be the user's input (a pair that does not exist)
   *   selfTest: a probe with known-good input failed; alert at once
   */
  function fail(feature, { detail, soft = false, selfTest = false } = {}) {
    const s = get(feature);
    const at = now();
    if (s.total === 0) s.firstFailureAt = at;
    s.total++;
    if (soft) s.soft++; else s.hard++;
    if (detail !== undefined && detail !== null) s.lastDetail = detail instanceof Error ? (detail.stack || detail.message) : String(detail);

    const tripped = selfTest || s.hard >= cfg.failuresToAlert || s.total >= cfg.softFailuresToAlert;
    const due = s.alertedAt === null || at - s.alertedAt >= cfg.realertHours * 3600 * 1000;
    if (!tripped || !due) return false;

    s.alertedAt = at;
    // One line in the error log as well, so the daily error summary carries it too.
    logError(`FEATURE FAILING: ${feature}: ${s.total} consecutive failure(s)${selfTest ? ' (self-test)' : ''}; last: ` +
      String(s.lastDetail || 'no detail').split('\n')[0]);
    deliver({ embeds: [alertEmbed(feature, s, selfTest)] }, `the ${feature} alert`);
    return true;
  }

  /**
   * Records a success. Sends a recovery note when the feature had been alerted on.
   * Returns true when it did.
   * @param {string} feature
   */
  function ok(feature) {
    const s = get(feature);
    const wasAlerted = s.alertedAt !== null;
    const failures = s.total;
    const since = s.firstFailureAt;
    state.set(feature, { hard: 0, soft: 0, total: 0, lastDetail: null, alertedAt: null, firstFailureAt: null });
    if (!wasAlerted) return false;

    log(`Feature health: ${feature} recovered after ${failures} failure(s).`);
    deliver({
      embeds: [new EmbedBuilder()
        .setTitle(`✅ ${feature} is working again`)
        .setColor(COLOR_RECOVERED)
        .setDescription(`It failed ${failures} time${failures === 1 ? '' : 's'} in a row` +
          (since ? `, starting <t:${Math.floor(since / 1000)}:R>` : '') + '; the latest request succeeded.')]
    }, `the ${feature} recovery note`);
    return true;
  }

  /** Current failure streaks, for /usage or debugging. */
  function snapshot() {
    const out = {};
    for (const [feature, s] of state) out[feature] = { ...s };
    return out;
  }

  return { ok, fail, snapshot };
}

module.exports = { createFeatureHealth, FEATURE_HEALTH_DEFAULTS: DEFAULTS };
