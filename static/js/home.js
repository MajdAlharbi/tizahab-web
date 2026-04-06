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
    restaurant: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80",
    cafe: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80",
    fast_food: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80",
    dessert: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400&q=80",
    bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80",
    juice: "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=400&q=80",
    food_truck: "https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=400&q=80",
    culture: "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?w=400&q=80",
    outdoor: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80",
    shopping: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=400&q=80",
    other: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&q=80",
  };

  function catImage(category) {
    return CATEGORY_IMAGES[category] || CATEGORY_IMAGES.other;
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

  function toList(data) {
    if (!data) return [];
    return Array.isArray(data) ? data : data.results || [];
  }

  function getNextUrl(data) {
    if (!data || Array.isArray(data)) return null;
    return data.next || null;
  }

  // ── #startingSoonList ──────────────────────────────────────────────────────

  function renderStartingSoon(events) {
    const el = document.getElementById("startingSoonList");
    if (!el) return;

    if (!events.length) {
      el.innerHTML =
        '<p class="text-sm text-gray-400 text-center py-4">No upcoming places found.</p>';
      return;
    }

    el.innerHTML = events
      .slice(0, 2)
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
      </a>`,
      )
      .join("");
  }

  // ── #todayPlanContainer ────────────────────────────────────────────────────

  function renderTodayPlan(plans) {
    const el = document.getElementById("todayPlanContainer");
    if (!el) return;

    const today = todayISO();
    const plan = (plans || []).find((p) => p.date === today);

    if (!plan || !plan.events || !plan.events.length) {
      return;
    }

    const startHour = 9;
    const last = plan.events.length - 1;
    const items = plan.events
      .map((ev, i) => {
        const hour = startHour + i * 2;
        const fmt = (h) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
        const isLast = i === last;
        return `
        <div class="flex gap-4">
          <!-- Timeline rail -->
          <div class="flex flex-col items-center w-10 shrink-0">
            <div class="w-8 h-8 rounded-full bg-brand/10 border-2 border-brand flex items-center justify-center text-sm">
              ${catEmoji(ev.category)}
            </div>
            ${!isLast ? '<div class="w-0.5 flex-1 bg-gray-200 my-1"></div>' : ""}
          </div>
          <!-- Content -->
          <a href="/events/page/${ev.id}/"
             class="flex-1 pb-6 group">
            <span class="text-xs font-semibold text-brand">${fmt(hour)}</span>
            <p class="text-sm font-semibold text-gray-800 group-hover:text-brand mt-0.5 truncate">
              ${escHtml(ev.title)}
            </p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-xs px-2 py-0.5 rounded-full ${catColor(ev.category)}">
                ${catLabel(ev.category)}
              </span>
              ${ev.price != null ? `<span class="text-xs text-gray-500">${priceLabel(ev.price)}</span>` : ""}
            </div>
          </a>
        </div>`;
      })
      .join("");

    el.innerHTML = `<div class="bg-white rounded-2xl border border-gray-200 p-5">${items}</div>`;
  }

  // ── #recommendedGrid (with pagination) ─────────────────────────────────────

  let _recommendedAll = [];
  let _recommendedTotal = 0;
  let _recommendedShown = 0;
  let _recommendedNextUrl = null;
  const RECOMMENDED_PAGE_SIZE = 6;

  function buildRecommendedCard(ev) {
    return `
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
            ${ev.price != null ? `<span class="text-xs font-medium text-gray-600">${priceLabel(ev.price)}</span>` : "<span></span>"}
            ${ev.rating ? `<span class="text-xs text-yellow-500">★ ${ev.rating}</span>` : ""}
          </div>
        </div>
      </a>`;
  }

  function renderRecommended(events, append) {
    const el = document.getElementById("recommendedGrid");
    if (!el) return;

    if (!append && !events.length) {
      el.innerHTML = `
        <div class="col-span-full text-center text-sm text-gray-400 py-8">
          <p>No recommendations yet.</p>
          <a href="/onboarding/" class="text-brand font-medium hover:underline mt-1 inline-block">
            Set your preferences →
          </a>
        </div>`;
      return;
    }

    if (!append) el.innerHTML = "";
    el.innerHTML += events.map(buildRecommendedCard).join("");
  }

  function updateRecommendedLoadMore() {
    const wrap = document.getElementById("recommendedLoadMoreWrap");
    const btn = document.getElementById("recommendedLoadMoreBtn");
    if (wrap) {
      const hasMore =
        _recommendedNextUrl || _recommendedShown < _recommendedAll.length;
      wrap.classList.toggle("hidden", !hasMore);
      if (btn && hasMore) {
        const remaining = _recommendedTotal - _recommendedShown;
        btn.textContent = remaining > 0 ? `Load More (${remaining} remaining)` : "Load More";
      }
    }
  }

  async function loadMoreRecommended() {
    const el = document.getElementById("recommendedGrid");
    if (!el) return;

    // First try to show more from already-loaded data
    if (_recommendedShown < _recommendedAll.length) {
      const next = _recommendedAll.slice(
        _recommendedShown,
        _recommendedShown + RECOMMENDED_PAGE_SIZE,
      );
      _recommendedShown += next.length;
      renderRecommended(next, true);
      updateRecommendedLoadMore();
      return;
    }

    // If we have a next URL, fetch more from API
    if (_recommendedNextUrl) {
      const data = await apiGet(_recommendedNextUrl);
      const newEvents = toList(data);
      _recommendedNextUrl = getNextUrl(data);
      if (!Array.isArray(data) && data?.count) _recommendedTotal = data.count;
      _recommendedAll = _recommendedAll.concat(newEvents);
      _recommendedShown += newEvents.length;
      renderRecommended(newEvents, true);
      updateRecommendedLoadMore();
    }
  }

  // ── #offersGrid (with pagination) ──────────────────────────────────────────

  let _offersAll = [];
  let _offersTotal = 0;
  let _offersShown = 0;
  let _offersNextUrl = null;
  const OFFERS_PAGE_SIZE = 6;

  function buildOfferCard(ev) {
    return `
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
      </a>`;
  }

  function renderOffersGrid(events, append) {
    const el = document.getElementById("offersGrid");
    if (!el) return;

    if (!append && !events.length) {
      el.innerHTML =
        '<p class="col-span-full text-sm text-gray-400 text-center py-6">No places available right now.</p>';
      return;
    }

    if (!append) el.innerHTML = "";
    el.innerHTML += events.map(buildOfferCard).join("");
  }

  function updateOffersLoadMore() {
    const wrap = document.getElementById("offersLoadMoreWrap");
    const btn = document.getElementById("offersLoadMoreBtn");
    if (wrap) {
      const hasMore = _offersNextUrl || _offersShown < _offersAll.length;
      wrap.classList.toggle("hidden", !hasMore);
      if (btn && hasMore) {
        const remaining = _offersTotal - _offersShown;
        btn.textContent = remaining > 0 ? `Load More (${remaining} remaining)` : "Load More";
      }
    }
  }

  async function loadMoreOffers() {
    const el = document.getElementById("offersGrid");
    if (!el) return;

    if (_offersShown < _offersAll.length) {
      const next = _offersAll.slice(
        _offersShown,
        _offersShown + OFFERS_PAGE_SIZE,
      );
      _offersShown += next.length;
      renderOffersGrid(next, true);
      updateOffersLoadMore();
      return;
    }

    if (_offersNextUrl) {
      const data = await apiGet(_offersNextUrl);
      const newEvents = toList(data);
      _offersNextUrl = getNextUrl(data);
      if (!Array.isArray(data) && data?.count) _offersTotal = data.count;
      _offersAll = _offersAll.concat(newEvents);
      _offersShown += newEvents.length;
      renderOffersGrid(newEvents, true);
      updateOffersLoadMore();
    }
  }

  // ── bootstrap ──────────────────────────────────────────────────────────────

  async function init() {
    const [eventsData, filtered, plans] =
      await Promise.allSettled([
        apiGet("/api/events/"),
        apiGet("/api/events/filtered/"),
        apiGet("/api/daily-plan/"),
      ]);

    // Starting Soon — just shows 2, no pagination needed
    renderStartingSoon(
      eventsData.status === "fulfilled" ? toList(eventsData.value) : [],
    );

    // Popular Places — paginated
    if (eventsData.status === "fulfilled") {
      const d = eventsData.value;
      _offersAll = toList(d);
      _offersNextUrl = getNextUrl(d);
      _offersTotal = (!Array.isArray(d) && d?.count) || _offersAll.length;
      const first = _offersAll.slice(0, OFFERS_PAGE_SIZE);
      _offersShown = first.length;
      renderOffersGrid(first, false);
      updateOffersLoadMore();
    } else {
      renderOffersGrid([], false);
    }

    // Recommended — paginated
    if (filtered.status === "fulfilled") {
      const f = filtered.value;
      _recommendedAll = toList(f);
      _recommendedNextUrl = getNextUrl(f);
      _recommendedTotal = (!Array.isArray(f) && f?.count) || _recommendedAll.length;
      const first = _recommendedAll.slice(0, RECOMMENDED_PAGE_SIZE);
      _recommendedShown = first.length;
      renderRecommended(first, false);
      updateRecommendedLoadMore();
    } else {
      renderRecommended([], false);
    }

    // Today's Plan
    renderTodayPlan(plans.status === "fulfilled" ? toList(plans.value) : []);

    // Wire up Load More buttons
    document
      .getElementById("recommendedLoadMoreBtn")
      ?.addEventListener("click", () =>
        loadMoreRecommended().catch(console.error),
      );
    document
      .getElementById("offersLoadMoreBtn")
      ?.addEventListener("click", () => loadMoreOffers().catch(console.error));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
