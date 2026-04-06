// ======================
//  Utilities
// ======================
// Auth helpers (getToken, apiGet, catLabel, catEmoji, catColor) come from api.js

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clearFilter() {
  _currentCategory = "";
  _currentSearch = "";
  _nextPageUrl = null;
  const searchEl = document.getElementById("searchInput");
  const searchMobile = document.getElementById("searchInputMobile");
  if (searchEl) searchEl.value = "";
  if (searchMobile) searchMobile.value = "";
  document.querySelectorAll(".cat-filter-btn").forEach((btn) => {
    const isAll = btn.dataset.cat === "";
    btn.classList.toggle("bg-purple-100", isAll);
    btn.classList.toggle("text-brand", isAll);
    btn.classList.toggle("border-brand", isAll);
    btn.classList.toggle("bg-white", !isAll);
    btn.classList.toggle("text-gray-700", !isAll);
  });
  loadEvents().catch(console.error);
}

// ======================
//  Favorites
// ======================

// Legacy localStorage key used only for one-time migration.
const FAV_KEY = "tizahab_favorites";
let _favoriteIds = new Set();

const getFavs = () => _favoriteIds;

function promptLoginForFavorites() {
  window.alert("Please log in to save favorites.");
  window.location.href = "/login/";
}

async function migrateLegacyFavorites() {
  const token = getToken();
  if (!token) return;

  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    saved = [];
  }

  if (!Array.isArray(saved) || !saved.length) return;

  const eventIds = [
    ...new Set(
      saved.map((v) => Number.parseInt(v, 10)).filter(Number.isInteger),
    ),
  ];
  if (!eventIds.length) {
    localStorage.removeItem(FAV_KEY);
    return;
  }

  try {
    await apiPost("/api/events/favorites/bulk/", { event_ids: eventIds });
    localStorage.removeItem(FAV_KEY);
  } catch {
    // Keep legacy data for retry on next login if migration fails.
  }
}

async function loadFavoriteIds() {
  const token = getToken();
  if (!token) {
    _favoriteIds = new Set();
    return;
  }

  try {
    const data = await apiGet("/api/events/favorites/");
    const rows = Array.isArray(data) ? data : [];
    _favoriteIds = new Set(
      rows
        .map((row) => row?.event?.id)
        .filter((id) => Number.isInteger(id))
        .map((id) => String(id)),
    );
  } catch {
    _favoriteIds = new Set();
  }
}

