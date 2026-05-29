const messages = {
  common: {
    genericError: "Có lỗi xảy ra, check log đi em.",
    invalidControlButton: "Nút điều khiển không hợp lệ.",
  },
  voice: {
    joinRequired: "Em vào voice channel hộ anh cái.",
    sameChannelRequired: (channelName) =>
      `Em qua chỗ anh Độ Mixi nha. Anh đang ở 120 An Liễng (${channelName}).`,
    botMissingPermissions: 'Cấp quyền "Join" và "Speak" cho anh cái.',
    botInDifferentChannel: "Anh đang bận ở channel khác rồi em ơi.",
    botNotInAnyChannel: "Anh có ở voice channel nào đâu em.",
    leftChannel: "Anh Độ Mixi đã rời channel.",
    connectionNotReady:
      "Anh vào voice channel rồi nhưng chưa kết nối được tới Discord voice server. Thử đổi voice region hoặc restart đi em.",
  },
  playback: {
    noPlayerInGuild: "Anh Độ Mixi chưa phát nhạc trong server này.",
    noCurrentTrack: "Không có bài nào đang phát.",
    noPreviousTrack: "Không có bài nào trước đó để phát lại.",
    backToPrevious: (title) => `Đang quay lại bài trước: **${title}**`,
    paused: "Đã tạm dừng.",
    resumed: "Đã tiếp tục phát.",
    skipped: "Đã bỏ bài hiện tại.",
    skippedQueueEnded: (title) =>
      `Đã bỏ bài hiện tại: **${title}**. Hàng đợi đã hết.`,
    stopped: "Đã dừng phát và xóa hàng đợi.",
    shuffled: "Đã xáo trộn hàng đợi.",
    shuffleNeedsTwoTracks: "Kiếm thêm bài nữa thì anh Độ Mixi mới xào được.",
    removedFromQueue: (title) => `Đã xóa **${title}** khỏi hàng đợi.`,
    invalidQueueIndex: "Index không hợp lệ.",
    seekedTo: (seconds) => `Đã tua đến **${seconds}s**.`,
    volumeSet: (volume) => `Âm lượng đã đặt thành **${volume}%**.`,
    loopSet: (mode) => `Loop đã đặt thành **${mode}**.`,
    autoplaySet: (enabled) => `Đã ${enabled ? "bật" : "tắt"} autoplay.`,
    currentlyBusy: "Anh Độ Mixi đang bận, đợi tí nhé.",
    clipNotFound: "Không tìm thấy file audio của lệnh này.",
    seekUnsupported:
      "Bài này không hỗ trợ seek vì không có thời lượng xác định.",
    seekOutOfRange: "Đù má, tua vượt quá thời lượng bài rồi.",
    failedTrackSkipped: (title) =>
      `Anh Độ Mixi không thể phát **${title}**, bỏ qua bài này.`,
    autoplayNext: (title) => `Tự phát tiếp: **${title}**`,
  },
  play: {
    searching: "Ae đợi tí anh Độ Mixi đang tìm bài hát",
    foundTrack: (title) => `Anh Độ Mixi tìm thấy rồi: **${title}**`,
    joiningVoice:
      "Tìm thấy bài rồi, anh Độ Mixi lên nhạc ngay cho các em đây...",
    nowPlaying: (title) => `Đang phát: **${title}**`,
    queuedOne: (title) => `Đã thêm vào hàng đợi: **${title}**`,
    queuedMany: (count, title) =>
      `Đã thêm **${count}** bài vào hàng đợi. Bài đầu: **${title}**`,
    noResults: "Không tìm thấy kết quả phù hợp.",
    authRefreshing:
      "YouTube đang đòi xác thực, đợi tí anh Độ Mixi đang tự đăng nhập lại...",
  },
  playnext: {
    searching: "Ae đợi tí anh Độ Mixi đang tìm bài để chèn lên đầu hàng đợi",
    nowPlaying: (title) => `Đang phát: **${title}**`,
    queuedOne: (title) => `Đã chèn lên đầu hàng đợi: **${title}**`,
    queuedMany: (count, title) =>
      `Đã chèn **${count}** bài lên đầu hàng đợi. Bài đầu: **${title}**`,
  },
  youtube: {
    authRequired:
      "YouTube yêu cầu xác thực rồi. Ae cập nhật YOUTUBE_COOKIE rồi restart bot giúp anh Độ Mixi nhé.",
    trackUnavailable: "Bài này đéo bật được đâu em ơi.",
    transientError: "Thằng YouTube đang bị ngáo rồi. Thử lại đi em.",
  },
  embeds: {
    nowPlayingTitle: "Đang phát",
    durationField: "Thời lượng",
    volumeField: "Âm lượng",
    loopField: "Loop",
    queueNowPlayingEmpty: "Đang phát: không có bài nào.",
    queueTitle: (total) => `Hàng đợi (${total})`,
    queueEmpty: "Hàng đợi đang trống.",
    queueMore: (count) => `...và ${count} mục nữa`,
  },
  clip: {
    alo: "Ờ, anh chào Vũ nhé. Em là Vũ hả Vũ? Rồi rồi... Em ơi, chối làm sao được Vũ. Anh nói thật đấy, Vũ mà không nói chuyện nghiêm túc  với anh là anh đăng hết thông tin của Vũ lên mạng đấy.",
    mixi: "Nà ná na na anh Độ Mixi",
  },
  commands: {
    alo: {
      description: "alo vũ à vũ.",
    },
    autoplay: {
      description: "Bật hoặc tắt tự phát bài liên quan khi hết queue.",
      modeDescription: "Trạng thái autoplay",
    },
    back: {
      description: "Phát lại bài vừa phát trước đó.",
    },
    leave: {
      description: "Rời voice channel.",
    },
    loop: {
      description: "Đặt chế độ lặp.",
      modeDescription: "Chế độ lặp",
    },
    mixi: {
      description: "nà ná na na a độ mixi.",
    },
    nowplaying: {
      description: "Hiển thị bài đang phát.",
    },
    pause: {
      description: "Tạm dừng bài hiện tại.",
    },
    play: {
      description: "Phát nhạc từ YouTube URL, playlist, hoặc từ khóa.",
      queryDescription: "URL hoặc từ khóa YouTube",
    },
    playnext: {
      description: "Thêm nhạc vào đầu hàng đợi.",
      queryDescription: "URL hoặc từ khóa YouTube",
    },
    queue: {
      description: "Hiển thị hàng đợi.",
    },
    remove: {
      description: "Xóa bài khỏi hàng đợi.",
      indexDescription: "Vị trí 1-based trong queue",
    },
    resume: {
      description: "Tiếp tục phát nhạc.",
    },
    seek: {
      description: "Tua bài hiện tại đến số giây tuyệt đối.",
      secondsDescription: "Vị trí tính bằng giây",
    },
    shuffle: {
      description: "Xáo trộn hàng đợi.",
    },
    skip: {
      description: "Bỏ bài hiện tại.",
    },
    stop: {
      description: "Dừng phát và xóa hàng đợi.",
    },
    volume: {
      description: "Chỉnh âm lượng.",
      valueDescription: "Âm lượng từ 0 đến 200",
    },
  },
};

module.exports = { messages };
