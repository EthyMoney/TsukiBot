-- ---------------------------------------------------------------------------
-- TsukiBot - additional tables
--
-- REFERENCE ONLY. You do not need to run this file.
--
-- The bot issues these exact CREATE TABLE IF NOT EXISTS statements itself on
-- every startup (see ensureAlertsTable, ensureHoldingsTable, and
-- ensureSchedulesTable in main.js), so a fresh deployment needs no migration
-- step. This file exists so the schema is documented somewhere readable, and
-- so you can pre-create the tables if your database user is not allowed to
-- create tables at runtime.
--
-- The original tsukibot.profiles table lives in TsukiBotDB_Schema and is still
-- required; it is not repeated here.
-- ---------------------------------------------------------------------------


-- Price alerts. One row per alert rather than a JSON blob per user, so the
-- once-a-minute scan can select only what it needs and expired alerts can be
-- pruned in SQL. Alerts are one-shot: delivering one deletes the row.
CREATE TABLE IF NOT EXISTS tsukibot.pricealerts (
    alert_id     BIGSERIAL PRIMARY KEY,
    user_id      VARCHAR(45)  NOT NULL,
    coin_id      VARCHAR(120) NOT NULL,   -- CoinGecko id, e.g. 'ethereum'
    symbol       VARCHAR(32)  NOT NULL,
    coin_name    VARCHAR(200) NOT NULL,
    target_price NUMERIC      NOT NULL,
    direction    VARCHAR(5)   NOT NULL,   -- 'above' or 'below'
    channel_id   VARCHAR(45),             -- fallback if the user's DMs are closed
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pricealerts_user_id_idx ON tsukibot.pricealerts (user_id);


-- Portfolio holdings. Kept separate from tsukibot.profiles on purpose: that
-- table stores the tbpa watchlist as one delimited string, and adding amounts
-- to that format would make both features harder to work with.
CREATE TABLE IF NOT EXISTS tsukibot.holdings (
    user_id   VARCHAR(45)  NOT NULL,
    coin_id   VARCHAR(120) NOT NULL,
    symbol    VARCHAR(32)  NOT NULL,
    coin_name VARCHAR(200) NOT NULL,
    amount    NUMERIC      NOT NULL,
    PRIMARY KEY (user_id, coin_id)
);


-- Recurring scheduled posts. Due jobs are found by polling this table once a
-- minute rather than by registering a scheduler entry per job, which keeps the
-- database as the single source of truth and means nothing needs rehydrating
-- after a restart.
CREATE TABLE IF NOT EXISTS tsukibot.scheduled_posts (
    job_id           BIGSERIAL PRIMARY KEY,
    guild_id         VARCHAR(45)  NOT NULL,
    channel_id       VARCHAR(45)  NOT NULL,
    command          VARCHAR(32)  NOT NULL,   -- hmap | fg | movers | trending | pop | cg
    args             VARCHAR(200),            -- coin list, only used by the 'cg' command
    interval_minutes INTEGER      NOT NULL,
    created_by       VARCHAR(45)  NOT NULL,
    last_run         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scheduled_posts_guild_idx ON tsukibot.scheduled_posts (guild_id);


-- ---------------------------------------------------------------------------
-- Usage telemetry.
--
-- One row per interaction: slash commands, button presses, autocomplete
-- searches, and the bot's own automated actions (fired alerts, scheduled
-- posts). Written in batches from an in-memory buffer rather than one INSERT
-- per interaction, so a user's command never waits on this table.
--
-- coins is denormalized on purpose. Extracting tickers at write time is what
-- lets the "top coins" report be a single grouped scan over a GIN index
-- instead of reparsing every params blob at query time.
--
-- Nothing prunes this table automatically; history is the point. Use
-- /usage prune (or a DELETE below) when it outgrows its usefulness.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tsukibot.usage_events (
    event_id     BIGSERIAL PRIMARY KEY,
    occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    event_type   VARCHAR(16)  NOT NULL,   -- command | autocomplete | button | system
    command      VARCHAR(64)  NOT NULL,
    subcommand   VARCHAR(96),             -- "group sub" for nested commands
    user_id      VARCHAR(45)  NOT NULL,
    username     VARCHAR(64),
    guild_id     VARCHAR(45),             -- NULL in DMs, which is how DM usage is counted
    guild_name   VARCHAR(120),
    channel_id   VARCHAR(45),
    params       JSONB,                   -- flattened option values, free text capped at 300 chars
    coins        TEXT[],                  -- tickers referenced, extracted at write time
    outcome      VARCHAR(16)  NOT NULL DEFAULT 'ok',  -- ok | error | expired
    error_kind   VARCHAR(160),            -- classified, with ids masked, so faults group
    duration_ms  INTEGER
);

-- Every report filters by a time window first, so occurred_at leads each index.
CREATE INDEX IF NOT EXISTS usage_events_occurred_idx ON tsukibot.usage_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_command_idx  ON tsukibot.usage_events (command, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_idx     ON tsukibot.usage_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_guild_idx    ON tsukibot.usage_events (guild_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_type_idx     ON tsukibot.usage_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_coins_idx    ON tsukibot.usage_events USING GIN (coins);
CREATE INDEX IF NOT EXISTS usage_events_params_idx   ON tsukibot.usage_events USING GIN (params);

-- Retention, if you ever want it. Deliberately not scheduled by the bot.
-- DELETE FROM tsukibot.usage_events WHERE occurred_at < NOW() - INTERVAL '365 days';
