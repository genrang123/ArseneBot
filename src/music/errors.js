const { messages } = require('../config/messages');

class UserFacingMusicError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'UserFacingMusicError';
    this.cause = cause;
  }
}

function classifyYoutubeError(error, context = {}) {
  const message = String(error?.message || error || '');
  const lower = message.toLowerCase();
  const meta = { ...context, rawMessage: message, causeName: error?.name || null };

  if (lower.includes('sign in') || lower.includes('confirm your age') || lower.includes('cookie')) {
    const classified = new UserFacingMusicError(messages.youtube.authRequired, error);
    classified.meta = meta;
    return classified;
  }

  if (lower.includes('private') || lower.includes('unavailable') || lower.includes('deleted') || lower.includes('geo')) {
    const classified = new UserFacingMusicError(messages.youtube.trackUnavailable, error);
    classified.meta = meta;
    return classified;
  }

  const classified = new UserFacingMusicError(messages.youtube.transientError, error);
  classified.meta = meta;
  return classified;
}

function isYoutubeAuthError(error) {
  return error instanceof UserFacingMusicError
    && error.message === messages.youtube.authRequired;
}

module.exports = { UserFacingMusicError, classifyYoutubeError, isYoutubeAuthError };
