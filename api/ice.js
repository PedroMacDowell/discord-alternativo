const DEFAULT_TTL_SECONDS = 3600;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  try {
    const twilioIceServers = await getTwilioIceServers();
    if (twilioIceServers?.length) {
      sendJson(res, {
        iceServers: twilioIceServers,
        forceRelay: readBooleanEnv("RTC_FORCE_RELAY", "RTC_FORCE_TURN"),
        source: "twilio"
      });
      return;
    }

    const meteredIceServers = await getMeteredIceServers();
    if (meteredIceServers?.length) {
      sendJson(res, {
        iceServers: meteredIceServers,
        forceRelay: readBooleanEnv("RTC_FORCE_RELAY", "RTC_FORCE_TURN"),
        source: "metered"
      });
      return;
    }

    const staticIceServers = getStaticTurnIceServers();
    sendJson(res, {
      iceServers: staticIceServers,
      forceRelay: readBooleanEnv("RTC_FORCE_RELAY", "RTC_FORCE_TURN"),
      source: staticIceServers.length ? "static" : "none"
    });
  } catch (error) {
    console.error("Failed to create ICE config:", error);
    sendJson(res, { iceServers: [], forceRelay: false, source: "error" }, 500);
  }
};

async function getTwilioIceServers() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || typeof fetch !== "function") {
    return [];
  }

  const ttl = clampNumber(Number(process.env.TWILIO_NTS_TTL || DEFAULT_TTL_SECONDS), 300, 86400);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Tokens.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({ Ttl: String(ttl) });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(`Twilio token failed: ${response.status}`);
  }

  const data = await response.json();
  return normalizeIceServers(data.ice_servers || data.iceServers || []);
}

async function getMeteredIceServers() {
  const appName = pickEnv("METERED_APP_NAME", "OPENRELAY_APP_NAME");
  const apiKey = pickEnv("METERED_API_KEY", "OPENRELAY_API_KEY");

  if (!appName || !apiKey || typeof fetch !== "function") {
    return [];
  }

  const url = `https://${encodeURIComponent(appName)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    throw new Error(`Metered TURN credentials failed: ${response.status}`);
  }

  return normalizeIceServers(await response.json());
}

function getStaticTurnIceServers() {
  const urls = splitEnv("RTC_TURN_URLS", "TURN_URLS", "VITE_RTC_TURN_URLS");
  const username = pickEnv("RTC_TURN_USERNAME", "TURN_USERNAME", "VITE_RTC_TURN_USERNAME");
  const credential = pickEnv("RTC_TURN_CREDENTIAL", "TURN_CREDENTIAL", "VITE_RTC_TURN_CREDENTIAL");

  if (!urls.length || !username || !credential) {
    return [];
  }

  return normalizeIceServers([{ urls, username, credential }]);
}

function normalizeIceServers(iceServers) {
  return iceServers
    .map((server) => ({
      urls: server.urls,
      username: server.username,
      credential: server.credential || server.password
    }))
    .filter((server) => server.urls);
}

function splitEnv(...keys) {
  const value = pickEnv(...keys);
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function pickEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return "";
}

function readBooleanEnv(...keys) {
  const value = pickEnv(...keys).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sendJson(res, data, statusCode = 200) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
