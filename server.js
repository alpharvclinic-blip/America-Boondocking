import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const port = Number(process.env.PORT || 3000);
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "AmericaBoondocking/1.0 (+https://github.com/alpharvclinic-blip/America-Boondocking)";
const MAX_BODY_BYTES = 10_000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function parseNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validBbox(value) {
  if (!value) return null;
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((item) => !Number.isFinite(item))) return null;
  const [south, west, north, east] = values;
  if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) return null;
  if (north - south > 3 || east - west > 3) return null;
  return { south, west, north, east };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Upstream service returned ${response.status}`);
  return response.json();
}

async function geocode(query) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("q", query);
  const results = await fetchJson(url);
  if (!results.length) return null;
  const place = results[0];
  const south = parseNumber(place.boundingbox?.[0], Number(place.lat) - 0.25);
  const north = parseNumber(place.boundingbox?.[1], Number(place.lat) + 0.25);
  const west = parseNumber(place.boundingbox?.[2], Number(place.lon) - 0.25);
  const east = parseNumber(place.boundingbox?.[3], Number(place.lon) + 0.25);
  return {
    lat: Number(place.lat),
    lng: Number(place.lon),
    displayName: place.display_name,
    bbox: {
      south: Math.max(-90, Math.min(south, north - 0.05)),
      west: Math.max(-180, Math.min(west, east - 0.05)),
      north: Math.min(90, Math.max(north, south + 0.05)),
      east: Math.min(180, Math.max(east, west + 0.05))
    }
  };
}

function overpassQuery(bbox) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  // These are deliberately narrow: a place must explicitly carry an RV tag
  // and not charge a parking fee. Untagged or membership-gated places do not
  // get presented as verified results.
  return `[out:json][timeout:20];
(
  nwr["shop"]["caravan"="yes"]["fee"!="yes"]["membership"!="yes"]["access"!="private"](${box});
  nwr["shop"]["motorhome"="yes"]["fee"!="yes"]["membership"!="yes"]["access"!="private"](${box});
  nwr["amenity"="fuel"]["caravan"="yes"]["fee"!="yes"]["membership"!="yes"]["access"!="private"](${box});
  nwr["amenity"="fuel"]["motorhome"="yes"]["fee"!="yes"]["membership"!="yes"]["access"!="private"](${box});
  nwr["amenity"="parking"]["caravan"="yes"]["fee"!="yes"]["membership"!="yes"]["access"!="private"](${box});
  nwr["amenity"="parking"]["motorhome"="yes"]["fee"!="yes"]["membership"!="yes"]["access"!="private"](${box});
);
out center tags;`;
}

function getAddress(tags = {}) {
  const lines = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    [tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ")
  ].filter(Boolean);
  return lines.join(", ");
}

function classify(tags = {}) {
  if (tags.shop) return tags.shop.replaceAll("_", " ");
  if (tags.amenity === "fuel") return "Fuel / travel retail";
  if (tags.amenity === "parking") return "Retail parking area";
  return "RV-friendly retail";
}

function normalizeElement(element) {
  const tags = element.tags || {};
  const lat = Number(element.lat ?? element.center?.lat);
  const lng = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || tags.brand || "Unnamed retail location",
    category: classify(tags),
    lat,
    lng,
    address: getAddress(tags) || "Address not listed in OpenStreetMap",
    city: tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "",
    state: tags["addr:state"] || "",
    zip: tags["addr:postcode"] || "",
    phone: tags.phone || tags["contact:phone"] || "",
    website: tags.website || tags["contact:website"] || "",
    overnight: tags.overnight === "yes",
    membership: tags.membership || "",
    source: "OpenStreetMap",
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    accessNote: tags.note || tags.description || "RV access is tagged in OpenStreetMap; confirm with the property before staying overnight.",
    updatedAt: new Date().toISOString()
  };
}

async function locationsForBbox(bbox) {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": USER_AGENT
    },
    body: overpassQuery(bbox),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Map data service returned ${response.status}`);
  const payload = await response.json();
  const deduped = new Map();
  for (const element of payload.elements || []) {
    const location = normalizeElement(element);
    if (location) deduped.set(location.id, location);
  }
  return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function createReport(request) {
  const raw = await readBody(request);
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
  const allowed = ["locationId", "locationName", "reason", "message"];
  const clean = Object.fromEntries(allowed.map((key) => [key, String(report[key] || "").slice(0, 500)]));
  if (!clean.locationId || !clean.reason) throw new Error("A location and reason are required");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(path.join(dataDir, "reports.ndjson"), `${JSON.stringify({ ...clean, createdAt: new Date().toISOString() })}\n`);
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/locations" && request.method === "GET") {
    const query = (url.searchParams.get("query") || "").trim().slice(0, 120);
    let bbox = validBbox(url.searchParams.get("bbox"));
    let searchedPlace = null;
    if (query) {
      searchedPlace = await geocode(query);
      if (!searchedPlace) return json(response, 404, { error: "No US place matched that search." });
      bbox = searchedPlace.bbox;
    }
    if (!bbox) return json(response, 400, { error: "Search for a city, state, or ZIP, or move the map to load a smaller area." });
    const locations = await locationsForBbox(bbox);
    return json(response, 200, {
      locations,
      searchedPlace,
      source: "OpenStreetMap / Overpass",
      policy: "Results require an RV or motorhome access tag and no parking fee tag. Local rules and manager permission still control."
    });
  }
  if (url.pathname === "/api/reports" && request.method === "POST") {
    await createReport(request);
    return json(response, 201, { ok: true });
  }
  return json(response, 404, { error: "Not found" });
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  // Keep the entry document at the repository root for hosts that apply
  // stricter rules to nested HTML paths. All other assets remain in public/.
  const filePath = requested === "/index.html"
    ? path.join(__dirname, "app-shell.md")
    : path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir + path.sep)) return json(response, 403, { error: "Forbidden" });
  fs.readFile(filePath, (error, content) => {
    if (error) return json(response, 404, { error: "Not found" });
    response.writeHead(200, {
      "Content-Type": requested === "/index.html" ? "text/html; charset=utf-8" : (mimeTypes[path.extname(filePath)] || "application/octet-stream"),
      "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else if (request.method === "GET") serveStatic(response, url.pathname);
    else json(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    json(response, 502, { error: error.message || "Upstream service unavailable" });
  }
});

server.listen(port, () => console.log(`America Boondocking listening at http://localhost:${port}`));