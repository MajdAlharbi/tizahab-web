console.log("Daily Plan JS Loaded");

let multiDayPlans = {};
let currentDayIndex = 0;
let _currentPreferences = null;
let selectedDate = new Date().toISOString().split("T")[0];

/* =========================
  Generate Daily Plan
========================= */

async function generateDailyPlan() {
  return apiPost("/api/daily-plan/generate/", {
    date: selectedDate,
    seed: Date.now(),
  });
}

async function requestPlanForSelectedDate(generateBtn) {
  if (generateBtn) generateBtn.disabled = true;

  try {
    setLoading(true);
    _currentPlan = null;
    multiDayPlans = { 0: [] };

    const data = await generateDailyPlan();
    if (data) {
      _currentPlan = data;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(data, preferences);
    }

    return data;
  } finally {
    setLoading(false);
    if (generateBtn) generateBtn.disabled = false;
  }
}

function organizeEventsByTime(events) {
  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  const available = [...normalizedEvents];

  const foodCategories = new Set([
    "restaurant",
    "cafe",
    "fast_food",
    "dessert",
    "bakery",
    "juice",
    "food_truck",
    "food",
  ]);
  const activityCategories = new Set(["culture", "shopping", "other"]);
  const relaxingCategories = new Set(["outdoor"]);

  function takeFirst(predicate) {
    const index = available.findIndex(predicate);
    if (index === -1) return null;
    return available.splice(index, 1)[0];
  }

  function withLabel(event, label) {
    return event ? { ...event, itineraryLabel: label } : null;
  }

  const breakfast =
    takeFirst((event) => foodCategories.has(String(event.category || "").toLowerCase())) ||
    takeFirst(() => true);

  const activity =
    takeFirst((event) =>
      activityCategories.has(String(event.category || "").toLowerCase()) ||
      !foodCategories.has(String(event.category || "").toLowerCase())
    ) ||
    takeFirst(() => true);

  const lunch =
    takeFirst((event) => foodCategories.has(String(event.category || "").toLowerCase())) ||
    takeFirst(() => true);

  const evening =
    takeFirst((event) => relaxingCategories.has(String(event.category || "").toLowerCase())) ||
    takeFirst(() => true);

  const structured = [
    withLabel(breakfast, "☀️ Breakfast"),
    withLabel(activity, "Activity"),
    withLabel(lunch, "🍽️ Lunch"),
    withLabel(evening, "Evening"),
  ].filter(Boolean);

  available.forEach((event) => {
    structured.push({ ...event, itineraryLabel: "Evening" });
  });

  return structured;
}

async function loadCurrentPreferences() {
  if (_currentPreferences) return _currentPreferences;

  try {
    const data = await apiGet("/api/auth/me/");
    if (data) _currentPreferences = data;
  } catch {
    _currentPreferences = null;
  }

  return _currentPreferences;
}

function getPlanDateForIndex(index) {
  const day = new Date();
  day.setDate(day.getDate() + index);
  return day;
}

