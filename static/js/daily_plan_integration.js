// Daily Plan - Frontend Integration
// This file handles Generate button behavior and UI updates
// TODO: Connect to real backend endpoint once available

async function generateDailyPlan() {
  const token = requireAuth();
  if (!token) return null;

  // sourcery skip: security

  const USE_MOCK = true;

  if (USE_MOCK) {
    return {
      day: "Today",
      events: [
        { title: "Mock Event 1", category: "Culture", date: "2026-02-10" },
        { title: "Mock Event 2", category: "Food", date: "2026-02-10" }
      ]
    };
  }

  // TODO: Confirm endpoint URL with backend team
  const response = await fetch("/api/daily-plan/generate/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    handleUnauthorized();
    return null;
  }

  if (!response.ok) {
    let err = {};
    try { err = await response.json(); } catch (_) {}
    throw new Error(err.detail || "Failed to generate daily plan");
  }

  return await response.json();
}

function renderDailyPlan(data) {
  const container = document.getElementById("plan-container");
  const message = document.getElementById("plan-message");
  if (!container) return;

  // Clear previous content safely
  container.replaceChildren();

  const events = (data && Array.isArray(data.events)) ? data.events : [];

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-gray-500";
    empty.textContent = "No events found.";
    container.appendChild(empty);
    return;
  }

  events.forEach(event => {
    const card = document.createElement("div");
    card.className = "p-3 border rounded mb-2";

    const title = document.createElement("div");
    title.className = "font-bold";
    title.textContent = event?.title ?? "";

    const meta = document.createElement("div");
    meta.className = "text-sm text-gray-500";
    const category = event?.category ?? "";
    const date = event?.date ?? "";
    meta.textContent = `${category} • ${date}`;

    card.appendChild(title);
    card.appendChild(meta);
    container.appendChild(card);
  });

  if (message) message.innerText = "";
}

function setLoading(isLoading) {
  const message = document.getElementById("plan-message");
  if (!message) return;
  message.innerText = isLoading ? "Generating..." : "";
}

document.addEventListener("DOMContentLoaded", () => {
  // Ensure page is protected
  requireAuth();

  const generateBtn = document.getElementById("generate-btn");
  if (!generateBtn) return;

  generateBtn.addEventListener("click", async () => {
    try {
      setLoading(true);
      const data = await generateDailyPlan();
      setLoading(false);
      if (data) renderDailyPlan(data);
    } catch (error) {
      setLoading(false);
      const message = document.getElementById("plan-message");
      if (message) message.innerText = error.message || "Something went wrong";
    }
  });
});
