let multiDayPlans = [];
let currentDayIndex = 0;
let _currentPreferences = null;
let _slotAssignmentsByDay = {};
let _slotFeedbackByDay = {};
let _slotBlockedIdsByDay = {};
let _replacementCandidatesCache = new Map();
let _isPlanLoading = false;
let _preferencesLoadFailed = false;
let _lastPlanRequestFailed = false;
const SELECTED_PLAN_DATE_STORAGE_KEY = "tz_selected_plan_date";
const PLAN_START_DATE_STORAGE_KEY = "tz_plan_start_date";
const PLAN_END_DATE_STORAGE_KEY = "tz_plan_end_date";
const normalizeApiDate =
  typeof window !== "undefined" && typeof window.toISODate === "function"
    ? window.toISODate.bind(window)
    : (dateStr) => dateStr || null;
const SLOT_LABELS = {
  breakfast: "Breakfast",
  activity: "Activity",
  lunch: "Lunch",
  evening: "Evening",
};
const CLEAN_SLOT_DEFINITIONS = [
  { key: "breakfast", label: SLOT_LABELS.breakfast },
  { key: "activity", label: SLOT_LABELS.activity },
  { key: "lunch", label: SLOT_LABELS.lunch },
  { key: "evening", label: SLOT_LABELS.evening },
];
const SLOT_DEFINITIONS = [
  { key: "breakfast", label: SLOT_LABELS.breakfast },
  { key: "activity", label: SLOT_LABELS.activity },
  { key: "lunch", label: SLOT_LABELS.lunch },
  { key: "evening", label: SLOT_LABELS.evening },
];
const SLOT_LIMITS = {
  breakfast: 1,
  activity: 3,
  lunch: 1,
  evening: 3,
};

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

function normalizePlanEvent(event, index = 0) {
  if (!event || typeof event !== "object") return null;
  return {
    ...event,
    plan_id: Number.isFinite(Number(event.plan_id)) ? Number(event.plan_id) : null,
    plan_date: event.plan_date || null,
    slot_type: event.slot_type || null,
    item_order: Number.isFinite(Number(event.item_order)) ? Number(event.item_order) : index,
    plan_item_id: Number.isFinite(Number(event.plan_item_id)) ? Number(event.plan_item_id) : null,
    locked: Boolean(event.locked),
    plan_item_source: event.plan_item_source || null,
  };
}

function normalizePlanPayload(plan) {
  const rawItems = Array.isArray(plan?.items) ? plan.items.filter(Boolean) : [];
  const itemBackedEvents = rawItems
    .map((item, index) => {
      if (!item?.event || typeof item.event !== "object") return null;
      return normalizePlanEvent(
        {
          ...item.event,
          plan_id: plan?.id || null,
          plan_date: plan?.date || null,
          slot_type: item.slot_type || null,
          item_order: item.order,
          plan_item_id: item.id,
          locked: item.locked,
          plan_item_source: item.source,
        },
        index,
      );
    })
    .filter(Boolean)
    .sort((a, b) => {
      const orderDiff = Number(a.item_order || 0) - Number(b.item_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(a.id || 0) - Number(b.id || 0);
    });

  const fallbackEvents = Array.isArray(plan?.events)
    ? plan.events
        .map((event, index) =>
          normalizePlanEvent(
            {
              ...event,
              plan_id: plan?.id || null,
              plan_date: plan?.date || null,
            },
            index,
          ),
        )
        .filter(Boolean)
    : [];
  const normalizedEvents = itemBackedEvents.length ? itemBackedEvents : fallbackEvents;

  return {
    ...(plan || {}),
    items: rawItems,
    events: normalizedEvents,
    count: normalizedEvents.length,
  };
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

function showPlanMessage(text, tone = "info") {
  const message = document.getElementById("plan-message");
  if (!message) return;

  message.textContent = text || "";
  message.classList.remove("text-red-500", "text-green-600", "text-gray-500");
  if (tone === "error") {
    message.classList.add("text-red-500");
  } else if (tone === "success") {
    message.classList.add("text-green-600");
  } else {
    message.classList.add("text-gray-500");
  }
}

function getCurrentLanguage() {
  return document.documentElement.lang === "ar" ? "ar" : "en";
}

function getGenerateButtonLabel(isLoading = false) {
  const generateBtn = document.getElementById("generate-plan-btn");
  const lang = getCurrentLanguage();
  if (isLoading) {
    return lang === "ar" ? "جارٍ التحميل..." : "Loading...";
  }
  if (!generateBtn) {
    return lang === "ar" ? "إنشاء خطة بالذكاء الاصطناعي" : "Generate AI Plan";
  }
  return lang === "ar"
    ? (generateBtn.dataset.labelAr || "إنشاء خطة بالذكاء الاصطناعي")
    : (generateBtn.dataset.labelEn || "Generate AI Plan");
}

function setGenerateButtonLabel(isLoading = false) {
  const label = document.getElementById("generate-plan-btn-label");
  if (!label) return;
  label.textContent = getGenerateButtonLabel(isLoading);
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
    _preferencesLoadFailed = false;
    if (data) {
      _currentPreferences = data;
      if (data.trip_duration) {
        localStorage.setItem("tz_trip_duration", String(data.trip_duration));
      }
      if (!localStorage.getItem(PLAN_START_DATE_STORAGE_KEY) && data.start_date) {
        setStoredPlanRange(data.start_date, data.end_date || "");
      }
    }
  } catch (error) {
    _preferencesLoadFailed = true;
    console.error("Failed to refresh preferences", error);
    /* fall back to localStorage */
  }
  return _currentPreferences;
}

function _hasMeaningfulPreferences() {
  const interests = Array.isArray(_currentPreferences?.interests)
    ? _currentPreferences.interests.filter(Boolean)
    : [];
  const startDate =
    _currentPreferences?.start_date || localStorage.getItem(PLAN_START_DATE_STORAGE_KEY);
  const endDate =
    _currentPreferences?.end_date || localStorage.getItem(PLAN_END_DATE_STORAGE_KEY);
  const tripDuration = Number.parseInt(
    _currentPreferences?.trip_duration || localStorage.getItem("tz_trip_duration") || "",
    10,
  );

  return Boolean(
    interests.length > 0 &&
    startDate &&
    (endDate || (Number.isFinite(tripDuration) && tripDuration > 0)),
  );
}

async function ensurePlanGenerationReady() {
  await refreshPreferences();

  if (_preferencesLoadFailed) {
    showPlanMessage("Could not refresh preferences. Trying plan generation anyway.", "error");
  }

  const interests = Array.isArray(_currentPreferences?.interests)
    ? _currentPreferences.interests.filter(Boolean)
    : [];
  if (!interests.length) {
    alert("Please set your preferences first");
    window.location.href = "/onboarding/";
    return false;
  }

  return true;
}

/* =========================
  Generate Daily Plan (multi-day)
========================= */

async function generateAllDays(generateBtn) {
  if (generateBtn) {
    generateBtn.disabled = true;
    setGenerateButtonLabel(true);
  }
  setLoading(true);

  _currentPlan = null;
  multiDayPlans = [];
  _slotAssignmentsByDay = {};
  _slotFeedbackByDay = {};
  _slotBlockedIdsByDay = {};
  _lastPlanRequestFailed = false;

  // Always pull the latest trip_duration before generating so a just-updated
  // value on the preferences page is picked up without a hard reload.
  await refreshPreferences();

  savePlanRangeFromInputs();
  const startDate = normalizeApiDate(getStoredPlanStartDate());
  const endDate = normalizeApiDate(getStoredPlanEndDate());

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
      const normalizedPlan = normalizePlanPayload(plan);
      multiDayPlans[index] = normalizedPlan.events;
    });

    const tripDuration = getTripDuration();
    for (let index = 0; index < tripDuration; index += 1) {
      if (!Array.isArray(multiDayPlans[index])) {
        multiDayPlans[index] = [];
      }
    }

    const firstPlan = plans[0] ? normalizePlanPayload(plans[0]) : null;
    _currentPlan = firstPlan;

    currentDayIndex = 0;
    setSelectedPlanDate(startDate);

    renderDaysBar();
    renderPlanForDay(0);
    showPlanMessage("Plan generated successfully", "success");
  } finally {
    setLoading(false);
    if (generateBtn) {
      generateBtn.disabled = false;
      setGenerateButtonLabel(false);
    }
  }
}