async function removeFavorite(eventId) {
  const token = getToken();
  if (!token) {
    promptLoginForFavorites();
    return false;
  }

  const res = await fetch(`/api/events/favorites/${eventId}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    promptLoginForFavorites();
    return false;
  }
  if (res.status !== 204 && res.status !== 404) {
    throw new Error("Could not remove favorite.");
  }

  return true;
}

async function toggleFav(id) {
  const token = getToken();
  if (!token) {
    promptLoginForFavorites();
    return null;
  }

  const key = String(id);
  const isFav = _favoriteIds.has(key);

  if (isFav) {
    await removeFavorite(id);
    _favoriteIds.delete(key);
    return false;
  }

  try {
    await apiPost("/api/events/favorites/", { event_id: Number(id) });
    _favoriteIds.add(key);
    return true;
  } catch (err) {
    if (
      String(err?.message || "")
        .toLowerCase()
        .includes("already")
    ) {
      _favoriteIds.add(key);
      return true;
    }
    throw err;
  }
}

// ======================
//  Card builders
// ======================

function gmapsUrl(ev) {
  const name = encodeURIComponent((ev.title || "") + " Riyadh");
  return `https://www.google.com/maps/search/?api=1&query=${name}`;
}

function buildEventCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const price = ev.price ? `${parseFloat(ev.price).toFixed(0)} SAR` : "Free";
  const label = catLabel(ev.category);
  const emoji = catEmoji(ev.category);
  const color = catColor(ev.category);
  const rating = ev.rating ? `<span class="text-xs text-yellow-500">★ ${ev.rating}</span>` : "";

  const card = document.createElement("a");
  card.href = `/events/page/${ev.id}/`;
  card.dataset.id = String(ev.id);
  card.className =
    "event-card group bg-white border rounded-2xl shadow-sm hover:shadow-md transition relative block";

  card.innerHTML = `
    <button type="button"
      class="fav-btn absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 grid place-items-center border hover:bg-white z-10"
      data-id="${escapeHtml(ev.id)}">
      <span class="fav-icon text-lg leading-none">${fav ? "♥" : "♡"}</span>
    </button>
    <div class="p-5 space-y-3">
      <div class="flex items-center gap-3">
        <span class="text-3xl">${emoji}</span>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-gray-800 truncate group-hover:text-brand">${escapeHtml(ev.title || "Untitled")}</h3>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium px-2 py-1 rounded-full ${color}">${escapeHtml(label)}</span>
        <div class="flex items-center gap-2">
          ${rating}
          <span class="font-semibold text-sm">${escapeHtml(price)}</span>
        </div>
      </div>
      <div class="flex gap-2">
        <div class="flex-1 h-10 rounded-xl border bg-white group-hover:bg-gray-50 grid place-items-center text-sm text-gray-700">
          View Details
        </div>
        <a href="${gmapsUrl(ev)}" target="_blank" rel="noopener"
          onclick="event.stopPropagation()"
          class="gmaps-link h-10 px-3 rounded-xl border bg-white hover:bg-gray-50 grid place-items-center text-sm text-gray-500 shrink-0"
          title="Open in Google Maps">
          🗺️
        </a>
      </div>
    </div>
  `;

  card.querySelector(".fav-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowFav = await toggleFav(ev.id);
    if (nowFav === null) return;
    card.querySelector(".fav-icon").textContent = nowFav ? "♥" : "♡";
    if (_favsOnly) renderFavoritesSection();
  });

  return card;
}

function buildTrendingCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const price = ev.price ? `${parseFloat(ev.price).toFixed(0)} SAR` : "Free";
  const label = catLabel(ev.category);
  const emoji = catEmoji(ev.category);
  const color = catColor(ev.category);
  const rating = ev.rating ? `<span class="text-xs text-yellow-500">★ ${ev.rating}</span>` : "";

  const article = document.createElement("article");
  article.dataset.id = String(ev.id);
  article.className =
    "relative min-w-[300px] sm:min-w-[360px] bg-white border rounded-2xl shadow-sm flex-shrink-0";

  article.innerHTML = `
    <div class="p-5 space-y-3">
      <div class="flex items-center justify-between">
        <span class="bg-brand/10 text-brand rounded-full px-3 py-1 text-xs font-medium">🔥 Trending</span>
        <button type="button"
          class="fav-btn h-9 w-9 rounded-full bg-white grid place-items-center border hover:bg-gray-50 z-10"
          data-id="${escapeHtml(ev.id)}">
          <span class="fav-icon text-lg leading-none">${fav ? "♥" : "♡"}</span>
        </button>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-3xl">${emoji}</span>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold truncate">${escapeHtml(ev.title || "Untitled")}</h3>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium px-2 py-1 rounded-full ${color}">${escapeHtml(label)}</span>
        <div class="flex items-center gap-2">
          ${rating}
          <span class="font-semibold text-sm">${escapeHtml(price)}</span>
        </div>
      </div>
      <div class="flex gap-2">
        <a href="/events/page/${ev.id}/"
          class="flex-1 h-10 rounded-xl border bg-white hover:bg-gray-50 grid place-items-center text-sm">
          View
        </a>
        <a href="${gmapsUrl(ev)}" target="_blank" rel="noopener"
          class="h-10 px-3 rounded-xl border bg-white hover:bg-gray-50 grid place-items-center text-sm text-gray-500 shrink-0"
          title="Open in Google Maps">
          🗺️
        </a>
      </div>
    </div>
  `;

  article.querySelector(".fav-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowFav = await toggleFav(ev.id);
    if (nowFav === null) return;
    article.querySelector(".fav-icon").textContent = nowFav ? "♥" : "♡";
    if (_favsOnly) renderFavoritesSection();
  });

  return article;
}

