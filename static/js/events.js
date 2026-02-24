// static/js/events.js
function initEventsMap() {
  
  const points = [
    { id: "10", title: "Traditional Saudi Food Festival", location: "Diriyah Square", lat: 24.7342, lng: 46.5762 },
    { id: "11", title: "Art Exhibition: Modern Saudi Artists", location: "KAFD, Riyadh", lat: 24.7667, lng: 46.6439 },
    { id: "12", title: "Boulevard Riyadh City", location: "Hittin, Riyadh", lat: 24.7636, lng: 46.6034 },
    { id: "13", title: "Tech Innovation Summit", location: "KAFD Conference Center", lat: 24.7702, lng: 46.6393 },
    { id: "trend-1", title: "Boulevard World 2025", location: "Prince Turki Ibn Abd", lat: 24.7718, lng: 46.6044 },
    { id: "trend-2", title: "The Groves", location: "King Fahd Cultural Center", lat: 24.6826, lng: 46.6753 },
    { id: "trend-3", title: "Desert Adventure Expo", location: "Riyadh Intl Convention Center", lat: 24.7375, lng: 46.7000 },
  ];

  if (!window.TZMap) return;
  window.TZMap.initMap("eventsMap", points, { zoom: 11 });
}