function _distanceBetween(a, b) {
  const lat1 = Number.parseFloat(a?.latitude);
  const lng1 = Number.parseFloat(a?.longitude);
  const lat2 = Number.parseFloat(b?.latitude);
  const lng2 = Number.parseFloat(b?.longitude);

  if (
    !Number.isFinite(lat1) || !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) || !Number.isFinite(lng2)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getDistance(a, b) {
  const latA = Number.parseFloat(a?.latitude);
  const lngA = Number.parseFloat(a?.longitude);
  const latB = Number.parseFloat(b?.latitude);
  const lngB = Number.parseFloat(b?.longitude);

  if (
    !Number.isFinite(latA) || !Number.isFinite(lngA) ||
    !Number.isFinite(latB) || !Number.isFinite(lngB)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const R = 6371;
  const dLat = (latB - latA) * Math.PI / 180;
  const dLng = (lngB - lngA) * Math.PI / 180;

  const lat1 = latA * Math.PI / 180;
  const lat2 = latB * Math.PI / 180;

  const x = Math.sin(dLat / 2) ** 2 +
            Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function findBestCenter(events) {
  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  if (!normalizedEvents.length) return null;

  let best = normalizedEvents[0];
  let bestScore = Infinity;

  normalizedEvents.forEach((e1) => {
    let total = 0;
    normalizedEvents.forEach((e2) => {
      total += getDistance(e1, e2);
    });

    if (total < bestScore) {
      bestScore = total;
      best = e1;
    }
  });

  return best;
}

function filterEventsByArea(events) {
  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  if (!normalizedEvents.length) return normalizedEvents;

  const center = findBestCenter(normalizedEvents);
  const hasCenterCoords =
    Number.isFinite(Number.parseFloat(center?.latitude)) &&
    Number.isFinite(Number.parseFloat(center?.longitude));

  if (!hasCenterCoords) return normalizedEvents;

  const withinRadius = (radiusKm) =>
    normalizedEvents.filter((event) => getDistance(center, event) <= radiusKm);

  let filtered = withinRadius(5);
  if (filtered.length < 3) {
    filtered = withinRadius(10);
  }

  return filtered.length ? filtered : normalizedEvents;
}

function sortEventsByProximity(events) {
  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  if (normalizedEvents.length <= 1) return normalizedEvents;

  const remaining = [...normalizedEvents];
  const ordered = [remaining.shift()];

  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = _distanceBetween(last, remaining[0]);

    for (let index = 1; index < remaining.length; index += 1) {
      const candidateDistance = _distanceBetween(last, remaining[index]);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestIndex = index;
      }
    }

    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return ordered;
}

function renderDaysBar() {
  const weekLabel = document.getElementById("week-label");
  const weekDays = document.getElementById("week-days");
  if (!weekLabel || !weekDays) return;

  console.log("Rendering days bar");

  const start = getPlanDateForIndex(0);
  const end = getPlanDateForIndex(6);

  weekLabel.textContent = `${start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  weekDays.replaceChildren();

  for (let index = 0; index < 7; index += 1) {
    const date = getPlanDateForIndex(index);
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "min-w-[120px] rounded-2xl border px-4 py-3 text-left transition";

    if (index === currentDayIndex) {
      button.classList.add("border-brand", "bg-brand", "text-white");
    } else {
      button.classList.add("border-gray-200", "bg-white", "text-gray-700", "hover:bg-gray-50");
    }

    const dayName = document.createElement("div");
    dayName.className = "text-sm font-semibold";
    dayName.textContent = date.toLocaleDateString("en-US", { weekday: "short" });

    const dayDate = document.createElement("div");
    dayDate.className = index === currentDayIndex ? "text-xs text-white/80" : "text-xs text-gray-500";
    dayDate.textContent = date.toLocaleDateString("en-US", {
      day: "numeric",
    });

    button.appendChild(dayName);
    button.appendChild(dayDate);
    button.addEventListener("click", async () => {
      currentDayIndex = index;
      selectedDate = date.toISOString().split("T")[0];
      renderDaysBar();

      if (window.isLoggedIn?.()) {
        try {
          const generateBtn = document.getElementById("generate-btn");
          await requestPlanForSelectedDate(generateBtn);
        } catch (error) {
          const message = document.getElementById("plan-message");
          if (message) {
            if (
              error.status === 400 &&
              error.message &&
              error.message.toLowerCase().includes("interests")
            ) {
              message.innerHTML =
                `Please select your interests first.&nbsp;` +
                `<a href="/onboarding/" ` +
                `class="underline text-brand font-medium hover:opacity-80">` +
                `Go to Preferences</a>`;
            } else if (error.status === 400) {
              message.textContent =
                error.message || "Invalid request. Please try again.";
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
        }
      } else {
        renderPlanForDay(index);
      }
    });

    weekDays.appendChild(button);
  }
}

function renderPlanForDay(index) {
  const activitiesDayLabel = document.getElementById("activities-day-label");
  const dayDate = selectedDate ? new Date(`${selectedDate}T00:00:00`) : getPlanDateForIndex(index);
  const dayEvents = Array.isArray(multiDayPlans[0]) ? multiDayPlans[0] : [];

  console.log("Switching to day:", index);

  if (activitiesDayLabel) {
    activitiesDayLabel.textContent = `${dayDate.toLocaleDateString("en-US", {
      weekday: "long",
    })}'s Activities`;
  }

  renderDailyPlan({
    ...(_currentPlan || {}),
    date: dayDate.toISOString().split("T")[0],
    events: dayEvents,
  });
}

function applyMultiDayPlan(plan, preferences) {
  multiDayPlans = {};
  const events = Array.isArray(plan?.events) ? plan.events : [];
  selectedDate = plan?.date || selectedDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(`${selectedDate}T00:00:00`);
  const diffDays = Math.round((selected - today) / (1000 * 60 * 60 * 24));
  currentDayIndex = diffDays >= 0 && diffDays < 7 ? diffDays : 0;
  _currentPreferences = preferences || _currentPreferences;
  multiDayPlans = { 0: sortEventsByProximity(events) };
  renderDaysBar();
  renderPlanForDay(currentDayIndex);
}

/* =========================
   Render Daily Plan
========================= */

function renderDailyPlan(data) {
  const container = document.getElementById("plan-container");
  const message = document.getElementById("plan-message");
  if (!container) return;

  container.replaceChildren();

  const rawEvents = Array.isArray(data?.events) ? data.events : [];
  const nearbyEvents = filterEventsByArea(rawEvents);
  const events = organizeEventsByTime(nearbyEvents);
  const sectionTimes = {
    "☀️ Breakfast": "8:00 AM",
    "Activity": "11:00 AM",
    "🍽️ Lunch": "2:00 PM",
    "Evening": "6:00 PM",
  };

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "py-10 text-center space-y-3";
    empty.innerHTML = `
      <p class="text-gray-400 text-sm">No activities planned yet.</p>
      <button onclick="document.getElementById('generate-btn').click()"
        data-requires-auth="true"
        class="px-5 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:opacity-90 transition">
        Generate My Plan
      </button>`;
    container.appendChild(empty);
    return;
  }

  const START_HOUR = 9;
  const SLOT_HOURS = 2;
  const sections = new Map();

  events.forEach((event, index) => {
    const sectionLabel = event.itineraryLabel || "Evening";
    if (!sections.has(sectionLabel)) {
      const section = document.createElement("section");
      section.className = "mt-6 first:mt-0 space-y-3";

      const header = document.createElement("div");
      header.className = "flex items-end justify-between gap-3 pb-1";

      const title = document.createElement("h3");
      title.className = "text-lg font-semibold text-gray-900";
      title.textContent = sectionLabel;

      const timeHint = document.createElement("span");
      timeHint.className = "text-sm text-gray-500";
      timeHint.textContent = sectionTimes[sectionLabel] || "";

      header.appendChild(title);
      header.appendChild(timeHint);
      section.appendChild(header);

      sections.set(sectionLabel, section);
      container.appendChild(section);
    }

    const card = document.createElement("div");
    card.className =
      "bg-white border rounded-2xl p-5 shadow-sm flex justify-between items-center hover:shadow-md transition";

    const left = document.createElement("div");
    left.className = "space-y-1";

    const slotStart = START_HOUR + index * SLOT_HOURS;
    const slotEnd = slotStart + SLOT_HOURS;
    const fmt = (h) =>
      `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
    const time = document.createElement("div");
    time.className = "text-sm text-brand font-medium";
    time.textContent = `${fmt(slotStart)} – ${fmt(slotEnd)}`;

    const title = document.createElement("div");
    title.className = "text-lg font-semibold";
    title.textContent = event.title || "";

    const location = document.createElement("div");
    location.className = "text-sm text-gray-500";
    location.textContent = event.location || "";

    const price = document.createElement("div");
    price.className = "text-sm text-gray-500";
    const parsedPrice = Number.parseFloat(event.price);
    price.textContent = Number.isFinite(parsedPrice)
      ? `${parsedPrice.toFixed(0)} SAR`
      : "Free";

    left.appendChild(time);
    left.appendChild(title);
    left.appendChild(location);
    left.appendChild(price);

    const actionBtn = document.createElement("a");
    const navQuery = encodeURIComponent((event.title || "") + " Riyadh");
    actionBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${navQuery}`;
    actionBtn.target = "_blank";
    actionBtn.rel = "noopener";
    actionBtn.className =
      "px-4 py-2 bg-brand text-white rounded-xl text-sm hover:opacity-90 inline-block";
    actionBtn.textContent = "Navigate";

    card.appendChild(left);
    card.appendChild(actionBtn);
    sections.get(sectionLabel).appendChild(card);
  });

  if (message) message.innerText = "";

  /* ===== Summary Stats ===== */
  const activityCount = document.getElementById("summary-activities");
  const durationEl = document.getElementById("summary-duration");
  if (activityCount) activityCount.textContent = events.length;
  if (durationEl) durationEl.textContent = `${events.length}h`;

  /* ===== Map Binding ===== */

  const mapPoints = events
    .map((e) => {
      const lat = Number.parseFloat(e.latitude);
      const lng = Number.parseFloat(e.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: e.id,
        title: e.title,
        location: e.location,
        lat,
        lng,
      };
    })
    .filter(Boolean);

  // Preserve points so markers can be rendered if the Google Maps callback arrives later.
  window.__TZ_DP_PENDING_POINTS = mapPoints;

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

let _currentPlan = null;

async function loadCurrentPlan() {
  try {
    const data = await apiGet("/api/daily-plan/");
    if (!data) return;
    const plans = Array.isArray(data) ? data : data.results || [];
    if (!plans.length) return;

    const today = new Date().toISOString().split("T")[0];
    const todayPlan = plans.find((p) => p.date === today) || plans[0];
    if (
      todayPlan &&
      Array.isArray(todayPlan.events) &&
      todayPlan.events.length > 0
    ) {
      _currentPlan = todayPlan;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(todayPlan, preferences);
    }
  } catch {
    /* silent */
  }
}

/* =========================
   Add Activity
========================= */

let _activityDebounce = null;

function openAddActivityModal() {
  const modal = document.getElementById("addActivityModal");
  if (modal) modal.classList.remove("hidden");
}

function closeAddActivityModal() {
  const modal = document.getElementById("addActivityModal");
  if (modal) modal.classList.add("hidden");
}

async function searchActivities(query) {
  const results = document.getElementById("activitySearchResults");
  if (!results) return;

  if (!query.trim()) {
    results.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Type to search for places</p>';
    return;
  }

  results.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Searching...</p>';

  try {
    const data = await apiGet(`/api/events/?search=${encodeURIComponent(query)}`);
    if (!data) return;
    const events = Array.isArray(data) ? data : data.results || [];

    if (!events.length) {
      results.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No places found</p>';
      return;
    }

    // Get current plan event IDs to mark already-added
    const planEventIds = new Set(
      (_currentPlan?.events || []).map(e => String(typeof e === "object" ? e.id : e))
    );

    results.innerHTML = "";
    events.slice(0, 20).forEach(ev => {
      const alreadyAdded = planEventIds.has(String(ev.id));
      const item = document.createElement("div");
      item.className = "flex items-center gap-3 p-3 rounded-xl border hover:bg-gray-50 transition";
      item.innerHTML = `
        <span class="text-xl shrink-0">${catEmoji(ev.category)}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-gray-800 truncate">${escapeHtml(ev.title)}</p>
          <span class="text-xs text-gray-500">${ev.price ? parseFloat(ev.price).toFixed(0) + " SAR" : "Free"}</span>
        </div>
        <button class="add-to-plan-btn px-3 py-1.5 rounded-lg text-xs font-medium transition ${
          alreadyAdded
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-brand text-white hover:opacity-90"
        }" data-event-id="${ev.id}" data-requires-auth="true" ${alreadyAdded ? "disabled" : ""}>
          ${alreadyAdded ? "Added" : "Add"}
        </button>
      `;

      if (!alreadyAdded) {
        item.querySelector(".add-to-plan-btn").addEventListener("click", async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = "Adding...";

          try {
            await addEventToPlan(ev.id);
            btn.textContent = "Added";
            btn.classList.remove("bg-brand", "hover:opacity-90");
            btn.classList.add("bg-gray-100", "text-gray-400", "cursor-not-allowed");
          } catch {
            btn.disabled = false;
            btn.textContent = "Add";
          }
        });
      }

      results.appendChild(item);
    });
  } catch {
    results.innerHTML = '<p class="text-sm text-red-400 text-center py-8">Failed to search</p>';
  }
}

