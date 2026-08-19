module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const apiKey = process.env.DAILY_API_KEY;
  const roomName = normalizeRoomName(req.query?.room);

  if (!apiKey) {
    sendJson(res, { error: "daily_config_missing" }, 501);
    return;
  }

  if (!roomName) {
    sendJson(res, { error: "invalid_room" }, 400);
    return;
  }

  try {
    const existingRoom = await getDailyRoom(apiKey, roomName);
    if (existingRoom?.url) {
      sendJson(res, { url: existingRoom.url, name: existingRoom.name, reused: true });
      return;
    }

    const room = await createDailyRoom(apiKey, roomName);
    sendJson(res, { url: room.url, name: room.name, reused: false });
  } catch (error) {
    console.error("Daily room error:", error);
    sendJson(res, { error: "daily_room_failed" }, 500);
  }
};

async function getDailyRoom(apiKey, roomName) {
  const response = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
    headers: dailyHeaders(apiKey)
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Daily get room failed: ${response.status}`);
  }

  return response.json();
}

async function createDailyRoom(apiKey, roomName) {
  const response = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: {
      ...dailyHeaders(apiKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: roomName,
      privacy: "public",
      properties: {
        enable_prejoin_ui: true,
        enable_people_ui: true,
        enable_network_ui: true,
        enable_noise_cancellation_ui: true,
        enable_video_processing_ui: true,
        enable_pip_ui: true,
        enable_screenshare: true,
        enable_chat: false,
        start_video_off: true,
        start_audio_off: false,
        lang: "pt-BR",
        sfu_switchover: 0.5
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Daily create room failed: ${response.status}`);
  }

  return response.json();
}

function dailyHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`
  };
}

function normalizeRoomName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

function sendJson(res, data, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
