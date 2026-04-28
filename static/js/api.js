// Tizahab  shared API layer
// All pages import this file for auth + fetch

const CATEGORY_MAP = {
  culture:       { label: "Culture",       emoji: "🏛️", color: "bg-blue-100 text-blue-700" },
  heritage:      { label: "Heritage",      emoji: "🕌", color: "bg-amber-100 text-amber-700" },
  entertainment: { label: "Entertainment", emoji: "🎡", color: "bg-rose-100 text-rose-700" },
  food:          { label: "Food",          emoji: "🍽️", color: "bg-orange-100 text-orange-700" },
  shopping:      { label: "Shopping",      emoji: "🛍️", color: "bg-purple-100 text-purple-700" },
  nature:        { label: "Nature",        emoji: "🌿", color: "bg-green-100 text-green-700" },
  family:        { label: "Family",        emoji: "👨‍👩‍👧", color: "bg-cyan-100 text-cyan-700" },
  events:        { label: "Events",        emoji: "🎫", color: "bg-indigo-100 text-indigo-700" },
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

function getCookie(name) {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

function logError(...args) {
  if (window.DEBUG) console.error(...args);
}

function authHeaders(url = "") {
  const headers = {
    "Content-Type": "application/json",
  };

  const token = localStorage.getItem("access");

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const csrfToken = getCookie("csrftoken");
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  return headers;
}

function toISODate(dateStr) {
  if (!dateStr) return null;

  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }

  return dateStr;
}

async function parseResponseBody(res) {
  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    console.warn("Unexpected HTML response");
    const err = new Error("Invalid response");
    err.type = "server";
    err.status = res.status;
    throw err;
  }

  if (!trimmed) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse API response body", error);
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
  console.error("API failure:", err);
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
      headers: authHeaders("/api/auth/token/refresh/"),
      credentials: "include",
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await parseResponseBody(res);
    if (data.access) {
      localStorage.setItem("access", data.access);
      return true;
    }
  } catch (error) {
    logError("API ERROR", error);
  }
  return false;
}

/** Redirect to login and clear stored tokens. */
async function logout(options = {}) {
  const redirect = options.redirect !== false;

  try {
    await fetch("/logout/", {
      method: "POST",
      headers: authHeaders("/logout/"),
      credentials: "include",
    });
  } catch (error) {
    logError("API ERROR", error);
  }

  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  localStorage.removeItem("tz_trip_duration");
  localStorage.removeItem("tz_plan_start_date");
  localStorage.removeItem("tz_plan_end_date");
  localStorage.removeItem("tz_selected_plan_date");
  localStorage.removeItem("selectedStartDate");
  localStorage.removeItem("selectedEndDate");
  localStorage.removeItem("tripDuration");
  localStorage.removeItem("currentDayIndex");
  if (redirect) {
    window.location.href = "/login/";
  }
}

function _logout() {
  return logout();
}

async function apiGet(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: authHeaders(url),
      credentials: "include",
    });

    if (res.status === 401) {
      return { results: [] };
    }

    if (!res.ok) await _raiseApiError(res, "Unable to load data");
    return parseResponseBody(res);
  } catch (error) {
    logError("API ERROR", error);
    throw error;
  }
}

async function apiPost(url, data) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(url),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (res.status === 401) {
      return { results: [] };
    }

    if (!res.ok) await _raiseApiError(res, "Unable to complete request");
    return parseResponseBody(res);
  } catch (error) {
    logError("API ERROR", error);
    throw error;
  }
}

async function apiPut(url, data) {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: authHeaders(url),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (res.status === 401) {
      return { results: [] };
    }

    if (!res.ok) await _raiseApiError(res, "Unable to save changes");
    return parseResponseBody(res);
  } catch (error) {
    logError("API ERROR", error);
    throw error;
  }
}

async function apiPatch(url, data) {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: authHeaders(url),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (res.status === 401) {
      return { results: [] };
    }

    if (!res.ok) await _raiseApiError(res, "Unable to update data");
    return parseResponseBody(res);
  } catch (error) {
    logError("API ERROR", error);
    throw error;
  }
}

async function apiDelete(url) {
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(url),
      credentials: "include",
    });

    if (res.status === 401) {
      return { results: [] };
    }

    if (!res.ok) await _raiseApiError(res, "Unable to delete data");
    return parseResponseBody(res);
  } catch (error) {
    logError("API ERROR", error);
    throw error;
  }
}

function catLabel(cat) { return CATEGORY_MAP[cat]?.label || cat; }
function catEmoji(cat) { return CATEGORY_MAP[cat]?.emoji || ""; }
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
window.toISODate = toISODate;
window.catColor = catColor;
window.toISODate = toISODate;
window.getToken = getToken;
window.isLoggedIn = isLoggedIn;
window.redirectToLogin = redirectToLogin;
window.logout = logout;
