// Auth helpers (getToken, apiGet, apiPost, apiDelete, catLabel, catEmoji, catColor) come from api.js
const SELECTED_PLAN_DATE_STORAGE_KEYS = [
  "tz_selected_plan_date",
  "tz_plan_start_date",
  "tz_start_date",
];

const CAT_GRADIENTS = {
  culture: "linear-gradient(135deg,#ede9fe,#c4b5fd)",
  heritage: "linear-gradient(135deg,#fef3c7,#fcd34d)",
  food: "linear-gradient(135deg,#fff7ed,#fed7aa)",
  nature: "linear-gradient(135deg,#ecfdf5,#a7f3d0)",
  shopping: "linear-gradient(135deg,#eff6ff,#bfdbfe)",
  events: "linear-gradient(135deg,#fef2f2,#fecaca)",
  family: "linear-gradient(135deg,#fefce8,#fde047)",
  entertainment: "linear-gradient(135deg,#fdf2f8,#fbcfe8)",
};

const RIYADH_AREAS = [
  {
    key: "central",
    name: "Central Riyadh",
    terms: ["masmak", "national museum", "historical center", "murabba", "bathaa", "deira", "king abdulaziz"],
  },
  {
    key: "diriyah",
    name: "Diriyah",
    terms: ["diriyah", "turaif", "at-turaif", "bujairi"],
  },
  {
    key: "boulevard",
    name: "Boulevard Area",
    terms: ["boulevard", "hittin", "riyadh season"],
  },
  {
    key: "kafd",
    name: "KAFD",
    terms: ["kafd", "financial district"],
  },
  {
    key: "riyadh-front",
    name: "Riyadh Front",
    terms: ["riyadh front", "rosn front", "front"],
  },
  {
    key: "dq",
    name: "Diplomatic Quarter",
    terms: ["diplomatic quarter", "dq", "tuwaiq palace"],
  },
  {
    key: "tuwaiq",
    name: "Tuwaiq / Edge Area",
    terms: ["edge of the world", "tuwaiq", "heeth", "wadi hanifa", "desert"],
  },
  {
    key: "other",
    name: "Other Riyadh",
    terms: [],
  },
];

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
  for (const key of SELECTED_PLAN_DATE_STORAGE_KEYS) {
    const selectedDate = localStorage.getItem(key);
    if (selectedDate) return selectedDate;
  }
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

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

function updatePillActiveState(activeCat) {
  document.querySelectorAll(".cat-pill").forEach(btn => {
    const isActive = btn.dataset.cat === activeCat;
    btn.classList.toggle("active", isActive);
    if (isActive) {
      btn.style.background = "";
      btn.style.borderColor = "";
      btn.style.color = "";
    } else {
      btn.style.background = btn.dataset.gradient || "#f3f4f6";
      btn.style.borderColor = "transparent";
      btn.style.color = "#374151";
    }
  });
}

function clearFilter() {
  _currentCategory = "";
  _currentSearch = "";
  _currentArea = "";
  _nextPageUrl = null;
  const searchEl = document.getElementById("searchInput");
  if (searchEl) searchEl.value = "";
  const clearBtn = document.getElementById("clearSearchBtn");
  if (clearBtn) clearBtn.classList.add("hidden");
  updatePillActiveState("");
  loadEvents().catch(console.error);
}

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

function notifyPlanUpdated(detail) {
  window.dispatchEvent(new CustomEvent("tizahab:plan-updated", { detail: detail || {} }));
}

