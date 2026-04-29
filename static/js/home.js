// home.js — renders the daily plan card based on /api/daily-plan/
// Depends on api.js (apiGet, catLabel, catEmoji, catColor loaded by base template)

(function () {
  "use strict";

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatPlanDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    } catch (e) { return iso || ""; }
  }

  function computeTripDay(startRaw) {
    if (!startRaw) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(startRaw); start.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((today - start) / 86400000) + 1);
  }

  function computeTripLength(startRaw, endRaw) {
    if (!startRaw || !endRaw) return null;
    const start = new Date(startRaw); start.setHours(0, 0, 0, 0);
    const end   = new Date(endRaw);   end.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }

  function renderPlanCard(plans) {
    const el = document.getElementById("planCard");
    if (!el) return;

    const today = todayISO();
    const sorted = [...(plans || [])].sort((a, b) =>
      String(a?.date || "").localeCompare(String(b?.date || ""))
    );
    const plan = sorted.find(p => String(p?.date || "") >= today) || sorted[0];

    if (plan && plan.events && plan.events.length) {
      const startRaw = localStorage.getItem("tz_plan_start_date") || localStorage.getItem("tz_start_date");
      const endRaw   = localStorage.getItem("tz_plan_end_date")   || localStorage.getItem("tz_end_date");
      const dayX     = computeTripDay(startRaw);
      const dayY     = computeTripLength(startRaw, endRaw);
      const dayLabel = (dayX && dayY) ? `Day ${dayX} of ${dayY}` : (dayX ? `Day ${dayX}` : null);

      const count     = plan.events.length;
      const countText = `${count} ${count === 1 ? "activity" : "activities"}`;
      const dateText  = plan.date ? formatPlanDate(plan.date) : "";
      const metaText  = [dateText, countText].filter(Boolean).join(" · ");

      const items = plan.events.slice(0, 3).map(ev => {
        const emoji = typeof catEmoji === "function" ? catEmoji(ev.category) : "📍";
        const color = typeof catColor === "function" ? catColor(ev.category) : "bg-gray-100 text-gray-600";
        const label = typeof catLabel === "function" ? catLabel(ev.category) : escHtml(ev.category);
        return `
          <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
            <span class="text-xl leading-none w-8 text-center shrink-0">${emoji}</span>
            <p class="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">${escHtml(ev.title)}</p>
            <span class="shrink-0 text-xs px-2 py-0.5 rounded-full ${color}">${label}</span>
          </div>`;
      }).join("");

      el.innerHTML = `
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div class="px-7 pt-7 pb-5 border-b border-gray-50">
            ${dayLabel ? `<p class="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-1">${escHtml(dayLabel)}</p>` : ""}
            <h2 class="text-lg font-bold text-gray-900">Your Plan is Ready</h2>
            ${metaText ? `<p class="mt-0.5 text-sm text-gray-400">${escHtml(metaText)}</p>` : ""}
          </div>
          <div class="px-7 py-1">${items}</div>
          <div class="px-7 pb-7 pt-4">
            <a href="/daily-plan/"
              class="block w-full text-center px-6 py-3 rounded-xl text-sm font-semibold text-white transition shadow-sm"
              style="background-color:#7c3aed"
              onmouseover="this.style.backgroundColor='#6d28d9'"
              onmouseout="this.style.backgroundColor='#7c3aed'">
              View Today's Plan →
            </a>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
          <div class="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-5">
            <i data-lucide="calendar-plus" class="w-7 h-7 text-violet-600"></i>
          </div>
          <h2 class="text-xl font-bold text-gray-900">Create Your Personalized Journey</h2>
          <p class="mt-2 text-sm text-gray-500">Tell us your interests and we'll build your Riyadh itinerary.</p>
          <a href="/preferences/"
            class="mt-6 inline-flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white transition shadow-sm"
            style="background-color:#7c3aed"
            onmouseover="this.style.backgroundColor='#6d28d9'"
            onmouseout="this.style.backgroundColor='#7c3aed'">
            Generate My Plan →
          </a>
        </div>`;
      if (typeof lucide !== "undefined") lucide.createIcons();
    }
  }

  async function init() {
    try {
      const data  = await apiGet("/api/daily-plan/");
      const plans = Array.isArray(data) ? data : (data?.results || []);
      renderPlanCard(plans);
    } catch (e) {
      renderPlanCard([]);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
