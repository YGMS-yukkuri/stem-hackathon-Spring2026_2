import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const OSRM_ENDPOINT = "https://router.project-osrm.org";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org";
const SEARCH_CACHE_MS = 60 * 1000;
const searchCache = new Map();
const geocodeCache = new Map();
const ALLOWED_TAG_VALUES = new Set([
  "cafe",
  "restaurant",
  "fast_food",
  "food_court",
  "bar",
  "pub",
  "ice_cream",
  "biergarten",
  "convenience",
  "bakery",
  "confectionery",
  "chocolate",
  "tea",
  "coffee",
  "pharmacy",
  "chemist",
  "drugstore",
  "attraction",
  "museum",
  "gallery",
  "zoo",
  "aquarium",
  "theme_park",
  "viewpoint",
  "park",
]);

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function inferCategory(tags = {}) {
  if (tags.amenity) {
    return tags.amenity;
  }
  if (tags.shop) {
    return tags.shop;
  }
  if (tags.tourism) {
    return tags.tourism;
  }
  return "facility";
}

function formatAddressFromTags(tags = {}) {
  if (tags["addr:full"]) {
    return tags["addr:full"];
  }

  const parts = [
    tags["addr:postcode"],
    tags["addr:state"],
    tags["addr:city"],
    tags["addr:suburb"],
    tags["addr:street"],
    tags["addr:housenumber"],
  ].filter(Boolean);

  return parts.join(" ") || "住所情報なし";
}

function isRelevantFacility(tags = {}) {
  const values = [tags.amenity, tags.shop, tags.tourism].filter(Boolean);
  if (values.length === 0) {
    return false;
  }
  return values.some((value) => ALLOWED_TAG_VALUES.has(value));
}

function categoryToRegex(category) {
  if (!category || category === "all") {
    return ".+";
  }

  if (category === "drugstore") {
    return "^(pharmacy|chemist|drugstore)$";
  }

  return `^${category}$`;
}

function buildOverpassQuery({ lat, lng, radius, keyword, category }) {
  const safeKeyword = (keyword || "").replace(/[\";]/g, "");
  const categoryPattern = `[~\"^(amenity|shop|tourism)$\"~\"${categoryToRegex(category)}\",i]`;
  const keywordPattern = safeKeyword
    ? `[~\"^(name|brand|operator)$\"~\"${safeKeyword}\",i]`
    : "";

  return `
[out:json][timeout:20];
(
  node(around:${radius},${lat},${lng})${categoryPattern}${keywordPattern};
  way(around:${radius},${lat},${lng})${categoryPattern}${keywordPattern};
  relation(around:${radius},${lat},${lng})${categoryPattern}${keywordPattern};
);
out center tags;
`.trim();
}

function normalizeFacility(element, userLat, userLng) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  const rawName = (element.tags?.name || "").trim();
  if (!rawName) {
    return null;
  }
  if (!isRelevantFacility(element.tags)) {
    return null;
  }

  const distanceMeters = haversineMeters(userLat, userLng, lat, lng);
  return {
    id: `${element.type}-${element.id}`,
    name: rawName,
    address: formatAddressFromTags(element.tags),
    lat,
    lng,
    phone: element.tags?.phone || "",
    url: element.tags?.website || element.tags?.url || "",
    opening_hours: element.tags?.opening_hours || "",
    category: inferCategory(element.tags),
    source: "overpass",
    distanceMeters: Math.round(distanceMeters),
    distanceType: "straight",
  };
}

async function fetchNominatimJson(path, cacheKey) {
  const cacheHit = geocodeCache.get(cacheKey);
  if (cacheHit && cacheHit.expiresAt > Date.now()) {
    return cacheHit.data;
  }

  const response = await fetch(`${NOMINATIM_ENDPOINT}${path}`, {
    headers: {
      "User-Agent": "stem-hackathon-spring2026/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim API error: ${response.status}`);
  }

  const data = await response.json();
  geocodeCache.set(cacheKey, { data, expiresAt: Date.now() + SEARCH_CACHE_MS });
  return data;
}

async function fetchFacilities({ lat, lng, radius, keyword, category }) {
  const cacheKey = JSON.stringify({ lat, lng, radius, keyword, category });
  const cacheHit = searchCache.get(cacheKey);
  if (cacheHit && cacheHit.expiresAt > Date.now()) {
    return cacheHit.data;
  }

  const query = buildOverpassQuery({ lat, lng, radius, keyword, category });
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const payload = await response.json();
  const facilities = (payload.elements || [])
    .map((element) => normalizeFacility(element, lat, lng))
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  searchCache.set(cacheKey, { data: facilities, expiresAt: Date.now() + SEARCH_CACHE_MS });
  return facilities;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "stem-hackathon-server" });
});

app.get("/api/search", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius || 1000);
  const keyword = String(req.query.keyword || "").trim();
  const category = String(req.query.category || "all").trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat/lng は必須です。" });
  }

  if (!Number.isFinite(radius) || radius < 100 || radius > 10000) {
    return res.status(400).json({ error: "radius は 100-10000 の範囲で指定してください。" });
  }

  try {
    const facilities = await fetchFacilities({ lat, lng, radius, keyword, category });
    return res.json({ facilities });
  } catch (error) {
    return res.status(502).json({
      error: "施設検索APIへの接続に失敗しました。時間をおいて再試行してください。",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});

app.get("/api/geocode", async (req, res) => {
  const query = String(req.query.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "query は必須です。" });
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
    });
    const payload = await fetchNominatimJson(`/search?${params.toString()}`, `g:${query.toLowerCase()}`);
    const first = payload?.[0];

    if (!first) {
      return res.status(404).json({ error: "住所から位置を特定できませんでした。" });
    }

    return res.json({
      lat: Number(first.lat),
      lng: Number(first.lon),
      address: first.display_name || query,
    });
  } catch (error) {
    return res.status(502).json({
      error: "住所変換APIへの接続に失敗しました。",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});

app.get("/api/reverse-geocode", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat/lng は必須です。" });
  }

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      addressdetails: "1",
    });
    const payload = await fetchNominatimJson(`/reverse?${params.toString()}`, `r:${lat.toFixed(6)}:${lng.toFixed(6)}`);
    return res.json({
      lat,
      lng,
      address: payload?.display_name || "住所情報なし",
    });
  } catch (error) {
    return res.status(502).json({
      error: "逆ジオコーディングAPIへの接続に失敗しました。",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});

app.get("/api/route", async (req, res) => {
  const fromLat = Number(req.query.fromLat);
  const fromLng = Number(req.query.fromLng);
  const toLat = Number(req.query.toLat);
  const toLng = Number(req.query.toLng);

  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    return res.status(400).json({ error: "from/to の緯度経度が必要です。" });
  }

  const straightDistance = haversineMeters(fromLat, fromLng, toLat, toLng);
  const fallback = {
    distanceMeters: Math.round(straightDistance),
    source: "fallback",
    distanceType: "straight",
  };

  try {
    const profile = req.query.profile === "driving" ? "driving" : "walking";
    const routeUrl = `${OSRM_ENDPOINT}/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const response = await fetch(routeUrl);

    if (!response.ok) {
      return res.json(fallback);
    }

    const payload = await response.json();
    const route = payload?.routes?.[0];
    if (!route) {
      return res.json(fallback);
    }

    return res.json({
      distanceMeters: Math.round(route.distance),
      source: "osrm",
      distanceType: "route",
    });
  } catch (_error) {
    return res.json(fallback);
  }
});

app.listen(PORT, () => {
  console.log(`server running on http://localhost:${PORT}`);
});
