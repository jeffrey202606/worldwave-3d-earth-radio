/* WORLDWAVE Prototype 02 — Radio Browser directory adapter.
 * Directory metadata is community-submitted. hidebroken is a recent directory
 * health signal, not a guarantee that a stream will play in every browser/region.
 */
(() => {
  const API_HOSTS = [
    "https://de1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://fr1.api.radio-browser.info"
  ];
  const CACHE_KEY = "ww-radio-browser-v2-cache";
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const LIMIT = 1000;
  const GLOBAL_PAGES = 4;
  const genreRules = [
    ["Jazz", /jazz|blues|soul|funk/],
    ["Electronic", /electro|electronic|techno|house|ambient|trance|dance|chillout/],
    ["Classical", /classical|classic|opera|orchestra|baroque|piano/],
    ["Indie", /indie|alternative|rock|pop|college|freeform/],
    ["World", /world|folk|ethnic|reggae|latin|african|asian|country/]
  ];
  const clean = value => String(value || "").trim();
  const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function genreFrom(tags, name) {
    const haystack = `${tags || ""} ${name || ""}`.toLowerCase();
    const match = genreRules.find(([, rule]) => rule.test(haystack));
    return match ? match[0] : "World";
  }
  function normalize(raw) {
    const lat = Number(raw.geo_lat), lon = Number(raw.geo_long);
    const stream = clean(raw.url_resolved || raw.url);
    if (!raw.stationuuid || !clean(raw.name) || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180 || !/^https?:\/\//i.test(stream)) return null;
    const country = clean(raw.country) || clean(raw.countrycode) || "Unknown country";
    const city = clean(raw.state) || country;
    const tags = clean(raw.tags).split(",").map(t => t.trim()).filter(Boolean).slice(0, 8);
    return {
      id: `rb-${raw.stationuuid}`, uuid: raw.stationuuid,
      name: clean(raw.name), city, country, countryCode: clean(raw.countrycode),
      genre: genreFrom(tags.join(" "), raw.name), tag: tags.slice(0, 3).join(" · ") || "Global radio",
      tags, language: clean(raw.language), lat, lon,
      code: clean(raw.name).split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase().slice(0, 4),
      stream, homepage: clean(raw.homepage), favicon: clean(raw.favicon),
      codec: clean(raw.codec).toUpperCase(), bitrate: Number(raw.bitrate) || 0,
      votes: Number(raw.votes) || 0, clickcount: Number(raw.clickcount) || 0,
      directoryLastCheckOk: raw.lastcheckok === true || raw.lastcheckok === 1,
      source: "Radio Browser", lastCheckOk: raw.lastcheckok, lastCheckTime: raw.lastchecktime_iso || null
    };
  }
  function dedupe(stations) {
    const seen = new Set();
    return stations.filter(s => {
      const key = s.uuid || `${slug(s.name)}|${slug(s.country)}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  async function request(path, params = {}) {
    const query = new URLSearchParams(params);
    let lastError;
    for (const host of API_HOSTS) {
      try {
        const response = await fetch(`${host}${path}?${query}`, {
          headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6000)
        });
        if (!response.ok) throw new Error(`Directory returned HTTP ${response.status}`);
        return await response.json();
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error("Radio directory unavailable");
  }
  async function loadFeatured() {
    const cached = readCache();
    if (cached && cached.stations.length > 500) return { stations: cached.stations, cached: true, source: "RADIO BROWSER CACHE" };
    const merged = new Map();
    // Radio Browser documents offset/limit paging and a 1000-row request is a conservative page size.
    // Four pages provide a broad global sample without downloading the entire directory on every visit.
    for (let page = 0; page < GLOBAL_PAGES; page++) {
      const raw = await request("/json/stations/search", {
        limit: LIMIT, offset: page * LIMIT, hidebroken: "true", has_geo_info: "true",
        order: "clickcount", reverse: "true"
      });
      const rows = (Array.isArray(raw) ? raw : []).map(normalize).filter(Boolean);
      rows.forEach(station => merged.set(station.uuid, station));
      if (rows.length < LIMIT) break;
    }
    const stations = dedupe([...merged.values()]);
    if (!stations.length) {
      if (cached) return { stations: cached.stations, cached: true, source: "STALE RADIO BROWSER CACHE" };
      throw new Error("The directory returned no stations with usable geographic coordinates.");
    }
    writeCache(stations);
    return { stations, cached: false, source: "RADIO BROWSER LIVE DIRECTORY" };
  }
  async function countClick(uuid) {
    if (!uuid) return;
    try { await request(`/json/url/${encodeURIComponent(uuid)}`); } catch (_) { /* click counter is best effort */ }
  }
  async function search(query) {
    if (window.WW_API) {
      try {
        const backendResults = await window.WW_API.searchStations(query);
        if (backendResults.length) return backendResults;
      } catch (error) { console.warn("WORLDWAVE backend search unavailable; using directory fallback:", error); }
    }
    const raw = await request("/json/stations/search", {
      name: query, limit: 80, hidebroken: "true", has_geo_info: "true", order: "clickcount", reverse: "true"
    });
    return dedupe((Array.isArray(raw) ? raw : []).map(normalize).filter(Boolean));
  }
  function readCache() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (value && Date.now() - value.savedAt < CACHE_TTL && Array.isArray(value.stations)) return value;
    } catch (_) {}
    return null;
  }
  function writeCache(stations) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), stations })); } catch (_) {}
  }
  window.WW_RADIO_BROWSER = { loadFeatured, search, normalize, countClick, cacheKey: CACHE_KEY };
})();
