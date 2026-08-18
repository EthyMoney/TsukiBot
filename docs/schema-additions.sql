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
