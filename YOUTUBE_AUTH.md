# YouTube auth for ArseneBot

ArseneBot supports three yt-dlp auth methods, in this priority order:

1. `YTDLP_COOKIES_FROM_BROWSER` (defaults to `chromium:$CHROMIUM_PROFILE`)
2. `YOUTUBE_COOKIE_FILE` or the default `/app/cookies.txt`
3. `YOUTUBE_COOKIE` JSON env, converted to Netscape cookies at container startup

The recommended setup is a single persistent Chromium profile that both yt-dlp and `scripts/refresh-yt-auth.js` use. That keeps rebuilds/recreates from drifting onto different cookie stores.

## Recommended VPS setup: persistent Chromium profile

This avoids manually exporting cookies every time. You still need to log in once.

1. Create a persistent profile directory on the host:

```bash
mkdir -p /opt/arsenebot/chromium-profile
chown -R 1001:1001 /opt/arsenebot/chromium-profile
```

2. Run the container with the config root mounted once, and point both yt-dlp and Playwright at the same persistent profile:

```bash
docker run -d --name arsenebot --network host \
  -e DISCORD_TOKEN=... \
  -e DISCORD_CLIENT_ID=... \
  -e CHROMIUM_CONFIG_ROOT=/home/bot/.config/chromium \
  -e CHROMIUM_PROFILE=/home/bot/.config/chromium/chromium \
  -e YTDLP_COOKIES_FROM_BROWSER=chromium:/home/bot/.config/chromium/chromium \
  -e GMAIL_USER=... \
  -e GMAIL_PASS=... \
  -v /opt/arsenebot/chromium-profile:/home/bot/.config/chromium \
  arsenebot:latest
```

3. Log in to YouTube once using that same profile. One practical way is to run a temporary Chromium container/session with VNC/noVNC or X11 and mount the same host directory, then open `https://youtube.com` and sign in.

4. Restart ArseneBot and test:

```bash
docker exec arsenebot yt-dlp \
  --cookies-from-browser chromium:/home/bot/.config/chromium/chromium \
  --dump-json "ytsearch1:billie jean"
```

If Google expires the session or asks for verification again, repeat only the login step. No manual cookie copy is needed.

## Manual cookies.txt fallback

If browser profile extraction fails, mount a Netscape-format cookies file:

```bash
docker run -d --name arsenebot --network host \
  -e DISCORD_TOKEN=... \
  -e DISCORD_CLIENT_ID=... \
  -e YOUTUBE_COOKIE_FILE=/app/cookies.txt \
  -v /opt/arsenebot/cookies.txt:/app/cookies.txt:ro \
  arsenebot:latest
```

## Optional PO token

Some YouTube blocks require a PO token. ArseneBot accepts:

```bash
-e YTDLP_PO_TOKEN=...
-e YTDLP_VISITOR_DATA=...
```

When `YTDLP_PO_TOKEN` is set, ArseneBot asks yt-dlp to use the web client. Without it, ArseneBot uses the iOS client fallback.

## Useful env vars

- `CHROMIUM_CONFIG_ROOT`: mounted Chromium config root, default `/home/bot/.config/chromium`.
- `CHROMIUM_PROFILE`: persistent Chromium profile used by both Playwright and yt-dlp, default `/home/bot/.config/chromium/chromium`.
- `YTDLP_COOKIES_FROM_BROWSER`: passed to yt-dlp, default `chromium:$CHROMIUM_PROFILE`.
- `YOUTUBE_COOKIE_FILE`: Netscape cookies path, default `/app/cookies.txt`.
- `YOUTUBE_COOKIE`: JSON cookie array; converted into `YOUTUBE_COOKIE_FILE` on startup.
- `YTDLP_PO_TOKEN`: optional YouTube PO token.
- `YTDLP_VISITOR_DATA`: optional visitor data paired with PO token.
- `YTDLP_USER_AGENT`: override default Chrome user agent.
- `YTDLP_JS_RUNTIME`: default `node`.
- `YTDLP_PATH`: default `yt-dlp`.
