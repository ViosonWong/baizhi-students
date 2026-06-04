const os = require("os");
const path = require("path");
const { handleClassAudioTaskRequest } = require("../realtime-asr/class-audio-tasks");

module.exports = async function handler(req, res) {
  return handleClassAudioTaskRequest(req, res, {
    dataDir: process.env.CLASS_AUDIO_DATA_DIR || path.join(os.tmpdir(), "baizhi-class-audio-records"),
    databaseUrl: process.env.CLASS_AUDIO_DATABASE_URL || process.env.DATABASE_URL || "",
  });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
