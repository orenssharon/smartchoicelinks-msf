const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCES_FILE = path.join(ROOT_DIR, "data", "sources.json");
const PUBLIC_CHARS_DIR = path.join(ROOT_DIR, "public", "characters");

function escapeHtml(val) {
  const str = String(val === undefined || val === null ? "" : val);
  return str
    .split("&").join("&")
    .split("<").join("<")
    .split(">").join(">")
    .split('"').join(""");
}

function slugify(text) {
  const cleaned = String(text || "placeholder-character")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "placeholder-character";
}

async function queryExternalEndpoints(endpoints) {
  const collected = [];
  if (!Array.isArray(endpoints)) return collected;

  for (const ep of endpoints) {
    if (!ep || !ep.url || !ep.url.startsWith("https://")) continue;
    try {
      const res = await fetch(ep.url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        collected.push({ source: ep.name || ep.url, data: json });
      } else {
        const text = await res.text();
        collected.push({ source: ep.name || ep.url, snippetLength: text.length });
      }
    } catch (err) {
      console
