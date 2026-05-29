FROM node:22-alpine
RUN apk add --no-cache chromium ffmpeg python3 xvfb-run
ARG YTDLP_VERSION=2026.03.17
RUN set -eux; \
    base_url="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
    wget -q "${base_url}/yt-dlp" -O /tmp/yt-dlp; \
    wget -q "${base_url}/SHA2-256SUMS" -O /tmp/SHA2-256SUMS; \
    grep '  yt-dlp$' /tmp/SHA2-256SUMS > /tmp/yt-dlp.sha256; \
    (cd /tmp && sha256sum -c /tmp/yt-dlp.sha256); \
    install -m 0755 /tmp/yt-dlp /usr/local/bin/yt-dlp; \
    rm -f /tmp/yt-dlp /tmp/SHA2-256SUMS /tmp/yt-dlp.sha256

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm install playwright-core@^1.52.0 --no-save
COPY . .
RUN chmod +x /app/docker-entrypoint.sh /app/scripts/refresh-yt-auth.js \
    && addgroup -g 1001 bot \
    && adduser -u 1001 -G bot -s /bin/sh -D bot \
    && mkdir -p /home/bot/.config/chromium \
    && chown -R bot:bot /app /home/bot
USER bot
CMD ["/app/docker-entrypoint.sh"]
