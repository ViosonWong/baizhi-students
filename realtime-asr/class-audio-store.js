const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_DIR = process.env.CLASS_AUDIO_DATA_DIR || "/opt/100waytoai/class-audio-records";
const MAX_AUDIO_BYTES = Number(process.env.CLASS_AUDIO_MAX_BYTES || 100 * 1024 * 1024);
const DEFAULT_DATABASE_URL = process.env.CLASS_AUDIO_DATABASE_URL || process.env.DATABASE_URL || "";

let pgPool = null;
let pgReady = false;

async function createClassAudioStore(options = {}) {
  const dataDir = options.dataDir || DEFAULT_DATA_DIR;
  const databaseUrl = options.databaseUrl || DEFAULT_DATABASE_URL;
  return createStore({ dataDir, databaseUrl });
}

async function handleClassAudioRecordsRequest(req, res, options = {}) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  try {
    const store = await createClassAudioStore(options);

    if (req.method === "GET") {
      await handleGet(req, res, store);
      return;
    }

    if (req.method === "POST") {
      await handleCreate(req, res, store);
      return;
    }

    if (req.method === "PATCH") {
      await handlePatch(req, res, store);
      return;
    }

    if (req.method === "DELETE") {
      await handleDelete(req, res, store);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, {
      error: "Unexpected server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleGet(req, res, store) {
  const url = requestUrl(req);
  const id = normalizeText(url.searchParams.get("id"));
  const asset = normalizeText(url.searchParams.get("asset"));
  const userId = normalizeText(url.searchParams.get("userId"));
  const publishedOnly = url.searchParams.get("published") === "1" || url.searchParams.get("published") === "true";

  if (id && asset === "audio") {
    const audio = await store.getAudio(id);

    if (!audio) {
      sendJson(res, 404, { error: "Audio record not found" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": audio.mimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=0, must-revalidate",
    });
    if (audio.stream) {
      audio.stream.pipe(res);
    } else {
      res.end(audio.data);
    }
    return;
  }

  if (id) {
    const record = await store.getRecord(id);
    if (!record) {
      sendJson(res, 404, { error: "Audio record not found" });
      return;
    }
    sendJson(res, 200, { record: publicRecord(record) });
    return;
  }

  const records = await store.listRecords(publishedOnly ? "" : userId);
  const filtered = publishedOnly
    ? records.filter((record) => record.publish && record.publish.publishedAt)
    : records;

  sendJson(res, 200, {
    records: filtered.map(publicRecord),
  });
}

async function handleCreate(req, res, store) {
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    sendJson(res, 415, { error: "multipart/form-data is required" });
    return;
  }

  const body = await readRequestBody(req);

  if (body.length > MAX_AUDIO_BYTES) {
    sendJson(res, 413, {
      error: "audio file is too large",
      maxBytes: MAX_AUDIO_BYTES,
    });
    return;
  }

  const parts = parseMultipart(body, contentType);
  const metadata = safeJson(textPart(parts.metadata)) || {};
  const audio = parts.audio || parts.file;

  if (!audio || !Buffer.isBuffer(audio.data) || !audio.data.length) {
    sendJson(res, 400, { error: "audio file is required" });
    return;
  }

  const now = new Date().toISOString();
  const requestedId = normalizeText(metadata.id);
  const id = /^[a-zA-Z0-9_-]{6,80}$/.test(requestedId) ? requestedId : `audio-${Date.now()}-${randomSuffix()}`;
  const mimeType = normalizeText(audio.contentType) || normalizeText(metadata.mimeType) || "application/octet-stream";
  const fileName = normalizeText(metadata.fileName) || normalizeText(audio.filename) || `class-recording${extensionForMime(mimeType)}`;
  const stages = Array.isArray(metadata.stages) && metadata.stages.length
    ? metadata.stages
    : processingStages();

  const record = {
    id,
    userId: normalizeText(metadata.userId) || "baizhi_student_web",
    tableName: "class_audio_records",
    title: normalizeText(metadata.title) || "课堂录音",
    type: "classroom_audio",
    date: "刚刚",
    createdAt: now,
    updatedAt: now,
    duration: Number(metadata.duration || 0),
    fileName,
    mimeType,
    size: audio.data.length,
    audioUrl: `/api/class-audio-records?id=${encodeURIComponent(id)}&asset=audio`,
    status: normalizeText(metadata.status) || "file_transfer",
    statusLabel: normalizeText(metadata.statusLabel) || "文件传输",
    stageIndex: Number(metadata.stageIndex || 0),
    stages,
    transcript: normalizeText(metadata.transcript),
    content: normalizeText(metadata.content || metadata.transcript),
    segments: Array.isArray(metadata.segments) ? metadata.segments : [],
    meta: normalizeObject(metadata.meta),
    processing: normalizeObject(metadata.processing, {
      fineTranscription: "pending",
      diarization: "pending",
      summary: "pending",
      quiz: "pending",
      review: "pending",
    }),
    artifacts: normalizeObject(metadata.artifacts, {}),
    publish: normalizeObject(metadata.publish, {}),
  };

  await store.saveRecord(record, audio.data);

  sendJson(res, 201, { record: publicRecord(record) });
}

async function handlePatch(req, res, store) {
  const url = requestUrl(req);
  const id = normalizeText(url.searchParams.get("id"));

  if (!id) {
    sendJson(res, 400, { error: "id is required" });
    return;
  }

  const body = await readRequestBody(req);
  const patch = safeJson(body.toString("utf8")) || {};
  const current = await store.getRecord(id);

  if (!current) {
    sendJson(res, 404, { error: "Audio record not found" });
    return;
  }

  const allowed = [
    "title",
    "duration",
    "status",
    "statusLabel",
    "stageIndex",
    "transcript",
    "content",
    "segments",
    "meta",
    "processing",
    "artifacts",
    "publish",
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      current[key] = patch[key];
    }
  }

  current.updatedAt = new Date().toISOString();
  await store.updateRecord(current);
  sendJson(res, 200, { record: publicRecord(current) });
}

async function handleDelete(req, res, store) {
  const url = requestUrl(req);
  const id = normalizeText(url.searchParams.get("id"));

  if (!id) {
    sendJson(res, 400, { error: "id is required" });
    return;
  }

  const deleted = await store.deleteRecord(id);

  if (!deleted) {
    sendJson(res, 404, { error: "Audio record not found" });
    return;
  }

  sendJson(res, 200, { ok: true, id });
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new Error("multipart boundary is missing");
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = {};
  let cursor = 0;

  while (cursor < buffer.length) {
    const boundaryStart = buffer.indexOf(boundary, cursor);
    if (boundaryStart < 0) break;

    let partStart = boundaryStart + boundary.length;
    if (buffer.slice(partStart, partStart + 2).toString() === "--") break;
    if (buffer.slice(partStart, partStart + 2).toString() === "\r\n") partStart += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), partStart);
    if (headerEnd < 0) break;

    const headerText = buffer.slice(partStart, headerEnd).toString("utf8");
    let dataStart = headerEnd + 4;
    let nextBoundary = buffer.indexOf(boundary, dataStart);
    if (nextBoundary < 0) nextBoundary = buffer.length;

    let dataEnd = nextBoundary;
    if (buffer.slice(dataEnd - 2, dataEnd).toString() === "\r\n") {
      dataEnd -= 2;
    }

    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    const nameMatch = disposition && disposition[1].match(/name="([^"]+)"/i);
    const fileMatch = disposition && disposition[1].match(/filename="([^"]*)"/i);
    const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);

    if (nameMatch) {
      parts[nameMatch[1]] = {
        data: buffer.slice(dataStart, dataEnd),
        filename: fileMatch ? fileMatch[1] : "",
        contentType: contentTypeMatch ? contentTypeMatch[1].trim() : "",
      };
    }

    cursor = nextBoundary;
  }

  return parts;
}

