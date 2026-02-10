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
  // TODO: Align element IDs with final Daily Plan UI (from Frontend team)
  const container = document.getElementById("plan-container");
  const message = document.getElementById("plan-message");

  if (!container) return;

  const events = (data && data.events) ? data.events : [];

  if (events.length === 0) {
    container.innerHTML = `<div class="text-gray-500">No events found.</div>`;
    return;
  }

  container.innerHTML = events.map(event => `
    <div class="p-3 border rounded mb-2">
      <div class="font-bold">${event.title}</div>
      <div class="text-sm text-gray-500">
        ${event.category} • ${event.date}
      </div>
    </div>
  `).join("");

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