async function addEventToPlan(eventId) {
  const today = new Date().toISOString().split("T")[0];

  if (_currentPlan) {
    const existingIds = _currentPlan.events.map(e =>
      typeof e === "object" ? e.id : Number(e)
    );
    const merged = [...new Set([...existingIds, Number(eventId)])];
    const updated = await apiPut(`/api/daily-plan/${_currentPlan.id}/`, {
      date: _currentPlan.date,
      events: merged,
    });
    if (updated) {
      _currentPlan = updated;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(updated, preferences);
    }
  } else {
    const created = await apiPost("/api/daily-plan/", {
      date: today,
      events: [Number(eventId)],
    });
    if (created) {
      _currentPlan = created;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(created, preferences);
    }
  }
}

/* =========================
   Export Plan
========================= */

function exportPlan() {
  if (!_currentPlan || !_currentPlan.events || !_currentPlan.events.length) {
    alert("No plan to export. Generate or add activities first.");
    return;
  }

  const events = _currentPlan.events;
  const startHour = 9;
  const slotHours = 2;
  const fmt = (h) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

  let text = `Tizahab Daily Plan — ${_currentPlan.date}\n`;
  text += "=".repeat(40) + "\n\n";

  events.forEach((ev, i) => {
    const hour = startHour + i * slotHours;
    const title = typeof ev === "object" ? ev.title : `Event #${ev}`;
    const price = typeof ev === "object" && ev.price
      ? `${parseFloat(ev.price).toFixed(0)} SAR`
      : "Free";
    const category = typeof ev === "object" ? (ev.category || "") : "";
    text += `${fmt(hour)} – ${fmt(hour + slotHours)}\n`;
    text += `  ${title}\n`;
    if (category) text += `  Category: ${category}\n`;
    text += `  Price: ${price}\n\n`;
  });

  text += "—\nGenerated by Tizahab (tizahab.com)\n";

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tizahab-plan-${_currentPlan.date}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================
   Page Init
========================= */

document.addEventListener("DOMContentLoaded", () => {
  initDailyPlanMap();
  loadCurrentPlan();

  // Generate AI Plan
  const generateBtn = document.getElementById("generate-btn");
  generateBtn?.addEventListener("click", async () => {
    try {
      await requestPlanForSelectedDate(generateBtn);
    } catch (error) {
      const message = document.getElementById("plan-message");
      if (!message) return;
      if (
        error.status === 400 &&
        error.message &&
        error.message.toLowerCase().includes("interests")
      ) {
        message.innerHTML =
          `Please select your interests first.&nbsp;` +
          `<a href="/onboarding/" ` +
          `class="underline text-brand font-medium hover:opacity-80">` +
          `Go to Preferences</a>`;
      } else if (error.status === 400) {
        message.textContent =
          error.message || "Invalid request. Please try again.";
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

  // Add Activity modal
  document.getElementById("add-activity-btn")?.addEventListener("click", openAddActivityModal);
  document.getElementById("closeAddActivity")?.addEventListener("click", closeAddActivityModal);
  document.getElementById("addActivityOverlay")?.addEventListener("click", closeAddActivityModal);

  document.getElementById("activitySearchInput")?.addEventListener("input", (e) => {
    clearTimeout(_activityDebounce);
    _activityDebounce = setTimeout(() => searchActivities(e.target.value), 350);
  });

  // Export Plan
  document.getElementById("export-plan-btn")?.addEventListener("click", exportPlan);
});

/* =========================
   Map Initialization
========================= */

function initDailyPlanMap() {
  if (!window.TZMap) return;

  window.__TZ_DP_MAP = window.TZMap.initMap("dailyPlanMap", { zoom: 11 });
  window.__TZ_DP_MARKERS = {};

  if (
    window.__TZ_DP_MAP &&
    Array.isArray(window.__TZ_DP_PENDING_POINTS) &&
    window.__TZ_DP_PENDING_POINTS.length
  ) {
    renderDailyPlanMarkers(window.__TZ_DP_PENDING_POINTS);
  }
}

/* =========================
   Render Map Markers
========================= */

function renderDailyPlanMarkers(points) {
  if (!window.google || !google.maps || !window.__TZ_DP_MAP) return;

  Object.values(window.__TZ_DP_MARKERS || {}).forEach((m) => {
    if (m?.setMap) m.setMap(null);
  });

  window.__TZ_DP_MARKERS = {};

  const map = window.__TZ_DP_MAP;
  const info = new google.maps.InfoWindow();
  const bounds = new google.maps.LatLngBounds();

  (Array.isArray(points) ? points : []).forEach((p) => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return;

    const pos = { lat: p.lat, lng: p.lng };
    const marker = new google.maps.Marker({ position: pos, map });

    window.__TZ_DP_MARKERS[p.id] = marker;

    marker.addListener("click", () => {
      info.setContent(
        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(p.title)}</div>
         <div style="font-size:12px;opacity:.85;">${escapeHtml(p.location)}</div>`,
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
  const emoji = catEmoji(ev.category);
  const card = document.createElement("a");
  card.href = `/events/page/${ev.id}/`;
  card.className =
    "min-w-[240px] bg-white border rounded-2xl shadow-sm p-4 hover:shadow-md transition flex-shrink-0 flex items-center gap-3";
  card.innerHTML = `
    <span class="text-2xl shrink-0">${emoji}</span>
    <div class="min-w-0 flex-1">
      <div class="font-semibold truncate text-gray-800">${escapeHtml(ev.title || "Untitled")}</div>
      <div class="flex items-center gap-2 mt-1">
        <span class="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">${escapeHtml(badgeLabel)}</span>
        <span class="text-xs text-gray-500">${escapeHtml(price)}</span>
      </div>
    </div>
  `;
  return card;
}

async function loadCarousel(containerId, sectionId, category, badgeLabel) {
  const container = document.getElementById(containerId);
  const section = document.getElementById(sectionId);
  if (!container) return;

  try {
    const qs = category ? `?category=${category}` : "";
    const data = await apiGet(`/api/events/${qs}`);
    if (!data) return;
    const events = Array.isArray(data) ? data : data.results || [];

    if (!events.length) return;

    container.innerHTML = "";
    events
      .slice(0, 6)
      .forEach((ev) => container.appendChild(buildMiniCard(ev, badgeLabel)));
    if (section) section.classList.remove("hidden");
  } catch {
    // Silently fail — carousels are non-critical
  }
}

function buildUpcomingCard(ev) {
  const emoji = catEmoji(ev.category);
  const price = ev.price ? `${parseFloat(ev.price).toFixed(0)} SAR` : "Free";
  const card = document.createElement("a");
  card.href = `/events/page/${ev.id}/`;
  card.className =
    "min-w-[260px] bg-white border rounded-2xl shadow-sm p-4 hover:shadow-md transition flex-shrink-0 flex items-center gap-3";
  card.innerHTML = `
    <span class="text-2xl shrink-0">${emoji}</span>
    <div class="min-w-0 flex-1">
      <div class="font-semibold truncate text-gray-800">${escapeHtml(ev.title || "Untitled")}</div>
      <div class="flex items-center gap-2 mt-1">
        <span class="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">${escapeHtml(ev.category || "Place")}</span>
        <span class="text-xs text-gray-500">${escapeHtml(price)}</span>
      </div>
    </div>
  `;
  return card;
}

async function loadUpcomingCarousel() {
  const container = document.getElementById("upcomingCarousel");
  const section = document.getElementById("upcomingSection");
  if (!container) return;

  try {
    const data = await apiGet("/api/events/");
    if (!data) return;
    const events = Array.isArray(data) ? data : data.results || [];

    if (!events.length) return;

    container.innerHTML = "";
    events
      .slice(0, 6)
      .forEach((ev) => container.appendChild(buildUpcomingCard(ev)));
    if (section) section.classList.remove("hidden");
  } catch {
    // Silently fail
  }
}

/* Load all three carousels on page load */
document.addEventListener("DOMContentLoaded", () => {
  loadCarousel("restaurantsCarousel", "restaurantsSection", "food", "Restaurant");
  loadCarousel("activitiesCarousel", "activitiesSection", "outdoor", "Outdoor");
  loadUpcomingCarousel();
});
