(function () {
  function renderMapFallback(containerId, message) {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
      <div class="h-full w-full flex items-center justify-center p-6 bg-gray-50 text-center">
        <div class="max-w-sm space-y-2">
          <p class="text-sm font-semibold text-gray-700">Map unavailable</p>
          <p class="text-xs text-gray-500">${message || "We couldn't load Google Maps right now. Please try again later."}</p>
        </div>
      </div>`;
  }

  function initMap(containerId, opts) {
    const el = document.getElementById(containerId);
    if (!el) return null;

    if (!window.google || !google.maps) {
      console.error("Google Maps not loaded");
      renderMapFallback(
        containerId,
        "Google Maps failed to load. Check your connection or API key configuration.",
      );
      return null;
    }

    const options = opts || {};
    const center = options.center || { lat: 24.7136, lng: 46.6753 };
    const zoom = typeof options.zoom === "number" ? options.zoom : 11;

    let map = null;
    try {
      map = new google.maps.Map(el, {
        center,
        zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        clickableIcons: false,
        styles: [
          {
            featureType: "poi",
            elementType: "labels.text",
            stylers: [{ visibility: "off" }],
          },
        ],
      });
    } catch (error) {
      console.error("Google Maps init failed", error);
      renderMapFallback(
        containerId,
        "Google Maps could not be initialized. Please verify your API key and billing setup.",
      );
      return null;
    }

    return map;
  }

  window.gm_authFailure = function () {
    ["eventsMap", "dailyPlanMap", "mapPageMap"].forEach((id) => {
      renderMapFallback(
        id,
        "Google Maps authorization failed. Please contact support or check API key restrictions.",
      );
    });
  };

  window.TZMap = { initMap, renderMapFallback };
})();
