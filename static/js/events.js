// Auth helpers (getToken, apiGet, apiPost, apiDelete, catLabel, catEmoji, catColor) come from api.js
const SELECTED_PLAN_DATE_STORAGE_KEY = "tz_selected_plan_date";

const CAT_GRADIENTS = {
  culture:       "linear-gradient(135deg,#ede9fe,#c4b5fd)",
  heritage:      "linear-gradient(135deg,#fef3c7,#fcd34d)",
  food:          "linear-gradient(135deg,#fff7ed,#fed7aa)",
  nature:        "linear-gradient(135deg,#ecfdf5,#a7f3d0)",
  shopping:      "linear-gradient(135deg,#eff6ff,#bfdbfe)",
  events:        "linear-gradient(135deg,#fef2f2,#fecaca)",
  family:        "linear-gradient(135deg,#fefce8,#fde047)",
  entertainment: "linear-gradient(135deg,#fdf2f8,#fbcfe8)",
};

function catGradient(cat) {
  return CAT_GRADIENTS[cat] || "linear-gradient(135deg,#f3f4f6,#e9eaec)";
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSelectedPlanDate() {
  const selectedDate = localStorage.getItem(SELECTED_PLAN_DATE_STORAGE_KEY);
  if (selectedDate) return selectedDate;
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

// ======================
//  Toast
// ======================

function showToast(msg, type = "success") {
  const bg = type === "error" ? "#ef4444" : type === "info" ? "#7c3aed" : "#10b981";
  const toast = document.createElement("div");
  toast.style.cssText = [
    "position:fixed", "bottom:24px", "left:50%",
    "transform:translateX(-50%) translateY(80px)",
    `background:${bg}`, "color:#fff",
    "padding:10px 20px", "border-radius:12px",
    "font-size:13px", "font-weight:600",
    "box-shadow:0 4px 16px rgba(0,0,0,0.18)",
    "z-index:9999",
    "transition:transform 0.3s ease,opacity 0.3s ease",
    "opacity:0", "white-space:nowrap",
  ].join(";");
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = "translateX(-50%) translateY(0)";
    toast.style.opacity = "1";
  });
  setTimeout(() => {
    toast.style.transform = "translateX(-50%) translateY(80px)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 350);
  }, 2500);
}

// ======================
//  Category pill state
// ======================

function updatePillActiveState(activeCat) {
  document.querySelectorAll(".cat-pill").forEach(btn => {
    const isActive = btn.dataset.cat === activeCat;
    btn.classList.toggle("active", isActive);
    if (isActive) {
      // CSS .cat-pill.active handles background/color via !important
      btn.style.background = "";
      btn.style.borderColor = "";
      btn.style.color = "";
    } else {
      // Restore each pill's own gradient (overrides any leftover inline style)
      btn.style.background = btn.dataset.gradient || "#f3f4f6";
      btn.style.borderColor = "transparent";
      btn.style.color = "#374151";
    }
  });
}

function clearFilter() {
  _currentCategory = "";
  _currentSearch = "";
  _nextPageUrl = null;
  const searchEl = document.getElementById("searchInput");
  if (searchEl) searchEl.value = "";
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) clearBtn.classList.add("hidden");
  updatePillActiveState("");
  loadEvents().catch(console.error);
}

// ======================
//  Favorites
// ======================

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
  try { saved = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { saved = []; }
  if (!Array.isArray(saved) || !saved.length) return;
  const eventIds = [...new Set(saved.map(v => Number.parseInt(v, 10)).filter(Number.isInteger))];
  if (!eventIds.length) { localStorage.removeItem(FAV_KEY); return; }
  try {
    await apiPost("/api/events/favorites/bulk/", { event_ids: eventIds });
    localStorage.removeItem(FAV_KEY);
  } catch { /* keep for retry on next login */ }
}

async function loadFavoriteIds() {
  const token = getToken();
  if (!token) { _favoriteIds = new Set(); return; }
  try {
    const data = await apiGet("/api/events/favorites/");
    const rows = Array.isArray(data) ? data : [];
    _favoriteIds = new Set(
      rows.map(row => row?.event?.id).filter(id => Number.isInteger(id)).map(id => String(id))
    );
  } catch { _favoriteIds = new Set(); }
}

async function removeFavorite(eventId) {
  const token = getToken();
  if (!token) { promptLoginForFavorites(); return false; }
  try {
    await apiDelete(`/api/events/favorites/${eventId}/`);
  } catch (error) {
    if (error.status === 401) { promptLoginForFavorites(); return false; }
    if (error.status !== 404) throw new Error("Could not remove favorite.");
  }
  return true;
}

