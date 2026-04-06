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

function authHeaders() {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
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
    const data = await res.json();
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

  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
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

  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
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

  if (!res.ok) {
    let detail = `API error ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function catLabel(cat) { return CATEGORY_MAP[cat]?.label || cat; }
function catEmoji(cat) { return CATEGORY_MAP[cat]?.emoji || "📍"; }
function catColor(cat) { return CATEGORY_MAP[cat]?.color || "bg-gray-100 text-gray-700"; }

// expose globally for all scripts
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.catLabel = catLabel;
window.catEmoji = catEmoji;
window.catColor = catColor;
window.getToken = getToken;
