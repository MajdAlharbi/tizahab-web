// Tizahab — shared API layer
// All pages import this file for auth + fetch

const CATEGORY_MAP = {
  restaurant: { label: "Restaurants",       emoji: "🍽️", color: "bg-orange-100 text-orange-700" },
  cafe:       { label: "Cafes & Coffee",    emoji: "☕",  color: "bg-amber-100 text-amber-700" },
  fast_food:  { label: "Fast Food",         emoji: "🍔",  color: "bg-red-100 text-red-700" },
  dessert:    { label: "Desserts & Sweets", emoji: "🍰",  color: "bg-pink-100 text-pink-700" },
  bakery:     { label: "Bakery",            emoji: "🥐",  color: "bg-yellow-100 text-yellow-700" },
  juice:      { label: "Juice & Smoothies", emoji: "🧃",  color: "bg-lime-100 text-lime-700" },
  food_truck: { label: "Food Trucks",       emoji: "🚚",  color: "bg-indigo-100 text-indigo-700" },
  culture:    { label: "Culture",           emoji: "🏛️", color: "bg-blue-100 text-blue-700" },
  outdoor:    { label: "Outdoor",           emoji: "🌿",  color: "bg-green-100 text-green-700" },
  shopping:   { label: "Shopping",          emoji: "🛍️", color: "bg-purple-100 text-purple-700" },
  other:      { label: "Other",             emoji: "🎯",  color: "bg-gray-100 text-gray-700" },
};

function getToken() {
  return localStorage.getItem("access") || "";
}

function isLoggedIn() {
  return localStorage.getItem("access") !== null;
}

function redirectToLogin() {
  const next = window.location.pathname;
  window.location.href = "/login/?next=" + encodeURIComponent(next);
}

function authHeaders() {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseResponseBody(res) {
  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    redirectToLogin();
    return null;
  }

  if (!trimmed) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function _flattenApiErrorParts(value) {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) return value.flatMap(_flattenApiErrorParts);
  if (typeof value === "object") {
    return Object.values(value).flatMap(_flattenApiErrorParts);
  }
  return [];
}

function extractApiErrorMessage(responseData, fallback = "Request failed. Please try again.") {
  if (!responseData) return fallback;

  for (const key of ["detail", "error", "message"]) {
    const parts = _flattenApiErrorParts(responseData[key]);
    if (parts.length) return parts.join(" ");
  }

  const nonFieldParts = _flattenApiErrorParts(responseData.non_field_errors);
  if (nonFieldParts.length) return nonFieldParts.join(" ");

  if (typeof responseData === "object" && !Array.isArray(responseData)) {
    const fieldMessages = [];
    for (const [field, rawValue] of Object.entries(responseData)) {
      if (["detail", "error", "message", "non_field_errors"].includes(field)) continue;
      const parts = _flattenApiErrorParts(rawValue);
      if (parts.length) fieldMessages.push(`${field}: ${parts.join(" ")}`);
    }
    if (fieldMessages.length) return fieldMessages.join(" ");
  }

  const genericParts = _flattenApiErrorParts(responseData);
  if (genericParts.length) return genericParts.join(" ");

  return fallback;
}

async function _raiseApiError(res, fallbackPrefix = "Request failed") {
  const body = await parseResponseBody(res);
  const err = new Error(
    extractApiErrorMessage(body, `${fallbackPrefix}. Please try again.`),
  );
  err.status = res.status;
  err.responseData = body;
  throw err;
}

/**
 * Attempt a silent token refresh using the stored refresh token.
 * Returns true if a new access token was obtained and stored, false otherwise.
 */
async function _tryRefresh() {
  const refresh = localStorage.getItem("refresh");
  if (!refresh) return false;

  try {
    const res = await fetch("/api/auth/token/refresh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await parseResponseBody(res);
    if (data.access) {
      localStorage.setItem("access", data.access);
      return true;
    }
  } catch {}
  return false;
}

/** Redirect to login and clear stored tokens. */
function _logout() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  window.location.href = "/login/";
}

async function apiGet(url) {
  let res = await fetch(url, { headers: authHeaders() });

  if (res.status === 401) {
    const refreshed = await _tryRefresh();
    if (!refreshed) { _logout(); return null; }
    // Retry with the new access token
    res = await fetch(url, { headers: authHeaders() });
    if (res.status === 401) { _logout(); return null; }
  }

  if (!res.ok) await _raiseApiError(res, "Unable to load data");
  return parseResponseBody(res);
}

async function apiPost(url, data) {
  let res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });

  if (res.status === 401) {
    const refreshed = await _tryRefresh();
    if (!refreshed) { _logout(); return null; }
    // Retry with the new access token
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (res.status === 401) { _logout(); return null; }
  }

  if (!res.ok) await _raiseApiError(res, "Unable to complete request");
  return parseResponseBody(res);
}

async function apiPut(url, data) {
  let res = await fetch(url, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });

  if (res.status === 401) {
    const refreshed = await _tryRefresh();
    if (!refreshed) { _logout(); return null; }
    res = await fetch(url, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (res.status === 401) { _logout(); return null; }
  }

  if (!res.ok) await _raiseApiError(res, "Unable to save changes");
  return parseResponseBody(res);
}

async function apiPatch(url, data) {
  let res = await fetch(url, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });

  if (res.status === 401) {
    const refreshed = await _tryRefresh();
    if (!refreshed) { _logout(); return null; }
    res = await fetch(url, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (res.status === 401) { _logout(); return null; }
  }

  if (!res.ok) await _raiseApiError(res, "Unable to update data");
  return parseResponseBody(res);
}

async function apiDelete(url) {
  let res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (res.status === 401) {
    const refreshed = await _tryRefresh();
    if (!refreshed) { _logout(); return null; }
    res = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) { _logout(); return null; }
  }

  if (!res.ok) await _raiseApiError(res, "Unable to delete data");
  return parseResponseBody(res);
}

function catLabel(cat) { return CATEGORY_MAP[cat]?.label || cat; }
function catEmoji(cat) { return CATEGORY_MAP[cat]?.emoji || "📍"; }
function catColor(cat) { return CATEGORY_MAP[cat]?.color || "bg-gray-100 text-gray-700"; }

document.addEventListener("click", function (e) {
  const target = e.target.closest("[data-requires-auth]");

  if (!target) return;

  if (!isLoggedIn()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    redirectToLogin();
  }
}, true);

// expose globally for all scripts
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiPatch = apiPatch;
window.apiDelete = apiDelete;
window.extractApiErrorMessage = extractApiErrorMessage;
window.catLabel = catLabel;
window.catEmoji = catEmoji;
window.catColor = catColor;
window.getToken = getToken;
window.isLoggedIn = isLoggedIn;
window.redirectToLogin = redirectToLogin;
