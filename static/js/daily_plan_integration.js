// Daily Plan - Frontend Integration
// This file handles Generate button behavior and UI updates
// TODO: Connect to real backend endpoint once available

console.log("Daily Plan JS Loaded");

async function generateDailyPlan() {
  const today = new Date();
  const selectedDate = today.toISOString().split("T")[0];
  console.log("Origin:", location.origin);
  const token = localStorage.getItem("access");
  if (!token) {
    redirectToLogin();
    return null;
  }
console.log("Token exists:", !!token);
console.log("Token preview:", token ? token.slice(0, 20) : null);
  const response = await fetch("/api/daily-plan/generate/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ date: selectedDate }),
  });

  if (response.status === 401) {
      console.warn("401 from generate endpoint. Redirect blocked for debugging.");
   // handleUnauthorized();
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    console.error("Generate API failed:", response.status, payload);
    const msg =
      (isJson && payload?.detail) ? payload.detail :
      (typeof payload === "string" && payload.slice(0, 200)) ? payload.slice(0, 200) :
      "Failed to generate daily plan";
    throw new Error(msg);
  }

  return payload;
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
  card.className = `
    bg-white border rounded-2xl p-5 shadow-sm
    flex justify-between items-center
    hover:shadow-md transition
  `;

  const left = document.createElement("div");
  left.className = "space-y-1";

  const time = document.createElement("div");
  time.className = "text-sm text-brand font-medium";
  time.textContent = "09:00 AM • 1 hour";

  const title = document.createElement("div");
  title.className = "text-lg font-semibold";
  title.textContent = event?.title ?? "";

  const location = document.createElement("div");
  location.className = "text-sm text-gray-500";
  location.textContent = event?.category ?? "";

  left.appendChild(time);
  left.appendChild(title);
  left.appendChild(location);

  const actionBtn = document.createElement("button");
  actionBtn.className = "px-4 py-2 bg-brand text-white rounded-xl text-sm hover:opacity-90";
  actionBtn.textContent = "Navigate";

  card.appendChild(left);
  card.appendChild(actionBtn);

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

  const generateBtn = document.getElementById("generate-btn");
  if (!generateBtn) return;

  generateBtn.addEventListener("click", async () => {
    console.log("Button clicked");

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