async function requestPlanForSelectedDate(generateBtn) {
  if (generateBtn) {
    generateBtn.disabled = true;
    setGenerateButtonLabel(true);
  }
  setLoading(true);

  try {
    _lastPlanRequestFailed = false;
    await refreshPreferences();
    savePlanRangeFromInputs();

    const targetDate = _localDateStr(getPlanDateForIndex(currentDayIndex));
    const startDate = normalizeApiDate(getStoredPlanStartDate());
    const endDate = normalizeApiDate(getStoredPlanEndDate());
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

    const data = normalizePlanPayload(
      await apiPost("/api/daily-plan/generate/", payload),
    );

    const events = Array.isArray(data?.events)
      ? data.events.filter(Boolean)
      : [];
    delete _slotAssignmentsByDay[currentDayIndex];
    delete _slotFeedbackByDay[currentDayIndex];
    delete _slotBlockedIdsByDay[currentDayIndex];
    multiDayPlans[currentDayIndex] = events;
    _currentPlan = data || _currentPlan;
    setSelectedPlanDate(targetDate);

    renderDaysBar();
    renderPlanForDay(currentDayIndex);
    showPlanMessage("Plan generated successfully", "success");

    return data;
  } finally {
    setLoading(false);
    if (generateBtn) {
      generateBtn.disabled = false;
      setGenerateButtonLabel(false);
    }
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
    withLabel(breakfast, "Breakfast"),
    withLabel(activity, "Activity"),
    withLabel(lunch, "Lunch"),
    withLabel(evening, "Evening"),
  ].filter(Boolean);

  available.forEach((event) => {
    structured.push({ ...event, itineraryLabel: "Evening" });
  });

  return structured;
}

function slotLabelForKey(slotKey) {
  return CLEAN_SLOT_DEFINITIONS.find((slot) => slot.key === slotKey)?.label || "Evening";
}

function getSlotLimit(slotKey) {
  return SLOT_LIMITS[slotKey] || 1;
}

function cloneSlotAssignments(assignments = {}) {
  return {
    breakfast: Array.isArray(assignments.breakfast) ? [...assignments.breakfast] : [],
    activity: Array.isArray(assignments.activity) ? [...assignments.activity] : [],
    lunch: Array.isArray(assignments.lunch) ? [...assignments.lunch] : [],
    evening: Array.isArray(assignments.evening) ? [...assignments.evening] : [],
  };
}

function createSlotPlaceholder(slotKey, slotIndex = 0) {
  return {
    id: `placeholder-${slotKey}-${slotIndex}`,
    _placeholder: true,
    slotKey,
    slotIndex,
    itineraryLabel: slotLabelForKey(slotKey),
    title: "No activity selected",
    location: "",
    price: null,
  };
}

function getWhyThisPlaceHint(event) {
  const category = String(event?.category || "").toLowerCase();
  if (category === "food") return "Great food option based on your preferences";
  if (category === "nature") return "Relaxing outdoor experience";
  if (category === "entertainment") return "Popular activity for your trip";
  if (category === "culture" || category === "heritage") {
    return "Explore local culture and history";
  }
  return "Recommended for your trip";
}

function allowsCategoryForSlot(slotKey, event) {
  const category = String(event?.category || "").toLowerCase();
  if (slotKey === "breakfast" || slotKey === "lunch") return category === "food";
  if (slotKey === "activity") return category !== "food";
  if (slotKey === "evening") return category !== "food";
  return true;
}