function getEventsErrorMessage(err) {
  const fromResponse = typeof extractApiErrorMessage === "function"
    ? extractApiErrorMessage(err?.responseData, "") : "";
  const fromError = typeof err?.message === "string" ? err.message.trim() : "";
  if (fromResponse) return fromResponse;
  if (fromError && !/^API error \d+$/i.test(fromError)) return fromError;
  return "Something went wrong. Please try again.";
}

async function toggleFav(id) {
  const token = getToken();
  if (!token) { promptLoginForFavorites(); return null; }
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
    if (String(err?.message || "").toLowerCase().includes("already")) {
      _favoriteIds.add(key);
      return true;
    }
    throw err;
  }
}

// ======================
//  Add to Plan
// ======================

function notifyPlanUpdated(detail) {
  window.dispatchEvent(new CustomEvent("tizahab:plan-updated", { detail: detail || {} }));
}

async function addEventToPlan(eventId, button) {
  const token = getToken();
  if (!token) { promptLoginForFavorites(); return; }

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Adding…";

  try {
    await apiPost("/api/daily-plan/add/", {
      event_id: Number(eventId),
      date: getSelectedPlanDate(),
    });
    notifyPlanUpdated({ eventId: Number(eventId), date: getSelectedPlanDate() });
    button.textContent = "✓ Added";
    showToast("Added to your plan!");
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 1500);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    showToast(getEventsErrorMessage(error), "error");
  }
}

// ======================
//  Utilities
// ======================

function gmapsUrl(ev) {
  const name = encodeURIComponent((ev.title || "") + " Riyadh");
  return `https://www.google.com/maps/search/?api=1&query=${name}`;
}

function formatDateWindow(ev) {
  if (ev.start_date && ev.end_date) return `${ev.start_date} to ${ev.end_date}`;
  if (ev.start_date) return ev.start_date;
  return ev.category === "events" ? "Check event date" : "Available daily";
}

// ======================
//  Card builders
// ======================

function buildEventCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const label = catLabel(ev.category);
  const emoji = catEmoji(ev.category);
  const grad = catGradient(ev.category);
  const rating = ev.rating
    ? `<span class="text-xs text-yellow-500 font-medium">★ ${ev.rating}</span>` : "";

  const card = document.createElement("div");
  card.dataset.id = String(ev.id);
  card.className = "event-card rounded-2xl border border-gray-100 overflow-hidden bg-white hover:shadow-md transition cursor-pointer";

  card.innerHTML = `
    <div class="h-28 relative flex items-center justify-center" style="background:${grad}">
      <span class="text-5xl select-none">${emoji}</span>
      <button type="button" class="fav-btn absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 grid place-items-center border border-white/60 hover:bg-white transition z-10"
        data-id="${escapeHtml(ev.id)}">
        <span class="fav-icon text-base leading-none">${fav ? "♥" : "♡"}</span>
      </button>
    </div>
    <div class="p-3.5 space-y-2">
      <h3 class="font-semibold text-gray-800 text-sm leading-snug line-clamp-2">${escapeHtml(ev.title || "Untitled")}</h3>
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium text-gray-600" style="background:${grad}">${escapeHtml(label)}</span>
        ${rating}
      </div>
      <button type="button" class="add-to-plan-btn w-full h-8 rounded-xl border border-gray-200 bg-gray-50 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 text-xs font-medium text-gray-600 transition">
        + Add to Plan
      </button>
    </div>
  `;

  card.addEventListener("click", e => {
    if (e.target.closest(".fav-btn") || e.target.closest(".add-to-plan-btn")) return;
    window.location.href = `/events/page/${ev.id}/`;
  });

  card.querySelector(".fav-btn").addEventListener("click", async e => {
    e.stopPropagation();
    const nowFav = await toggleFav(ev.id);
    if (nowFav === null) return;
    card.querySelector(".fav-icon").textContent = nowFav ? "♥" : "♡";
    if (_favsOnly) renderFavoritesSection();
  });

  card.querySelector(".add-to-plan-btn").addEventListener("click", e => {
    e.stopPropagation();
    addEventToPlan(ev.id, e.currentTarget).catch(console.error);
  });

  return card;
}

function buildTrendingCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const label = catLabel(ev.category);
  const emoji = catEmoji(ev.category);
  const grad = catGradient(ev.category);
  const rating = ev.rating
    ? `<span class="text-xs text-gray-600 font-medium">★ ${ev.rating}</span>` : "";

  const article = document.createElement("article");
  article.dataset.id = String(ev.id);
  article.className = "relative min-w-[220px] w-56 h-60 rounded-2xl overflow-hidden flex-shrink-0 cursor-pointer";
  article.style.background = grad;

  article.innerHTML = `
    <div class="absolute inset-0 flex flex-col p-4">
      <div class="flex items-start justify-between">
        <span class="text-5xl select-none">${emoji}</span>
        <button type="button" class="fav-btn w-8 h-8 rounded-full bg-white/80 grid place-items-center border border-white/60 hover:bg-white transition z-10 shrink-0"
          data-id="${escapeHtml(ev.id)}">
          <span class="fav-icon text-base leading-none">${fav ? "♥" : "♡"}</span>
        </button>
      </div>
      <div class="mt-auto space-y-1.5">
        <p class="font-bold text-gray-800 text-sm leading-snug line-clamp-2">${escapeHtml(ev.title || "Untitled")}</p>
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-0.5 rounded-full bg-white/60 text-gray-600 font-medium">${escapeHtml(label)}</span>
          ${rating}
        </div>
        <button type="button" class="add-to-plan-btn w-full h-8 rounded-xl bg-white/80 hover:bg-white text-xs font-medium text-gray-700 transition">
          + Add to Plan
        </button>
      </div>
    </div>
  `;

  article.addEventListener("click", e => {
    if (e.target.closest(".fav-btn") || e.target.closest(".add-to-plan-btn")) return;
    window.location.href = `/events/page/${ev.id}/`;
  });

  article.querySelector(".fav-btn").addEventListener("click", async e => {
    e.stopPropagation();
    const nowFav = await toggleFav(ev.id);
    if (nowFav === null) return;
    article.querySelector(".fav-icon").textContent = nowFav ? "♥" : "♡";
    if (_favsOnly) renderFavoritesSection();
  });

  article.querySelector(".add-to-plan-btn").addEventListener("click", e => {
    e.stopPropagation();
    addEventToPlan(ev.id, e.currentTarget).catch(console.error);
  });

  return article;
}

// ======================
//  Skeleton loaders
// ======================

function buildSkeletonCard(extraClasses = "") {
  const el = document.createElement("div");
  el.className = `rounded-2xl border border-gray-100 overflow-hidden skeleton-pulse${extraClasses ? " " + extraClasses : ""}`;
  el.innerHTML = `
    <div class="h-28" style="background:linear-gradient(135deg,#f3f4f6,#e9eaec)"></div>
    <div class="p-3.5 space-y-2">
      <div class="h-3 bg-gray-100 rounded-full w-4/5"></div>
      <div class="h-3 bg-gray-100 rounded-full w-1/2"></div>
      <div class="h-7 bg-gray-100 rounded-xl mt-1"></div>
    </div>
  `;
  return el;
}

