# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
#  TsukiBot container image
#
#  Build:  docker compose build
#  Run:    docker compose up -d          (see docker-compose.yml)
#
#  Node 22 is the lowest line package.json's engines field allows
#  ("^22.22.2 || ^24.15.0 || >=26.0.0"), so the node:22 tag must resolve to
#  22.22.2 or newer. Bookworm (Debian 12) is the distro the author's
#  docs/puppeteer-debian-deps.txt was written against, and it is where
#  /usr/bin/chromium comes from.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

# ---------------------------------------------------------------------------
#  Chromium
#
#  Puppeteer does NOT download its own browser here: the distro chromium
#  package is used instead, which is the same arrangement the production box
#  uses and the reason main.js reads CHROME_PATH. Skipping the download also
#  keeps ~200MB of duplicate browser out of the image and out of
#  common/puppeteer-cache (which is a bind mount at runtime anyway).
# ---------------------------------------------------------------------------
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# The library list below is docs/puppeteer-debian-deps.txt verbatim, with one
# substitution: that list was written for an older Debian and names `libgcc1`,
# which no longer exists in bookworm (verified: "Candidate: (none)"). Bookworm
# ships the same runtime as `libgcc-s1`, so that is what is installed here.
# Everything else in the documented list resolves on bookworm as written.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       chromium \
       ca-certificates \
       fonts-liberation \
       libasound2 \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libc6 \
       libcairo2 \
       libcups2 \
       libdbus-1-3 \
       libexpat1 \
       libfontconfig1 \
       libgbm1 \
       libgcc-s1 \
       libglib2.0-0 \
       libgtk-3-0 \
       libnspr4 \
       libnss3 \
       libpango-1.0-0 \
       libpangocairo-1.0-0 \
       libstdc++6 \
       libx11-6 \
       libx11-xcb1 \
       libxcb1 \
       libxcomposite1 \
       libxcursor1 \
       libxdamage1 \
       libxext6 \
       libxfixes3 \
       libxi6 \
       libxrandr2 \
       libxrender1 \
       libxss1 \
       libxtst6 \
       lsb-release \
       wget \
       xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
#  Non-root user  --  this is load bearing, not hygiene theatre
#
#  main.js keeps Chromium's sandbox ON by default (the chart pages render a
#  user-supplied symbol from /c) and only drops it if CHROME_NO_SANDBOX=true.
#  A sandboxed Chromium refuses to start as uid 0, so the process MUST run as
#  a normal user; the namespace sandbox then does the containment instead of
#  --no-sandbox. See docker-compose.yml for the matching seccomp note -- the
#  container also has to be allowed to create user namespaces for this to work.
#
#  APP_UID/APP_GID are build args because ./common is bind-mounted read-write
#  (the bot rewrites metadata.json, coinsCG*.json, msg_id, cgCache.json). On a
#  Linux host these must match the owner of ./common or those writes fail:
#      docker compose build --build-arg APP_UID=$(id -u) --build-arg APP_GID=$(id -g)
#  Default 1000 matches the usual first login account. The stock `node` account
#  is removed first because it already occupies uid/gid 1000 in this base image.
# ---------------------------------------------------------------------------
ARG APP_UID=1000
ARG APP_GID=1000
RUN userdel -r node 2>/dev/null || true; \
    groupdel node 2>/dev/null || true; \
    groupadd -g "${APP_GID}" tsuki \
    && useradd -u "${APP_UID}" -g "${APP_GID}" -m -d /home/tsuki -s /bin/bash tsuki \
    && mkdir -p /app/common /app/chartscreens/generated-charts \
    && chown -R tsuki:tsuki /app

WORKDIR /app
USER tsuki

# ---------------------------------------------------------------------------
#  Dependencies first, source second, so an edit to main.js does not re-run
#  `npm ci`. Installing as `tsuki` (rather than root + a later chown -R) keeps
#  node_modules correctly owned without duplicating it into a second layer.
# ---------------------------------------------------------------------------
COPY --chown=tsuki:tsuki package.json package-lock.json puppeteer.config.cjs ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Everything the .dockerignore does not exclude. Note what is NOT here:
# common/ (secrets + runtime state, bind-mounted by compose) and stuff/
# (bot tokens, tsuki.pem, cloud key). common/keys.api is never baked into a
# layer -- it arrives only via the ./common mount, so the image itself is
# safe to push to a registry.
COPY --chown=tsuki:tsuki . .

# The bot writes tags.json into the working directory and hmap.png into
# chartscreens/generated-charts/ on the first heatmap run, so both must be
# writable by the non-root user; the chown above covers them.

# Chart server (127.0.0.1:8080) and prices API (127.0.0.1:3330) bind to
# loopback on purpose. They are reachable from inside this container only and
# are deliberately NOT EXPOSEd/published.

CMD ["node", "main.js"]
