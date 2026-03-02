console.log("Daily Plan JS Loaded");

/* =========================
   Generate Daily Plan
========================= */

async function generateDailyPlan() {
  const token = requireAuth();
  if (!token) return null;

  const today = new Date();
  const selectedDate = today.toISOString().split("T")[0];

  const response = await fetch("/api/daily-plan/generate/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ date: selectedDate })
  });

  if (response.status === 401) {
    redirectToLogin();
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const msg =
      (isJson && payload?.detail)
        ? payload.detail
        : "Failed to generate daily plan";
    throw new Error(msg);
  }

  return payload;
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
    empty.className = "text-gray-500";
    empty.textContent = "No events found.";
    container.appendChild(empty);
    return;
  }

  events.forEach(event => {
    const card = document.createElement("div");
    card.className =
      "bg-white border rounded-2xl p-5 shadow-sm flex justify-between items-center hover:shadow-md transition";

    const left = document.createElement("div");
    left.className = "space-y-1";

    const time = document.createElement("div");
    time.className = "text-sm text-brand font-medium";
    time.textContent = "09:00 AM • 1 hour";

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
   Page Init
========================= */

document.addEventListener("DOMContentLoaded", () => {
  requireAuth();

  initDailyPlanMap();

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
      if (message)
        message.innerText = error.message || "Something went wrong";
    }
  });
});


/* =========================
   Map Initialization
========================= */

function initDailyPlanMap() {
  if (!window.TZMap) return;

  window.__TZ_DP_MAP = window.TZMap.initMap("dailyPlanMap", [], { zoom: 11 });
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