function showGridSkeletons(count = 4) {
  const grid = document.getElementById("eventsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const extraClasses = ["", "", "hidden sm:block", "hidden lg:block"];
  for (let i = 0; i < count; i++) {
    grid.appendChild(buildSkeletonCard(extraClasses[i] || ""));
  }
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
    btn.textContent = "Loading…";
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
        <p class="text-4xl">🔍</p>
        <p class="text-gray-500 font-medium">No places found</p>
        <p class="text-sm text-gray-400">Try a different search or category.</p>
        ${hasFilter ? `<button onclick="clearFilter()" class="mt-2 px-5 py-2 rounded-xl border border-purple-200 text-sm font-medium text-purple-700 hover:bg-purple-50 transition">Clear Filter</button>` : ""}
      </div>`;
    if (countText) countText.textContent = "";
    return;
  }

  events.forEach(ev => grid.appendChild(buildEventCard(ev)));
  if (countText) {
    countText.textContent = _totalCount > _allEvents.length
      ? `Showing ${_allEvents.length} of ${_totalCount} places`
      : `${_allEvents.length} places found`;
  }
}

function renderTrendingRow(events) {
  const row = document.getElementById("trendingRow");
  if (!row) return;
  row.innerHTML = "";
  events.slice(0, 6).forEach(ev => row.appendChild(buildTrendingCard(ev)));
}

// ======================
//  Map
// ======================

function initEventsMap() {
  if (!window.TZMap) return;
  const map = window.TZMap.initMap("eventsMap", { zoom: 11 });
  if (!map) return;
  window.__TZ_EVENTS_MAP = map;
  if (_allEvents.length) resetEventsMap(_allEvents);
}

let _mapMarkers = [];
let _mapInfo = null;

function resetEventsMap(newVisibleEvents) {
  const map = window.__TZ_EVENTS_MAP;
  if (!map || !window.google || !google.maps) return;
  _mapMarkers.forEach(m => m.setMap(null));
  _mapMarkers.length = 0;
  if (!_mapInfo) _mapInfo = new google.maps.InfoWindow();
  const bounds = new google.maps.LatLngBounds();
  let hasPoints = false;
  newVisibleEvents.forEach(ev => {
    const lat = Number.parseFloat(ev.latitude);
    const lng = Number.parseFloat(ev.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };
    const marker = new google.maps.Marker({ position: pos, map });
    _mapMarkers.push(marker);
    bounds.extend(pos);
    hasPoints = true;
    marker.addListener("click", () => {
      _mapInfo.setContent(
        `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(ev.title)}</div>` +
        `<a href="/events/page/${ev.id}/" style="font-size:12px;color:#7E1CA1">View Details →</a>`
      );
      _mapInfo.open({ anchor: marker, map });
    });
  });
  if (hasPoints) map.fitBounds(bounds);
}

function initMapToggle() {
  const toggleBtn = document.getElementById("mapToggleBtn");
  const container = document.getElementById("mapContainer");
  const chevron = document.getElementById("mapChevron");
  const hideBtn = document.getElementById("hideMapBtn");

  toggleBtn?.addEventListener("click", () => {
    const wasHidden = container?.classList.contains("hidden");
    container?.classList.toggle("hidden", !wasHidden);
    if (chevron) chevron.style.transform = wasHidden ? "rotate(180deg)" : "";
    if (wasHidden && window.__TZ_EVENTS_MAP) {
      google.maps.event.trigger(window.__TZ_EVENTS_MAP, "resize");
      if (_allEvents.length) resetEventsMap(_allEvents);
    }
  });

  hideBtn?.addEventListener("click", () => {
    container?.classList.add("hidden");
    if (chevron) chevron.style.transform = "";
  });
}

// ======================
//  Load events from API
// ======================

let _currentCategory = "";
let _currentSearch = "";
let _debounceTimer = null;

async function loadEvents() {
  const countText = document.getElementById("countText");

  if (!_isLoadingMore) {
    showGridSkeletons(4);
    if (countText) countText.textContent = "";
    _totalCount = 0;  // reset so counter reflects the fresh filtered result
  }

  let requestUrl = _nextPageUrl;
  if (!_isLoadingMore || !requestUrl) {
    const params = new URLSearchParams();
    if (_currentCategory) params.set("category", _currentCategory);
    if (_currentSearch) params.set("search", _currentSearch);
    params.set("page_size", "12");
    const qs = params.toString();
    requestUrl = `/api/events/${qs ? "?" + qs : ""}`;
  }

  const data = await apiGet(requestUrl);
  if (!data) return;

  const events = Array.isArray(data) ? data : data.results || [];
  _nextPageUrl = Array.isArray(data) ? null : data.next || null;
  if (!Array.isArray(data) && data.count != null) {
    _totalCount = data.count;
  } else if (!_isLoadingMore) {
    _totalCount = events.length;  // plain array — total = what we got
  }

  if (_isLoadingMore) {
    const merged = new Map(_allEvents.map(ev => [String(ev.id), ev]));
    events.forEach(ev => merged.set(String(ev.id), ev));
    _allEvents = [...merged.values()];
  } else {
    _allEvents = events;
  }

  renderEventsGrid(_allEvents);

  if (!_isLoadingMore && !_currentCategory && !_currentSearch) {
    renderTrendingRow(events);
  }

  if (window.__TZ_EVENTS_MAP) resetEventsMap(_allEvents);

  if (countText) {
    countText.textContent = _totalCount > _allEvents.length
      ? `Showing ${_allEvents.length} of ${_totalCount} places`
      : `${_allEvents.length} places found`;
  }
  updateLoadMoreState();
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
  _currentCategory = cat;  // cat="" means All Places (no filter)
  _nextPageUrl = null;
  updatePillActiveState(_currentCategory);
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
  const favEvents = _allEvents.filter(ev => favIds.has(String(ev.id)));
  grid.innerHTML = "";
  favEvents.forEach(ev => grid.appendChild(buildEventCard(ev)));
  if (countEl) countEl.textContent = _favoriteIds.size ? `${_favoriteIds.size} favorites` : "";
}

function initFavoritesToggle() {
  const prefBtn = document.getElementById("prefBtn");
  const favSection = document.getElementById("favoritesSection");
  const eventsGrid = document.getElementById("eventsGrid");
  const loadMoreWrap = document.getElementById("loadMoreWrap");

  prefBtn?.addEventListener("click", () => {
    _favsOnly = !_favsOnly;
    if (_favsOnly) {
      prefBtn.style.background = "#ede9fe";
      prefBtn.style.color = "#7c3aed";
      prefBtn.style.borderColor = "#c4b5fd";
      renderFavoritesSection();
      favSection?.classList.remove("hidden");
      eventsGrid?.classList.add("hidden");
      loadMoreWrap?.classList.add("hidden");
    } else {
      prefBtn.style.background = "";
      prefBtn.style.color = "";
      prefBtn.style.borderColor = "";
      favSection?.classList.add("hidden");
      eventsGrid?.classList.remove("hidden");
      updateLoadMoreState();
    }
  });
}

// ======================
//  Trending carousel nav
// ======================

function initTrendingNav() {
  const row = document.getElementById("trendingRow");
  document.getElementById("trendPrev")?.addEventListener("click", () =>
    row?.scrollBy({ left: -260, behavior: "smooth" })
  );
  document.getElementById("trendNext")?.addEventListener("click", () =>
    row?.scrollBy({ left: 260, behavior: "smooth" })
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

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-5">
        <div class="bg-white rounded-2xl border border-gray-200 p-5">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-lg shrink-0">📅</div>
              <div>
                <p class="text-xs text-gray-500">Date</p>
                <p class="text-sm font-semibold text-gray-800">${escapeHtml(formatDateWindow(ev))}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg shrink-0">🕐</div>
              <div>
                <p class="text-xs text-gray-500">Opening Hours</p>
                <p class="text-sm font-semibold text-gray-800">${ev.category === "food" ? "8:00 AM – 11:00 PM" : ev.category === "shopping" ? "10:00 AM – 10:00 PM" : "9:00 AM – 9:00 PM"}</p>
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

        <div class="flex gap-1 bg-gray-100 rounded-xl p-1" id="detailTabs">
          <button class="tab-btn flex-1 h-9 rounded-lg bg-white text-sm font-medium text-brand shadow-sm" data-tab="overview">Overview</button>
          <button class="tab-btn flex-1 h-9 rounded-lg text-sm font-medium text-gray-600 hover:bg-white/60 transition" data-tab="schedule">Schedule</button>
          <button class="tab-btn flex-1 h-9 rounded-lg text-sm font-medium text-gray-600 hover:bg-white/60 transition" data-tab="reviews">Reviews</button>
        </div>

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

      <aside class="space-y-4">
        <div class="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 sticky top-6">
          <div>
            <p class="text-xs text-gray-500 mb-1">Entry Fee</p>
            <p class="text-3xl font-bold text-brand">${escapeHtml(price)}</p>
          </div>
          <button type="button" id="getTicketsBtn" data-requires-auth="true"
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
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(t => {
        const active = t === btn;
        t.style.background = active ? "#fff" : "";
        t.style.boxShadow = active ? "0 1px 3px rgba(0,0,0,0.1)" : "";
        t.style.color = active ? "#7c3aed" : "";
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
      const targetDate = getSelectedPlanDate();
      await apiPost("/api/daily-plan/add/", { date: targetDate, event_id: eventId });
      btn.textContent = "✓ Added to Plan";
      msg.textContent = "Added to your plan!";
      msg.classList.add("text-green-600");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Get Tickets";
      msg.textContent = getEventsErrorMessage(err);
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
  if (document.getElementById("eventsGrid")) {
    (async () => {
      await migrateLegacyFavorites();
      await loadFavoriteIds();
      await loadEvents();
    })().catch(console.error);

    initTrendingNav();
    initFavoritesToggle();
    initMapToggle();
    updateLoadMoreState();

    document.getElementById("loadMoreBtn")?.addEventListener("click", () =>
      loadMoreEvents().catch(console.error)
    );

    const searchInput = document.getElementById("searchInput");
    const clearBtn = document.getElementById("clearSearchBtn");

    searchInput?.addEventListener("input", e => {
      onSearchChange(e.target.value);
      if (clearBtn) clearBtn.classList.toggle("hidden", !e.target.value);
    });

    clearBtn?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      clearBtn.classList.add("hidden");
      onSearchChange("");
    });

    document.querySelectorAll(".cat-pill").forEach(btn =>
      btn.addEventListener("click", () => onCategorySelect(btn.dataset.cat))
    );
  }

  if (window.EVENT_ID) {
    loadEventDetails(window.EVENT_ID).catch(console.error);
  }
});
