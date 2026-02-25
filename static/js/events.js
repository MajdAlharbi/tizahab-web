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