async function readRequestBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function createStore({ dataDir, databaseUrl }) {
  if (databaseUrl) {
    return createPostgresStore(databaseUrl);
  }

  return createFileStore(dataDir);
}

async function createPostgresStore(databaseUrl) {
  const pool = getPgPool(databaseUrl);
  await ensurePostgresSchema(pool);

  return {
    async listRecords(userId) {
      const params = [];
      let sql = "SELECT * FROM class_audio_records";

      if (userId) {
        params.push(userId);
        sql += " WHERE user_id IS NULL OR user_id = $1";
      }

      sql += " ORDER BY created_at DESC";
      const result = await pool.query(sql, params);
      return result.rows.map(rowToRecord);
    },

    async getRecord(id) {
      const result = await pool.query("SELECT * FROM class_audio_records WHERE id = $1", [id]);
      return result.rows[0] ? rowToRecord(result.rows[0]) : null;
    },

    async getAudio(id) {
      const result = await pool.query(
        `SELECT f.audio_data, r.mime_type
         FROM class_audio_files f
         JOIN class_audio_records r ON r.id = f.record_id
         WHERE f.record_id = $1`,
        [id],
      );

      if (!result.rows[0]) {
        return null;
      }

      return {
        data: result.rows[0].audio_data,
        mimeType: result.rows[0].mime_type,
      };
    },

    async saveRecord(record, audioBuffer) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await upsertPostgresRecord(client, record);
        await client.query(
          `INSERT INTO class_audio_files (record_id, audio_data, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (record_id)
           DO UPDATE SET audio_data = EXCLUDED.audio_data, updated_at = NOW()`,
          [record.id, audioBuffer],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateRecord(record) {
      await upsertPostgresRecord(pool, record);
    },

    async deleteRecord(id) {
      const result = await pool.query("DELETE FROM class_audio_records WHERE id = $1", [id]);
      return result.rowCount > 0;
    },
  };
}

function createFileStore(dataDir) {
  return {
    async listRecords(userId) {
      const records = readRecords(dataDir);
      const filtered = userId
        ? records.filter((record) => !record.userId || record.userId === userId)
        : records;

      return filtered.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    },

    async getRecord(id) {
      return readRecords(dataDir).find((item) => item.id === id) || null;
    },

    async getAudio(id) {
      const record = readRecords(dataDir).find((item) => item.id === id);

      if (!record || !record.audioPath) {
        return null;
      }

      const audioPath = path.resolve(dataDir, record.audioPath);
      const audioRoot = path.resolve(dataDir, "audio");

      if (!audioPath.startsWith(audioRoot) || !fs.existsSync(audioPath)) {
        return null;
      }

      return {
        stream: fs.createReadStream(audioPath),
        mimeType: record.mimeType || "application/octet-stream",
      };
    },

    async saveRecord(record, audioBuffer) {
      const ext = safeExtension(record.fileName, record.mimeType);
      const audioDir = path.join(dataDir, "audio");
      const audioPath = path.join(audioDir, `${record.id}${ext}`);
      const relativeAudioPath = path.relative(dataDir, audioPath);

      ensureDataDir(dataDir);
      fs.mkdirSync(audioDir, { recursive: true });
      fs.writeFileSync(audioPath, audioBuffer);

      const stored = { ...record, audioPath: relativeAudioPath };
      const records = readRecords(dataDir).filter((item) => item.id !== stored.id);
      records.unshift(stored);
      writeRecords(dataDir, records);
    },

    async updateRecord(record) {
      const records = readRecords(dataDir);
      const index = records.findIndex((item) => item.id === record.id);

      if (index < 0) {
        throw new Error("Audio record not found");
      }

      records[index] = { ...records[index], ...record };
      writeRecords(dataDir, records);
    },

    async deleteRecord(id) {
      const records = readRecords(dataDir);
      const record = records.find((item) => item.id === id);

      if (!record) {
        return false;
      }

      if (record.audioPath) {
        const audioPath = path.resolve(dataDir, record.audioPath);
        const audioRoot = path.resolve(dataDir, "audio");

        if (audioPath.startsWith(audioRoot) && fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      }

      writeRecords(dataDir, records.filter((item) => item.id !== id));
      return true;
    },
  };
}

function getPgPool(databaseUrl) {
  if (pgPool) {
    return pgPool;
  }

  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    throw new Error("PostgreSQL adapter requires the pg package. Run npm install in realtime-asr.");
  }

  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.CLASS_AUDIO_DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
  });

  return pgPool;
}

