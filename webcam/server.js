// Web camera relay for CrewSafety. No dependencies: `node webcam/server.js`.
//
// Serves the webcam page and relays WebSocket messages between it and the iOS app:
//   /ws/camera  the browser page. Sends {type:"pose"} frames and {type:"answer"} replies.
//   /ws/app     the iOS app. Sends {type:"checkin"} state and {type:"readout"} for the page to mirror.
//   POST /stt   optional: forwards a short audio clip from the page to ElevenLabs speech-to-text.
//               Needs ELEVENLABS_API_KEY (environment or webcam/.env). The key never leaves this process.
// Every message from one side goes to all clients on the other side. Video never leaves the browser;
// only joint positions are sent, and only to this machine.

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "0.0.0.0";
const PAGE = path.join(__dirname, "public", "index.html");

loadDotEnv(path.join(__dirname, ".env"));
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const STT_KEYTERMS = ["I'm okay", "I'm OK", "I'm fine", "help", "I need help", "I can't get up"];
const MAX_CLIP_BYTES = 5 * 1024 * 1024;

const clients = { camera: new Set(), app: new Set() };
let nextCameraId = 1;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    fs.createReadStream(PAGE).pipe(res);
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", cameras: clients.camera.size, apps: clients.app.size }));
    return;
  }
  if (req.url === "/stt/status" && req.method === "GET") {
    sendJSON(res, 200, { enabled: Boolean(ELEVENLABS_API_KEY) });
    return;
  }
  if (req.url === "/stt" && req.method === "POST") {
    handleSpeechToText(req, res);
    return;
  }
  res.writeHead(404).end("Not found");
});

function sendJSON(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Only this machine may use the key, even though the relay listens on the network for phones.
function isLoopback(req) {
  const address = req.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function handleSpeechToText(req, res) {
  if (!isLoopback(req)) return sendJSON(res, 403, { error: "stt_local_only" });
  if (!ELEVENLABS_API_KEY) return sendJSON(res, 503, { error: "no_key" });

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_CLIP_BYTES) return sendJSON(res, 413, { error: "clip_too_large" });
    chunks.push(chunk);
  }
  if (size === 0) return sendJSON(res, 400, { error: "empty_clip" });

  const type = (req.headers["content-type"] || "audio/webm").split(";")[0];
  const extension = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("language_code", "en");
  for (const term of STT_KEYTERMS) form.append("keyterms", term);
  form.append("file", new Blob([Buffer.concat(chunks)], { type }), `clip.${extension}`);

  try {
    const response = await fetch(STT_URL, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.log(`ElevenLabs speech-to-text failed: ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
      return sendJSON(res, 502, { error: "stt_failed", status: response.status });
    }
    sendJSON(res, 200, { text: (body.text || "").trim() });
  } catch (error) {
    console.log(`ElevenLabs speech-to-text error: ${error.message}`);
    sendJSON(res, 502, { error: "stt_unreachable" });
  }
}

// Minimal KEY=VALUE reader so the key can live in webcam/.env (gitignored) instead of the shell.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

server.on("upgrade", (req, socket) => {
  const role = req.url === "/ws/camera" ? "camera" : req.url === "/ws/app" ? "app" : null;
  const key = req.headers["sec-websocket-key"];
  if (!role || !key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  // Each camera page gets an id, added to what it sends, so the app can follow one page at a time.
  const cameraId = role === "camera" ? nextCameraId++ : null;
  clients[role].add(socket);
  console.log(`${role} connected (${clients.camera.size} camera, ${clients.app.size} app)`);
  broadcastPeers();

  let buffer = Buffer.alloc(0);
  let fragments = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const frame = readFrame(buffer);
      if (!frame) break;
      buffer = buffer.subarray(frame.length);
      if (frame.opcode === 0x8) {
        socket.end(encodeFrame(Buffer.alloc(0), 0x8));
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(encodeFrame(frame.payload, 0xa));
        continue;
      }
      if (frame.opcode === 0x1 || frame.opcode === 0x0) {
        fragments.push(frame.payload);
        if (!frame.fin) continue;
        const text = Buffer.concat(fragments).toString("utf8");
        fragments = [];
        relay(role, cameraId === null ? text : tagCamera(text, cameraId));
      }
    }
  });
  const drop = () => {
    if (clients[role].delete(socket)) {
      console.log(`${role} disconnected (${clients.camera.size} camera, ${clients.app.size} app)`);
      broadcastPeers();
    }
  };
  socket.on("close", drop);
  socket.on("error", drop);
});

function relay(fromRole, text) {
  const to = fromRole === "camera" ? clients.app : clients.camera;
  const frame = encodeFrame(Buffer.from(text, "utf8"), 0x1);
  for (const socket of to) socket.write(frame);
}

function tagCamera(text, cameraId) {
  try {
    const message = JSON.parse(text);
    message.cam = cameraId;
    return JSON.stringify(message);
  } catch {
    return text;
  }
}

function broadcastPeers() {
  const message = JSON.stringify({ type: "peers", cameras: clients.camera.size, apps: clients.app.size });
  const frame = encodeFrame(Buffer.from(message, "utf8"), 0x1);
  for (const socket of [...clients.camera, ...clients.app]) socket.write(frame);
}

// Parses one client frame (always masked). Returns null until the whole frame has arrived.
function readFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  const maskLength = masked ? 4 : 0;
  if (buf.length < offset + maskLength + len) return null;
  const mask = masked ? buf.subarray(offset, offset + 4) : null;
  const payload = Buffer.from(buf.subarray(offset + maskLength, offset + maskLength + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  return { fin, opcode, payload, length: offset + maskLength + len };
}

// Server frames are never masked.
function encodeFrame(payload, opcode) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

server.listen(PORT, HOST, () => {
  console.log(`CrewSafety web camera: open http://localhost:${PORT} in Chrome or Safari`);
  console.log(`The app connects to ws://localhost:${PORT}/ws/app`);
  console.log(ELEVENLABS_API_KEY
    ? "ElevenLabs voice: on (clips are sent to ElevenLabs only during a check-in)"
    : "ElevenLabs voice: off. Set ELEVENLABS_API_KEY or add it to webcam/.env to turn it on");
});
