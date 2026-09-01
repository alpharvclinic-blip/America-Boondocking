if (!document.getElementById("map")) {
  document.body.innerHTML = `<header class="topbar"><a class="brand" href="/"><span class="brand-mark">⌂</span><span><strong>Overnight</strong> Atlas</span></a><div class="topbar-note"><span class="live-dot"></span> Live map data · USA</div></header><main class="app-shell"><aside class="sidebar"><div class="intro"><p class="eyebrow">Free overnight parking</p><h1>Find a place to reset.</h1><p class="intro-copy">Search source-linked retail and travel locations tagged for RV access, open access, and no membership or parking fee.</p></div><form id="search-form" class="search-form"><label for="search-input">Search by city, state, or ZIP code</label><div class="search-row"><input id="search-input" name="query" type="search" placeholder="Try Flagstaff, AZ or 86001" autocomplete="off" /><button class="primary-button" type="submit">Search</button></div></form><div class="quick-actions"><button id="locate-button" class="secondary-button" type="button">◎ Use my location</button><button id="reset-button" class="text-button" type="button">Reset map</button></div><section class="filters"><div class="section-label">Narrow results</div><label class="check-row"><input id="overnight-filter" type="checkbox" /> <span>Explicitly tagged overnight</span></label><label class="check-row"><input id="phone-filter" type="checkbox" /> <span>Phone number listed</span></label></section><div class="results-head"><div><span id="results-count">Search to load locations</span><span id="searched-place"></span></div><button id="about-button" class="info-button" type="button">How this works</button></div><div id="status" class="status" role="status">Search a city, state, or ZIP to begin.</div><div id="locations-list" class="locations-list"></div></aside><section class="map-panel" aria-label="Map of RV-friendly locations"><div id="map"></div><div class="map-legend"><span><i class="legend-dot green"></i> RV access tagged</span><span><i class="legend-dot gold"></i> Overnight tagged</span></div><div class="map-hint">Zoom in and move the map to load another area</div></section></main><dialog id="about-dialog" class="dialog"><button class="dialog-close" data-close-dialog aria-label="Close">×</button><p class="eyebrow">Data you can inspect</p><h2>Useful, not overconfident.</h2><p>Overnight Atlas only displays OpenStreetMap places with an explicit <code>caravan=yes</code> or <code>motorhome=yes</code> tag, without a parking fee or membership tag, and without private access. That removes membership-gated and paid parking candidates from the default feed.</p><p>Tags are community-maintained, and a property can change its policy without notice. Always check posted signs and ask the manager before staying overnight. Open each result’s source link to inspect the map record yourself.</p><p class="dialog-footnote">Map © OpenStreetMap contributors · Data queried live from Overpass API · Geocoding by Nominatim</p></dialog><dialog id="report-dialog" class="dialog"><button class="dialog-close" data-close-dialog aria-label="Close">×</button><p class="eyebrow">Keep the map honest</p><h2>Report a change</h2><p id="report-location"></p><form id="report-form"><input id="report-location-id" type="hidden" /><input id="report-location-name" type="hidden" /><label for="report-reason">What changed?</label><select id="report-reason" required><option value="">Choose one</option><option>Overnight parking is no longer allowed</option><option>Parking fee or membership is required</option><option>Location is closed or moved</option><option>Address or contact information is wrong</option></select><label for="report-message">Notes <span>(optional)</span></label><textarea id="report-message" rows="3" maxlength="500" placeholder="What did you see?"></textarea><button class="primary-button" type="submit">Send report</button><div id="report-status" class="form-status" role="status"></div></form></dialog>`;
}

const map = L.map("map", { zoomControl: true }).setView([39.8283, -98.5795], 4);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const state = { locations: [], loading: false, requestId: 0 };
const $ = (selector) => document.querySelector(selector);
const elements = {
  form: $("#search-form"),
  input: $("#search-input"),
  locate: $("#locate-button"),
  reset: $("#reset-button"),
  overnight: $("#overnight-filter"),
  phone: $("#phone-filter"),
  list: $("#locations-list"),
  count: $("#results-count"),
  place: $("#searched-place"),
  status: $("#status"),
  about: $("#about-dialog"),
  report: $("#report-dialog"),
  reportForm: $("#report-form")
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function setStatus(message, error = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", error);
}

function filteredLocations() {
  return state.locations.filter((location) => {
    if (elements.overnight.checked && !location.overnight) return false;
    if (elements.phone.checked && !location.phone) return false;
    return true;
  });
}

function iconFor(location) {
  const color = location.overnight ? "#e9aa43" : "#174d3a";
  return L.divIcon({
    className: "atlas-marker",
    html: `<span style="display:grid;place-items:center;width:25px;height:25px;border:3px solid white;border-radius:50%;background:${color};box-shadow:0 2px 7px #17352a88;color:white;font-size:12px">⌂</span>`,
    iconSize: [25, 25],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10]
  });
}

function popupHtml(location) {
  const phone = location.phone
    ? `<p>☎ <a href="tel:${escapeHtml(location.phone)}">${escapeHtml(location.phone)}</a></p>`
    : "";
  const website = location.website
    ? `<p>↗ <a href="${escapeHtml(location.website)}" target="_blank" rel="noreferrer">Website</a></p>`
    : "";
  return `<div class="popup">
    <h3>${escapeHtml(location.name)}</h3>
    <p>${escapeHtml(location.category)}</p>
    <p>${escapeHtml(location.address)}</p>
    ${phone}${website}
    <p><a href="${escapeHtml(location.sourceUrl)}" target="_blank" rel="noreferrer">Inspect source record ↗</a></p>
  </div>`;
}

