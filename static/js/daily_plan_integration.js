console.log("Daily Plan JS Loaded");

/* =========================
  Generate Daily Plan
========================= */

async function generateDailyPlan() {
  const today = new Date().toISOString().split("T")[0];
 return apiPost("/api/daily-plan/generate/", { date: today });
}


/* =========================
   Render Daily Plan
========================= */

function renderDailyPlan(data) {
  const container = document.getElementById("plan-container");
  const message = document.getElementById("plan-message");
  if (!container) return;

  container.replaceChildren();

  const events = Array.isArray(data?.events) ? data.events : [];

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "py-10 text-center space-y-3";
    empty.innerHTML = `
      <p class="text-gray-400 text-sm">No activities planned yet.</p>
      <button onclick="document.getElementById('generate-btn').click()"
        class="px-5 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:opacity-90 transition">
        Generate My Plan
      </button>`;
    container.appendChild(empty);
    return;
  }

  const START_HOUR = 9;
  const SLOT_HOURS = 2;

  events.forEach((event, index) => {
    const card = document.createElement("div");
    card.className =
      "bg-white border rounded-2xl p-5 shadow-sm flex justify-between items-center hover:shadow-md transition";

    const left = document.createElement("div");
    left.className = "space-y-1";

    const slotStart = START_HOUR + index * SLOT_HOURS;
    const slotEnd = slotStart + SLOT_HOURS;
    const fmt = h => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
    const time = document.createElement("div");
    time.className = "text-sm text-brand font-medium";
    time.textContent = `${fmt(slotStart)} – ${fmt(slotEnd)}`;

    const title = document.createElement("div");
    title.className = "text-lg font-semibold";
    title.textContent = event.title || "";

    const location = document.createElement("div");
    location.className = "text-sm text-gray-500";
    location.textContent = event.location || "";

    left.appendChild(time);
    left.appendChild(title);
    left.appendChild(location);

    const actionBtn = document.createElement("button");
    actionBtn.className =
      "px-4 py-2 bg-brand text-white rounded-xl text-sm hover:opacity-90";
    actionBtn.textContent = "Navigate";

    card.appendChild(left);
    card.appendChild(actionBtn);
    container.appendChild(card);
  });

  if (message) message.innerText = "";

  /* ===== Summary Stats ===== */
  const activityCount = document.getElementById("summary-activities");
  const durationEl = document.getElementById("summary-duration");
  if (activityCount) activityCount.textContent = events.length;
  if (durationEl) durationEl.textContent = `${events.length}h`;

  /* ===== Map Binding ===== */

  const mapPoints = events
    .filter(e => typeof e.latitude === "number" && typeof e.longitude === "number")
    .map(e => ({
      id: e.id,
      title: e.title,
      location: e.location,
      lat: e.latitude,
      lng: e.longitude
    }));

  if (window.__TZ_DP_MAP) {
    renderDailyPlanMarkers(mapPoints);
  }
}


/* =========================
   Loading State
========================= */

function setLoading(isLoading) {
  const message = document.getElementById("plan-message");
  if (!message) return;
  message.innerText = isLoading ? "Generating..." : "";
}


/* =========================
   Load Current Plan
========================= */

async function loadCurrentPlan() {
  try {
    const data = await apiGet("/api/daily-plan/");
    if (!data) return;
    const plans = Array.isArray(data) ? data : (data.results || []);
    if (!plans.length) return;

    const today = new Date().toISOString().split("T")[0];
    const todayPlan = plans.find(p => p.date === today) || plans[0];
    if (todayPlan && Array.isArray(todayPlan.events) && todayPlan.events.length > 0) {
      renderDailyPlan(todayPlan);
    }
  } catch { /* silent */ }
}


/* =========================
   Page Init
========================= */

document.addEventListener("DOMContentLoaded", () => {
  initDailyPlanMap();
  loadCurrentPlan();

  const generateBtn = document.getElementById("generate-btn");
  if (!generateBtn) return;

  generateBtn.addEventListener("click", async () => {
    try {
      setLoading(true);
      const data = await generateDailyPlan();
      setLoading(false);
      if (data) renderDailyPlan(data);
    } catch (error) {
      setLoading(false);
      const message = document.getElementById("plan-message");
      if (!message) return;
      if (error.status === 400 && error.message && error.message.toLowerCase().includes("interests")) {
        message.innerHTML =
          `Please select your interests first.&nbsp;` +
          `<a href="/onboarding/" ` +
          `class="underline text-brand font-medium hover:opacity-80">` +
          `Go to Preferences</a>`;
      } else if (error.status === 400) {
        message.textContent = error.message || "Invalid request. Please try again.";
      } else if (error.status === 404) {
        message.innerHTML =
          `No places match your current budget.&nbsp;` +
          `<a href="/onboarding/" ` +
          `class="underline text-brand font-medium hover:opacity-80">` +
          `Adjust preferences →</a>`;
      } else {
        message.textContent = "Something went wrong. Please try again.";
      }
    }
  });
});


