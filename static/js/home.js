// home.js - renders the logged-in tourism dashboard.
// Depends on api.js (apiGet, catLabel, catColor loaded by base template).

(function () {
  "use strict";

  const CATEGORY_IMAGES = {
    culture: "https://commons.wikimedia.org/wiki/Special:FilePath/National_Museum_Riyadh_%286781666263%29.jpg?width=900",
    heritage: "https://commons.wikimedia.org/wiki/Special:FilePath/Masmak_Fort_%2812753717253%29.jpg?width=900",
    food: "https://www.alyaum.com/uploads/images/2023/06/03/1944213.jpg",
    nature: "https://www.atlastravels.com/public/upload/atlas/travelogues/descriptionimage/descriptionimage_1727952417.jpg",
    shopping: "https://ar.timeoutriyadh.com/cloud/artimeoutriyadh/2022/12/13/malls-in-riyadh.jpg",
    events: "https://golden4tic.com/blog/wp-content/uploads/2024/11/LG-1.webp",
    family: "https://cdn2.wingie.com/uploads/f_webp,s_500x300,q_60,fit_cover/bwlyfard_syty_balryad_25321bd3b8.jpg",
    entertainment: "https://commons.wikimedia.org/wiki/Special:FilePath/Boulevard_Riyadh_City.jpg?width=900",
  };

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatPlanDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
    } catch (e) {
      return iso || "";
    }
  }

  function computeTripDay(startRaw) {
    if (!startRaw) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startRaw);
    start.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((today - start) / 86400000) + 1);
  }

  function computeTripLength(startRaw, endRaw) {
    if (!startRaw || !endRaw) return null;
    const start = new Date(startRaw);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endRaw);
    end.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }

  function categoryLabel(category) {
    return typeof catLabel === "function" ? catLabel(category) : String(category || "Place");
  }

  function categoryClass(category) {
    return typeof catColor === "function" ? catColor(category) : "bg-violet-50 text-violet-700";
  }

  function imageFor(event) {
    const category = String(event?.category || "events").toLowerCase();
    return event?.image_url || event?.image || event?.photo_url || CATEGORY_IMAGES[category] || CATEGORY_IMAGES.events;
  }

  function normalizeList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.events)) return data.events;
    return [];
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
      const endRaw = localStorage.getItem("tz_plan_end_date") || localStorage.getItem("tz_end_date");
      const dayX = computeTripDay(startRaw);
      const dayY = computeTripLength(startRaw, endRaw);
      const dayLabel = (dayX && dayY) ? `Day ${dayX} of ${dayY}` : (dayX ? `Day ${dayX}` : null);

      const count = plan.events.length;
      const countText = `${count} ${count === 1 ? "activity" : "activities"}`;
      const dateText = plan.date ? formatPlanDate(plan.date) : "";
      const metaText = [dateText, countText].filter(Boolean).join(" - ");
      const lead = plan.events[0];
      const leadImage = imageFor(lead);

      const items = plan.events.slice(0, 4).map(ev => {
        const label = categoryLabel(ev.category);
        const color = categoryClass(ev.category);
        return `
          <div class="flex items-center gap-3 py-3 border-b border-violet-50 last:border-0">
            <img src="${escHtml(imageFor(ev))}" alt="${escHtml(ev.title)}" loading="lazy"
              class="w-11 h-11 rounded-xl object-cover shrink-0 bg-violet-50">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-gray-900 truncate">${escHtml(ev.title)}</p>
              <p class="text-xs text-gray-400 truncate">${escHtml(ev.area || ev.location || "Riyadh")}</p>
            </div>
            <span class="shrink-0 text-xs px-2 py-0.5 rounded-full ${color}">${escHtml(label)}</span>
          </div>`;
      }).join("");

      el.innerHTML = `
        <div class="h-full bg-white rounded-3xl border border-violet-100 shadow-sm overflow-hidden">
          <div class="relative h-44">
            <img src="${escHtml(leadImage)}" alt="${escHtml(lead?.title || "Riyadh plan")}" class="absolute inset-0 h-full w-full object-cover">
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
            <div class="absolute bottom-0 left-0 right-0 p-6 text-white">
              ${dayLabel ? `<p class="text-xs font-semibold uppercase tracking-widest text-white/75">${escHtml(dayLabel)}</p>` : ""}
              <h2 class="mt-1 text-2xl font-bold">Your Plan is Ready</h2>
              ${metaText ? `<p class="mt-1 text-sm text-white/75">${escHtml(metaText)}</p>` : ""}
            </div>
          </div>
          <div class="px-6 py-2">${items}</div>
          <div class="px-6 pb-6 pt-3">
            <a href="/daily-plan/"
              class="block w-full text-center px-6 py-3 rounded-xl text-sm font-semibold text-white transition shadow-sm bg-violet-600 hover:bg-violet-700">
              View Today's Plan
            </a>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="h-full bg-white rounded-3xl border border-violet-100 shadow-sm overflow-hidden">
          <div class="relative h-44">
            <img src="${CATEGORY_IMAGES.heritage}" alt="Riyadh heritage" class="absolute inset-0 h-full w-full object-cover">
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
            <div class="absolute bottom-0 left-0 right-0 p-6 text-white">
              <h2 class="text-2xl font-bold">Create Your Personalized Journey</h2>
              <p class="mt-1 text-sm text-white/75">Tell us your interests and we will build your Riyadh itinerary.</p>
            </div>
          </div>
          <div class="p-6">
            <a href="/onboarding/"
              class="inline-flex w-full items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-white transition shadow-sm bg-violet-600 hover:bg-violet-700">
              Generate My Plan
            </a>
          </div>
        </div>`;
    }
  }

  function renderRecommended(events) {
    const container = document.getElementById("recommendedPlaces");
    if (!container) return;

    const list = normalizeList(events)
      .filter(ev => ev && ev.title)
      .slice(0, 3);

    if (!list.length) {
      container.innerHTML = `
        <div class="sm:col-span-2 lg:col-span-3 rounded-3xl border border-violet-100 bg-white p-8 text-center text-sm text-gray-400">
          Explore Riyadh places will appear here soon.
        </div>`;
      return;
    }

    container.innerHTML = list.map(ev => {
      const label = categoryLabel(ev.category);
      return `
        <a href="/events/page/${escHtml(ev.id)}/"
          class="group overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition">
          <div class="relative h-40">
            <img src="${escHtml(imageFor(ev))}" alt="${escHtml(ev.title)}" loading="lazy"
              class="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105">
            <div class="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent"></div>
            <span class="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-violet-700">
              ${escHtml(label)}
            </span>
          </div>
          <div class="p-4">
            <h3 class="text-sm font-bold text-gray-900 truncate">${escHtml(ev.title)}</h3>
            <p class="mt-1 text-xs text-gray-500 truncate">${escHtml(ev.area || ev.location || "Riyadh")}</p>
          </div>
        </a>`;
    }).join("");
  }

  async function init() {
    try {
      const data = await apiGet("/api/daily-plan/");
      renderPlanCard(normalizeList(data));
    } catch (e) {
      renderPlanCard([]);
    }

    try {
      const events = await apiGet("/api/events/?page_size=6");
      renderRecommended(events);
    } catch (e) {
      renderRecommended([]);
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
