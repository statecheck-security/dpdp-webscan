# Egress-restricted scan container (WS-3f, plan section 4).
# Build context is the repo root: docker compose -f docker/compose.yml build
#
# The base tag must equal the Playwright version in package-lock.json exactly,
# or Chromium and the driver disagree; test/egress.test.ts checks it.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

# iptables/ip6tables for docker/egress.sh. curl (self-test) and setpriv
# (util-linux) are already in the base image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iptables \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Browsers come with the base image (PLAYWRIGHT_BROWSERS_PATH=/ms-playwright).
# HOME=/tmp: the root filesystem is read-only at run time (compose.yml) and
# Chromium, tsx and npm want a writable home and cache.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  HOME=/tmp \
  npm_config_update_notifier=false

COPY package.json package-lock.json ./
# Dev dependencies are needed: the CLI runs through tsx.
RUN npm ci && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY docker/egress.sh docker/selftest.sh ./docker/
RUN chmod 0755 docker/egress.sh docker/selftest.sh

# The image starts as root only so egress.sh can install the rules; it then
# drops to pwuser (the base image's non-root user) before running anything.
# With no command the container runs the egress self-test; compose.yml's scan
# service adds the CLI to the entrypoint so `run scan <url>` works.
ENTRYPOINT ["/app/docker/egress.sh"]
CMD ["/app/docker/selftest.sh"]
