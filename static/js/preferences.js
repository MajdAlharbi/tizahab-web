(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let currentStep   = 1;
  let _transitioning = false;
  let _isSubmitting  = false;

  const formData = {
    interests:  new Set(),
    startDate:  "",
    endDate:    "",
    travelers:  2,
    ageGroups:  new Set(["adults"]),
    budgetMin:  0,
    budgetMax:  4000,
    minRating:  null,
    language:   "en",
  };

  // ── Progress ───────────────────────────────────────────────
  function updateProgress() {
    const label = document.getElementById("stepLabel");
    if (label) label.textContent = `Step ${currentStep} of 5`;

    const dots = document.querySelectorAll("#progressDots span");
    dots.forEach((dot, i) => {
      const active = i === currentStep - 1;
      const done   = i < currentStep - 1;
      dot.style.background = (active || done) ? "#7c3aed" : "#e5e7eb";
      dot.style.width      = active ? "24px" : "8px";
    });
  }

  // ── Step transitions ───────────────────────────────────────
  function goToStep(newStep, direction) {
    if (_transitioning || newStep === currentStep || newStep < 1 || newStep > 5) return;
    _transitioning = true;

    const outEl = document.getElementById(`step-${currentStep}`);
    const inEl  = document.getElementById(`step-${newStep}`);
    if (!outEl || !inEl) { _transitioning = false; return; }

    const outX = direction === "forward" ? "-20px" : "20px";
    const inX  = direction === "forward" ? "20px"  : "-20px";

    outEl.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    outEl.style.opacity    = "0";
    outEl.style.transform  = `translateX(${outX})`;

    setTimeout(() => {
      outEl.classList.add("hidden");
      outEl.style.cssText = "";

      inEl.style.opacity   = "0";
      inEl.style.transform = `translateX(${inX})`;
      inEl.classList.remove("hidden");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inEl.style.transition = "opacity 0.2s ease, transform 0.2s ease";
          inEl.style.opacity    = "1";
          inEl.style.transform  = "translateX(0)";
          setTimeout(() => {
            inEl.style.cssText = "";
            _transitioning = false;
          }, 200);
        });
      });

      currentStep = newStep;
      updateProgress();
      if (newStep === 5) renderSummary();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 200);
  }

  // ── Validation ─────────────────────────────────────────────
  function validateStep(step) {
    clearStepError(step);
    if (step === 1 && formData.interests.size === 0) {
      showStepError(1, "Please select at least one interest.");
      return false;
    }
    if (step === 2) {
      if (!formData.startDate || !formData.endDate) {
        showStepError(2, "Please select both start and end dates.");
        return false;
      }
      if (formData.endDate < formData.startDate) {
        showStepError(2, "End date must be on or after start date.");
        return false;
      }
    }
    if (step === 3 && formData.ageGroups.size === 0) {
      showStepError(3, "Please select at least one age group.");
      return false;
    }
    return true;
  }

  function showStepError(step, msg) {
    const el = document.getElementById(`step${step}-error`);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 4000);
  }

  function clearStepError(step) {
    document.getElementById(`step${step}-error`)?.classList.add("hidden");
  }

  // ── Interest cards ─────────────────────────────────────────
  function setCardActive(card, active) {
    const check = card.querySelector(".interest-check");
    card.style.borderColor = active ? "#7c3aed" : "transparent";
    card.style.transform   = active ? "scale(1.03)" : "";
    if (check) check.style.display = active ? "flex" : "none";
  }

  function initInterestCards() {
    document.querySelectorAll(".interest-card").forEach(card => {
      card.addEventListener("click", () => {
        const cat      = card.dataset.cat;
        const selected = !formData.interests.has(cat);
        if (selected) formData.interests.add(cat);
        else          formData.interests.delete(cat);
        setCardActive(card, selected);
        clearStepError(1);
      });
    });
  }

  // ── Date pickers ────────────────────────────────────────────
  function calcDuration(start, end) {
    if (!start || !end || end < start) return null;
    return Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1;
  }

  function refreshDurationBadge() {
    const badge = document.getElementById("durationBadge");
    if (!badge) return;
    const days = calcDuration(formData.startDate, formData.endDate);
    if (days) {
      badge.textContent = `${days} day${days !== 1 ? "s" : ""}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function initDatePickers() {
    const startInput = document.getElementById("startDate");
    const endInput   = document.getElementById("endDate");
    const travInput  = document.getElementById("travelers");

    startInput?.addEventListener("change", () => {
      formData.startDate = startInput.value;
      refreshDurationBadge();
      clearStepError(2);
    });
    endInput?.addEventListener("change", () => {
      formData.endDate = endInput.value;
      refreshDurationBadge();
      clearStepError(2);
    });

    function setTravelers(val) {
      formData.travelers = Math.max(1, Math.min(20, val));
      if (travInput) travInput.value = formData.travelers;
    }
    document.getElementById("travMinus")?.addEventListener("click", () => setTravelers(formData.travelers - 1));
    document.getElementById("travPlus")?.addEventListener( "click", () => setTravelers(formData.travelers + 1));
    travInput?.addEventListener("change", () => setTravelers(parseInt(travInput.value) || 1));
  }

  // ── Age groups ──────────────────────────────────────────────
  function setAgeLabelActive(label, active) {
    label.style.borderColor  = active ? "#7c3aed" : "#e5e7eb";
    label.style.background   = active ? "#f5f3ff" : "";
  }

  function initAgeGroups() {
    document.querySelectorAll(".age-label").forEach(label => {
      const cb = label.querySelector(".age-check");
      if (!cb) return;
      setAgeLabelActive(label, cb.checked);
      cb.addEventListener("change", () => {
        if (cb.checked) formData.ageGroups.add(cb.value);
        else            formData.ageGroups.delete(cb.value);
        setAgeLabelActive(label, cb.checked);
        clearStepError(3);
      });
    });
  }

  // ── Budget sliders ──────────────────────────────────────────
  function refreshBudgetLabels() {
    const rangeEl = document.getElementById("budgetRangeLabel");
    const minEl   = document.getElementById("budgetMinLabel");
    const maxEl   = document.getElementById("budgetMaxLabel");
    if (rangeEl) rangeEl.textContent = `${formData.budgetMin.toLocaleString()} – ${formData.budgetMax.toLocaleString()} SAR`;
    if (minEl)   minEl.textContent   = formData.budgetMin.toLocaleString();
    if (maxEl)   maxEl.textContent   = formData.budgetMax.toLocaleString();
  }

  function initBudget() {
    const minSlider = document.getElementById("budgetMin");
    const maxSlider = document.getElementById("budgetMax");

    minSlider?.addEventListener("input", () => {
      formData.budgetMin = parseInt(minSlider.value);
      if (formData.budgetMin > formData.budgetMax) {
        formData.budgetMax = formData.budgetMin;
        if (maxSlider) maxSlider.value = formData.budgetMax;
      }
      refreshBudgetLabels();
    });
    maxSlider?.addEventListener("input", () => {
      formData.budgetMax = parseInt(maxSlider.value);
      if (formData.budgetMax < formData.budgetMin) {
        formData.budgetMin = formData.budgetMax;
        if (minSlider) minSlider.value = formData.budgetMin;
      }
      refreshBudgetLabels();
    });
  }

  // ── Rating pills ────────────────────────────────────────────
  function setRatingActive(ratingVal) {
    document.querySelectorAll(".rating-pill").forEach(btn => {
      const active = btn.dataset.rating === (ratingVal || "");
      btn.style.borderColor     = active ? "#7c3aed" : "#e5e7eb";
      btn.style.backgroundColor = active ? "#f5f3ff" : "white";
      btn.style.color           = active ? "#7c3aed" : "#4b5563";
    });
  }

  function initRating() {
    document.querySelectorAll(".rating-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        formData.minRating = btn.dataset.rating || null;
        setRatingActive(btn.dataset.rating);
      });
    });
  }

  // ── Language buttons ────────────────────────────────────────
  function setLangActive(lang) {
    document.querySelectorAll(".lang-btn").forEach(btn => {
      const active = btn.dataset.lang === lang;
      btn.style.borderColor     = active ? "#7c3aed" : "#e5e7eb";
      btn.style.backgroundColor = active ? "#f5f3ff" : "white";
      btn.style.color           = active ? "#7c3aed" : "#374151";
    });
  }

  function initLanguage() {
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        formData.language = btn.dataset.lang;
        setLangActive(formData.language);
      });
    });
  }

  // ── Summary ─────────────────────────────────────────────────
  function renderSummary() {
    const el = document.getElementById("summaryContent");
    if (!el) return;

    const fmt = iso => {
      try { return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
      catch (e) { return iso || "—"; }
    };

    const days     = calcDuration(formData.startDate, formData.endDate);
    const cats     = [...formData.interests].map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(", ") || "—";
    const ageMap   = { kids: "Kids", teens: "Teens", adults: "Adults", seniors: "Seniors" };
    const ages     = [...formData.ageGroups].map(a => ageMap[a] || a).join(", ") || "—";
    const dateStr  = (formData.startDate && formData.endDate)
      ? `${fmt(formData.startDate)} – ${fmt(formData.endDate)}${days ? ` (${days} days)` : ""}`
      : "—";

    const rows = [
      ["Interests",   cats],
      ["Dates",       dateStr],
      ["Travelers",   `${formData.travelers} · ${ages}`],
      ["Budget",      `${formData.budgetMin.toLocaleString()} – ${formData.budgetMax.toLocaleString()} SAR / day`],
      ["Min rating",  formData.minRating ? `${formData.minRating}+ ★` : "Any"],
      ["Language",    formData.language === "ar" ? "العربية" : "English"],
    ];

    el.innerHTML = rows.map(([label, value]) => `
      <div class="flex items-start gap-2.5">
        <span class="text-[#7c3aed] font-bold text-xs mt-0.5 shrink-0">✓</span>
        <span class="text-sm"><span class="font-medium text-gray-700">${label}:</span>
          <span class="text-gray-500 ml-1">${value}</span></span>
      </div>`
    ).join("");
  }

  // ── Submit ───────────────────────────────────────────────────
  async function handleSubmit() {
    if (_isSubmitting) return;
    _isSubmitting = true;

    const btn   = document.getElementById("submit-btn");
    const msgEl = document.getElementById("pref-message");

    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    if (msgEl) msgEl.classList.add("hidden");

    const days = calcDuration(formData.startDate, formData.endDate) || 1;

    const payload = {
      interests:          [...formData.interests],
      budget_min:         formData.budgetMin,
      budget_max:         formData.budgetMax,
      preferred_language: formData.language,
      min_rating:         formData.minRating ? parseFloat(formData.minRating) : null,
      trip_duration:      days,
      start_date:         formData.startDate || null,
      end_date:           formData.endDate   || null,
    };

    // Always persist to localStorage
    if (formData.startDate) {
      localStorage.setItem("tz_plan_start_date", formData.startDate);
      localStorage.setItem("tz_start_date",      formData.startDate);
    } else {
      localStorage.removeItem("tz_plan_start_date");
      localStorage.removeItem("tz_start_date");
    }
    if (formData.endDate) {
      localStorage.setItem("tz_plan_end_date", formData.endDate);
      localStorage.setItem("tz_end_date",      formData.endDate);
    } else {
      localStorage.removeItem("tz_plan_end_date");
      localStorage.removeItem("tz_end_date");
    }
    localStorage.setItem("tz_trip_duration", String(days));

    try {
      // POST to API (non-fatal if it fails — user may not be logged in yet)
      if (typeof apiPost === "function" && typeof isLoggedIn === "function" && isLoggedIn()) {
        await apiPost("/api/auth/preferences/", payload);
      }

      if (msgEl) {
        msgEl.textContent = "Preferences saved! Building your plan…";
        msgEl.className   = "text-sm text-center mt-4 rounded-xl py-2.5 px-4 bg-green-50 text-green-700";
        msgEl.classList.remove("hidden");
      }
      setTimeout(() => { window.location.href = "/daily-plan/"; }, 900);
    } catch (err) {
      const msg = (err?.message && !/^API error \d+$/i.test(String(err.message)))
        ? err.message
        : "Could not save preferences. Please try again.";
      if (msgEl) {
        msgEl.textContent = msg;
        msgEl.className   = "text-sm text-center mt-4 rounded-xl py-2.5 px-4 bg-red-50 text-red-600";
        msgEl.classList.remove("hidden");
      }
      if (btn) { btn.disabled = false; btn.textContent = "Generate My Plan →"; }
      _isSubmitting = false;
    }
  }

  // ── Load existing preferences from API ──────────────────────
  async function loadExistingPreferences() {
    if (typeof isLoggedIn === "function" && !isLoggedIn()) return;
    if (typeof apiGet !== "function") return;
    try {
      const data = await apiGet("/api/auth/preferences/");
      if (!data) return;

      if (Array.isArray(data.interests)) {
        data.interests.forEach(cat => {
          formData.interests.add(cat);
          const card = document.querySelector(`.interest-card[data-cat="${cat}"]`);
          if (card) setCardActive(card, true);
        });
      }

      if (data.start_date) {
        formData.startDate = data.start_date;
        const el = document.getElementById("startDate");
        if (el && !el.value) el.value = data.start_date;
      }
      if (data.end_date) {
        formData.endDate = data.end_date;
        const el = document.getElementById("endDate");
        if (el && !el.value) el.value = data.end_date;
      }
      if (formData.startDate || formData.endDate) refreshDurationBadge();

      if (data.budget_min != null) {
        formData.budgetMin = parseInt(data.budget_min);
        const sl = document.getElementById("budgetMin");
        if (sl) sl.value = formData.budgetMin;
      }
      if (data.budget_max != null) {
        formData.budgetMax = parseInt(data.budget_max);
        const sl = document.getElementById("budgetMax");
        if (sl) sl.value = formData.budgetMax;
      }
      refreshBudgetLabels();

      if (data.min_rating != null) {
        formData.minRating = String(data.min_rating);
        setRatingActive(formData.minRating);
      }
      if (data.preferred_language) {
        formData.language = data.preferred_language;
        setLangActive(formData.language);
      }
    } catch (e) { /* silent — existing prefs are a nice-to-have */ }
  }

  // ── Prefill from localStorage ───────────────────────────────
  function prefillFromStorage() {
    const storedStart = localStorage.getItem("tz_plan_start_date") || localStorage.getItem("tz_start_date");
    const storedEnd   = localStorage.getItem("tz_plan_end_date")   || localStorage.getItem("tz_end_date");
    if (storedStart) {
      formData.startDate = storedStart;
      const el = document.getElementById("startDate");
      if (el && !el.value) el.value = storedStart;
    }
    if (storedEnd) {
      formData.endDate = storedEnd;
      const el = document.getElementById("endDate");
      if (el && !el.value) el.value = storedEnd;
    }
    if (formData.startDate || formData.endDate) refreshDurationBadge();
  }

  // ── Keyboard navigation ─────────────────────────────────────
  function initKeyboard() {
    document.addEventListener("keydown", e => {
      if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
      if (e.key === "Enter") {
        if (currentStep < 5) document.getElementById(`next-${currentStep}`)?.click();
        else document.getElementById("submit-btn")?.click();
      }
      if (e.key === "Escape" && currentStep > 1) {
        document.getElementById(`back-${currentStep}`)?.click();
      }
    });
  }

  // ── Wire buttons ────────────────────────────────────────────
  function initButtons() {
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`next-${i}`)?.addEventListener("click", () => {
        if (validateStep(i)) goToStep(i + 1, "forward");
      });
    }
    for (let i = 2; i <= 5; i++) {
      document.getElementById(`back-${i}`)?.addEventListener("click", () => {
        goToStep(i - 1, "backward");
      });
    }
    document.getElementById("submit-btn")?.addEventListener("click", handleSubmit);
  }

  // ── Init ────────────────────────────────────────────────────
  function init() {
    initInterestCards();
    initDatePickers();
    initAgeGroups();
    initBudget();
    initRating();
    initLanguage();
    initKeyboard();
    initButtons();
    updateProgress();
    prefillFromStorage();
    loadExistingPreferences();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
