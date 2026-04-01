// home.js — populates the four dynamic sections on home.html
// Depends on api.js (apiGet, catLabel, catEmoji, catColor must be loaded first)

(function () {
  "use strict";

  // ── helpers ────────────────────────────────────────────────────────────────

  function todayISO() {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  }

  function priceLabel(price) {
    if (price === null || price === undefined) return "";
    return price === 0 ? "Free" : `${price} SAR`;
  }

  const CATEGORY_IMAGES = {
    food:     "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80",
    culture:  "https://images.unsplash.com/photo-1566127992631-137a642a90f4?w=400&q=80",
    outdoor:  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80",
    shopping: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=400&q=80",
    other:    "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&q=80",
  };

  function catImage(category) {
    return CATEGORY_IMAGES[category] || CATEGORY_IMAGES.other;
  }

  // ── #startingSoonList ──────────────────────────────────────────────────────
  // Compact row: emoji + title + category badge, one per event

  function renderStartingSoon(events) {
    const el = document.getElementById("startingSoonList");
    if (!el) return;

    if (!events.length) {
      el.innerHTML =
        '<p class="text-sm text-gray-400 text-center py-4">No upcoming places found.</p>';
      return;
    }

    el.innerHTML = events
      .map(
        (ev) => `
      <a href="/events/page/${ev.id}/"
         class="flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition">
        <img src="${catImage(ev.category)}"
             alt="${escHtml(ev.title)}"
             class="w-full h-40 object-cover">
        <div class="flex items-center gap-2 px-3 py-2.5">
          <span class="text-lg leading-none flex-shrink-0">${catEmoji(ev.category)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 truncate">${escHtml(ev.title)}</p>
            <span class="inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${catColor(ev.category)}">
              ${catLabel(ev.category)}
            </span>
          </div>
        </div>
      </a>`
      )
      .join("");
  }

  // ── #todayPlanContainer ────────────────────────────────────────────────────
  // Shows today's plan events as a vertical timeline; falls back to the static
  // empty-state already in the HTML so we only replace on actual data.

  function renderTodayPlan(plans) {
    const el = document.getElementById("todayPlanContainer");
    if (!el) return;

    const today = todayISO();
    const plan = (plans || []).find((p) => p.date === today);

    if (!plan || !plan.events || !plan.events.length) {
      // Leave the existing static empty-state in place
      return;
    }

    // Assign 2-hour slots starting at 09:00
    const startHour = 9;
    const items = plan.events
      .map((ev, i) => {
        const hour = startHour + i * 2;
        const timeStr = `${String(hour).padStart(2, "0")}:00`;
        return `
        <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-sm transition">
          <img src="${catImage(ev.category)}"
               alt="${escHtml(ev.title)}"
               class="w-full h-40 object-cover">
          <div class="flex gap-4 p-4">
            <div class="flex flex-col items-center gap-1 min-w-[48px]">
              <span class="text-xs font-semibold text-brand">${timeStr}</span>
              <span class="text-xl">${catEmoji(ev.category)}</span>
            </div>
            <div class="flex-1 min-w-0">
              <a href="/events/page/${ev.id}/"
                 class="text-sm font-semibold text-gray-800 hover:text-brand truncate block">
                ${escHtml(ev.title)}
              </a>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span class="text-xs px-2 py-0.5 rounded-full ${catColor(ev.category)}">
                  ${catLabel(ev.category)}
                </span>
                ${ev.price != null ? `<span class="text-xs text-gray-500">${priceLabel(ev.price)}</span>` : ""}
              </div>
            </div>
          </div>
        </div>`;
      })
      .join("");

    el.innerHTML = items;
  }

  // ── #recommendedGrid ───────────────────────────────────────────────────────
  // Tall cards (matches h-48 skeleton) with title, category, price, description

  function renderRecommended(events) {
    const el = document.getElementById("recommendedGrid");
    if (!el) return;

    if (!events.length) {
      el.innerHTML = `
        <div class="col-span-full text-center text-sm text-gray-400 py-8">
          <p>No recommendations yet.</p>
          <a href="/onboarding/" class="text-brand font-medium hover:underline mt-1 inline-block">
            Set your preferences →
          </a>
        </div>`;
      return;
    }

    el.innerHTML = events
      .map(
        (ev) => `
      <a href="/events/page/${ev.id}/"
         class="flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-brand/30 transition">
        <img src="${catImage(ev.category)}"
             alt="${escHtml(ev.title)}"
             class="w-full h-40 object-cover">
        <div class="flex flex-col flex-1 p-5">
          <div class="flex items-start justify-between gap-2 mb-3">
            <span class="text-3xl leading-none">${catEmoji(ev.category)}</span>
            <span class="text-xs px-2 py-0.5 rounded-full ${catColor(ev.category)} whitespace-nowrap">
              ${catLabel(ev.category)}
            </span>
          </div>
          <p class="text-sm font-semibold text-gray-800 line-clamp-2 flex-1">${escHtml(ev.title)}</p>
          ${
            ev.description
              ? `<p class="text-xs text-gray-500 mt-1 line-clamp-2">${escHtml(ev.description)}</p>`
              : ""
          }
          <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            ${ev.price != null ? `<span class="text-xs font-medium text-gray-600">${priceLabel(ev.price)}</span>` : '<span></span>'}
            ${ev.rating ? `<span class="text-xs text-yellow-500">★ ${ev.rating}</span>` : ""}
          </div>
        </div>
      </a>`
      )
      .join("");
  }

  // ── #offersGrid ────────────────────────────────────────────────────────────
  // Shorter cards (matches h-32 skeleton) — compact 2-col layout

  function renderOffersGrid(events) {
    const el = document.getElementById("offersGrid");
    if (!el) return;

    if (!events.length) {
      el.innerHTML =
        '<p class="col-span-full text-sm text-gray-400 text-center py-6">No places available right now.</p>';
      return;
    }

    el.innerHTML = events
      .map(
        (ev) => `
      <a href="/events/page/${ev.id}/"
         class="flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-md hover:border-brand/30 transition">
        <img src="${catImage(ev.category)}"
             alt="${escHtml(ev.title)}"
             class="w-full h-40 object-cover">
        <div class="flex items-center gap-3 p-4">
          <span class="text-2xl leading-none flex-shrink-0">${catEmoji(ev.category)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-gray-800 line-clamp-2">${escHtml(ev.title)}</p>
            <span class="inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${catColor(ev.category)}">
              ${catLabel(ev.category)}
            </span>
            ${ev.price != null ? `<p class="text-xs text-gray-500 mt-1">${priceLabel(ev.price)}</p>` : ""}
          </div>
        </div>
      </a>`
      )
      .join("");
  }

  // ── XSS guard ──────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── fetch helpers ──────────────────────────────────────────────────────────
  // Extract the results array whether the response is paginated or a plain list.

  function toList(data) {
    if (!data) return [];
    return Array.isArray(data) ? data : data.results || [];
  }

  // ── bootstrap ──────────────────────────────────────────────────────────────

  async function init() {
    // All four requests fire in parallel; each section is independent.
    const [eventsSmall, eventsLarge, filtered, plans] = await Promise.allSettled([
      apiGet("/api/events/?limit=4"),
      apiGet("/api/events/?limit=6"),
      apiGet("/api/events/filtered/"),
      apiGet("/api/daily-plan/"),
    ]);

    renderStartingSoon(
      eventsSmall.status === "fulfilled" ? toList(eventsSmall.value) : []
    );
    renderOffersGrid(
      eventsLarge.status === "fulfilled" ? toList(eventsLarge.value) : []
    );
    renderRecommended(
      filtered.status === "fulfilled" ? toList(filtered.value) : []
    );
    renderTodayPlan(
      plans.status === "fulfilled" ? toList(plans.value) : []
    );
  }

  document.addEventListener("DOMContentLoaded", init);
})();
