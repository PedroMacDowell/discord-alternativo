const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 8081);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const clients = new Map();
const rooms = new Map();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  serveStatic(req, res);
});

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket" || req.url !== "/signal") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      ""
    ].join("\r\n")
  );

  attachClient(socket, req);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let requestedPath = decodeURIComponent(url.pathname);

  if (requestedPath === "/") {
    requestedPath = "/index.html";
  }

  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Arquivo não encontrado");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

function attachClient(socket, req) {
  const client = {
    id: createId(),
    name: "Convidado",
    sessionId: "",
    color: colorFromSeed(crypto.randomBytes(2).readUInt16BE(0)),
    mediaState: {
      micEnabled: false,
      cameraEnabled: false,
      screenEnabled: false
    },
    roomId: null,
    socket,
    buffer: Buffer.alloc(0),
    joinedAt: Date.now(),
    ip: req.socket.remoteAddress
  };

  clients.set(client.id, client);

  socket.on("data", (chunk) => readFrames(client, chunk));
  socket.on("close", () => removeClient(client));
  socket.on("end", () => removeClient(client));
  socket.on("error", () => removeClient(client));
}

function readFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0];
    const secondByte = client.buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let length = secondByte & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < 4) return;
      length = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (client.buffer.length < 10) return;
      const high = client.buffer.readUInt32BE(2);
      const low = client.buffer.readUInt32BE(6);
      if (high !== 0) {
        closeSocket(client.socket);
        return;
      }
      length = low;
      offset = 10;
    }

    const maskOffset = masked ? 4 : 0;
    const frameLength = offset + maskOffset + length;
    if (client.buffer.length < frameLength) return;

    let payload = client.buffer.subarray(offset + maskOffset, frameLength);

    if (masked) {
      const mask = client.buffer.subarray(offset, offset + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }

    client.buffer = client.buffer.subarray(frameLength);

    if (opcode === 0x8) {
      removeClient(client);
      closeSocket(client.socket);
      return;
    }

    if (opcode === 0x9) {
      sendFrame(client.socket, payload, 0xA);
      continue;
    }

    if (opcode === 0x1) {
      handleMessage(client, payload.toString("utf8"));
    }
  }
}

function handleMessage(client, raw) {
  let message;

  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }

  if (!message || typeof message.type !== "string") return;

  if (message.type === "join") {
    const roomId = normalizeRoomId(message.roomId);
    const name = normalizeName(message.name);
    const stableClientId = normalizeClientId(message.clientId);
    const sessionId = normalizeClientId(message.sessionId) || createId();

    if (!roomId) {
      send(client, { type: "error", message: "Sala inválida." });
      return;
    }

    if (stableClientId && stableClientId !== client.id) {
      rekeyClient(client, stableClientId);
    }

    if (client.roomId) {
      leaveRoom(client);
    }

    client.roomId = roomId;
    client.name = name || "Convidado";
    client.sessionId = sessionId;
    client.color = normalizeColor(message.color) || colorFromSeed(Math.abs(hashCode(client.id)));

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId);
    const peers = [...room.values()].map(publicClient);
    room.set(client.id, client);

    send(client, {
      type: "welcome",
      id: client.id,
      roomId,
      peers
    });

    broadcast(roomId, {
      type: "peer-joined",
      peer: publicClient(client)
    }, client.id);
    return;
  }

  if (!client.roomId) return;

  if (message.type === "signal") {
    const target = rooms.get(client.roomId)?.get(message.to);
    if (!target) return;

    send(target, {
      type: "signal",
      from: client.id,
      fromSessionId: client.sessionId,
      signalType: message.signalType,
      data: message.data
    });
    return;
  }

  if (message.type === "chat") {
    const text = String(message.text || "").trim().slice(0, 800);
    if (!text) return;

    broadcast(client.roomId, {
      type: "chat",
      id: createId(),
      from: client.id,
      name: client.name,
      color: client.color,
      text,
      timestamp: Date.now()
    });
    return;
  }

  if (message.type === "media-state") {
    client.mediaState = {
      micEnabled: Boolean(message.state?.micEnabled),
      cameraEnabled: Boolean(message.state?.cameraEnabled),
      screenEnabled: Boolean(message.state?.screenEnabled)
    };

    broadcast(client.roomId, {
      type: "media-state",
      from: client.id,
      state: client.mediaState
    }, client.id);
    return;
  }

  if (message.type === "leave") {
    leaveRoom(client);
  }
}

function publicClient(client) {
  return {
    id: client.id,
    name: client.name,
    sessionId: client.sessionId,
    color: client.color,
    clientId: client.id,
    mediaState: client.mediaState,
    joinedAt: client.joinedAt,
    lastSeenMs: Date.now()
  };
}

function send(client, message) {
  if (!client?.socket?.writable) return;
  sendFrame(client.socket, Buffer.from(JSON.stringify(message), "utf8"));
}

function broadcast(roomId, message, exceptId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const client of room.values()) {
    if (client.id !== exceptId) {
      send(client, message);
    }
  }
}

function sendFrame(socket, payload, opcode = 0x1) {
  if (!socket.writable) return;

  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }

  socket.write(Buffer.concat([header, payload]));
}

function leaveRoom(client) {
  const roomId = client.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    room.delete(client.id);
    broadcast(roomId, { type: "peer-left", id: client.id });

    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  client.roomId = null;
}

function removeClient(client) {
  if (!clients.has(client.id)) return;
  leaveRoom(client);
  clients.delete(client.id);
}

function rekeyClient(client, id) {
  const previousId = client.id;
  const existing = clients.get(id);

  if (existing && existing !== client) {
    removeClient(existing);
    closeSocket(existing.socket);
  }

  clients.delete(previousId);
  client.id = id;
  clients.set(client.id, client);
}

function closeSocket(socket) {
  try {
    socket.end();
  } catch {
    socket.destroy();
  }
}

function createId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

function normalizeClientId(value) {
  const normalized = String(value || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  return normalized.length >= 8 ? normalized : "";
}

function normalizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "";
}

function hashCode(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function colorFromSeed(seed) {
  const palette = ["#20c7b3", "#ff6b5f", "#f6c85f", "#8bb8ff", "#b98cff", "#7bd88f"];
  return palette[seed % palette.length];
}
