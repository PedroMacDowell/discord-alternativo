const fs = require("fs");
const path = require("path");

loadLocalEnv(path.join(__dirname, "..", ".env.local"));

const config = {
  apiKey: pickEnv("FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"),
  authDomain: pickEnv("FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: pickEnv("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"),
  storageBucket: pickEnv("FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: pickEnv("FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: pickEnv("FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"),
  measurementId: pickEnv("FIREBASE_MEASUREMENT_ID", "VITE_FIREBASE_MEASUREMENT_ID")
};

const rtcConfig = {
  turnUrls: splitEnv("RTC_TURN_URLS", "TURN_URLS", "VITE_RTC_TURN_URLS"),
  turnUsername: pickEnv("RTC_TURN_USERNAME", "TURN_USERNAME", "VITE_RTC_TURN_USERNAME"),
  turnCredential: pickEnv("RTC_TURN_CREDENTIAL", "TURN_CREDENTIAL", "VITE_RTC_TURN_CREDENTIAL"),
  forceRelay: readBooleanEnv("RTC_FORCE_RELAY", "RTC_FORCE_TURN")
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"];
const hasRequiredConfig = requiredKeys.every((key) => Boolean(config[key]));
const configForBrowser = hasRequiredConfig ? removeEmptyValues(config) : null;
const hasTurnConfig = Boolean(rtcConfig.turnUrls.length && rtcConfig.turnUsername && rtcConfig.turnCredential);
const rtcConfigForBrowser = hasTurnConfig ? rtcConfig : null;
const targetPath = path.join(__dirname, "..", "public", "firebase-config.js");

fs.writeFileSync(
  targetPath,
  [
    `window.PONTE_FIREBASE_CONFIG = ${JSON.stringify(configForBrowser, null, 2)};`,
    `window.PONTE_RTC_CONFIG = ${JSON.stringify(rtcConfigForBrowser, null, 2)};`,
    ""
  ].join("\n"),
  "utf8"
);

if (hasRequiredConfig) {
  console.log("Firebase configurado para build de produção.");
} else {
  console.log("Build sem Firebase: defina FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID e FIREBASE_APP_ID na Vercel.");
}

console.log("Chamadas configuradas via Jitsi Meet embed, sem chave de API.");

function pickEnv(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return "";
}

function splitEnv(...keys) {
  const value = pickEnv(...keys);
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function readBooleanEnv(...keys) {
  const value = pickEnv(...keys).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function removeEmptyValues(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => Boolean(item)));
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
