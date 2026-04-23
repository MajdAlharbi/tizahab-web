let multiDayPlans = [];
let currentDayIndex = 0;
let _currentPreferences = null;
const SELECTED_PLAN_DATE_STORAGE_KEY = "tz_selected_plan_date";
const PLAN_START_DATE_STORAGE_KEY = "tz_plan_start_date";
const PLAN_END_DATE_STORAGE_KEY = "tz_plan_end_date";

/** Format a Date as YYYY-MM-DD in the local timezone (not UTC). */
function _localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let selectedDate =
  localStorage.getItem(SELECTED_PLAN_DATE_STORAGE_KEY) ||
  _localDateStr(new Date());

function getStoredPlanStartDate() {
  return (
    localStorage.getItem(PLAN_START_DATE_STORAGE_KEY) ||
    _currentPreferences?.start_date ||
    _localDateStr(new Date())
  );
}

function getStoredPlanEndDate() {
  return localStorage.getItem(PLAN_END_DATE_STORAGE_KEY) || _currentPreferences?.end_date || "";
}

function setStoredPlanRange(startDateStr, endDateStr = "") {
  const safeStart = startDateStr || _localDateStr(new Date());
  localStorage.setItem(PLAN_START_DATE_STORAGE_KEY, safeStart);
  if (endDateStr) {
    localStorage.setItem(PLAN_END_DATE_STORAGE_KEY, endDateStr);
  } else {
    localStorage.removeItem(PLAN_END_DATE_STORAGE_KEY);
  }
}

function configuredRangeDuration() {
  const startDate = getStoredPlanStartDate();
  const endDate = getStoredPlanEndDate();
  if (!startDate || !endDate) return null;

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : null;
}

function updateTripLengthLabel() {
  const label = document.getElementById("trip-length-label");
  if (!label) return;
  const duration = getTripDuration();
  label.textContent = duration === 1 ? "1 day" : `${duration} days`;
}

function syncPlanDateInputs() {
  const startInput = document.getElementById("plan-start-date");
  const endInput = document.getElementById("plan-end-date");
  if (startInput) startInput.value = getStoredPlanStartDate();
  if (endInput) endInput.value = getStoredPlanEndDate();
  updateTripLengthLabel();
}

function savePlanRangeFromInputs() {
  const startInput = document.getElementById("plan-start-date");
  const endInput = document.getElementById("plan-end-date");
  const startDate = startInput?.value || getStoredPlanStartDate();
  const endDate = endInput?.value || "";

  if (endDate && endDate < startDate) {
    endInput.value = startDate;
    setStoredPlanRange(startDate, startDate);
  } else {
    setStoredPlanRange(startDate, endDate);
  }
  updateTripLengthLabel();
}

function setSelectedPlanDate(dateStr) {
  selectedDate = dateStr || _localDateStr(new Date());
  localStorage.setItem(SELECTED_PLAN_DATE_STORAGE_KEY, selectedDate);
  return selectedDate;
}

function getSelectedPlanDate() {
  const indexedDate =
    typeof multiDayDates !== "undefined"
      ? multiDayDates?.[currentDayIndex]
      : _localDateStr(getPlanDateForIndex(currentDayIndex));
  return selectedDate || indexedDate || _localDateStr(new Date());
}

function getDailyPlanErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const fromResponse =
    typeof extractApiErrorMessage === "function"
      ? extractApiErrorMessage(error?.responseData, "")
      : "";
  const fromError = typeof error?.message === "string" ? error.message.trim() : "";

  if (fromResponse) return fromResponse;
  if (fromError && !/^API error \d+$/i.test(fromError)) return fromError;
  return fallback;
}

function getTripDuration() {
  const rangeDuration = configuredRangeDuration();
  if (rangeDuration) return rangeDuration;

  const fromPrefs = _currentPreferences?.trip_duration;
  const fromCache =
    parseInt(localStorage.getItem("tz_trip_duration") || "1") || 1;
  const raw =
    Number.isFinite(Number(fromPrefs)) && Number(fromPrefs) > 0
      ? Number(fromPrefs)
      : fromCache;
  return Math.max(1, Math.min(30, raw));
}

