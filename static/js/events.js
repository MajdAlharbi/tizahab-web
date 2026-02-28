<<<<<<< HEAD
function getAccessToken() {
  return localStorage.getItem("access");
}

function authHeaders() {
  const token = getAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

async function apiGet(url) {
  const headers = authHeaders();
  if (!headers) {
    window.location.href = "/api/auth/ui/login/";
    return null;
  }

  const res = await fetch(url, { headers });

  if (res.status === 401) {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    window.location.href = "/api/auth/ui/login/";
    return null;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Request failed");

  return data;
}

/* Listing */

function renderEventsList(events) {
  const grid = document.getElementById("eventsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "text-gray-500";
    empty.textContent = "No events found.";
    grid.appendChild(empty);
    return;
  }

  for (const ev of events) {
    const a = document.createElement("a");
    a.href = `/events/page/${ev.id}/`;
    a.className =
      "group bg-white border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition relative";

    const wrap = document.createElement("div");
    wrap.className = "p-4 space-y-2";

    const title = document.createElement("h3");
    title.className = "font-semibold text-lg";
    title.textContent = ev.title || "Untitled";

    const meta = document.createElement("p");
    meta.className = "text-sm text-gray-600";

    const d = ev.date ? new Date(ev.date) : null;
    meta.textContent = `${ev.category || "other"} • ${
      d ? d.toLocaleString() : "No date"
    }`;

    wrap.appendChild(title);
    wrap.appendChild(meta);
    a.appendChild(wrap);
    grid.appendChild(a);
  }
}

async function loadAllEvents() {
  const data = await apiGet("/api/events/");
  if (!data) return;
  renderEventsList(data);
}

async function loadFilteredEvents() {
  const data = await apiGet("/api/events/filtered/");
  if (!data) return;
  renderEventsList(data);
}

/* Details */

function renderEventDetails(ev) {
  const container = document.getElementById("eventDetails");
  if (!container) return;

  container.innerHTML = "";

  const title = document.createElement("h1");
  title.className = "text-2xl font-bold";
  title.textContent = ev.title || "Event";

  const meta = document.createElement("p");
  meta.className = "text-gray-600";

  const d = ev.date ? new Date(ev.date) : null;
  meta.textContent = `${ev.category || "other"} • ${
    d ? d.toLocaleString() : "No date"
  }`;

  const description = document.createElement("p");
  description.className = "mt-4";
  description.textContent = ev.description || "No description";

  container.appendChild(title);
  container.appendChild(meta);
  container.appendChild(description);
}

async function loadEventDetails(eventId) {
  const data = await apiGet("/api/events/");
  if (!data) return;

  const ev = data.find((x) => String(x.id) === String(eventId));
  if (!ev) return;

  renderEventDetails(ev);
}

/* Init */

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("eventsGrid")) {
    loadAllEvents().catch(console.error);
  }

  if (window.EVENT_ID) {
    loadEventDetails(window.EVENT_ID).catch(console.error);
  }
});
=======
// static/js/events.js
function initEventsMap() {
  
  const points = [
    { id: "10", title: "Traditional Saudi Food Festival", location: "Diriyah Square", lat: 24.7342, lng: 46.5762 },
    { id: "11", title: "Art Exhibition: Modern Saudi Artists", location: "KAFD, Riyadh", lat: 24.7667, lng: 46.6439 },
    { id: "12", title: "Boulevard Riyadh City", location: "Hittin, Riyadh", lat: 24.7636, lng: 46.6034 },
    { id: "13", title: "Tech Innovation Summit", location: "KAFD Conference Center", lat: 24.7702, lng: 46.6393 },
    { id: "trend-1", title: "Boulevard World 2025", location: "Prince Turki Ibn Abd", lat: 24.7718, lng: 46.6044 },
    { id: "trend-2", title: "The Groves", location: "King Fahd Cultural Center", lat: 24.6826, lng: 46.6753 },
    { id: "trend-3", title: "Desert Adventure Expo", location: "Riyadh Intl Convention Center", lat: 24.7375, lng: 46.7000 },
  ];

  if (!window.TZMap) return;
  window.TZMap.initMap("eventsMap", points, { zoom: 11 });
}
>>>>>>> origin/dev