async function ensurePostgresSchema(pool) {
  if (pgReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_audio_records (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      table_name TEXT NOT NULL DEFAULT 'class_audio_records',
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'classroom_audio',
      date_label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      duration DOUBLE PRECISION NOT NULL DEFAULT 0,
      file_name TEXT,
      mime_type TEXT,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      audio_url TEXT,
      status TEXT,
      status_label TEXT,
      stage_index INTEGER NOT NULL DEFAULT 0,
      stages JSONB NOT NULL DEFAULT '[]'::jsonb,
      transcript TEXT,
      content TEXT,
      segments JSONB NOT NULL DEFAULT '[]'::jsonb,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      processing JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    ALTER TABLE class_audio_records
      ADD COLUMN IF NOT EXISTS artifacts JSONB NOT NULL DEFAULT '{}'::jsonb;

    ALTER TABLE class_audio_records
      ADD COLUMN IF NOT EXISTS publish JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS class_audio_files (
      record_id TEXT PRIMARY KEY REFERENCES class_audio_records(id) ON DELETE CASCADE,
      audio_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_class_audio_records_user_created
      ON class_audio_records (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_class_audio_records_status
      ON class_audio_records (status);
  `);

  pgReady = true;
}

async function upsertPostgresRecord(queryable, record) {
  await queryable.query(
    `INSERT INTO class_audio_records (
      id, user_id, table_name, title, type, date_label, created_at, updated_at,
      duration, file_name, mime_type, size_bytes, audio_url, status, status_label,
      stage_index, stages, transcript, content, segments, meta, processing, artifacts, publish
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15,
      $16, $17::jsonb, $18, $19, $20::jsonb, $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      table_name = EXCLUDED.table_name,
      title = EXCLUDED.title,
      type = EXCLUDED.type,
      date_label = EXCLUDED.date_label,
      updated_at = EXCLUDED.updated_at,
      duration = EXCLUDED.duration,
      file_name = EXCLUDED.file_name,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      audio_url = EXCLUDED.audio_url,
      status = EXCLUDED.status,
      status_label = EXCLUDED.status_label,
      stage_index = EXCLUDED.stage_index,
      stages = EXCLUDED.stages,
      transcript = EXCLUDED.transcript,
      content = EXCLUDED.content,
      segments = EXCLUDED.segments,
      meta = EXCLUDED.meta,
      processing = EXCLUDED.processing,
      artifacts = EXCLUDED.artifacts,
      publish = EXCLUDED.publish`,
    [
      record.id,
      record.userId || null,
      record.tableName || "class_audio_records",
      record.title || "课堂录音",
      record.type || "classroom_audio",
      record.date || "刚刚",
      record.createdAt || new Date().toISOString(),
      record.updatedAt || new Date().toISOString(),
      Number(record.duration || 0),
      record.fileName || "",
      record.mimeType || "application/octet-stream",
      Number(record.size || 0),
      record.audioUrl || `/api/class-audio-records?id=${encodeURIComponent(record.id)}&asset=audio`,
      record.status || "file_transfer",
      record.statusLabel || "文件传输",
      Number(record.stageIndex || 0),
      JSON.stringify(Array.isArray(record.stages) ? record.stages : processingStages()),
      record.transcript || "",
      record.content || "",
      JSON.stringify(Array.isArray(record.segments) ? record.segments : []),
      JSON.stringify(normalizeObject(record.meta)),
      JSON.stringify(normalizeObject(record.processing)),
      JSON.stringify(normalizeObject(record.artifacts)),
      JSON.stringify(normalizeObject(record.publish)),
    ],
  );
}

function rowToRecord(row) {
  return {
    id: row.id,
    userId: row.user_id,
    tableName: row.table_name || "class_audio_records",
    title: row.title,
    type: row.type || "classroom_audio",
    date: row.date_label || "刚刚",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
    duration: Number(row.duration || 0),
    fileName: row.file_name || "",
    mimeType: row.mime_type || "application/octet-stream",
    size: Number(row.size_bytes || 0),
    audioUrl: row.audio_url || `/api/class-audio-records?id=${encodeURIComponent(row.id)}&asset=audio`,
    status: row.status || "file_transfer",
    statusLabel: row.status_label || "文件传输",
    stageIndex: Number(row.stage_index || 0),
    stages: Array.isArray(row.stages) ? row.stages : processingStages(),
    transcript: row.transcript || "",
    content: row.content || "",
    segments: Array.isArray(row.segments) ? row.segments : [],
    meta: normalizeObject(row.meta),
    processing: normalizeObject(row.processing),
    artifacts: normalizeObject(row.artifacts),
    publish: normalizeObject(row.publish),
  };
}

function readRecords(dataDir) {
  ensureDataDir(dataDir);
  const file = recordsFile(dataDir);

  if (!fs.existsSync(file)) {
    return [];
  }

  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeRecords(dataDir, records) {
  ensureDataDir(dataDir);
  const file = recordsFile(dataDir);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2));
  fs.renameSync(tmp, file);
}

function recordsFile(dataDir) {
  return path.join(dataDir, "records.json");
}

function ensureDataDir(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function publicRecord(record) {
  const clone = { ...record };
  delete clone.audioPath;
  return clone;
}

function requestUrl(req) {
  return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
}

function textPart(part) {
  return part && Buffer.isBuffer(part.data) ? part.data.toString("utf8") : "";
}

function safeJson(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function processingStages() {
  return [
    { key: "file_transfer", label: "文件传输" },
    { key: "file_transcode", label: "文件转码" },
    { key: "server_upload", label: "文件上传服务器" },
    { key: "waiting_summary", label: "待AI总结" },
  ];
}

function safeExtension(fileName, mimeType) {
  const ext = path.extname(fileName || "").toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
  return extensionForMime(mimeType);
}

function extensionForMime(mimeType) {
  if (mimeType.includes("mp4")) return ".m4a";
  if (mimeType.includes("mpeg")) return ".mp3";
  if (mimeType.includes("wav")) return ".wav";
  return ".webm";
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(status === 204 ? "" : JSON.stringify(payload));
}

module.exports = {
  createClassAudioStore,
  handleClassAudioRecordsRequest,
};