function getDaySlotAssignments(events, dayIndex = currentDayIndex) {
  const existingAssignments = _slotAssignmentsByDay[dayIndex];
  if (existingAssignments) return cloneSlotAssignments(existingAssignments);

  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  const hasExplicitSlots = normalizedEvents.some((event) => typeof event?.slot_type === "string" && event.slot_type);
  const orderedIds = normalizedEvents
    .map((event) => Number(event?.id))
    .filter((id) => Number.isFinite(id));
  const assignments = {
    breakfast: [],
    activity: [],
    lunch: [],
    evening: [],
  };

  if (!orderedIds.length) {
    _slotAssignmentsByDay[dayIndex] = cloneSlotAssignments(assignments);
    return cloneSlotAssignments(assignments);
  }

  if (hasExplicitSlots) {
    const orderedEvents = [...normalizedEvents].sort((a, b) => {
      const orderDiff =
        Number(a?.item_order ?? Number.MAX_SAFE_INTEGER) -
        Number(b?.item_order ?? Number.MAX_SAFE_INTEGER);
      if (orderDiff !== 0) return orderDiff;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

    orderedEvents.forEach((event) => {
      const slotKey = String(event?.slot_type || "").toLowerCase();
      const eventId = Number(event?.id);
      if (!SLOT_LIMITS[slotKey] || !Number.isFinite(eventId)) return;
      if (assignments[slotKey].length >= getSlotLimit(slotKey)) return;
      assignments[slotKey].push(eventId);
    });

    _slotAssignmentsByDay[dayIndex] = cloneSlotAssignments(assignments);
    return cloneSlotAssignments(assignments);
  }

  if (orderedIds.length === 1) {
    assignments.breakfast = [orderedIds[0]];
  } else if (orderedIds.length === 2) {
    assignments.breakfast = [orderedIds[0]];
    assignments.evening = [orderedIds[1]];
  } else if (orderedIds.length === 3) {
    assignments.breakfast = [orderedIds[0]];
    assignments.activity = [orderedIds[1]];
    assignments.evening = [orderedIds[2]];
  } else {
    const lastIndex = orderedIds.length - 1;
    const lunchIndex = Math.min(3, lastIndex - 1);

    assignments.breakfast = [orderedIds[0]];
    assignments.lunch = [orderedIds[lunchIndex]];
    assignments.evening = [orderedIds[lastIndex]];
    assignments.activity = orderedIds
      .filter((_, index) => index !== 0 && index !== lunchIndex && index !== lastIndex)
      .slice(0, getSlotLimit("activity"));
  }

  _slotAssignmentsByDay[dayIndex] = cloneSlotAssignments(assignments);
  return cloneSlotAssignments(assignments);
}

function buildStructuredSlots(events, dayIndex = currentDayIndex) {
  const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  const hasExplicitSlots = normalizedEvents.some((event) => typeof event?.slot_type === "string" && event.slot_type);

  if (hasExplicitSlots) {
    return CLEAN_SLOT_DEFINITIONS.map((slot) => {
      const items = normalizedEvents
        .filter((event) => String(event?.slot_type || "").toLowerCase() === slot.key)
        .sort((a, b) => {
          const orderDiff =
            Number(a?.item_order ?? Number.MAX_SAFE_INTEGER) -
            Number(b?.item_order ?? Number.MAX_SAFE_INTEGER);
          if (orderDiff !== 0) return orderDiff;
          return Number(a?.id || 0) - Number(b?.id || 0);
        })
        .slice(0, getSlotLimit(slot.key))
        .map((event, slotIndex) => ({
          ...event,
          slotKey: slot.key,
          slotIndex,
          itineraryLabel: slot.label,
        }));

      return {
        key: slot.key,
        label: slot.label,
        items: items.length ? items : [createSlotPlaceholder(slot.key)],
      };
    });
  }

  const assignments = getDaySlotAssignments(normalizedEvents, dayIndex);
  const eventById = new Map(
    normalizedEvents
      .filter((event) => Number.isFinite(Number(event?.id)))
      .map((event) => [Number(event.id), event]),
  );

  return CLEAN_SLOT_DEFINITIONS.map((slot) => {
    const assignedIds = Array.isArray(assignments[slot.key]) ? assignments[slot.key] : [];
    const items = assignedIds
      .map((assignedId, slotIndex) => {
        const assignedEvent = Number.isFinite(Number(assignedId))
          ? eventById.get(Number(assignedId))
          : null;
        if (!assignedEvent) return null;
        return {
          ...assignedEvent,
          slotKey: slot.key,
          slotIndex,
          itineraryLabel: slot.label,
        };
      })
      .filter(Boolean);

    return {
      key: slot.key,
      label: slot.label,
      items: items.length ? items : [createSlotPlaceholder(slot.key)],
    };
  });
}

function buildStructuredSlotEvents(events, dayIndex = currentDayIndex) {
  return buildStructuredSlots(events, dayIndex);
}

window.buildStructuredSlotEvents = buildStructuredSlotEvents;

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
    weekLabel.textContent = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} | ${tripDuration} days`;
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
  const dayEvents = getActiveDayEvents(index);
  const activeDate = _localDateStr(dayDate);

  if (activitiesDayLabel) {
    const dayLabel =
      tripDuration > 1
        ? `Day ${index + 1} - ${dayDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`
        : `${dayDate.toLocaleDateString("en-US", { weekday: "long" })}'s Activities`;
    activitiesDayLabel.textContent = dayLabel;
  }

  _currentPlan = {
    ...(_currentPlan || {}),
    id: Number.isFinite(Number(dayEvents[0]?.plan_id)) ? Number(dayEvents[0].plan_id) : null,
    date: activeDate,
    events: dayEvents,
    count: dayEvents.length,
  };

  renderDailyPlan({
    date: activeDate,
    events: dayEvents,
  });
}

function applyMultiDayPlan(plan, preferences) {
  const normalizedPlan = normalizePlanPayload(plan);
  const events = Array.isArray(normalizedPlan?.events) ? normalizedPlan.events : [];
  setSelectedPlanDate(normalizedPlan?.date || selectedDate);
  const start = new Date(`${getStoredPlanStartDate()}T00:00:00`);
  const selected = new Date(`${selectedDate}T00:00:00`);
  const diffDays = Math.round((selected - start) / (1000 * 60 * 60 * 24));

  _currentPreferences = preferences || _currentPreferences;

  const targetIndex =
    diffDays >= 0 && diffDays < getTripDuration() ? diffDays : 0;
  currentDayIndex = targetIndex;
  delete _slotAssignmentsByDay[targetIndex];
  delete _slotFeedbackByDay[targetIndex];
  delete _slotBlockedIdsByDay[targetIndex];
  multiDayPlans[targetIndex] = events.filter(Boolean);
  _currentPlan = normalizedPlan;

  renderDaysBar();
  renderPlanForDay(currentDayIndex);
}

function getRenderedDayEvents(dayIndex = currentDayIndex) {
  const rawEvents = Array.isArray(multiDayPlans[dayIndex]) ? multiDayPlans[dayIndex] : [];
  return rawEvents.filter(Boolean);
}

function getActiveDayEvents(dayIndex = currentDayIndex) {
  return Array.isArray(multiDayPlans[dayIndex])
    ? multiDayPlans[dayIndex].filter(Boolean)
    : [];
}

function collectAllRenderedPlanEvents() {
  return multiDayPlans
    .flatMap((_, dayIndex) => {
      const slots = buildStructuredSlots(getRenderedDayEvents(dayIndex), dayIndex);
      return slots.flatMap((slot) => slot.items);
    })
    .filter((event) => event && !event._placeholder);
}

function refreshPlanSummaryAndMap(dayIndex = currentDayIndex) {
  const structuredSlots = buildStructuredSlots(getRenderedDayEvents(dayIndex), dayIndex);
  const currentDayEvents = structuredSlots
    .flatMap((slot) => slot.items)
    .filter((event) => event && !event._placeholder);

  renderTripSummary(currentDayEvents);
  updateMapPlaceholderLink(currentDayEvents);
}