// ======================
//  Render helpers
// ======================

let _allEvents = [];
let _totalCount = 0;
let _nextPageUrl = null;
let _isLoadingMore = false;

function updateLoadMoreState() {
  const wrap = document.getElementById("loadMoreWrap");
  const btn = document.getElementById("loadMoreBtn");
  if (!wrap || !btn) return;

  const shouldShow = Boolean(_nextPageUrl) && !_favsOnly;
  wrap.classList.toggle("hidden", !shouldShow);
  btn.disabled = !shouldShow || _isLoadingMore;
  if (_isLoadingMore) {
    btn.textContent = "Loading...";
  } else {
    const remaining = _totalCount - _allEvents.length;
    btn.textContent = remaining > 0 ? `Load More (${remaining} remaining)` : "Load More";
  }
}

function renderEventsGrid(events) {
  const grid = document.getElementById("eventsGrid");
  const countText = document.getElementById("countText");
  if (!grid) return;

  grid.innerHTML = "";

  if (!events.length) {
    const hasFilter = _currentCategory || _currentSearch;
    grid.innerHTML = `
      <div class="col-span-2 py-16 text-center space-y-3">
        <p class="text-gray-400">No places found matching your search.</p>
        ${hasFilter ? `<button onclick="clearFilter()" class="px-5 py-2 rounded-xl border border-brand text-brand text-sm font-medium hover:bg-brand/5 transition">Clear Filter</button>` : ""}
      </div>`;
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
    const lat = Number.parseFloat(ev.latitude);
    const lng = Number.parseFloat(ev.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };
    const marker = new google.maps.Marker({ position: pos, map });
    window.__TZ_EVENTS_MARKERS.push(marker);
    bounds.extend(pos);
    hasPoints = true;

    marker.addListener("click", () => {
      info.setContent(
        `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(ev.title)}</div>` +
          `<div style="font-size:12px;opacity:.8;margin-bottom:4px">${escapeHtml(ev.location || "Riyadh")}</div>` +
          `<a href="/events/page/${ev.id}/" style="font-size:12px;color:#7E1CA1">View Details →</a>`,
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
  if (countText && !_isLoadingMore) countText.textContent = "";

  let requestUrl = _nextPageUrl;
  if (!_isLoadingMore || !requestUrl) {
    const params = new URLSearchParams();
    if (_currentCategory) params.set("category", _currentCategory);
    if (_currentSearch) params.set("search", _currentSearch);
    const qs = params.toString();
    requestUrl = `/api/events/${qs ? "?" + qs : ""}`;
  }

  const data = await apiGet(requestUrl);
  if (!data) return;

  // Handle both paginated {count, results:[]} and plain array responses
  const events = Array.isArray(data) ? data : data.results || [];
  _nextPageUrl = Array.isArray(data) ? null : data.next || null;
  if (!Array.isArray(data) && data.count != null) _totalCount = data.count;

  if (_isLoadingMore) {
    const merged = new Map(_allEvents.map((ev) => [String(ev.id), ev]));
    events.forEach((ev) => merged.set(String(ev.id), ev));
    _allEvents = [...merged.values()];
  } else {
    _allEvents = events;
  }

  renderEventsGrid(_allEvents);

  // Populate trending only on the unfiltered initial load
  if (!_isLoadingMore && !_currentCategory && !_currentSearch) {
    renderTrendingRow(events);
  }

  // Update map markers if the map is already initialised
  if (window.__TZ_EVENTS_MAP) _renderEventsMarkers(_allEvents);

  if (countText) {
    countText.textContent = _totalCount > _allEvents.length
      ? `${_allEvents.length} of ${_totalCount} places`
      : `${_allEvents.length} places found`;
  }
  updateLoadMoreState();

  if (loadingText) loadingText.textContent = "";
}

async function loadMoreEvents() {
  if (!_nextPageUrl || _isLoadingMore) return;
  _isLoadingMore = true;
  updateLoadMoreState();
  try {
    await loadEvents();
  } finally {
    _isLoadingMore = false;
    updateLoadMoreState();
  }
}


// ======================
//  Search & filter
// ======================

function onSearchChange(value) {
  _currentSearch = value.trim();
  _nextPageUrl = null;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => loadEvents().catch(console.error), 350);
}

function onCategorySelect(cat) {
  // Toggle: clicking active category clears the filter
  _currentCategory = _currentCategory === cat ? "" : cat;
  _nextPageUrl = null;

  document.querySelectorAll(".cat-filter-btn").forEach((btn) => {
    const active = btn.dataset.cat === _currentCategory;
    btn.classList.toggle("bg-purple-100", active);
    btn.classList.toggle("text-brand", active);
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

  if (countEl)
    countEl.textContent = _favoriteIds.size
      ? `${_favoriteIds.size} favorites`
      : "";
}

function initFavoritesToggle() {
  const prefBtn = document.getElementById("prefBtn");
  const favSection = document.getElementById("favoritesSection");
  const allSection = document.getElementById("allEventsSection");

  prefBtn?.addEventListener("click", () => {
    _favsOnly = !_favsOnly;
    if (_favsOnly) {
      prefBtn.classList.add("bg-purple-100", "text-brand", "border-brand");
      prefBtn.classList.remove("bg-white", "border-gray-200");
      renderFavoritesSection();
      favSection?.classList.remove("hidden");
      allSection?.classList.add("hidden");
    } else {
      prefBtn.classList.remove("bg-purple-100", "text-brand", "border-brand");
      prefBtn.classList.add("bg-white", "border-gray-200");
      favSection?.classList.add("hidden");
      allSection?.classList.remove("hidden");
      updateLoadMoreState();
    }
  });
}

// ======================
//  Trending carousel nav
// ======================

function initTrendingNav() {
  const row = document.getElementById("trendingRow");
  document
    .getElementById("trendPrev")
    ?.addEventListener("click", () =>
      row?.scrollBy({ left: -440, behavior: "smooth" }),
    );
  document
    .getElementById("trendNext")
    ?.addEventListener("click", () =>
      row?.scrollBy({ left: 440, behavior: "smooth" }),
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
  const emoji = catEmoji(ev.category);
  const color = catColor(ev.category);
  const mapsLink = gmapsUrl(ev);

  container.innerHTML = `
    <!-- Header -->
    <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div class="flex items-start gap-4">
        <span class="text-5xl">${emoji}</span>
        <div class="flex-1 min-w-0">
          <span class="inline-block text-xs font-medium px-2.5 py-1 rounded-full ${color} mb-2">${escapeHtml(label)}</span>
          <h1 class="text-2xl font-bold text-gray-900 leading-snug">${escapeHtml(ev.title || "")}</h1>
          <p class="text-sm text-gray-500 mt-1">${escapeHtml(ev.title || "")}</p>
        </div>
      </div>
    </div>

    <!-- Body: 2-col -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Left column -->
      <div class="lg:col-span-2 space-y-5">

        <!-- Metadata 2×2 grid -->
        <div class="bg-white rounded-2xl border border-gray-200 p-5">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-lg shrink-0">📅</div>
              <div>
                <p class="text-xs text-gray-500">Date</p>
                <p class="text-sm font-semibold text-gray-800">${ev.start_date ? escapeHtml(ev.start_date) : "Available Daily"}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg shrink-0">🕐</div>
              <div>
                <p class="text-xs text-gray-500">Opening Hours</p>
                <p class="text-sm font-semibold text-gray-800">${["restaurant","cafe","fast_food","dessert","bakery","juice","food_truck"].includes(ev.category) ? "8:00 AM – 11:00 PM" : ev.category === "shopping" ? "10:00 AM – 10:00 PM" : "9:00 AM – 9:00 PM"}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg shrink-0">💰</div>
              <div>
                <p class="text-xs text-gray-500">Price</p>
                <p class="text-sm font-semibold text-gray-800">${escapeHtml(price)}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-lg shrink-0">🏷️</div>
              <div>
                <p class="text-xs text-gray-500">Category</p>
                <p class="text-sm font-semibold text-gray-800">${escapeHtml(label)}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 bg-gray-100 rounded-xl p-1" id="detailTabs">
          <button class="tab-btn flex-1 h-9 rounded-lg bg-white text-sm font-medium text-brand shadow-sm" data-tab="overview">Overview</button>
          <button class="tab-btn flex-1 h-9 rounded-lg text-sm font-medium text-gray-600 hover:bg-white/60 transition" data-tab="schedule">Schedule</button>
          <button class="tab-btn flex-1 h-9 rounded-lg text-sm font-medium text-gray-600 hover:bg-white/60 transition" data-tab="reviews">Reviews</button>
        </div>

        <!-- Tab panels -->
        <div id="tab-overview" class="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h3 class="font-semibold text-gray-800">About</h3>
          <p class="text-sm text-gray-600 leading-relaxed">${escapeHtml(ev.description || "Experience one of Riyadh's unique destinations. Enjoy the atmosphere, explore the surroundings, and create lasting memories.")}</p>
          <div class="space-y-2 pt-1">
            <p class="text-sm font-medium text-gray-700">Highlights</p>
            <ul class="space-y-1.5">
              <li class="flex items-center gap-2 text-sm text-gray-600"><span class="text-green-500">✓</span> Accessible location in Riyadh</li>
              <li class="flex items-center gap-2 text-sm text-gray-600"><span class="text-green-500">✓</span> Suitable for all ages</li>
              <li class="flex items-center gap-2 text-sm text-gray-600"><span class="text-green-500">✓</span> ${escapeHtml(label)} experience</li>
            </ul>
          </div>
        </div>
        <div id="tab-schedule" class="hidden bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h3 class="font-semibold text-gray-800">Typical Schedule</h3>
          <p class="text-sm text-gray-500">Plan your visit around these suggested time slots.</p>
          <ul class="space-y-2 text-sm text-gray-700">
            <li class="flex gap-3"><span class="text-brand font-medium w-24 shrink-0">Morning</span> Best time for quieter visits and photos</li>
            <li class="flex gap-3"><span class="text-brand font-medium w-24 shrink-0">Afternoon</span> Peak hours — expect larger crowds</li>
            <li class="flex gap-3"><span class="text-brand font-medium w-24 shrink-0">Evening</span> Popular for dining and nighttime activities</li>
          </ul>
        </div>
        <div id="tab-reviews" class="hidden bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h3 class="font-semibold text-gray-800">Reviews</h3>
          <p class="text-sm text-gray-400">No reviews yet. Be the first to visit and share your experience!</p>
        </div>

      </div>

      <!-- Right: Booking card -->
      <aside class="space-y-4">
        <div class="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 sticky top-6">
          <div>
            <p class="text-xs text-gray-500 mb-1">Entry Fee</p>
            <p class="text-3xl font-bold text-brand">${escapeHtml(price)}</p>
          </div>
          <button type="button" id="getTicketsBtn"
            class="w-full h-11 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed">
            Get Tickets
          </button>
          <div id="ticketMsg" class="text-sm text-center min-h-[20px]"></div>
          <a href="${mapsLink}" target="_blank" rel="noopener"
            class="block w-full h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 text-center leading-[44px] hover:bg-gray-50 transition">
            🗺️ Open in Google Maps
          </a>
          <div class="flex gap-2 flex-wrap pt-1">
            <span class="text-xs bg-purple-50 text-brand px-3 py-1 rounded-full border border-purple-100">👨‍👩‍👧 Family Friendly</span>
            <span class="text-xs bg-purple-50 text-brand px-3 py-1 rounded-full border border-purple-100">📸 Photography Allowed</span>
          </div>
        </div>
      </aside>

    </div>
  `;
}

function wireDetailTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const panels = {
    overview: document.getElementById("tab-overview"),
    schedule: document.getElementById("tab-schedule"),
    reviews: document.getElementById("tab-reviews"),
  };
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((t) => {
        const active = t === btn;
        t.classList.toggle("bg-white", active);
        t.classList.toggle("text-brand", active);
        t.classList.toggle("shadow-sm", active);
        t.classList.toggle("text-gray-600", !active);
      });
      Object.entries(panels).forEach(([key, el]) => {
        if (el) el.classList.toggle("hidden", key !== btn.dataset.tab);
      });
    });
  });
}

function wireGetTickets(eventId) {
  const btn = document.getElementById("getTicketsBtn");
  const msg = document.getElementById("ticketMsg");
  if (!btn || !msg) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Adding…";
    msg.textContent = "";
    msg.className = "text-sm text-center min-h-[20px]";

    try {
      const today = new Date().toISOString().slice(0, 10);

      // Fetch existing plans for today
      const data = await apiGet("/api/daily-plan/");
      if (!data) return; // apiGet handles 401 → logout

      const plans = Array.isArray(data) ? data : data.results || [];
      const todayPlan = plans.find((p) => p.date === today);

      if (todayPlan) {
        // Plan exists — merge this event in (deduplicate)
        const existingIds = todayPlan.events.map((e) =>
          typeof e === "object" ? e.id : Number(e),
        );
        const merged = [...new Set([...existingIds, Number(eventId)])];
        await apiPut(`/api/daily-plan/${todayPlan.id}/`, {
          date: today,
          events: merged,
        });
      } else {
        // No plan for today — create one with just this event
        await apiPost("/api/daily-plan/", {
          date: today,
          events: [Number(eventId)],
        });
      }

      btn.textContent = "✓ Added to Plan";
      msg.textContent = "Added to your plan!";
      msg.classList.add("text-green-600");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Get Tickets";
      msg.textContent =
        err.message || "Something went wrong. Please try again.";
      msg.classList.add("text-red-500");
    }
  });
}

async function loadEventDetails(eventId) {
  const data = await apiGet(`/api/events/${eventId}/`);
  if (data) {
    renderEventDetails(data);
    wireDetailTabs();
    wireGetTickets(data.id);
  }
}

// ======================
//  Init
// ======================

document.addEventListener("DOMContentLoaded", () => {
  // Events list page
  if (document.getElementById("eventsGrid")) {
    (async () => {
      await migrateLegacyFavorites();
      await loadFavoriteIds();
      await loadEvents();
    })().catch(console.error);
    initTrendingNav();
    initFavoritesToggle();
    updateLoadMoreState();

    document
      .getElementById("loadMoreBtn")
      ?.addEventListener("click", () => loadMoreEvents().catch(console.error));

    ["searchInput", "searchInputMobile"].forEach((id) => {
      document
        .getElementById(id)
        ?.addEventListener("input", (e) => onSearchChange(e.target.value));
    });

    document
      .querySelectorAll(".cat-filter-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () => onCategorySelect(btn.dataset.cat)),
      );
  }

  // Event details page
  if (window.EVENT_ID) {
    loadEventDetails(window.EVENT_ID).catch(console.error);
  }
});
