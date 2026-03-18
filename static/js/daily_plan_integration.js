console.log("Daily Plan JS Loaded");

let dailyPlanMap = null;
let dailyPlanMarkers = [];
let dailyPlanInfoWindow = null;
let directionsService = null;
let directionsRenderer = null;

/* =========================
   Generate Daily Plan
========================= */

async function generateDailyPlan() {
  const today = new Date().toISOString().split("T")[0];
  return apiPost("/api/daily-plan/generate/", { date: today });
}

/* =========================
   Map Initialization
========================= */

window.initDailyPlanMap = function () {
  if (!window.TZMap) {
    console.error("TZMap is not loaded");
    return;
  }

  const mapEl = document.getElementById("dailyPlanMap");
  if (!mapEl) {
    console.error("dailyPlanMap element not found");
    return;
  }

  dailyPlanMap = window.TZMap.initMap("dailyPlanMap", {
    zoom: 11,
    center: { lat: 24.7136, lng: 46.6753 }
  });

  if (!dailyPlanMap) {
    console.error("Failed to initialize daily plan map");
    return;
  }

  dailyPlanInfoWindow = new google.maps.InfoWindow();
  directionsService = new google.maps.DirectionsService();

  directionsRenderer = new google.maps.DirectionsRenderer({
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: "#7e1ca1",
      strokeWeight: 4
    }
  });

  directionsRenderer.setMap(dailyPlanMap);

  loadCurrentPlan();
};

/* =========================
   Helpers
========================= */

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNum(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function extractCoordinates(event) {
  const candidates = [
    [event?.latitude, event?.longitude],
    [event?.lat, event?.lng],
    [event?.lat, event?.longitude],
    [event?.latitude, event?.lng],
    [event?.event?.latitude, event?.event?.longitude],
    [event?.event?.lat, event?.event?.lng],
    [event?.place?.latitude, event?.place?.longitude],
    [event?.place?.lat, event?.place?.lng]
  ];

  for (const [latRaw, lngRaw] of candidates) {
    const lat = toNum(latRaw);
    const lng = toNum(lngRaw);
    if (lat !== null && lng !== null) {
      return { lat, lng };
    }
  }

  return null;
}

function normalizeEvent(event) {
  const coords = extractCoordinates(event);

  return {
    id: event?.id ?? event?.event?.id ?? null,
    title:
      event?.title ||
      event?.name ||
      event?.event?.title ||
      event?.event?.name ||
      "Activity",
    location:
      event?.location ||
      event?.place_name ||
      event?.event?.location ||
      event?.place?.name ||
      "Riyadh",
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null
  };
}

/* =========================
   Render Daily Plan
========================= */

function renderDailyPlan(data) {
  const container = document.getElementById("plan-container");
  const rawEvents = Array.isArray(data?.events) ? data.events : [];
  const events = rawEvents.map(normalizeEvent);

  if (!container) return;

  container.replaceChildren();

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "text-center py-10 text-gray-500";
    empty.innerText = "No activities planned yet.";
    container.appendChild(empty);

    clearDailyPlanMarkers();
    if (directionsRenderer) directionsRenderer.set("directions", null);
    return;
  }

  events.forEach((event, index) => {
    const card = document.createElement("div");
    card.className =
      "bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition";

    card.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="font-semibold text-lg">${escapeHtml(event.title)}</div>
          <div class="text-sm text-gray-500 mt-1">📍 ${escapeHtml(event.location)}</div>
        </div>
        <div class="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center text-sm font-bold shrink-0">
          ${index + 1}
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  const mapPoints = events.filter(e => e.lat !== null && e.lng !== null);

  console.log("Daily plan raw events:", rawEvents);
  console.log("Daily plan normalized events:", events);
  console.log("Daily plan map points:", mapPoints);

  renderDailyPlanMarkers(mapPoints);
  renderRoute(mapPoints);

  const activityCount = document.getElementById("summary-activities");
  const durationEl = document.getElementById("summary-duration");

  if (activityCount) activityCount.textContent = String(events.length);
  if (durationEl) durationEl.textContent = `${events.length}h`;
}

/* =========================
   Clear Markers
========================= */

function clearDailyPlanMarkers() {
  dailyPlanMarkers.forEach(marker => marker.setMap(null));
  dailyPlanMarkers = [];
}

/* =========================
   Render Markers
========================= */

function renderDailyPlanMarkers(points) {
  if (!dailyPlanMap || !window.google || !google.maps) return;

  clearDailyPlanMarkers();

  const bounds = new google.maps.LatLngBounds();
  let hasPoints = false;

  points.forEach((p, index) => {
    const marker = new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng },
      map: dailyPlanMap,
      title: p.title,
      label: {
        text: String(index + 1),
        color: "#ffffff",
        fontWeight: "bold"
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: "#7e1ca1",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
        scale: 10
      }
    });

    marker.addListener("click", () => {
      dailyPlanInfoWindow.setContent(`
        <div style="padding:12px;min-width:190px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px;">
            ${escapeHtml(p.title)}
          </div>
          <div style="font-size:12px;color:#6b7280;">
            📍 ${escapeHtml(p.location)}
          </div>
        </div>
      `);

      dailyPlanInfoWindow.open({
        anchor: marker,
        map: dailyPlanMap
      });
    });

    dailyPlanMarkers.push(marker);
    bounds.extend(marker.getPosition());
    hasPoints = true;
  });

  if (hasPoints) {
    dailyPlanMap.fitBounds(bounds);

    google.maps.event.addListenerOnce(dailyPlanMap, "bounds_changed", () => {
      if (dailyPlanMap.getZoom() > 13) {
        dailyPlanMap.setZoom(13);
      }
    });
  } else {
    dailyPlanMap.setCenter({ lat: 24.7136, lng: 46.6753 });
    dailyPlanMap.setZoom(11);
  }
}

/* =========================
   Route Between Activities
========================= */

function renderRoute(points) {
  if (!directionsService || !directionsRenderer) return;

  if (points.length < 2) {
    directionsRenderer.set("directions", null);
    return;
  }

  const origin = { lat: points[0].lat, lng: points[0].lng };
  const destination = {
    lat: points[points.length - 1].lat,
    lng: points[points.length - 1].lng
  };

  const waypoints = points.slice(1, -1).map(p => ({
    location: { lat: p.lat, lng: p.lng },
    stopover: true
  }));

  directionsService.route(
    {
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
      } else {
        console.error("Directions request failed:", status);
        directionsRenderer.set("directions", null);
      }
    }
  );
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

    if (todayPlan) renderDailyPlan(todayPlan);
  } catch (error) {
    console.error("Failed to load current plan:", error);
  }
}

/* =========================
   Page Init
========================= */

document.addEventListener("DOMContentLoaded", () => {
  const generateBtn = document.getElementById("generate-btn");

  if (!generateBtn) return;

  generateBtn.addEventListener("click", async () => {
    try {
      const data = await generateDailyPlan();
      if (data) renderDailyPlan(data);
    } catch (error) {
      console.error("Failed to generate daily plan:", error);
    }
  });
});