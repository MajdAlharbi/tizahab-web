// ======================
//  Auth helpers
// ======================

function getAccessToken() {
  return localStorage.getItem("access");
}

function authHeaders() {
  const token = getAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function apiGet(url) {
  const headers = authHeaders();
  if (!headers) {
    window.location.href = "/api/auth/ui/login/";
    return null;
  }
  const res = await fetch(url, { headers });
  if (res.status === 401) {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    window.location.href = "/api/auth/ui/login/";
    return null;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

// ======================
//  Utilities
// ======================

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const CATEGORY_LABELS = {
  food: "Food & Dining",
  culture: "Culture",
  outdoor: "Outdoor",
  shopping: "Shopping",
  other: "Other",
};

const CATEGORY_COLORS = {
  food: "bg-orange-100 text-orange-700",
  culture: "bg-purple-100 text-purple-700",
  outdoor: "bg-green-100 text-green-700",
  shopping: "bg-blue-100 text-blue-700",
  other: "bg-gray-100 text-gray-600",
};

function catLabel(cat) {
  return CATEGORY_LABELS[cat] || cat || "Other";
}

function catColor(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
}

// ======================
//  Favorites (localStorage)
// ======================

const FAV_KEY = "tizahab_favorites";
const getFavs = () => new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
const saveFavs = (set) => localStorage.setItem(FAV_KEY, JSON.stringify([...set]));

function toggleFav(id) {
  const favs = getFavs();
  const key = String(id);
  if (favs.has(key)) favs.delete(key);
  else favs.add(key);
  saveFavs(favs);
  return favs.has(key);
}

// ======================
//  Card builders
// ======================

function buildEventCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const price = ev.price ? `${parseFloat(ev.price).toFixed(0)} SAR` : "Free";
  const label = catLabel(ev.category);
  const color = catColor(ev.category);

  const card = document.createElement("a");
  card.href = `/events/page/${ev.id}/`;
  card.dataset.id = String(ev.id);
  card.className =
    "event-card group bg-white border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition relative block";

  card.innerHTML = `
    <div class="h-40 bg-gray-200"></div>
    <button type="button"
      class="fav-btn absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 grid place-items-center border hover:bg-white z-10"
      data-id="${escapeHtml(ev.id)}">
      <span class="fav-icon text-lg leading-none">${fav ? "♥" : "♡"}</span>
    </button>
    <div class="p-4 space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium px-2 py-1 rounded-full ${color}">${escapeHtml(label)}</span>
        <span class="font-semibold text-sm">${escapeHtml(price)}</span>
      </div>
      <h3 class="font-semibold group-hover:underline">${escapeHtml(ev.title || "Untitled")}</h3>
      <div class="text-sm text-gray-500">📍 ${escapeHtml(ev.location || "Riyadh")}</div>
      <div class="w-full h-10 rounded-xl border bg-white group-hover:bg-gray-50 grid place-items-center text-sm text-gray-700">
        View Details
      </div>
    </div>
  `;

  card.querySelector(".fav-btn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowFav = toggleFav(ev.id);
    card.querySelector(".fav-icon").textContent = nowFav ? "♥" : "♡";
  });

  return card;
}

function buildTrendingCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const price = ev.price ? `${parseFloat(ev.price).toFixed(0)} SAR` : "Free";
  const label = catLabel(ev.category);
  const color = catColor(ev.category);

  const article = document.createElement("article");
  article.dataset.id = String(ev.id);
  article.className =
    "relative min-w-[320px] sm:min-w-[420px] bg-white border rounded-2xl overflow-hidden shadow-sm flex-shrink-0";

  article.innerHTML = `
    <div class="relative h-44 bg-gray-200">
      <div class="absolute top-3 left-3 bg-white/90 rounded-full px-3 py-1 text-xs font-medium">Trending</div>
      <button type="button"
        class="fav-btn absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 grid place-items-center border hover:bg-white z-10"
        data-id="${escapeHtml(ev.id)}">
        <span class="fav-icon text-lg leading-none">${fav ? "♥" : "♡"}</span>
      </button>
    </div>
    <div class="p-4 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="inline-flex px-2 py-1 rounded-full ${color} text-xs font-medium">${escapeHtml(label)}</div>
          <h3 class="font-semibold mt-2 truncate">${escapeHtml(ev.title || "Untitled")}</h3>
          <div class="text-sm text-gray-500 mt-1">📍 ${escapeHtml(ev.location || "Riyadh")}</div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="font-semibold">${escapeHtml(price)}</div>
        </div>
      </div>
      <a href="/events/page/${ev.id}/"
        class="block w-full h-10 rounded-xl border bg-white hover:bg-gray-50 grid place-items-center text-sm">
        View
      </a>
    </div>
  `;

  article.querySelector(".fav-btn").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowFav = toggleFav(ev.id);
    article.querySelector(".fav-icon").textContent = nowFav ? "♥" : "♡";
  });

  return article;
}

