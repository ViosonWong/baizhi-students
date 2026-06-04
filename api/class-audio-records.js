const os = require("os");
const path = require("path");
const { handleClassAudioRecordsRequest } = require("../realtime-asr/class-audio-store");

module.exports = async function handler(req, res) {
  await handleClassAudioRecordsRequest(req, res, {
    dataDir: process.env.CLASS_AUDIO_DATA_DIR || path.join(os.tmpdir(), "baizhi-class-audio-records"),
  });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
