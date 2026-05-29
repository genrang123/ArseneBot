# ArseneBot

ArseneBot is a Discord YouTube music bot using slash commands, discord.js v14, @discordjs/voice, and play-dl.

## Setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
4. Optionally set `DISCORD_GUILD_ID` for instant guild command deployment during development.
5. Optionally set `YOUTUBE_COOKIE` if YouTube asks for sign-in confirmation.
6. Run `npm install`.
7. Run `npm run deploy`.
8. Run `npm start`.

## Commands

- `/play query:<string>` — play a YouTube video URL, playlist URL, or keyword search.
- `/skip` — skip the current track.
- `/stop` — stop playback and clear the queue.
- `/pause` and `/resume` — pause or resume playback.
- `/queue` — show the queued tracks.
- `/nowplaying` — show the current track.
- `/volume value:<0-200>` — set playback volume.
- `/loop mode:<off|track|queue>` — set loop mode.
- `/shuffle` — shuffle the queue.
- `/seek seconds:<number>` — seek the current track to an absolute position.
- `/remove index:<number>` — remove a queued track by 1-based index.
- `/leave` — leave the voice channel.

## YouTube Cookie

If YouTube returns errors such as `Sign in to confirm`, refresh the `YOUTUBE_COOKIE` value from your browser DevTools and restart the bot. Do not commit `.env` or share the cookie.

## Docker

```bash
docker build -t arsenebot .
docker run --env-file .env arsenebot
```

## Manual Test Checklist

Use a private Discord test server.

- [ ] `/play <video URL>` plays the right track.
- [ ] `/play <playlist URL>` adds the playlist.
- [ ] `/play <keyword>` plays the first search result.
- [ ] `/play` while bot is active in another voice channel returns `Bot đang phát ở channel khác.`
- [ ] YouTube sign-in/cookie errors show the `YOUTUBE_COOKIE` guidance.
- [ ] `/skip`, `/pause`, `/resume`, and `/stop` work.
- [ ] `/queue` and `/nowplaying` display correct state.
- [ ] `/loop track`, `/loop queue`, and `/loop off` work.
- [ ] `/shuffle`, `/remove <index>`, and `/seek <seconds>` work.
- [ ] `/seek` rejects live/unknown-duration tracks and out-of-range seconds.
- [ ] `/volume 50` and `/volume 150` change volume on the current track.
- [ ] Bot auto-leaves after 5 minutes when no humans remain in voice.
- [ ] Bot auto-leaves after 5 minutes when queue is empty and nothing is playing.
- [ ] Kicking the bot from voice cleans up without crashing.