// ======================
//  Render helpers
// ======================

let _allEvents = [];

function renderEventsGrid(events) {
  const grid = document.getElementById("eventsGrid");
  const countText = document.getElementById("countText");
  if (!grid) return;

  grid.innerHTML = "";

  if (!events.length) {
    grid.innerHTML =
      '<div class="col-span-2 py-16 text-center text-gray-400">No places found matching your search.</div>';
    if (countText) countText.textContent = "0 places found";
    return;
  }

  events.forEach((ev) => grid.appendChild(buildEventCard(ev)));
  if (countText) countText.textContent = `${events.length} places found`;
}

function renderTrendingRow(events) {
  const row = document.getElementById("trendingRow");
  if (!row) return;
  row.innerHTML = "";
  events.slice(0, 6).forEach((ev) => row.appendChild(buildTrendingCard(ev)));
}

// ======================
//  Map
// ======================

// Called by Google Maps API as async callback
function initEventsMap() {
  if (!window.TZMap) return;
  const map = window.TZMap.initMap("eventsMap", { zoom: 11 });
  if (!map) return;
  window.__TZ_EVENTS_MAP = map;
  // If events were fetched before the map finished loading, render markers now
  if (_allEvents.length) _renderEventsMarkers(_allEvents);
}

function _renderEventsMarkers(events) {
  const map = window.__TZ_EVENTS_MAP;
  if (!map || !window.google || !google.maps) return;

  // Clear previous markers
  (window.__TZ_EVENTS_MARKERS || []).forEach((m) => m.setMap(null));
  window.__TZ_EVENTS_MARKERS = [];

  const bounds = new google.maps.LatLngBounds();
  const info = new google.maps.InfoWindow();
  let hasPoints = false;

  events.forEach((ev) => {
    if (typeof ev.latitude !== "number" || typeof ev.longitude !== "number") return;
    const pos = { lat: ev.latitude, lng: ev.longitude };
    const marker = new google.maps.Marker({ position: pos, map });
    window.__TZ_EVENTS_MARKERS.push(marker);
    bounds.extend(pos);
    hasPoints = true;

    marker.addListener("click", () => {
      info.setContent(
        `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(ev.title)}</div>` +
        `<div style="font-size:12px;opacity:.8;margin-bottom:4px">${escapeHtml(ev.location || "Riyadh")}</div>` +
        `<a href="/events/page/${ev.id}/" style="font-size:12px;color:#7E1CA1">View Details →</a>`
      );
      info.open({ anchor: marker, map });
    });
  });

  if (hasPoints) map.fitBounds(bounds);
}

// ======================
//  Load events from API
// ======================

let _currentCategory = "";
let _currentSearch = "";
let _debounceTimer = null;

async function loadEvents() {
  const loadingText = document.getElementById("loadingText");
  const countText = document.getElementById("countText");

  if (loadingText) loadingText.textContent = "Loading…";
  if (countText) countText.textContent = "";

  const params = new URLSearchParams();
  if (_currentCategory) params.set("category", _currentCategory);
  if (_currentSearch) params.set("search", _currentSearch);

  const qs = params.toString();
  const data = await apiGet(`/api/events/${qs ? "?" + qs : ""}`);
  if (!data) return;

  // Handle both paginated {count, results:[]} and plain array responses
  const events = Array.isArray(data) ? data : data.results || [];
  _allEvents = events;

  renderEventsGrid(events);

  // Populate trending only on the unfiltered initial load
  if (!_currentCategory && !_currentSearch) {
    renderTrendingRow(events);
  }

  // Update map markers if the map is already initialised
  if (window.__TZ_EVENTS_MAP) _renderEventsMarkers(events);

  if (loadingText) loadingText.textContent = "";
}

// ======================
//  Search & filter
// ======================

function onSearchChange(value) {
  _currentSearch = value.trim();
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => loadEvents().catch(console.error), 350);
}