async function refreshPreferences() {
  // Always fetch fresh preferences from the API so trip_duration is never stale.
  try {
    const data = await apiGet("/api/auth/me/");
    if (data) {
      _currentPreferences = data;
      if (data.trip_duration) {
        localStorage.setItem("tz_trip_duration", String(data.trip_duration));
      }
      if (!localStorage.getItem(PLAN_START_DATE_STORAGE_KEY) && data.start_date) {
        setStoredPlanRange(data.start_date, data.end_date || "");
      }
    }
  } catch {
    /* silent — we'll fall back to localStorage */
  }
  return _currentPreferences;
}

/* =========================
  Generate Daily Plan (multi-day)
========================= */

async function generateAllDays(generateBtn) {
  if (generateBtn) generateBtn.disabled = true;
  setLoading(true);

  _currentPlan = null;
  multiDayPlans = [];

  // Always pull the latest trip_duration before generating so a just-updated
  // value on the preferences page is picked up without a hard reload.
  await refreshPreferences();

  savePlanRangeFromInputs();
  const startDate = toISODate(getStoredPlanStartDate());
  const endDate = toISODate(getStoredPlanEndDate());

  try {
    const payload = {
      start_date: startDate,
    };
    if (endDate) payload.end_date = endDate;

    const data = await apiPost("/api/daily-plan/generate-multiday/", payload);

    const plans = Array.isArray(data?.plans) ? data.plans : [];
    plans.sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")),
    );

    plans.forEach((plan, index) => {
      const events = Array.isArray(plan?.events)
        ? plan.events.filter(Boolean)
        : [];
      multiDayPlans[index] = sortEventsByProximity(events);
    });

    const tripDuration = getTripDuration();
    for (let index = 0; index < tripDuration; index += 1) {
      if (!Array.isArray(multiDayPlans[index])) {
        multiDayPlans[index] = [];
      }
    }

    const firstPlan = plans[0] || null;
    _currentPlan = firstPlan;

    currentDayIndex = 0;
    setSelectedPlanDate(startDate);

    renderDaysBar();
    renderPlanForDay(0);
  } finally {
    setLoading(false);
    if (generateBtn) generateBtn.disabled = false;
  }
}

async function requestPlanForSelectedDate(generateBtn) {
  if (generateBtn) generateBtn.disabled = true;
  setLoading(true);

  try {
    await refreshPreferences();
    savePlanRangeFromInputs();

    const targetDate = _localDateStr(getPlanDateForIndex(currentDayIndex));
    const startDate = toISODate(getStoredPlanStartDate());
    const endDate = toISODate(getStoredPlanEndDate());
    const tripDuration = getTripDuration();
    const excludePlanDates = [];

    for (let index = 0; index < tripDuration; index += 1) {
      if (index === currentDayIndex) continue;
      excludePlanDates.push(_localDateStr(getPlanDateForIndex(index)));
    }

    const payload = {
      date: targetDate,
      start_date: startDate,
      seed: Date.now(),
      exclude_plan_dates: excludePlanDates,
    };
    if (endDate) payload.end_date = endDate;

    const data = await apiPost("/api/daily-plan/generate/", payload);

    const events = Array.isArray(data?.events)
      ? data.events.filter(Boolean)
      : [];
    multiDayPlans[currentDayIndex] = sortEventsByProximity(events);
    _currentPlan = data || _currentPlan;
    setSelectedPlanDate(targetDate);

    renderDaysBar();
    renderPlanForDay(currentDayIndex);

    return data;
  } finally {
    setLoading(false);
    if (generateBtn) generateBtn.disabled = false;
  }
}

function organizeEventsByTime(events) {
  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  const available = [...normalizedEvents];

  const foodCategories = new Set(["food"]);
  const activityCategories = new Set(["culture", "heritage", "shopping", "entertainment", "events"]);
  const relaxingCategories = new Set(["nature", "family"]);

  function takeFirst(predicate) {
    const index = available.findIndex(predicate);
    if (index === -1) return null;
    return available.splice(index, 1)[0];
  }

  function withLabel(event, label) {
    return event ? { ...event, itineraryLabel: label } : null;
  }

  const breakfast =
    takeFirst((event) =>
      foodCategories.has(String(event.category || "").toLowerCase()),
    ) || takeFirst(() => true);

  const activity =
    takeFirst(
      (event) =>
        activityCategories.has(String(event.category || "").toLowerCase()) ||
        !foodCategories.has(String(event.category || "").toLowerCase()),
    ) || takeFirst(() => true);

  const lunch =
    takeFirst((event) =>
      foodCategories.has(String(event.category || "").toLowerCase()),
    ) || takeFirst(() => true);

  const evening =
    takeFirst((event) =>
      relaxingCategories.has(String(event.category || "").toLowerCase()),
    ) || takeFirst(() => true);

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
  // Always re-fetch so trip_duration / budget changes on the preferences page
  // are reflected on the daily plan page without a hard reload.
  return refreshPreferences();
}