function updateMapPlaceholderLink(events) {
  const mapLink = document.getElementById("daily-plan-map-link");
  if (!mapLink) return;

  const safeEvents = Array.isArray(events) ? events.filter(Boolean) : [];
  const query = safeEvents.length
    ? safeEvents.map((event) => event.title || "").filter(Boolean).join(" Riyadh ")
    : "Riyadh";
  mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function updatePlanPageState(hasPlan) {
  const readySection = document.getElementById("plan-status-ready");
  const emptySection = document.getElementById("plan-empty-state");
  const generateBtn = document.getElementById("generate-plan-btn");
  const addActivityBtn = document.getElementById("add-activity-btn");

  if (readySection) {
    readySection.classList.toggle("hidden", !hasPlan);
  }
  if (emptySection) {
    emptySection.classList.toggle("hidden", hasPlan);
  }
  if (generateBtn) {
    generateBtn.classList.toggle("hidden", hasPlan);
  }
  if (addActivityBtn) {
    addActivityBtn.classList.toggle("hidden", !hasPlan);
  }
}

function createSlotCard(slotKey, event, itemIndex) {
  const card = document.createElement("div");
  card.className = event._placeholder
    ? "bg-white border rounded-2xl p-4 mb-4 shadow-sm flex flex-col items-center text-center gap-3"
    : "bg-white border rounded-2xl p-5 mb-4 shadow-sm transition hover:shadow-md";

  const content = document.createElement("div");
  content.className = event._placeholder ? "space-y-1 text-center" : "space-y-2";

  const slotBadge = document.createElement("div");
  slotBadge.className =
    "inline-flex items-center rounded-full bg-brand/10 text-brand text-xs font-semibold px-2.5 py-1";
  slotBadge.textContent = event.itineraryLabel || slotLabelForKey(slotKey);

  const title = document.createElement("div");
  title.className = event._placeholder ? "text-base font-medium text-gray-500" : "text-lg font-semibold text-gray-900 truncate";
  title.textContent = event._placeholder ? "No activity selected" : (event.title || "");

  const categoryBadge = document.createElement("span");
  categoryBadge.className =
    "inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600";
  categoryBadge.textContent = _formatCategoryLabel(event.category || "");

  const whyHint = document.createElement("div");
  whyHint.className = "text-xs text-gray-400";
  whyHint.textContent = event._placeholder ? "" : getWhyThisPlaceHint(event);

  const location = document.createElement("div");
  location.className = "text-sm text-gray-500";
  location.textContent = event.location || "";

  const price = document.createElement("div");
  price.className = "text-sm text-gray-500";
  const parsedPrice = Number.parseFloat(event.price);
  price.textContent = event._placeholder
    ? ""
    : Number.isFinite(parsedPrice)
      ? `${parsedPrice.toFixed(0)} SAR`
      : "Free";

  content.appendChild(slotBadge);
  content.appendChild(title);
  if (!event._placeholder && event.category) {
    content.appendChild(categoryBadge);
  }
  content.appendChild(whyHint);
  if (!event._placeholder) {
    content.appendChild(location);
    content.appendChild(price);
  }

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "flex items-center gap-2 mt-3";

  const actionBaseClass =
    "flex-1 px-3 py-2 text-sm rounded-lg h-10 flex items-center justify-center";

  const navigateBtn = document.createElement("a");
  const navQuery = encodeURIComponent((event.title || "") + " Riyadh");
  navigateBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${navQuery}`;
  navigateBtn.target = "_blank";
  navigateBtn.rel = "noopener";
  navigateBtn.className = `${actionBaseClass} bg-purple-600 text-white`;
  navigateBtn.textContent = "Navigate";
  if (event._placeholder) {
    navigateBtn.classList.add("hidden");
  }

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = `${actionBaseClass} border border-gray-300 text-gray-600`;
  replaceBtn.textContent = "Try Another";
  replaceBtn.addEventListener("click", async () => {
    replaceBtn.disabled = true;
    replaceBtn.textContent = "Loading...";
    try {
      await replaceActivityForSlot(
        slotKey,
        event._placeholder ? null : event.id,
        {
          dayIndex: currentDayIndex,
          itemIndex,
        },
      );
    } catch (error) {
      console.error("Plan update failed:", error);
      replaceBtn.disabled = false;
      replaceBtn.textContent = "Try Another";
      showPlanMessage(
        getDailyPlanErrorMessage(error, "No alternative available"),
        "error",
      );
    }
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = `${actionBaseClass} border border-red-300 text-red-500`;
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", async () => {
    removeBtn.disabled = true;
    removeBtn.textContent = "Removing...";
      try {
        await removeEventFromPlan(event.id, slotKey, {
          dayIndex: currentDayIndex,
          itemIndex,
          itemId: event.plan_item_id,
        });
      } catch (error) {
      console.error("Plan update failed:", error);
      removeBtn.disabled = false;
      removeBtn.textContent = "Remove";
      showPlanMessage(
        getDailyPlanErrorMessage(error, "Unable to remove this activity."),
        "error",
      );
    }
  });
  if (event._placeholder) {
    removeBtn.classList.add("hidden");
  }

  const feedback = document.createElement("div");
  feedback.className = "text-xs text-green-600 mt-2";
  feedback.textContent = _slotFeedbackByDay[currentDayIndex]?.[slotKey] || "";

  actionsWrap.appendChild(navigateBtn);
  actionsWrap.appendChild(replaceBtn);
  actionsWrap.appendChild(removeBtn);

  card.appendChild(content);
  card.appendChild(actionsWrap);
  card.appendChild(feedback);

  return card;
}

function renderSlotSection(slotKey, dayIndex = currentDayIndex) {
  const sectionBody = document.querySelector(`[data-slot-body="${slotKey}"]`);
  if (!sectionBody) {
    renderPlanForDay(dayIndex);
    return;
  }

  const slot = buildStructuredSlots(getRenderedDayEvents(dayIndex), dayIndex)
    .find((entry) => entry.key === slotKey);
  if (!slot) return;

  sectionBody.replaceChildren();
  slot.items.forEach((event, itemIndex) => {
    sectionBody.appendChild(createSlotCard(slotKey, event, itemIndex));
  });
}

function _distanceBetweenEvents(a, b) {
  const lat1 = Number.parseFloat(a?.latitude);
  const lng1 = Number.parseFloat(a?.longitude);
  const lat2 = Number.parseFloat(b?.latitude);
  const lng2 = Number.parseFloat(b?.longitude);
  if (
    !Number.isFinite(lat1) || !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) || !Number.isFinite(lng2)
  ) {
    return null;
  }
  const latDiff = lat1 - lat2;
  const lngDiff = lng1 - lng2;
  return Math.sqrt((latDiff * latDiff) + (lngDiff * lngDiff));
}

function _areNearbyEvents(a, b) {
  const distance = _distanceBetweenEvents(a, b);
  return distance !== null && distance <= 0.05;
}

function _firstMappedEvent(slot) {
  return (slot?.items || []).find((event) => event && !event._placeholder) || null;
}

function _extractAreaLabel(event) {
  const rawLocation = String(event?.location || "").trim();
  if (!rawLocation) return "";
  const firstPart = rawLocation.split(",")[0]?.trim();
  return firstPart || rawLocation;
}

function _formatCategoryLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildWhyThisPlanText() {
  const interests = Array.isArray(_currentPreferences?.interests)
    ? _currentPreferences.interests.filter(Boolean)
    : [];
  const topInterests = interests.slice(0, 2).map(_formatCategoryLabel);

  if (!topInterests.length) {
    return "This plan is optimized for a balanced Riyadh experience.";
  }

  if (topInterests.length === 1) {
    return `This plan is based on your interest in ${topInterests[0]}, and optimized for nearby locations.`;
  }

  return `This plan is based on your interest in ${topInterests[0]} and ${topInterests[1]}, and optimized for nearby locations.`;
}

function renderTripSummary(events) {
  const section = document.getElementById("trip-summary-section");
  const totalEl = document.getElementById("trip-summary-total");
  const categoryEl = document.getElementById("trip-summary-category");
  const foodEl = document.getElementById("trip-summary-food");
  const experiencesEl = document.getElementById("trip-summary-experiences");
  const areaEl = document.getElementById("trip-summary-area");
  const whyEl = document.getElementById("trip-summary-why");
  if (!section || !totalEl || !categoryEl || !foodEl || !experiencesEl || !areaEl || !whyEl) return;

  const safeEvents = Array.isArray(events) ? events.filter((event) => event && !event._placeholder) : [];
  if (!safeEvents.length) {
    section.classList.add("hidden");
    const whyEl = document.getElementById("trip-summary-why");
    if (whyEl) whyEl.textContent = "";
    return;
  }

  const categoryCounts = {};
  const areaCounts = {};
  let foodCount = 0;

  safeEvents.forEach((event) => {
    const category = String(event.category || "").toLowerCase();
    if (category) {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (category === "food") foodCount += 1;
    }

    const area = _extractAreaLabel(event);
    if (area) {
      areaCounts[area] = (areaCounts[area] || 0) + 1;
    }
  });

  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  const mainArea = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Across Riyadh";
  const experiencesCount = safeEvents.length - foodCount;

  totalEl.textContent = String(safeEvents.length);
  categoryEl.textContent = _formatCategoryLabel(topCategory || "-");
  foodEl.textContent = String(foodCount);
  experiencesEl.textContent = String(experiencesCount);
  areaEl.textContent = `Mostly in: ${mainArea}`;
  whyEl.textContent = buildWhyThisPlanText();
  section.classList.remove("hidden");
}

/* =========================
   Render Daily Plan
========================= */

function renderDailyPlan(data) {
  const container = document.getElementById("plan-container");
  const message = document.getElementById("plan-message");
  if (!container) return;

  container.replaceChildren();

   if (_isPlanLoading) {
    return;
  }

  const rawEvents = Array.isArray(data?.events) ? data.events.filter(Boolean) : [];
  if (!rawEvents.length && !_slotAssignmentsByDay[currentDayIndex]) {
    updatePlanPageState(false);
    renderTripSummary([]);
    return;
  }
  updatePlanPageState(true);
  const slots = buildStructuredSlots(rawEvents, currentDayIndex);
  const dayTitle = document.getElementById("activities-day-label");
  const dayTitleWrap = dayTitle?.closest("h2")?.parentElement;
  if (dayTitleWrap && !dayTitleWrap.querySelector("[data-nearby-hint]")) {
    const hint = document.createElement("p");
    hint.className = "text-sm text-gray-500";
    hint.dataset.nearbyHint = "true";
    hint.textContent = "Optimized for nearby locations";
    dayTitleWrap.appendChild(hint);
  }

  let previousMappedEvent = null;

  slots.forEach((slot) => {
    try {
      const section = document.createElement("section");
      if (!section) {
        console.warn("Missing section for slot", slot);
        return;
      }
      section.className = "mt-6 first:mt-0 space-y-3";

      const header = document.createElement("div");
      header.className = "flex items-end justify-between gap-3 pb-1";

      const title = document.createElement("h3");
      title.className = "text-lg font-semibold text-gray-900";
      title.textContent = slot.label;

      header.appendChild(title);
      const currentMappedEvent = _firstMappedEvent(slot);
      if (_areNearbyEvents(previousMappedEvent, currentMappedEvent)) {
        const sameAreaLabel = document.createElement("span");
        sameAreaLabel.className =
          "inline-flex items-center rounded-full bg-brand/10 text-brand text-xs font-semibold px-2.5 py-1";
        sameAreaLabel.textContent = "Same Area";
        header.appendChild(sameAreaLabel);
      }
      section.appendChild(header);

      const body = document.createElement("div");
      body.className = "space-y-3";
      body.dataset.slotBody = slot.key;
      section.appendChild(body);

      container.appendChild(section);
      renderSlotSection(slot.key, currentDayIndex);
      if (currentMappedEvent) {
        previousMappedEvent = currentMappedEvent;
      }
    } catch (e) {
      console.warn("Render failed", e);
    }
  });

  if (message && !message.textContent) message.innerText = "";
  refreshPlanSummaryAndMap(currentDayIndex);
}

/* =========================
   Loading State
========================= */

function setLoading(isLoading) {
  _isPlanLoading = isLoading;
  if (isLoading) {
    showPlanMessage("Loading...");
    return;
  }

  const message = document.getElementById("plan-message");
  if (!message) return;
  if (message.classList.contains("text-gray-500")) {
    message.innerText = "";
  }
}

function resetGenerateActionState() {
  setLoading(false);
  const generateBtn = document.getElementById("generate-plan-btn");
  if (generateBtn) generateBtn.disabled = false;
}

/* =========================
   Load Current Plan
========================= */

let _currentPlan = null;

async function loadCurrentPlan() {
  try {
    // Always pull fresh preferences first so the days bar shows the correct span
    // even before any plan exists.
    _lastPlanRequestFailed = false;
    await refreshPreferences();
    syncPlanDateInputs();
    const tripDuration = getTripDuration();
    multiDayPlans = [];
    _slotAssignmentsByDay = {};
    _slotFeedbackByDay = {};
    _slotBlockedIdsByDay = {};

    const data = await apiGet("/api/daily-plan/");
    const plans = data
      ? (Array.isArray(data) ? data : data.results || []).map((plan) => normalizePlanPayload(plan))
      : [];
    const startDate = new Date(`${getStoredPlanStartDate()}T00:00:00`);

    // Map any existing plan onto its day-offset within the current trip window.
    for (let i = 0; i < tripDuration; i += 1) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      const dayStr = _localDateStr(day);
      const match = plans.find((p) => p.date === dayStr);
      if (match && Array.isArray(match.events) && match.events.length) {
        multiDayPlans[i] = match.events.filter(Boolean);
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
    _lastPlanRequestFailed = true;
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
    const targetDate = getSelectedPlanDate();
    const data = await apiGet(
      `/api/events/?search=${encodeURIComponent(query)}&date=${encodeURIComponent(targetDate)}`,
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
      getActiveDayEvents().map((e) =>
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
  } catch (error) {
    console.error("Failed to search activities", error);
    results.innerHTML =
      '<p class="text-sm text-red-400 text-center py-8">Failed to search</p>';
  }
}

async function addEventToPlan(eventId, options = {}) {
  const normalizedEventId = Number(eventId);
  if (!Number.isFinite(normalizedEventId) || normalizedEventId <= 0) {
    throw new Error("Invalid event ID");
  }

  const targetDate = getSelectedPlanDate();
  const slotKey = options.slotKey || "activity";

  let targetPlan = await findPlanForDate(targetDate);
  const activeEvents = getActiveDayEvents();
  const existingEvent = activeEvents.find(
    (event) => Number(event?.id) === normalizedEventId,
  );

  if (existingEvent && targetPlan?.id && existingEvent.plan_item_id) {
    const updated = normalizePlanPayload(
      await apiDelete(`/api/daily-plan/${targetPlan.id}/items/${existingEvent.plan_item_id}/`),
    );
    if (updated) {
      _currentPlan = updated;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(updated, preferences);
    }
    return;
  }

  if (!existingEvent && !targetPlan?.id) {
    targetPlan = normalizePlanPayload(
      await apiPost("/api/daily-plan/", {
        date: targetDate,
        events: [],
      }),
    );
  }

  if (!existingEvent && targetPlan?.id) {
    const updated = normalizePlanPayload(
      await apiPost(`/api/daily-plan/${targetPlan.id}/items/`, {
        event_id: normalizedEventId,
        slot_type: slotKey,
      }),
    );
    if (updated) {
      _currentPlan = updated;
      const preferences = await loadCurrentPreferences();
      applyMultiDayPlan(updated, preferences);
    }
    return;
  }

  if (targetPlan) {
      const existingIds = activeEvents.map((e) =>
        typeof e === "object" ? e.id : Number(e),
      );
    const updatedEvents = existingIds.includes(normalizedEventId)
      ? existingIds.filter((id) => id !== normalizedEventId)
      : [...new Set([...existingIds, normalizedEventId])];
      const updated = normalizePlanPayload(await apiPut(`/api/daily-plan/${targetPlan.id}/`, {
        date: targetDate,
        events: updatedEvents,
      }));
      if (updated) {
        _currentPlan = updated;
        const preferences = await loadCurrentPreferences();
        applyMultiDayPlan(updated, preferences);
      }
    } else {
      const created = normalizePlanPayload(await apiPost("/api/daily-plan/", {
        date: targetDate,
        events: [normalizedEventId],
      }));
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
  const plans = data
    ? (Array.isArray(data) ? data : data.results || []).map((plan) => normalizePlanPayload(plan))
    : [];
  return plans.find((plan) => plan.date === targetDate) || null;
}

function buildPlanEventPayload(events) {
  return (Array.isArray(events) ? [...events] : [])
    .sort((a, b) => {
      const orderDiff =
        Number(a?.item_order ?? Number.MAX_SAFE_INTEGER) -
        Number(b?.item_order ?? Number.MAX_SAFE_INTEGER);
      if (orderDiff !== 0) return orderDiff;
      return Number(a?.id || 0) - Number(b?.id || 0);
    })
    .filter((event) => event && !event._placeholder)
    .map((event) => Number(event.id))
    .filter((id) => Number.isFinite(id));
}

function setSlotFeedback(slotKey, message, options = {}) {
  const dayIndex = Number.isInteger(options.dayIndex) ? options.dayIndex : currentDayIndex;
  if (!_slotFeedbackByDay[dayIndex]) {
    _slotFeedbackByDay[dayIndex] = {};
  }
  _slotFeedbackByDay[dayIndex][slotKey] = message;
  window.setTimeout(() => {
    if (_slotFeedbackByDay[dayIndex]) {
      delete _slotFeedbackByDay[dayIndex][slotKey];
      if (dayIndex === currentDayIndex) {
        renderSlotSection(slotKey, dayIndex);
      }
    }
  }, 2200);
}

async function getReplacementCandidatesForDay(dayIndex = currentDayIndex) {
  const targetDate = _localDateStr(getPlanDateForIndex(dayIndex));
  const cacheKey = targetDate;
  if (_replacementCandidatesCache.has(cacheKey)) {
    return _replacementCandidatesCache.get(cacheKey);
  }

  const dateFrom = encodeURIComponent(targetDate);
  const data = await apiGet(`/api/events/filtered/?date_from=${dateFrom}&date_to=${dateFrom}`);
  const candidates = Array.isArray(data) ? data : data?.results || [];
  _replacementCandidatesCache.set(cacheKey, candidates);
  return candidates;
}

function pickReplacementCandidate(slotKey, candidates, excludedIds) {
  const normalizedExcludedIds = new Set(
    [...excludedIds].map((value) => Number(value)).filter((value) => Number.isFinite(value)),
  );
  const pool = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const candidateId = Number(candidate?.id);
    if (!Number.isFinite(candidateId) || normalizedExcludedIds.has(candidateId)) {
      return false;
    }
    return true;
  });

  if (slotKey === "breakfast" || slotKey === "lunch") {
    return pool.find((candidate) => String(candidate.category || "").toLowerCase() === "food") || null;
  }

  const nonFoodCandidate = pool.find(
    (candidate) => String(candidate.category || "").toLowerCase() !== "food",
  );
  if (nonFoodCandidate) return nonFoodCandidate;
  return pool[0] || null;
}

async function persistCurrentDayEvents(rawEvents, dayIndex = currentDayIndex) {
  const targetDate = _localDateStr(getPlanDateForIndex(dayIndex));
  const payloadEvents = buildPlanEventPayload(rawEvents);
  const targetPlan = await findPlanForDate(targetDate);

  if (targetPlan?.id) {
    const updated = normalizePlanPayload(await apiPut(`/api/daily-plan/${targetPlan.id}/`, {
      date: targetDate,
      events: payloadEvents,
    }));
    return updated || null;
  }

  if (!payloadEvents.length) {
    return null;
  }

  const created = normalizePlanPayload(await apiPost("/api/daily-plan/", {
    date: targetDate,
    events: payloadEvents,
  }));
  return created || null;
}

async function replaceActivityForSlot(slotKey, currentEventId = null, options = {}) {
  const dayIndex = Number.isInteger(options.dayIndex) ? options.dayIndex : currentDayIndex;
  const itemIndex = Number.isInteger(options.itemIndex) ? options.itemIndex : 0;
  const currentEvents = Array.isArray(multiDayPlans[dayIndex])
    ? multiDayPlans[dayIndex].filter((event) => event && !event._placeholder)
    : [];
  const currentAssignments = cloneSlotAssignments(getDaySlotAssignments(currentEvents, dayIndex));
  const currentIds = currentEvents
    .map((event) => Number(event?.id))
    .filter((id) => Number.isFinite(id));
  const excludedIds = new Set(currentIds);
  const blockedIds = _slotBlockedIdsByDay[dayIndex]?.[slotKey] || [];
  blockedIds.forEach((id) => excludedIds.add(Number(id)));
  if (currentEventId !== null && currentEventId !== undefined) {
    excludedIds.add(Number(currentEventId));
  }

  const candidates = await getReplacementCandidatesForDay(dayIndex);
  const replacement = pickReplacementCandidate(slotKey, candidates, excludedIds);
  if (!replacement) {
    throw new Error("No alternative available");
  }

  const currentEvent = currentEvents.find(
    (event) => Number(event?.id) === Number(currentEventId),
  );
  const targetDate = _localDateStr(getPlanDateForIndex(dayIndex));
  const targetPlan = await findPlanForDate(targetDate);
  if (currentEvent?.plan_item_id && targetPlan?.id) {
    const updated = normalizePlanPayload(
      await apiPatch(`/api/daily-plan/${targetPlan.id}/items/${currentEvent.plan_item_id}/`, {
        event_id: Number(replacement.id),
      }),
    );
    updateCurrentDayEvents(updated?.events || [], updated || null, {
      preserveOrder: true,
      dayIndex,
      rerenderSlotKey: slotKey,
    });
    setSlotFeedback(slotKey, "Updated based on your preferences", { dayIndex });
    return;
  }

  const nextEvents = [...currentEvents];
  const currentIndex = nextEvents.findIndex(
    (event) => Number(event?.id) === Number(currentEventId),
  );
  if (currentIndex >= 0) {
    nextEvents[currentIndex] = replacement;
  } else {
    nextEvents.push(replacement);
  }

  const nextSlotIds = [...(currentAssignments[slotKey] || [])];
  if (currentIndex >= 0 && itemIndex < nextSlotIds.length) {
    nextSlotIds[itemIndex] = Number(replacement.id);
  } else if (nextSlotIds.length < getSlotLimit(slotKey)) {
    nextSlotIds.push(Number(replacement.id));
  }
  currentAssignments[slotKey] = nextSlotIds.slice(0, getSlotLimit(slotKey));
  _slotAssignmentsByDay[dayIndex] = cloneSlotAssignments(currentAssignments);
  if (!_slotBlockedIdsByDay[dayIndex]) {
    _slotBlockedIdsByDay[dayIndex] = {};
  }
  _slotBlockedIdsByDay[dayIndex][slotKey] = [
    ...new Set(
      [
        ...(blockedIds || []),
        currentEventId !== null && currentEventId !== undefined
          ? Number(currentEventId)
          : null,
        Number(replacement.id),
      ].filter((id) => Number.isFinite(id)),
    ),
  ];

  const updatedPlan = await persistCurrentDayEvents(nextEvents, dayIndex);
  updateCurrentDayEvents(
    updatedPlan?.events || nextEvents,
    updatedPlan || null,
    { preserveOrder: true, dayIndex, rerenderSlotKey: slotKey },
  );
  setSlotFeedback(slotKey, "Updated based on your preferences", { dayIndex });
}

function updateCurrentDayEvents(events, planData = null, options = {}) {
  const dayIndex = Number.isInteger(options.dayIndex) ? options.dayIndex : currentDayIndex;
  const preserveOrder = options.preserveOrder === true;
  const normalizedPlan = planData ? normalizePlanPayload(planData) : null;
  const sourceEvents = normalizedPlan?.events || events;
  const safeEvents = (Array.isArray(sourceEvents) ? sourceEvents : []).map((event, index) =>
    normalizePlanEvent(event, index),
  ).filter(Boolean);
  multiDayPlans[dayIndex] = safeEvents;

  const targetDate = _localDateStr(getPlanDateForIndex(dayIndex));
  if (normalizedPlan) {
    if (dayIndex === currentDayIndex) {
      _currentPlan = {
        ...normalizedPlan,
        date: targetDate,
        events: safeEvents,
        count: safeEvents.length,
      };
    }
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

  if (options.rerenderSlotKey && dayIndex === currentDayIndex) {
    renderSlotSection(options.rerenderSlotKey, dayIndex);
    refreshPlanSummaryAndMap(dayIndex);
    return;
  }

  renderDaysBar();
  renderPlanForDay(dayIndex);
}

async function removeEventFromPlan(eventId, slotKey = "evening", options = {}) {
  const dayIndex = Number.isInteger(options.dayIndex) ? options.dayIndex : currentDayIndex;
  const normalizedEventId = Number(eventId);
  const normalizedItemId = Number(options.itemId);
  if (!Number.isFinite(normalizedEventId) || normalizedEventId <= 0) {
    throw new Error("Invalid event ID");
  }

  const currentEvents = Array.isArray(multiDayPlans[dayIndex])
    ? multiDayPlans[dayIndex]
    : [];
  const nextEvents = currentEvents.filter(
    (event) => Number(event?.id) !== normalizedEventId,
  );

  if (nextEvents.length === currentEvents.length) {
    return;
  }

  const previousAssignments = cloneSlotAssignments(getDaySlotAssignments(currentEvents, dayIndex));
  const currentAssignments = cloneSlotAssignments(previousAssignments);
  currentAssignments[slotKey] = (currentAssignments[slotKey] || [])
    .filter((id) => Number(id) !== normalizedEventId);
  _slotAssignmentsByDay[dayIndex] = cloneSlotAssignments(currentAssignments);
  if (!_slotBlockedIdsByDay[dayIndex]) {
    _slotBlockedIdsByDay[dayIndex] = {};
  }
  _slotBlockedIdsByDay[dayIndex][slotKey] = [
    ...new Set([
      ...(_slotBlockedIdsByDay[dayIndex][slotKey] || []),
      normalizedEventId,
    ]),
  ];

  const previousEvents = [...currentEvents];
  updateCurrentDayEvents(nextEvents, null, {
    preserveOrder: true,
    dayIndex,
    rerenderSlotKey: slotKey,
  });

  const targetDate = _localDateStr(getPlanDateForIndex(dayIndex));
  try {
    const targetPlan = await findPlanForDate(targetDate);
    if (!targetPlan?.id) {
      setSlotFeedback(slotKey, "Activity removed", { dayIndex });
      return;
    }

    const updated = normalizedItemId
      ? normalizePlanPayload(
          await apiDelete(`/api/daily-plan/${targetPlan.id}/items/${normalizedItemId}/`),
        )
      : normalizePlanPayload(
          await apiDelete(`/api/daily-plan/${targetPlan.id}/events/${normalizedEventId}/`),
        );
    if (updated) {
      updateCurrentDayEvents(updated.events || [], updated, {
        preserveOrder: true,
        dayIndex,
        rerenderSlotKey: slotKey,
      });
    }
    setSlotFeedback(slotKey, "Activity removed", { dayIndex });
  } catch (error) {
    _slotAssignmentsByDay[dayIndex] = cloneSlotAssignments(previousAssignments);
    updateCurrentDayEvents(previousEvents, null, {
      preserveOrder: true,
      dayIndex,
      rerenderSlotKey: slotKey,
    });
    throw error;
  }
}

/* =========================
   Export Plan
========================= */

function exportPlan() {
  const events = [...getActiveDayEvents()].sort((a, b) => {
    const orderDiff =
      Number(a?.item_order ?? Number.MAX_SAFE_INTEGER) -
      Number(b?.item_order ?? Number.MAX_SAFE_INTEGER);
    if (orderDiff !== 0) return orderDiff;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
  const targetDate = getSelectedPlanDate();
  if (!events.length) {
    alert("No plan to export. Generate or add activities first.");
    return;
  }

  const startHour = 9;
  const slotHours = 2;
  const fmt = (h) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;

  let text = `Tizahab Daily Plan - ${targetDate}\n`;
  text += "=".repeat(40) + "\n\n";

  events.forEach((ev, i) => {
    const hour = startHour + i * slotHours;
    const title = typeof ev === "object" ? ev.title : `Event #${ev}`;
    const price =
      typeof ev === "object" && ev.price
        ? `${parseFloat(ev.price).toFixed(0)} SAR`
        : "Free";
    const category = typeof ev === "object" ? ev.category || "" : "";
    text += `${fmt(hour)} - ${fmt(hour + slotHours)}\n`;
    text += `  ${title}\n`;
    if (category) text += `  Category: ${category}\n`;
    text += `  Price: ${price}\n\n`;
  });

  text += "-\nGenerated by Tizahab (tizahab.com)\n";

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tizahab-plan-${targetDate}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================
   Page Init
