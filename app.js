// ── App Logic ──
const map = L.map('map').setView([39.8283, -98.5795], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 18
}).addTo(map);

let markersLayer = L.layerGroup().addTo(map);
let allLocations = [...LOCATIONS];

// Icons
const iconBlue = L.divIcon({ className: 'custom-icon', html: '<span style="background:#2979ff;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4);">●</span>', iconSize: [28,28], iconAnchor: [14,14] });
const iconGold = L.divIcon({ className: 'custom-icon', html: '<span style="background:#ffd700;color:#1a1a2e;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4);">⚡</span>', iconSize: [28,28], iconAnchor: [14,14] });

function renderList(locations) {
  const list = document.getElementById('locations-list');
  const count = document.getElementById('results-count');
  if (!locations.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No locations found. Try a different search.</div>';
    count.textContent = '0 locations';
    return;
  }
  count.textContent = locations.length + ' location' + (locations.length!==1?'s':'');
  list.innerHTML = locations.map(l => `
    <div class="loc-item" data-id="${l.id}" onclick="flyToLocation(${l.id})">
      <h3>${l.name}</h3>
      <div>
        <span class="type">${l.type}</span>
        ${l.electric ? '<span class="electric">⚡ Electric</span>' : '<span class="no-electric">No electric</span>'}
      </div>
      <div class="address">${l.city}, ${l.state}${l.address ? ' — ' + l.address : ''}</div>
      <div class="booking"><strong>How to book:</strong> ${l.booking}</div>
    </div>
  `).join('');
}

function renderMap(locations) {
  markersLayer.clearLayers();
  const bounds = [];
  locations.forEach(l => {
    const icon = l.electric ? iconGold : iconBlue;
    const popupContent = `
      <h3>${l.name}</h3>
      <div class="popup-type">${l.type}</div>
      <div class="popup-addr">${l.city}, ${l.state}${l.address ? '<br/>' + l.address : ''}</div>
      <div class="popup-electric" style="color:${l.electric?'#2d6a4f':'#a00'}">⚡ ${l.electric_detail}</div>
      <div class="popup-booking"><strong>Booking:</strong> ${l.booking}</div>
    `;
    const marker = L.marker([l.lat, l.lng], { icon })
      .bindPopup(popupContent, { maxWidth: 320 });
    markersLayer.addLayer(marker);
    bounds.push([l.lat, l.lng]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30,30], maxZoom: 12 });
}

function flyToLocation(id) {
  const loc = allLocations.find(l => l.id === id);
  if (!loc) return;
  map.setView([loc.lat, loc.lng], 12);
  // open popup
  markersLayer.eachLayer(m => {
    if (m.getLatLng().lat === loc.lat && m.getLatLng().lng === loc.lng) {
      m.openPopup();
    }
  });
}

function filterAndRender() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  const onlyElectric = document.getElementById('filter-electric').checked;

  let filtered = allLocations;

  if (q) {
    // State abbreviation lookup
    const stateAbbr = {
      al:'alabama', ak:'alaska', az:'arizona', ar:'arkansas', ca:'california',
      co:'colorado', ct:'connecticut', de:'delaware', fl:'florida', ga:'georgia',
      hi:'hawaii', id:'idaho', il:'illinois', in:'indiana', ia:'iowa',
      ks:'kansas', ky:'kentucky', la:'louisiana', me:'maine', md:'maryland',
      ma:'massachusetts', mi:'michigan', mn:'minnesota', ms:'mississippi', mo:'missouri',
      mt:'montana', ne:'nebraska', nv:'nevada', nh:'new hampshire', nj:'new jersey',
      nm:'new mexico', ny:'new york', nc:'north carolina', nd:'north dakota', oh:'ohio',
      ok:'oklahoma', or:'oregon', pa:'pennsylvania', ri:'rhode island', sc:'south carolina',
      sd:'south dakota', tn:'tennessee', tx:'texas', ut:'utah', vt:'vermont',
      va:'virginia', wa:'washington', wv:'west virginia', wi:'wisconsin', wy:'wyoming'
    };
    const qState = stateAbbr[q] || null;

    filtered = filtered.filter(l =>
      l.city.toLowerCase().includes(q) ||
      l.state.toLowerCase().includes(q) ||
      (qState && l.state.toLowerCase().includes(qState)) ||
      l.zip.includes(q) ||
      l.name.toLowerCase().includes(q) ||
      l.type.toLowerCase().includes(q) ||
      l.address.toLowerCase().includes(q)
    );
  }
  if (onlyElectric) {
    filtered = filtered.filter(l => l.electric);
  }
  renderList(filtered);
  renderMap(filtered);
}

// Events
document.getElementById('search-btn').addEventListener('click', filterAndRender);
document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') filterAndRender(); });
document.getElementById('filter-electric').addEventListener('change', filterAndRender);

// Initial render
filterAndRender();