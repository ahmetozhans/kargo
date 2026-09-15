(() => {
  const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const ALT_STYLE = 'https://tiles.openfreemap.org/styles/bright';
  let sequence = 0;

  function nextId(prefix) {
    sequence += 1;
    return `${prefix}-${Date.now()}-${sequence}`;
  }

  function toPadding(value) {
    if (Array.isArray(value)) {
      const n = Math.max(...value.map((item) => Number(item) || 0));
      return n;
    }
    return Number(value) || 0;
  }

  class CompatMap {
    constructor(container, options = {}) {
      this._tileLayers = [];
      this._styleOverlays = new Set();
      this._map = new maplibregl.Map({
        container,
        style: DEFAULT_STYLE,
        center: [29.06, 40.195],
        zoom: 12,
        attributionControl: options.attributionControl !== false,
        renderWorldCopies: false,
      });
      this._map.dragRotate.disable();
      this._map.touchZoomRotate.disableRotation();
    }

    setView(latlng, zoom) {
      const [lat, lng] = latlng;
      this._map.jumpTo({ center: [lng, lat], zoom });
      return this;
    }

    on(type, handler) {
      if (type === 'click') {
        const wrapped = (event) => handler({
          originalEvent: event.originalEvent,
          latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
        });
        this._map.on(type, wrapped);
        return this;
      }
      this._map.on(type, handler);
      return this;
    }

    fitBounds(points, options = {}) {
      if (!Array.isArray(points) || !points.length) return this;
      const bounds = new maplibregl.LngLatBounds();
      points.forEach(([lat, lng]) => bounds.extend([lng, lat]));
      this._map.fitBounds(bounds, {
        padding: toPadding(options.padding),
        maxZoom: options.maxZoom,
        duration: 350,
      });
      return this;
    }

    removeLayer(layer) {
      if (!layer) return this;
      if (typeof layer.remove === 'function') layer.remove();
      this._tileLayers = this._tileLayers.filter((item) => item !== layer);
      return this;
    }

    eachLayer(handler) {
      this._tileLayers.slice().forEach(handler);
      return this;
    }

    invalidateSize() {
      this._map.resize();
      return this;
    }

    setStyle(style) {
      this._map.setStyle(style);
      return this;
    }
  }

  class TileLayer {
    constructor(url, options = {}) {
      this.url = url;
      this.options = options;
      this._map = null;
    }

    addTo(map) {
      this._map = map;
      map._tileLayers.push(this);
      const style = /hot/i.test(this.url) ? ALT_STYLE : DEFAULT_STYLE;
      if (map._map.getStyle()) map._map.setStyle(style);
      return this;
    }

    remove() {
      if (!this._map) return;
      this._map._tileLayers = this._map._tileLayers.filter((item) => item !== this);
      this._map = null;
    }
  }

  class GeoJSONLayer {
    constructor(geometry, options = {}) {
      this.geometry = geometry;
      this.options = options;
      this._map = null;
      this._sourceId = nextId('route-source');
      this._layerId = nextId('route-line');
      this._styleHandler = null;
    }

    _install() {
      if (!this._map) return;
      const raw = this._map._map;
      if (!raw.isStyleLoaded()) {
        raw.once('idle', () => this._install());
        return;
      }
      if (raw.getSource(this._sourceId) || raw.getLayer(this._layerId)) return;
      try {
        raw.addSource(this._sourceId, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: this.geometry },
        });
        const style = this.options.style || {};
        raw.addLayer({
          id: this._layerId,
          type: 'line',
          source: this._sourceId,
          layout: {
            'line-cap': style.lineCap || 'round',
            'line-join': style.lineJoin || 'round',
          },
          paint: {
            'line-color': style.color || '#3478f6',
            'line-width': style.weight || 5,
            'line-opacity': style.opacity ?? 0.88,
          },
        });
      } catch {
        // Style may still be changing; the styledata listener will retry.
      }
    }

    addTo(map) {
      this._map = map;
      this._styleHandler = () => this._install();
      map._map.on('styledata', this._styleHandler);
      this._install();
      return this;
    }

    remove() {
      if (!this._map) return;
      const raw = this._map._map;
      if (this._styleHandler) raw.off('styledata', this._styleHandler);
      try { if (raw.getLayer(this._layerId)) raw.removeLayer(this._layerId); } catch {}
      try { if (raw.getSource(this._sourceId)) raw.removeSource(this._sourceId); } catch {}
      this._map = null;
    }
  }

  class CompatMarker {
    constructor(latlng, options = {}) {
      this.latlng = latlng;
      this.options = options;
      this._marker = null;
      this._element = null;
      this._title = '';
    }

    addTo(map) {
      const element = document.createElement('div');
      element.className = 'maplibre-stop-marker';
      element.innerHTML = this.options.icon?.html || '<div class="marker-dot"></div>';
      element.style.cursor = 'pointer';
      this._element = element;
      this._marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([this.latlng[1], this.latlng[0]])
        .addTo(map._map);
      if (this._title) element.title = this._title;
      return this;
    }

    bindTooltip(text) {
      this._title = text || '';
      if (this._element) this._element.title = this._title;
      return this;
    }

    remove() {
      this._marker?.remove();
      this._marker = null;
      this._element = null;
    }
  }

  window.L = {
    TileLayer,
    map(container, options) {
      return new CompatMap(container, options);
    },
    control: {
      zoom() {
        return { addTo() { return this; } };
      },
    },
    tileLayer(url, options) {
      return new TileLayer(url, options);
    },
    geoJSON(geometry, options) {
      return new GeoJSONLayer(geometry, options);
    },
    divIcon(options) {
      return options || {};
    },
    marker(latlng, options) {
      return new CompatMarker(latlng, options);
    },
  };
})();