function onCategorySelect(cat) {
  // Toggle: clicking active category clears the filter
  _currentCategory = _currentCategory === cat ? "" : cat;

  document.querySelectorAll(".cat-filter-btn").forEach((btn) => {
    const active = btn.dataset.cat === _currentCategory;
    btn.classList.toggle("bg-brand", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("border-brand", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("text-gray-700", !active);
  });

  loadEvents().catch(console.error);
}

// ======================
//  Favorites section
// ======================

let _favsOnly = false;

function renderFavoritesSection() {
  const grid = document.getElementById("favoritesGrid");
  const countEl = document.getElementById("favoritesCount");
  if (!grid) return;

  const favIds = getFavs();
  const favEvents = _allEvents.filter((ev) => favIds.has(String(ev.id)));
  grid.innerHTML = "";
  favEvents.forEach((ev) => grid.appendChild(buildEventCard(ev)));

  if (countEl) countEl.textContent = favEvents.length ? `${favEvents.length} favorites` : "";
}

function initFavoritesToggle() {
  const prefBtn = document.getElementById("prefBtn");
  const favSection = document.getElementById("favoritesSection");
  const allSection = document.getElementById("allEventsSection");

  prefBtn?.addEventListener("click", () => {
    _favsOnly = !_favsOnly;
    if (_favsOnly) {
      prefBtn.classList.add("bg-brand", "text-white", "border-brand");
      prefBtn.classList.remove("bg-white", "border-black/10");
      renderFavoritesSection();
      favSection?.classList.remove("hidden");
      allSection?.classList.add("hidden");
    } else {
      prefBtn.classList.remove("bg-brand", "text-white", "border-brand");
      prefBtn.classList.add("bg-white", "border-black/10");
      favSection?.classList.add("hidden");
      allSection?.classList.remove("hidden");
    }
  });
}

// ======================
//  Trending carousel nav
// ======================

function initTrendingNav() {
  const row = document.getElementById("trendingRow");
  document.getElementById("trendPrev")?.addEventListener("click", () =>
    row?.scrollBy({ left: -440, behavior: "smooth" })
  );
  document.getElementById("trendNext")?.addEventListener("click", () =>
    row?.scrollBy({ left: 440, behavior: "smooth" })
  );
}

// ======================
//  Event details page
// ======================

function renderEventDetails(ev) {
  const container = document.getElementById("eventDetails");
  if (!container) return;

  const price = ev.price ? `${parseFloat(ev.price).toFixed(0)} SAR` : "Free";
  const label = catLabel(ev.category);
  const color = catColor(ev.category);

  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-white border rounded-2xl overflow-hidden">
        <div class="h-64 bg-gray-200"></div>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-2 flex-wrap text-xs text-gray-600">
            <span class="px-2 py-1 rounded-full ${color} font-medium">${escapeHtml(label)}</span>
            <span>📍 ${escapeHtml(ev.location || "Riyadh")}</span>
          </div>
          <h2 class="text-2xl font-semibold">${escapeHtml(ev.title || "")}</h2>
          <p class="text-gray-600">${escapeHtml(ev.description || "No description available.")}</p>
        </div>
      </div>
      <aside class="bg-white border rounded-2xl p-6 space-y-4 h-fit">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600">Category</span>
          <span class="text-sm font-semibold">${escapeHtml(label)}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600">Price</span>
          <span class="text-xl font-semibold">${escapeHtml(price)}</span>
        </div>
        <a href="/daily-plan/"
          class="block w-full h-11 rounded-xl bg-brand text-white hover:opacity-90 text-sm text-center leading-[44px]">
          Add to Plan
        </a>
      </aside>
    </div>
  `;
}

async function loadEventDetails(eventId) {
  const data = await apiGet(`/api/events/${eventId}/`);
  if (data) renderEventDetails(data);
}

// ======================
//  Init
// ======================

document.addEventListener("DOMContentLoaded", () => {
  // Events list page
  if (document.getElementById("eventsGrid")) {
    loadEvents().catch(console.error);
    initTrendingNav();
    initFavoritesToggle();

    ["searchInput", "searchInputMobile"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", (e) =>
        onSearchChange(e.target.value)
      );
    });

    document.querySelectorAll(".cat-filter-btn").forEach((btn) =>
      btn.addEventListener("click", () => onCategorySelect(btn.dataset.cat))
    );
  }

  // Event details page
  if (window.EVENT_ID) {
    loadEventDetails(window.EVENT_ID).catch(console.error);
  }
});