========================= */

document.addEventListener("DOMContentLoaded", () => {
  syncPlanDateInputs();
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
  const generateBtn = document.getElementById("generate-plan-btn");
  setGenerateButtonLabel(false);
  generateBtn?.addEventListener("click", async () => {
    try {
      const ready = await ensurePlanGenerationReady();
      if (!ready) return;

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
    } catch (error) {
      _lastPlanRequestFailed = true;
      const message = document.getElementById("plan-message");
      console.error("Plan update failed:", error);
      if (!message) return;
      if (
        error.status === 400 &&
        error.message &&
        error.message.toLowerCase().includes("interests")
      ) {
        message.classList.remove("text-green-600", "text-gray-500");
        message.classList.add("text-red-500");
        message.innerHTML =
          `Please select your interests first.&nbsp;` +
          `<a href="/onboarding/" ` +
          `class="underline text-brand font-medium hover:opacity-80">` +
          `Go to Preferences</a>`;
      } else if (error.status === 400) {
        showPlanMessage(
          getDailyPlanErrorMessage(error, "Invalid request. Please try again."),
          "error",
        );
      } else if (error.status === 404) {
        message.classList.remove("text-green-600", "text-gray-500");
        message.classList.add("text-red-500");
        message.innerHTML =
          `No places match your current preferences (interests, rating, or budget).&nbsp;` +
          `<a href="/onboarding/" ` +
          `class="underline text-brand font-medium hover:opacity-80">` +
          `Adjust preferences -></a>`;
      } else if (error.status === 500) {
        showPlanMessage(
          getDailyPlanErrorMessage(
            error,
            "Server error while generating your trip. Please try again.",
          ),
          "error",
        );
      } else {
        showPlanMessage(
          getDailyPlanErrorMessage(error, "Could not generate plan. Please try again."),
          "error",
        );
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
  if (typeof google === "undefined" || !google.maps) {
    console.warn("Google Maps not available");
    return;
  }

  try {
    if (!window.TZMap) return;

    window.__TZ_DP_MAP = window.TZMap.initMap("dailyPlanMap", { zoom: 11 });
    window.__TZ_DP_MARKERS = {};

    if (
      window.__TZ_DP_MAP &&
      Array.isArray(window.__TZ_DP_PENDING_POINTS) &&
      window.__TZ_DP_PENDING_POINTS.length
    ) {
      updateMapMarkers(window.__TZ_DP_PENDING_POINTS);
    }
  } catch (e) {
    console.warn("Map failed to load", e);

    const mapContainer =
      document.getElementById("dailyPlanMap") || document.getElementById("map");
    if (mapContainer) {
      mapContainer.innerHTML = `
      <div class="p-4 text-center text-gray-500">
        Map is currently unavailable
      </div>
    `;
    }
  }
}

/* =========================
   Render Map Markers
========================= */

function updateMapMarkers(allEvents) {
  if (!window.google || !google.maps || !window.__TZ_DP_MAP) return;

  Object.values(window.__TZ_DP_MARKERS || {}).forEach((m) => {
    if (m?.setMap) m.setMap(null);
  });

  window.__TZ_DP_MARKERS = {};

  const map = window.__TZ_DP_MAP;
  const info = new google.maps.InfoWindow();
  const bounds = new google.maps.LatLngBounds();

  const markerEvents = (Array.isArray(allEvents) ? allEvents : [])
    .map((event) => {
      const latitude = Number.parseFloat(event?.latitude);
      const longitude = Number.parseFloat(event?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        ...event,
        latitude,
        longitude,
      };
    })
    .filter(Boolean);

  window.__TZ_DP_PENDING_POINTS = markerEvents;

  markerEvents.forEach((event) => {
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
  } catch (error) {
    console.error(`Failed to load ${sectionId} carousel`, error);
    // Silently fail - carousels are non-critical
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
  } catch (error) {
    console.error("Failed to load upcoming carousel", error);
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

