// Tizahab — shared API layer
// All pages import this file for auth + fetch

const CATEGORY_MAP = {
  food:     { label: "Food & Dining",  emoji: "🍽️", color: "bg-orange-100 text-orange-700" },
  culture:  { label: "Culture",        emoji: "🏛️", color: "bg-blue-100 text-blue-700" },
  outdoor:  { label: "Outdoor",        emoji: "🌿", color: "bg-green-100 text-green-700" },
  shopping: { label: "Shopping",       emoji: "🛍️", color: "bg-pink-100 text-pink-700" },
  other:    { label: "Other",          emoji: "🎯", color: "bg-gray-100 text-gray-700" },
};

function getToken() {
  return localStorage.getItem("access") || "";
}

function authHeaders() {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function apiGet(url) {
  const res = await fetch(url, { headers: authHeaders() });

  if (res.status === 401) {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    window.location.href = "/login/";
    return null;
  }

  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function apiPost(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function catLabel(cat) { return CATEGORY_MAP[cat]?.label || cat; }
function catEmoji(cat) { return CATEGORY_MAP[cat]?.emoji || "📍"; }
function catColor(cat) { return CATEGORY_MAP[cat]?.color || "bg-gray-100 text-gray-700"; }

// expose globally for all scripts
window.apiGet = apiGet;
window.apiPost = apiPost;
window.catLabel = catLabel;
window.catEmoji = catEmoji;
window.catColor = catColor;
window.getToken = getToken;
