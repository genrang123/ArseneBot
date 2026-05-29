function createTrack(details, requestedBy) {
  return {
    title: details.title || 'Unknown title',
    url: details.url,
    duration: Number.isFinite(details.durationInSec) ? details.durationInSec : null,
    requestedBy,
    thumbnail: details.thumbnails?.[0]?.url || null,
  };
}

module.exports = { createTrack };