function getPlanDateForIndex(index) {
  const day = new Date(`${getStoredPlanStartDate()}T00:00:00`);
  day.setDate(day.getDate() + index);
  return day;
}

function _distanceBetween(a, b) {
  const lat1 = Number.parseFloat(a?.latitude);
  const lng1 = Number.parseFloat(a?.longitude);
  const lat2 = Number.parseFloat(b?.latitude);
  const lng2 = Number.parseFloat(b?.longitude);

  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
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

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function getDistance(a, b) {
  const latA = Number.parseFloat(a?.latitude);
  const lngA = Number.parseFloat(a?.longitude);
  const latB = Number.parseFloat(b?.latitude);
  const lngB = Number.parseFloat(b?.longitude);

  if (
    !Number.isFinite(latA) ||
    !Number.isFinite(lngA) ||
    !Number.isFinite(latB) ||
    !Number.isFinite(lngB)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const R = 6371;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLng = ((lngB - lngA) * Math.PI) / 180;

  const lat1 = (latA * Math.PI) / 180;
  const lat2 = (latB * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
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

  const tripDuration = getTripDuration();
  const start = getPlanDateForIndex(0);
  const end = getPlanDateForIndex(tripDuration - 1);

  if (tripDuration === 1) {
    weekLabel.textContent = start.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } else {
    weekLabel.textContent = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${tripDuration} days`;
  }

  weekDays.replaceChildren();

  for (let index = 0; index < tripDuration; index += 1) {
    const date = getPlanDateForIndex(index);
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "min-w-[120px] rounded-2xl border px-4 py-3 text-left transition";

    const isActive = index === currentDayIndex;
    if (isActive) {
      button.classList.add("border-brand", "bg-brand", "text-white");
    } else {
      button.classList.add(
        "border-gray-200",
        "bg-white",
        "text-gray-700",
        "hover:bg-gray-50",
      );
    }

    const dayLabel = document.createElement("div");
    dayLabel.className = "text-sm font-semibold";
    dayLabel.textContent =
      tripDuration === 1
        ? date.toLocaleDateString("en-US", { weekday: "short" })
        : `Day ${index + 1}`;

    const dayDate = document.createElement("div");
    dayDate.className = isActive
      ? "text-xs text-white/80"
      : "text-xs text-gray-500";
    dayDate.textContent = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    // Show a small dot if this day already has a plan
    const hasPlan =
      Array.isArray(multiDayPlans[index]) && multiDayPlans[index].length > 0;
    if (hasPlan && !isActive) {
      const dot = document.createElement("div");
      dot.className = "mt-1.5 w-1.5 h-1.5 rounded-full bg-brand";
      button.appendChild(dayLabel);
      button.appendChild(dayDate);
      button.appendChild(dot);
    } else {
      button.appendChild(dayLabel);
      button.appendChild(dayDate);
    }

    button.addEventListener("click", () => {
      currentDayIndex = index;
      setSelectedPlanDate(_localDateStr(date));
      renderDaysBar();
      renderPlanForDay(index);
    });

    weekDays.appendChild(button);
  }
}

function renderPlanForDay(index) {
  const activitiesDayLabel = document.getElementById("activities-day-label");
  const tripDuration = getTripDuration();
  const dayDate = getPlanDateForIndex(index);
  const dayEvents = Array.isArray(multiDayPlans[index])
    ? multiDayPlans[index]
    : [];

  if (activitiesDayLabel) {
    const dayLabel =
      tripDuration > 1
        ? `Day ${index + 1} — ${dayDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`
        : `${dayDate.toLocaleDateString("en-US", { weekday: "long" })}'s Activities`;
    activitiesDayLabel.textContent = dayLabel;
  }

  renderDailyPlan({
    ...(_currentPlan || {}),
    date: _localDateStr(dayDate),
    events: dayEvents,
  });
}

function applyMultiDayPlan(plan, preferences) {
  const events = Array.isArray(plan?.events) ? plan.events : [];
  setSelectedPlanDate(plan?.date || selectedDate);
  const start = new Date(`${getStoredPlanStartDate()}T00:00:00`);
  const selected = new Date(`${selectedDate}T00:00:00`);
  const diffDays = Math.round((selected - start) / (1000 * 60 * 60 * 24));

  _currentPreferences = preferences || _currentPreferences;

  const targetIndex =
    diffDays >= 0 && diffDays < getTripDuration() ? diffDays : 0;
  currentDayIndex = targetIndex;
  multiDayPlans[targetIndex] = sortEventsByProximity(events.filter(Boolean));

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

      header.appendChild(title);
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

    const actions = document.createElement("div");
    actions.className = "flex flex-col items-end gap-2 shrink-0";

    const actionBtn = document.createElement("a");
    const navQuery = encodeURIComponent((event.title || "") + " Riyadh");
    actionBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${navQuery}`;
    actionBtn.target = "_blank";
    actionBtn.rel = "noopener";
    actionBtn.className =
      "px-4 py-2 bg-brand text-white rounded-xl text-sm hover:opacity-90 inline-block";
    actionBtn.textContent = "Navigate";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className =
      "px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      removeBtn.disabled = true;
      removeBtn.textContent = "Removing...";
      try {
        await removeEventFromPlan(event.id);
      } catch (error) {
        removeBtn.disabled = false;
        removeBtn.textContent = "Remove";
        const planMessage = document.getElementById("plan-message");
        if (planMessage) {
          planMessage.textContent = getDailyPlanErrorMessage(
            error,
            "Unable to remove this activity.",
          );
        }
      }
    });

    actions.appendChild(actionBtn);
    actions.appendChild(removeBtn);

    card.appendChild(left);
    card.appendChild(actions);
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
      const latitude = Number.parseFloat(e.latitude);
      const longitude = Number.parseFloat(e.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        id: e.id,
        title: e.title,
        location: e.location,
        latitude,
        longitude,
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

function resetGenerateActionState() {
  setLoading(false);
  const generateBtn = document.getElementById("generate-btn");
  if (generateBtn) generateBtn.disabled = false;
}

/* =========================
   Load Current Plan
========================= */

let _currentPlan = null;

async function loadCurrentPlan() {
  // Always pull fresh preferences first so the days bar shows the correct span
  // even before any plan exists.
  await refreshPreferences();
  syncPlanDateInputs();
  const tripDuration = getTripDuration();
  multiDayPlans = [];

  try {
    const data = await apiGet("/api/daily-plan/");
    const plans = data ? (Array.isArray(data) ? data : data.results || []) : [];
    const startDate = new Date(`${getStoredPlanStartDate()}T00:00:00`);

    // Map any existing plan onto its day-offset within the current trip window.
    for (let i = 0; i < tripDuration; i += 1) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      const dayStr = _localDateStr(day);
      const match = plans.find((p) => p.date === dayStr);
      if (match && Array.isArray(match.events) && match.events.length) {
        multiDayPlans[i] = sortEventsByProximity(match.events.filter(Boolean));
        if (i === 0) _currentPlan = match;
      } else {
        multiDayPlans[i] = [];
      }
    }

    if (!_currentPlan) {
      // Fall back to the first plan we found (may be in the past) for add-activity context.
      _currentPlan = plans[0] || null;
    }

    currentDayIndex = 0;
    setSelectedPlanDate(_localDateStr(startDate));
    renderDaysBar();
    renderPlanForDay(0);
  } catch (error) {
    console.error("Failed to load current daily plan", error);
    // Even on error, still render an empty days bar so the UI is consistent.
    renderDaysBar();
    renderPlanForDay(0);
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
    results.innerHTML =
      '<p class="text-sm text-gray-400 text-center py-8">Type to search for places</p>';
    return;
  }

  results.innerHTML =
    '<p class="text-sm text-gray-400 text-center py-8">Searching...</p>';

  try {
    const data = await apiGet(
      `/api/events/?search=${encodeURIComponent(query)}`,
    );
    if (!data) return;
    const events = Array.isArray(data) ? data : data.results || [];

    if (!events.length) {
      results.innerHTML =
        '<p class="text-sm text-gray-400 text-center py-8">No places found</p>';
      return;
    }

    // Get current plan event IDs to mark already-added
    const planEventIds = new Set(
      (_currentPlan?.events || []).map((e) =>
        String(typeof e === "object" ? e.id : e),
      ),
    );

    results.innerHTML = "";
    events.slice(0, 20).forEach((ev) => {
      const alreadyAdded = planEventIds.has(String(ev.id));
      const item = document.createElement("div");
      item.className =
        "flex items-center gap-3 p-3 rounded-xl border hover:bg-gray-50 transition";
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

      item
        .querySelector(".add-to-plan-btn")
        .addEventListener("click", async (e) => {
          const btn = e.currentTarget;
          const wasAdded = btn.textContent.trim() === "Added";
          btn.disabled = true;
          btn.textContent = wasAdded ? "Removing..." : "Adding...";

          try {
            await addEventToPlan(ev.id);
            const isAdded = !wasAdded;
            btn.disabled = false;
            btn.textContent = isAdded ? "Added" : "Add";
            btn.classList.toggle("bg-brand", !isAdded);
            btn.classList.toggle("text-white", !isAdded);
            btn.classList.toggle("hover:opacity-90", !isAdded);
            btn.classList.toggle("bg-gray-100", isAdded);
            btn.classList.toggle("text-gray-400", isAdded);
            btn.classList.toggle("cursor-not-allowed", false);
          } catch (error) {
            console.error("Unable to update plan activity state", error);
            btn.disabled = false;
            btn.textContent = wasAdded ? "Added" : "Add";
          }
        });

      results.appendChild(item);
    });
  } catch {
    results.innerHTML =
      '<p class="text-sm text-red-400 text-center py-8">Failed to search</p>';
  }
}

async function addEventToPlan(eventId) {
  const normalizedEventId = Number(eventId);
  if (!Number.isFinite(normalizedEventId) || normalizedEventId <= 0) {
    throw new Error("Invalid event ID");
  }

  const targetDate = getSelectedPlanDate();

  let targetPlan =
    _currentPlan && _currentPlan.date === targetDate ? _currentPlan : null;

  if (!targetPlan) {
    const data = await apiGet("/api/daily-plan/");
    const plans = data ? (Array.isArray(data) ? data : data.results || []) : [];
    targetPlan = plans.find((plan) => plan.date === targetDate) || null;
  }

  if (targetPlan) {
    const existingIds = (targetPlan.events || []).map((e) =>
      typeof e === "object" ? e.id : Number(e),
    );
    const updatedEvents = existingIds.includes(normalizedEventId)
      ? existingIds.filter((id) => id !== normalizedEventId)
      : [...new Set([...existingIds, normalizedEventId])];
    const updated = await apiPut(`/api/daily-plan/${targetPlan.id}/`, {
      date: targetDate,
      events: updatedEvents,
    });
    if (updated) {
      _currentPlan = updated;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(updated, preferences);
    }
  } else {
    const created = await apiPost("/api/daily-plan/", {
      date: targetDate,
      events: [normalizedEventId],
    });
    if (created) {
      _currentPlan = created;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(created, preferences);
    }
  }
}

async function findPlanForDate(targetDate) {
  if (_currentPlan && _currentPlan.date === targetDate && _currentPlan.id) {
    return _currentPlan;
  }

  const data = await apiGet("/api/daily-plan/");
  const plans = data ? (Array.isArray(data) ? data : data.results || []) : [];
  return plans.find((plan) => plan.date === targetDate) || null;
}

function updateCurrentDayEvents(events, planData = null) {
  const safeEvents = sortEventsByProximity(
    (Array.isArray(events) ? events : []).filter(Boolean),
  );
  multiDayPlans[currentDayIndex] = safeEvents;

  const targetDate = getSelectedPlanDate();
  if (planData) {
    _currentPlan = planData;
  } else if (_currentPlan && _currentPlan.date === targetDate) {
    _currentPlan = {
      ..._currentPlan,
      date: targetDate,
      events: safeEvents,
      count: safeEvents.length,
    };
  }

  if (safeEvents.length === 0) {
    resetGenerateActionState();
  }

  renderDaysBar();
  renderPlanForDay(currentDayIndex);
}

async function removeEventFromPlan(eventId) {
  const normalizedEventId = Number(eventId);
  if (!Number.isFinite(normalizedEventId) || normalizedEventId <= 0) {
    throw new Error("Invalid event ID");
  }

  const currentEvents = Array.isArray(multiDayPlans[currentDayIndex])
    ? multiDayPlans[currentDayIndex]
    : [];
  const nextEvents = currentEvents.filter(
    (event) => Number(event?.id) !== normalizedEventId,
  );

  if (nextEvents.length === currentEvents.length) {
    return;
  }

  const previousEvents = [...currentEvents];
  updateCurrentDayEvents(nextEvents);

  const targetDate = getSelectedPlanDate();
  try {
    const targetPlan = await findPlanForDate(targetDate);
    if (!targetPlan?.id) {
      return;
    }

    const updated = await apiDelete(
      `/api/daily-plan/${targetPlan.id}/events/${normalizedEventId}/`,
    );
    if (updated) {
      updateCurrentDayEvents(updated.events || [], updated);
    }
  } catch (error) {
    updateCurrentDayEvents(previousEvents);
    throw error;
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
    const price =
      typeof ev === "object" && ev.price
        ? `${parseFloat(ev.price).toFixed(0)} SAR`
        : "Free";
    const category = typeof ev === "object" ? ev.category || "" : "";
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
  syncPlanDateInputs();
  initDailyPlanMap();
  loadCurrentPlan();

  document.getElementById("plan-start-date")?.addEventListener("change", () => {
    savePlanRangeFromInputs();
    currentDayIndex = 0;
    loadCurrentPlan();
  });
  document.getElementById("plan-end-date")?.addEventListener("change", () => {
    savePlanRangeFromInputs();
    currentDayIndex = 0;
    loadCurrentPlan();
  });

  // Generate AI Plan (multi-day)
  const generateBtn = document.getElementById("generate-btn");
  generateBtn?.addEventListener("click", async () => {
    const message = document.getElementById("plan-message");
    try {
      const currentDayEvents = Array.isArray(multiDayPlans[currentDayIndex])
        ? multiDayPlans[currentDayIndex].filter(Boolean)
        : [];
      const hasCurrentDayPlan = currentDayEvents.length > 0;
      const isSpecificDayRegeneration =
        Array.isArray(multiDayPlans[currentDayIndex]) &&
        (currentDayIndex > 0 || !hasCurrentDayPlan);

      if (isSpecificDayRegeneration) {
        await requestPlanForSelectedDate(generateBtn);
      } else {
        await generateAllDays(generateBtn);
      }

      if (message) message.textContent = "";
    } catch (error) {
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
          getDailyPlanErrorMessage(error, "Invalid request. Please try again.");
      } else if (error.status === 404) {
        message.innerHTML =
          `No places match your current preferences (interests, rating, or budget).&nbsp;` +
          `<a href="/onboarding/" ` +
          `class="underline text-brand font-medium hover:opacity-80">` +
          `Adjust preferences →</a>`;
      } else if (error.status === 500) {
        message.textContent =
          getDailyPlanErrorMessage(
            error,
            "Server error while generating your trip. Please try again.",
          );
      } else {
        message.textContent = getDailyPlanErrorMessage(error);
      }
    }
  });

  // Add Activity modal
  document
    .getElementById("add-activity-btn")
    ?.addEventListener("click", openAddActivityModal);
  document
    .getElementById("closeAddActivity")
    ?.addEventListener("click", closeAddActivityModal);
  document
    .getElementById("addActivityOverlay")
    ?.addEventListener("click", closeAddActivityModal);

  document
    .getElementById("activitySearchInput")
    ?.addEventListener("input", (e) => {
      clearTimeout(_activityDebounce);
      _activityDebounce = setTimeout(
        () => searchActivities(e.target.value),
        350,
      );
    });

  // Export Plan
  document
    .getElementById("export-plan-btn")
    ?.addEventListener("click", exportPlan);
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

  (Array.isArray(points) ? points : []).forEach((event) => {
    const lat = Number.parseFloat(event.latitude);
    const lng = Number.parseFloat(event.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    const marker = new google.maps.Marker({
      position: {
        lat: lat,
        lng: lng,
      },
      map: map,
      title: event.title,
    });

    window.__TZ_DP_MARKERS[event.id] = marker;

    marker.addListener("click", () => {
      info.setContent(
        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(event.title)}</div>
         <div style="font-size:12px;opacity:.85;">${escapeHtml(event.location)}</div>`,
      );
      info.open({ anchor: marker, map });
    });

    bounds.extend({
      lat: lat,
      lng: lng,
    });
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
  loadCarousel(
    "restaurantsCarousel",
    "restaurantsSection",
    "food",
    "Food",
  );
  loadCarousel("activitiesCarousel", "activitiesSection", "nature", "Nature");
  loadUpcomingCarousel();
});