async function addEventToPlan(eventId, button) {
  const token = getToken();
  if (!token) { promptLoginForFavorites(); return; }

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Adding...";

  try {
    const targetDate = getSelectedPlanDate();
    await apiPost("/api/daily-plan/add/", {
      event_id: Number(eventId),
      date: targetDate,
    });
    notifyPlanUpdated({ eventId: Number(eventId), date: targetDate });
    button.textContent = "Added";
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

function getTitle(ev) {
  return ev.title || ev.title_en || ev.name || "Untitled";
}

function getLocationText(ev) {
  return ev.location || ev.address || ev.area || "";
}

function getPriceText(ev) {
  if (ev.price_range) return ev.price_range;
  if (ev.price != null && ev.price !== "") return `${parseFloat(ev.price).toFixed(0)} SAR`;
  return "";
}

function getGoogleMapsUrl(ev) {
  const lat = Number.parseFloat(ev.latitude);
  const lng = Number.parseFloat(ev.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${getTitle(ev)} Riyadh`)}`;
}

function formatDateWindow(ev) {
  if (ev.start_date && ev.end_date) return `${ev.start_date} to ${ev.end_date}`;
  if (ev.start_date) return ev.start_date;
  return ev.category === "events" ? "Check event date" : "Available daily";
}

function inferAreaKey(ev) {
  const text = `${getTitle(ev)} ${getLocationText(ev)} ${ev.category || ""}`.toLowerCase();
  const area = RIYADH_AREAS.find(item => item.key !== "other" && item.terms.some(term => text.includes(term)));
  return area ? area.key : "other";
}

function getAreaName(areaKey) {
  return RIYADH_AREAS.find(area => area.key === areaKey)?.name || "Other Riyadh";
}

function getVisibleEvents() {
  if (!_currentArea) return _allEvents;
  return _allEvents.filter(ev => inferAreaKey(ev) === _currentArea);
}

function buildEventCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const label = catLabel(ev.category);
  const emoji = catEmoji(ev.category);
  const grad = catGradient(ev.category);
  const title = getTitle(ev);
  const location = getLocationText(ev);
  const price = getPriceText(ev);
  const rating = ev.rating
    ? `<span class="text-xs text-yellow-600 font-medium">Rating ${escapeHtml(ev.rating)}</span>` : "";

  const card = document.createElement("article");
  card.dataset.id = String(ev.id);
  card.className = "event-card rounded-2xl border border-gray-100 overflow-hidden bg-white hover:shadow-md transition cursor-pointer";

  card.innerHTML = `
    <div class="h-24 relative flex items-center justify-center" style="background:${grad}">
      <span class="text-4xl select-none">${emoji}</span>
      <button type="button" class="fav-btn absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 grid place-items-center border border-white/60 hover:bg-white transition z-10"
        data-id="${escapeHtml(ev.id)}" aria-label="Toggle favorite">
        <span class="fav-icon text-base leading-none">${fav ? "&hearts;" : "&#9825;"}</span>
      </button>
    </div>
    <div class="p-4 space-y-3">
      <div class="space-y-1">
        <h3 class="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">${escapeHtml(title)}</h3>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs px-2 py-0.5 rounded-full font-medium text-gray-600" style="background:${grad}">${escapeHtml(label)}</span>
          ${rating}
        </div>
      </div>
      <div class="space-y-1 min-h-[40px]">
        ${location ? `<p class="text-xs text-gray-500 line-clamp-1">${escapeHtml(location)}</p>` : ""}
        ${price ? `<p class="text-xs text-gray-500 capitalize">${escapeHtml(price)}</p>` : ""}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="add-to-plan-btn h-9 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs font-semibold text-white transition">
          Add
        </button>
        <a class="maps-link h-9 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-semibold text-gray-700 transition inline-flex items-center justify-center"
          href="${getGoogleMapsUrl(ev)}" target="_blank" rel="noopener">
          Open Maps
        </a>
      </div>
    </div>
  `;

  card.addEventListener("click", e => {
    if (e.target.closest(".fav-btn") || e.target.closest(".add-to-plan-btn") || e.target.closest(".maps-link")) return;
    window.location.href = `/events/page/${ev.id}/`;
  });

  card.querySelector(".fav-btn").addEventListener("click", async e => {
    e.stopPropagation();
    const nowFav = await toggleFav(ev.id);
    if (nowFav === null) return;
    card.querySelector(".fav-icon").textContent = nowFav ? "\u2665" : "\u2661";
    if (_favsOnly) renderFavoritesSection();
  });

  card.querySelector(".add-to-plan-btn").addEventListener("click", e => {
    e.stopPropagation();
    addEventToPlan(ev.id, e.currentTarget).catch(console.error);
  });

  card.querySelector(".maps-link").addEventListener("click", e => e.stopPropagation());

  return card;
}

function buildTrendingCard(ev) {
  const fav = getFavs().has(String(ev.id));
  const label = catLabel(ev.category);
  const emoji = catEmoji(ev.category);
  const grad = catGradient(ev.category);
  const title = getTitle(ev);
  const rating = ev.rating
    ? `<span class="text-xs text-gray-600 font-medium">${escapeHtml(ev.rating)}</span>` : "";

  const article = document.createElement("article");
  article.dataset.id = String(ev.id);
  article.className = "relative min-w-[220px] w-56 h-60 rounded-2xl overflow-hidden flex-shrink-0 cursor-pointer";
  article.style.background = grad;

  article.innerHTML = `
    <div class="absolute inset-0 flex flex-col p-4">
      <div class="flex items-start justify-between">
        <span class="text-5xl select-none">${emoji}</span>
        <button type="button" class="fav-btn w-8 h-8 rounded-full bg-white/80 grid place-items-center border border-white/60 hover:bg-white transition z-10 shrink-0"
          data-id="${escapeHtml(ev.id)}" aria-label="Toggle favorite">
          <span class="fav-icon text-base leading-none">${fav ? "&hearts;" : "&#9825;"}</span>
        </button>
      </div>
      <div class="mt-auto space-y-2">
        <p class="font-bold text-gray-800 text-sm leading-snug line-clamp-2">${escapeHtml(title)}</p>
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-0.5 rounded-full bg-white/60 text-gray-600 font-medium">${escapeHtml(label)}</span>
          ${rating}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="add-to-plan-btn h-8 rounded-xl bg-white/80 hover:bg-white text-xs font-medium text-gray-700 transition">
            Add
          </button>
          <a class="maps-link h-8 rounded-xl bg-white/60 hover:bg-white text-xs font-medium text-gray-700 transition inline-flex items-center justify-center"
            href="${getGoogleMapsUrl(ev)}" target="_blank" rel="noopener">
            Maps
          </a>
        </div>
      </div>
    </div>
  `;

  article.addEventListener("click", e => {
    if (e.target.closest(".fav-btn") || e.target.closest(".add-to-plan-btn") || e.target.closest(".maps-link")) return;
    window.location.href = `/events/page/${ev.id}/`;
  });

  article.querySelector(".fav-btn").addEventListener("click", async e => {
    e.stopPropagation();
    const nowFav = await toggleFav(ev.id);
    if (nowFav === null) return;
    article.querySelector(".fav-icon").textContent = nowFav ? "\u2665" : "\u2661";
    if (_favsOnly) renderFavoritesSection();
  });

  article.querySelector(".add-to-plan-btn").addEventListener("click", e => {
    e.stopPropagation();
    addEventToPlan(ev.id, e.currentTarget).catch(console.error);
  });

  article.querySelector(".maps-link").addEventListener("click", e => e.stopPropagation());

  return article;
}

function buildAreaCard(area, events) {
  const card = document.createElement("article");
  const active = _currentArea === area.key;
  const names = events.slice(0, 3).map(ev => getTitle(ev));
  card.className = `area-card rounded-2xl border bg-white p-4 shadow-sm space-y-3 ${active ? "border-purple-300 ring-2 ring-purple-100" : "border-gray-100"}`;
  card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold text-gray-900">${escapeHtml(area.name)}</h3>
        <p class="text-xs text-gray-500">${events.length} places</p>
      </div>
      <span class="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
        <i data-lucide="map-pin" class="w-4 h-4"></i>
      </span>
    </div>
    <div class="min-h-[54px] space-y-1">
      ${names.length
        ? names.map(name => `<p class="text-xs text-gray-500 line-clamp-1">${escapeHtml(name)}</p>`).join("")
        : `<p class="text-xs text-gray-400">No places in this filter yet.</p>`}
    </div>
    <button type="button" class="view-area-btn w-full h-9 rounded-xl ${active ? "bg-purple-600 text-white" : "bg-gray-50 text-gray-700 border border-gray-200"} text-xs font-semibold hover:opacity-90 transition">
      ${active ? "Viewing Area" : "View Places"}
    </button>
  `;
  card.querySelector(".view-area-btn").addEventListener("click", () => {
    _currentArea = active ? "" : area.key;
    renderAreaCards();
    renderEventsGrid(getVisibleEvents());
    updateAreaControls();
  });
  return card;
}

function buildSkeletonCard(extraClasses = "") {
  const el = document.createElement("div");
  el.className = `rounded-2xl border border-gray-100 overflow-hidden skeleton-pulse${extraClasses ? " " + extraClasses : ""}`;
  el.innerHTML = `
    <div class="h-24" style="background:linear-gradient(135deg,#f3f4f6,#e9eaec)"></div>
    <div class="p-3.5 space-y-2">
      <div class="h-3 bg-gray-100 rounded-full w-4/5"></div>
      <div class="h-3 bg-gray-100 rounded-full w-1/2"></div>
      <div class="h-7 bg-gray-100 rounded-xl mt-1"></div>
    </div>
  `;
  return el;
}

function showGridSkeletons(count = 3) {
  const grid = document.getElementById("eventsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const extraClasses = ["", "hidden sm:block", "hidden lg:block"];
  for (let i = 0; i < count; i++) {
    grid.appendChild(buildSkeletonCard(extraClasses[i] || ""));
  }
}

let _allEvents = [];
let _totalCount = 0;
let _nextPageUrl = null;
let _isLoadingMore = false;
let _currentCategory = "";
let _currentSearch = "";
let _currentArea = "";
let _debounceTimer = null;
let _favsOnly = false;

function updateLoadMoreState() {
  const wrap = document.getElementById("loadMoreWrap");
  const btn = document.getElementById("loadMoreBtn");
  if (!wrap || !btn) return;
  const shouldShow = Boolean(_nextPageUrl) && !_favsOnly && !_currentArea;
  wrap.classList.toggle("hidden", !shouldShow);
  btn.disabled = !shouldShow || _isLoadingMore;
  if (_isLoadingMore) {
    btn.textContent = "Loading...";
  } else {
    const remaining = _totalCount - _allEvents.length;
    btn.textContent = remaining > 0 ? `Load More (${remaining} remaining)` : "Load More";
  }
}

function updateAreaControls() {
  const clearBtn = document.getElementById("clearAreaBtn");
  const heading = document.getElementById("placesHeading");
  clearBtn?.classList.toggle("hidden", !_currentArea);
  if (heading) heading.textContent = _currentArea ? getAreaName(_currentArea) : "Places";
  updateLoadMoreState();
}

function renderEventsGrid(events) {
  const grid = document.getElementById("eventsGrid");
  const countText = document.getElementById("countText");
  if (!grid) return;

  grid.innerHTML = "";

  if (!events.length) {
    const hasFilter = _currentCategory || _currentSearch || _currentArea;
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center space-y-3 bg-white rounded-2xl border border-gray-100">
        <p class="text-gray-500 font-medium">No places found</p>
        <p class="text-sm text-gray-400">Try a different search, category, or area.</p>
        ${hasFilter ? `<button onclick="clearFilter()" class="mt-2 px-5 py-2 rounded-xl border border-purple-200 text-sm font-medium text-purple-700 hover:bg-purple-50 transition">Clear Filters</button>` : ""}
      </div>`;
    if (countText) countText.textContent = "";
    return;
  }

  events.forEach(ev => grid.appendChild(buildEventCard(ev)));
  if (countText) {
    if (_currentArea) {
      countText.textContent = `${events.length} places in ${getAreaName(_currentArea)}`;
    } else {
      countText.textContent = _totalCount > _allEvents.length
        ? `Showing ${_allEvents.length} of ${_totalCount} places`
        : `${_allEvents.length} places found`;
    }
  }
  if (window.lucide) window.lucide.createIcons();
}

function renderTrendingRow(events) {
  const row = document.getElementById("trendingRow");
  if (!row) return;
  row.innerHTML = "";
  events.slice(0, 6).forEach(ev => row.appendChild(buildTrendingCard(ev)));
}

function renderAreaCards() {
  const grid = document.getElementById("eventsAreasGrid");
  if (!grid) return;
  const grouped = new Map(RIYADH_AREAS.map(area => [area.key, []]));
  _allEvents.forEach(ev => grouped.get(inferAreaKey(ev))?.push(ev));

  const orderedAreas = RIYADH_AREAS
    .map(area => ({ area, events: grouped.get(area.key) || [] }))
    .filter(row => row.events.length || row.area.key === "other" || !_currentCategory);

  grid.innerHTML = "";
  orderedAreas.forEach(row => grid.appendChild(buildAreaCard(row.area, row.events)));
  if (window.lucide) window.lucide.createIcons();
}

async function loadEvents() {
  const countText = document.getElementById("countText");

  if (!_isLoadingMore) {
    showGridSkeletons(3);
    if (countText) countText.textContent = "";
    _totalCount = 0;
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
    _totalCount = events.length;
  }

  if (_isLoadingMore) {
    const merged = new Map(_allEvents.map(ev => [String(ev.id), ev]));
    events.forEach(ev => merged.set(String(ev.id), ev));
    _allEvents = [...merged.values()];
  } else {
    _allEvents = events;
  }

  renderAreaCards();
  renderEventsGrid(getVisibleEvents());
  renderTrendingRow(getVisibleEvents());
  updateAreaControls();
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

function onSearchChange(value) {
  _currentSearch = value.trim();
  _currentArea = "";
  _nextPageUrl = null;
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => loadEvents().catch(console.error), 350);
}

function onCategorySelect(cat) {
  _currentCategory = cat;
  _currentArea = "";
  _nextPageUrl = null;
  updatePillActiveState(_currentCategory);
  loadEvents().catch(console.error);
}

function renderFavoritesSection() {
  const grid = document.getElementById("favoritesGrid");
  const countEl = document.getElementById("favoritesCount");
  if (!grid) return;
  const favIds = getFavs();
  const favEvents = getVisibleEvents().filter(ev => favIds.has(String(ev.id)));
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

function initTrendingNav() {
  const row = document.getElementById("trendingRow");
  document.getElementById("trendPrev")?.addEventListener("click", () =>
    row?.scrollBy({ left: -260, behavior: "smooth" })
  );
  document.getElementById("trendNext")?.addEventListener("click", () =>
    row?.scrollBy({ left: 260, behavior: "smooth" })
  );
}

function renderEventDetails(ev) {
  const container = document.getElementById("eventDetails");
  if (!container) return;

  const price = getPriceText(ev) || "Free";
  const label = catLabel(ev.category);
  const emoji = catEmoji(ev.category);
  const color = catColor(ev.category);
  const mapsLink = getGoogleMapsUrl(ev);
  const sourceUrl = ev.source_url || ev.website || "";
  const primaryAction = sourceUrl
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" class="block w-full h-11 rounded-xl bg-brand text-white text-sm font-semibold text-center leading-[44px] hover:opacity-90 transition">Official Info</a>`
    : `<button type="button" id="detailAddToPlanBtn" data-requires-auth="true" class="w-full h-11 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed">Add to Plan</button>`;

  container.innerHTML = `
    <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div class="flex items-start gap-4">
        <span class="text-5xl">${emoji}</span>
        <div class="flex-1 min-w-0">
          <span class="inline-block text-xs font-medium px-2.5 py-1 rounded-full ${color} mb-2">${escapeHtml(label)}</span>
          <h1 class="text-2xl font-bold text-gray-900 leading-snug">${escapeHtml(getTitle(ev))}</h1>
          <p class="text-sm text-gray-500 mt-1">${escapeHtml(getLocationText(ev) || "Riyadh")}</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-5">
        <div class="bg-white rounded-2xl border border-gray-200 p-5">
          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-lg shrink-0">Date</div>
              <div>
                <p class="text-xs text-gray-500">Date</p>
                <p class="text-sm font-semibold text-gray-800">${escapeHtml(formatDateWindow(ev))}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg shrink-0">Time</div>
              <div>
                <p class="text-xs text-gray-500">Opening Hours</p>
                <p class="text-sm font-semibold text-gray-800">${escapeHtml(ev.opening_hours || "Check before visiting")}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg shrink-0">SAR</div>
              <div>
                <p class="text-xs text-gray-500">Price</p>
                <p class="text-sm font-semibold text-gray-800">${escapeHtml(price)}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-lg shrink-0">Type</div>
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
          <p class="text-sm text-gray-600 leading-relaxed">${escapeHtml(ev.description || "Experience one of Riyadh's destinations. Enjoy the atmosphere, explore the surroundings, and create lasting memories.")}</p>
          <div class="space-y-2 pt-1">
            <p class="text-sm font-medium text-gray-700">Highlights</p>
            <ul class="space-y-1.5">
              <li class="flex items-center gap-2 text-sm text-gray-600"><span class="text-green-500">-</span> Accessible location in Riyadh</li>
              <li class="flex items-center gap-2 text-sm text-gray-600"><span class="text-green-500">-</span> Suitable for all ages</li>
              <li class="flex items-center gap-2 text-sm text-gray-600"><span class="text-green-500">-</span> ${escapeHtml(label)} experience</li>
            </ul>
          </div>
        </div>
        <div id="tab-schedule" class="hidden bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h3 class="font-semibold text-gray-800">Typical Schedule</h3>
          <p class="text-sm text-gray-500">Plan your visit around these suggested time slots.</p>
          <ul class="space-y-2 text-sm text-gray-700">
            <li class="flex gap-3"><span class="text-brand font-medium w-24 shrink-0">Morning</span> Best time for quieter visits and photos</li>
            <li class="flex gap-3"><span class="text-brand font-medium w-24 shrink-0">Afternoon</span> Peak hours can be busier</li>
            <li class="flex gap-3"><span class="text-brand font-medium w-24 shrink-0">Evening</span> Popular for dining and nighttime activities</li>
          </ul>
        </div>
        <div id="tab-reviews" class="hidden bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h3 class="font-semibold text-gray-800">Reviews</h3>
          <p class="text-sm text-gray-400">No reviews yet. Be the first to visit and share your experience.</p>
        </div>
      </div>

      <aside class="space-y-4">
        <div class="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 sticky top-6">
          <div>
            <p class="text-xs text-gray-500 mb-1">Entry Fee</p>
            <p class="text-3xl font-bold text-brand">${escapeHtml(price)}</p>
          </div>
          ${primaryAction}
          <div id="ticketMsg" class="text-sm text-center min-h-[20px]"></div>
          <a href="${mapsLink}" target="_blank" rel="noopener"
            class="block w-full h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 text-center leading-[44px] hover:bg-gray-50 transition">
            Open in Google Maps
          </a>
          <div class="flex gap-2 flex-wrap pt-1">
            <span class="text-xs bg-purple-50 text-brand px-3 py-1 rounded-full border border-purple-100">Family Friendly</span>
            <span class="text-xs bg-purple-50 text-brand px-3 py-1 rounded-full border border-purple-100">Riyadh Destination</span>
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
  const btn = document.getElementById("detailAddToPlanBtn");
  const msg = document.getElementById("ticketMsg");
  if (!btn || !msg) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Adding...";
    msg.textContent = "";
    msg.className = "text-sm text-center min-h-[20px]";

    try {
      const targetDate = getSelectedPlanDate();
      await apiPost("/api/daily-plan/add/", { date: targetDate, event_id: eventId });
      notifyPlanUpdated({ eventId, date: targetDate });
      btn.textContent = "Added to Plan";
      msg.textContent = "Added to your plan!";
      msg.classList.add("text-green-600");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Add to Plan";
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

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("eventsGrid")) {
    (async () => {
      await migrateLegacyFavorites();
      await loadFavoriteIds();
      await loadEvents();
    })().catch(console.error);

    initTrendingNav();
    initFavoritesToggle();
    updateLoadMoreState();

    document.getElementById("loadMoreBtn")?.addEventListener("click", () =>
      loadMoreEvents().catch(console.error)
    );

    document.getElementById("clearAreaBtn")?.addEventListener("click", () => {
      _currentArea = "";
      renderAreaCards();
      renderEventsGrid(getVisibleEvents());
      updateAreaControls();
    });

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
