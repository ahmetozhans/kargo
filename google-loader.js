(() => {
  const key = String(window.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key) return;

  window.__initKargoGoogleMaps = async () => {
    try {
      const mapsLib = await google.maps.importLibrary('maps');
      const placesLib = await google.maps.importLibrary('places');
      const markerLib = await google.maps.importLibrary('marker');
      window.KargoGoogle = {
        Map: mapsLib.Map,
        Place: placesLib.Place,
        AdvancedMarkerElement: markerLib.AdvancedMarkerElement,
        PinElement: markerLib.PinElement,
      };
      window.dispatchEvent(new CustomEvent('kargo-google-ready'));
    } catch (error) {
      console.warn('Google Maps başlatılamadı.', error);
    }
  };

  const script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&language=tr&region=TR&loading=async&callback=__initKargoGoogleMaps';
  script.async = true;
  script.defer = true;
  document.head.append(script);
})();