function drawMap(locations, fit = false) {
  markerLayer.clearLayers();
  const bounds = [];
  for (const location of locations) {
    const marker = L.marker([location.lat, location.lng], { icon: iconFor(location) })
      .bindPopup(popupHtml(location), { maxWidth: 280 });
    marker.locationId = location.id;
    markerLayer.addLayer(marker);
    bounds.push([location.lat, location.lng]);
  }
  if (fit && bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
}

function cardHtml(location) {
  const phone = location.phone
    ? `<div class="card-contact">☎ <a href="tel:${escapeHtml(location.phone)}">${escapeHtml(location.phone)}</a></div>`
    : `<div class="card-contact">No phone listed in source</div>`;
  return `<article class="location-card">
    <h3>${escapeHtml(location.name)}</h3>
    <div class="badges">
      <span class="badge">RV access tagged</span>
      ${location.overnight ? '<span class="badge gold">Overnight tagged</span>' : ""}
      <span class="badge">No membership or fee tagged</span>
    </div>
    <div class="card-address">${escapeHtml(location.address)}</div>
    ${phone}
    <div class="card-actions">
      <button class="zoom-link" data-id="${escapeHtml(location.id)}" type="button">Show on map</button>
      <a class="source-link" href="${escapeHtml(location.sourceUrl)}" target="_blank" rel="noreferrer">Source record ↗</a>
      <button class="report-link" data-report-id="${escapeHtml(location.id)}" type="button">Report change</button>
    </div>
  </article>`;
}

function drawList() {
  const locations = filteredLocations();
  elements.count.textContent = `${locations.length} location${locations.length === 1 ? "" : "s"}`;
  elements.list.innerHTML = locations.length
    ? locations.map(cardHtml).join("")
    : '<div class="empty">No source-tagged locations match these filters in this area. Try a nearby city or zoom out slightly.</div>';
  drawMap(locations);
  elements.list.querySelectorAll(".zoom-link").forEach((button) => {
    button.addEventListener("click", () => {
      const location = state.locations.find((item) => item.id === button.dataset.id);
      if (!location) return;
      map.setView([location.lat, location.lng], 15);
      markerLayer.eachLayer((marker) => {
        if (marker.locationId === location.id) marker.openPopup();
      });
    });
  });
  elements.list.querySelectorAll("[data-report-id]").forEach((button) => {
    button.addEventListener("click", () => openReport(button.dataset.reportId));
  });
}

async function loadLocations({ query = "", bbox = "", fit = true } = {}) {
  const requestId = ++state.requestId;
  state.loading = true;
  setStatus("Loading live map data…");
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (bbox) params.set("bbox", bbox);
  try {
    const response = await fetch(`/api/locations?${params}`);
    const payload = await response.json();
    if (requestId !== state.requestId) return;
    if (!response.ok) throw new Error(payload.error || "Could not load locations.");
    state.locations = payload.locations || [];
    elements.place.textContent = payload.searchedPlace ? payload.searchedPlace.displayName : "";
    setStatus("Source-tagged candidates only. Check signs and ask the property before staying overnight.");
    drawList();
    if (payload.searchedPlace && fit) map.setView([payload.searchedPlace.lat, payload.searchedPlace.lng], 11);
    if (fit && state.locations.length) drawMap(filteredLocations(), true);
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.locations = [];
    drawList();
    setStatus(error.message, true);
  } finally {
    if (requestId === state.requestId) state.loading = false;
  }
}

function currentMapBbox() {
  const bounds = map.getBounds();
  return [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");
}

function openReport(id) {
  const location = state.locations.find((item) => item.id === id);
  if (!location) return;
  $("#report-location").textContent = location.name;
  $("#report-location-id").value = location.id;
  $("#report-location-name").value = location.name;
  $("#report-reason").value = "";
  $("#report-message").value = "";
  $("#report-status").textContent = "";
  elements.report.showModal();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = elements.input.value.trim();
  if (query) loadLocations({ query });
});
elements.overnight.addEventListener("change", drawList);
elements.phone.addEventListener("change", drawList);
elements.reset.addEventListener("click", () => {
  elements.input.value = "";
  elements.place.textContent = "";
  map.setView([39.8283, -98.5795], 4);
  state.locations = [];
  drawList();
  setStatus("Search a city, state, or ZIP to begin.");
});
elements.locate.addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("Location services are not available in this browser.", true);
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      map.setView([coords.latitude, coords.longitude], 11);
      loadLocations({ bbox: currentMapBbox(), fit: false });
    },
    () => setStatus("Location access was declined. Search by city, state, or ZIP instead.", true),
    { enableHighAccuracy: false, timeout: 10_000 }
  );
});
map.on("moveend", () => {
  if (map.getZoom() >= 8 && !state.loading) loadLocations({ bbox: currentMapBbox(), fit: false });
});
$("#about-button").addEventListener("click", () => elements.about.showModal());
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
elements.reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = $("#report-status");
  status.textContent = "Sending…";
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId: $("#report-location-id").value,
        locationName: $("#report-location-name").value,
        reason: $("#report-reason").value,
        message: $("#report-message").value
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not send report.");
    status.textContent = "Thanks — the report was recorded.";
    setTimeout(() => elements.report.close(), 900);
  } catch (error) {
    status.textContent = error.message;
  }
});

drawList();