/* =========================
   Map Initialization
========================= */

function initDailyPlanMap() {
  if (!window.TZMap) return;

  window.__TZ_DP_MAP = window.TZMap.initMap("dailyPlanMap", { zoom: 11 });
  window.__TZ_DP_MARKERS = {};
}


/* =========================
   Render Map Markers
========================= */

function renderDailyPlanMarkers(points) {
  if (!window.google || !google.maps || !window.__TZ_DP_MAP) return;

  Object.values(window.__TZ_DP_MARKERS || {}).forEach(m => {
    if (m?.setMap) m.setMap(null);
  });

  window.__TZ_DP_MARKERS = {};

  const map = window.__TZ_DP_MAP;
  const info = new google.maps.InfoWindow();
  const bounds = new google.maps.LatLngBounds();

  (Array.isArray(points) ? points : []).forEach(p => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return;

    const pos = { lat: p.lat, lng: p.lng };
    const marker = new google.maps.Marker({ position: pos, map });

    window.__TZ_DP_MARKERS[p.id] = marker;

    marker.addListener("click", () => {
      info.setContent(
        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(p.title)}</div>
         <div style="font-size:12px;opacity:.85;">${escapeHtml(p.location)}</div>`
      );
      info.open({ anchor: marker, map });
    });

    bounds.extend(pos);
  });

  if (!bounds.isEmpty()) map.fitBounds(bounds);
}


/* =========================
   Utility
========================= */

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================
   Carousel helpers
========================= */

function buildMiniCard(ev, badgeLabel) {
  const price = ev.price ? `${parseFloat(ev.price).toFixed(0)} SAR` : "Free";
  const card = document.createElement("div");
  card.className =
    "min-w-[240px] bg-white border rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition flex-shrink-0";
  card.innerHTML = `
    <div class="h-40 bg-gray-200 relative">
      <span class="absolute top-3 left-3 bg-brand text-white text-xs px-3 py-1 rounded-full">
        ${escapeHtml(badgeLabel)}
      </span>
    </div>
    <div class="p-4 space-y-1">
      <div class="font-semibold truncate">${escapeHtml(ev.title || "Untitled")}</div>
      <div class="text-sm text-gray-500">${escapeHtml(price)}</div>
    </div>
  `;
  card.style.cursor = "pointer";
  card.addEventListener("click", () => {
    window.location.href = `/events/page/${ev.id}/`;
  });
  return card;
}

async function loadCarousel(containerId, category, badgeLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const qs = category ? `?category=${category}` : "";
    const data = await apiGet(`/api/events/${qs}`);
    if (!data) return;
    const events = Array.isArray(data) ? data : data.results || [];

    container.innerHTML = "";
    events.slice(0, 6).forEach((ev) =>
      container.appendChild(buildMiniCard(ev, badgeLabel))
    );
  } catch {
    // Silently fail — carousels are non-critical
  }
}

function buildUpcomingCard(ev) {
  const card = document.createElement("div");
  card.className =
    "min-w-[260px] bg-white border rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition flex-shrink-0";
  card.innerHTML = `
    <div class="h-40 bg-gray-200 relative">
      <span class="absolute top-3 left-3 bg-brand text-white text-xs px-3 py-1 rounded-full">
        ${escapeHtml(ev.category || "Place")}
      </span>
    </div>
    <div class="p-4 space-y-2">
      <div class="font-semibold truncate">${escapeHtml(ev.title || "Untitled")}</div>
      <div class="text-sm text-gray-500">📍 ${escapeHtml(ev.location || "Riyadh")}</div>
      <a href="/events/page/${ev.id}/"
        class="block w-full h-9 rounded-xl bg-brand text-white text-sm hover:opacity-90 text-center leading-9">
        View Event
      </a>
    </div>
  `;
  return card;
}

async function loadUpcomingCarousel() {
  const container = document.getElementById("upcomingCarousel");
  if (!container) return;

  try {
    const data = await apiGet("/api/events/");
    if (!data) return;
    const events = Array.isArray(data) ? data : data.results || [];

    container.innerHTML = "";
    events.slice(0, 6).forEach((ev) => container.appendChild(buildUpcomingCard(ev)));
  } catch {
    // Silently fail
  }
}

/* Load all three carousels on page load */
document.addEventListener("DOMContentLoaded", () => {
  loadCarousel("restaurantsCarousel", "food", "Restaurant");
  loadCarousel("activitiesCarousel", "outdoor", "Outdoor");
  loadUpcomingCarousel();
});