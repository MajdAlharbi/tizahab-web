(function () {
  function initMap(containerId, opts) {
    const el = document.getElementById(containerId);
    if (!el) return null;

    if (!window.google || !google.maps) {
      console.error("Google Maps not loaded");
      return null;
    }

    const options = opts || {};
    const center = options.center || { lat: 24.7136, lng: 46.6753 };
    const zoom = typeof options.zoom === "number" ? options.zoom : 11;

    const map = new google.maps.Map(el, {
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
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    return map;
  }

  window.TZMap = { initMap };
})();