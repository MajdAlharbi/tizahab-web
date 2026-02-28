console.log("Daily Plan JS Loaded");

async function generateDailyPlan() {
<<<<<<< HEAD
  const today = new Date();
  const selectedDate = today.toISOString().split("T")[0];
  console.log("Origin:", location.origin);
  const token = localStorage.getItem("access");
  if (!token) {
    redirectToLogin();
    return null;
  }
console.log("Token exists:", !!token);
console.log("Token preview:", token ? token.slice(0, 20) : null);
=======
  console.log("generateDailyPlan started");

  const token = requireAuth();
  console.log("Token:", token);

  const USE_MOCK = false;

  if (USE_MOCK) {
    return {
      day: "Today",
      events: [
        { title: "Mock Event 1", category: "Culture", date: "2026-02-10" },
        { title: "Mock Event 2", category: "Food", date: "2026-02-10" }
      ]
    };
  }

  const today = new Date();
  const selectedDate = today.toISOString().split("T")[0];

  console.log("Selected date:", selectedDate);
  console.log("About to call API...");

>>>>>>> origin/dev
  const response = await fetch("/api/daily-plan/generate/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
<<<<<<< HEAD
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ date: selectedDate }),
=======
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      date: selectedDate
    })
>>>>>>> origin/dev
  });

  if (response.status === 401) {
      console.warn("401 from generate endpoint. Redirect blocked for debugging.");
   // handleUnauthorized();
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    console.error("Generate API failed:", response.status, payload);
    const msg =
      (isJson && payload?.detail) ? payload.detail :
      (typeof payload === "string" && payload.slice(0, 200)) ? payload.slice(0, 200) :
      "Failed to generate daily plan";
    throw new Error(msg);
  }

  return payload;
}
function renderDailyPlan(data) {
  const container = document.getElementById("plan-container");
  const message = document.getElementById("plan-message");
  if (!container) return;

  container.replaceChildren();

  const events = (data && Array.isArray(data.events)) ? data.events : [];

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-gray-500";
    empty.textContent = "No events found.";
    container.appendChild(empty);
    return;
  }

  events.forEach(event => {
    const card = document.createElement("div");
    card.className = `
      bg-white border rounded-2xl p-5 shadow-sm
      flex justify-between items-center
      hover:shadow-md transition
    `;

    const left = document.createElement("div");
    left.className = "space-y-1";

    const time = document.createElement("div");
    time.className = "text-sm text-brand font-medium";
    time.textContent = "09:00 AM • 1 hour";

    const title = document.createElement("div");
    title.className = "text-lg font-semibold";
    title.textContent = event?.title ?? "";

    const location = document.createElement("div");
    location.className = "text-sm text-gray-500";
    location.textContent = event?.category ?? "";

    left.appendChild(time);
    left.appendChild(title);
    left.appendChild(location);

    const actionBtn = document.createElement("button");
    actionBtn.className = "px-4 py-2 bg-brand text-white rounded-xl text-sm hover:opacity-90";
    actionBtn.textContent = "Navigate";

    card.appendChild(left);
    card.appendChild(actionBtn);

    container.appendChild(card);
  });

  if (message) message.innerText = "";

  const mapPoints = extractPlanPointsFromDOM();
  if (window.__TZ_DP_MAP && window.__TZ_DP_MARKERS) {
    renderDailyPlanMarkers(mapPoints);
  }
}

function setLoading(isLoading) {
  const message = document.getElementById("plan-message");
  if (!message) return;
  message.innerText = isLoading ? "Generating..." : "";
}

document.addEventListener("DOMContentLoaded", () => {
<<<<<<< HEAD
  // Ensure page is protected
=======
  requireAuth();
>>>>>>> origin/dev

  const generateBtn = document.getElementById("generate-btn");
  if (!generateBtn) return;

  generateBtn.addEventListener("click", async () => {
    console.log("Button clicked");

    try {
      setLoading(true);
      const data = await generateDailyPlan();
      setLoading(false);
      if (data) renderDailyPlan(data);
    } catch (error) {
      setLoading(false);
      const message = document.getElementById("plan-message");
      if (message) message.innerText = error.message || "Something went wrong";
    }
  });
});

function initDailyPlanMap() {
  if (!window.TZMap) return;

  const points = [
    { id: "dp-1", title: "Start Point", location: "Riyadh", lat: 24.7136, lng: 46.6753 },
    { id: "dp-2", title: "Diriyah", location: "Diriyah", lat: 24.7342, lng: 46.5762 },
    { id: "dp-3", title: "KAFD", location: "King Abdullah Financial District", lat: 24.7667, lng: 46.6439 },
  ];

  window.__TZ_DP_POINTS = points;
  window.__TZ_DP_MAP = window.TZMap.initMap("dailyPlanMap", points, { zoom: 11 });
  window.__TZ_DP_MARKERS = window.__TZ_DP_MARKERS || {};
}

function extractPlanPointsFromDOM() {
  return window.__TZ_DP_POINTS || [];
}

function renderDailyPlanMarkers(points) {
  if (!window.google || !google.maps || !window.__TZ_DP_MAP) return;

  Object.values(window.__TZ_DP_MARKERS).forEach(m => {
    if (m && typeof m.setMap === "function") m.setMap(null);
  });
  window.__TZ_DP_MARKERS = {};

  const map = window.__TZ_DP_MAP;
  const info = new google.maps.InfoWindow();
  const bounds = new google.maps.LatLngBounds();

  (Array.isArray(points) ? points : []).forEach(p => {
    if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return;

    const pos = { lat: p.lat, lng: p.lng };
    const marker = new google.maps.Marker({ position: pos, map });

    if (p.id) window.__TZ_DP_MARKERS[p.id] = marker;

    const title = (p.title || "Stop").toString();
    const location = (p.location || "").toString();

    marker.addListener("click", () => {
      info.setContent(
        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(title)}</div>
         <div style="font-size:12px;opacity:.85;">${escapeHtml(location)}</div>`
      );
      info.open({ anchor: marker, map });
    });

    bounds.extend(pos);
  });

  if (!bounds.isEmpty()) map.fitBounds(bounds);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
