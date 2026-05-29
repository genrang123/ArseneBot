# ArseneBot Project Rules

## User-facing text convention

- Never hardcode new user-facing text directly inside commands, events, embeds, or music logic.
- All user-visible text must be defined in `src/config/messages.js` and referenced from there.
- This applies to:
  - slash command reply text
  - embed titles, field names, and descriptions shown to users
  - error messages intended for users
  - button/control feedback text
  - clip text and other bot-spoken text
  - slash command descriptions and option descriptions
- When adding a new feature that needs user-visible copy, add the text key to the appropriate section in `src/config/messages.js` first, then consume that key in code.
- When editing existing wording, update `src/config/messages.js` instead of editing string literals across multiple files.

## Structure convention for messages

- Put runtime reply/error/control text under the existing domain groups such as `common`, `voice`, `playback`, `play`, `playnext`, `youtube`, `embeds`, and `clip`.
- Put slash command metadata text under `messages.commands.<commandName>`.
- Use functions in the message catalog for dynamic text that interpolates values.

## Review checklist for future changes

Before finishing a change, verify:

- no new hardcoded user-facing Vietnamese or English copy was introduced in command/event/music/UI modules
- any new command description or option description comes from `messages.commands`
- dynamic messages still preserve placeholders and formatting after centralization
