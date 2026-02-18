// static/js/map.js
// Google Maps reusable helper (Frontend only)

(function () {
  function initMap(containerId, points, opts) {
    const el = document.getElementById(containerId);
    if (!el) return null;

    // prevent double init
    if (el.dataset.mapInit === "1") return null;
    el.dataset.mapInit = "1";

    if (!window.google || !google.maps) {
      console.error("Google Maps not loaded");
      return null;
    }

    const options = opts || {};
    const center = options.center || { lat: 24.7136, lng: 46.6753 }; // Riyadh
    const zoom = typeof options.zoom === "number" ? options.zoom : 11;

    const map = new google.maps.Map(el, {
      center,
      zoom,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    const info = new google.maps.InfoWindow();
    const bounds = new google.maps.LatLngBounds();

    (Array.isArray(points) ? points : []).forEach(p => {
      if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return;

      const pos = { lat: p.lat, lng: p.lng };
      const marker = new google.maps.Marker({ position: pos, map });

      const title = (p.title || "Event").toString();
      const location = (p.location || "").toString();

      marker.addListener("click", () => {
        info.setContent(
          `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(title)}</div>
           <div style="font-size:12px;opacity:.85;">${escapeHtml(location)}</div>`
        );
        info.open({ anchor: marker, map });
      });

      bounds.extend(pos);
    });

    // Fit markers if exist
    if (!bounds.isEmpty()) map.fitBounds(bounds);

    return map;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.TZMap = { initMap };
})();
