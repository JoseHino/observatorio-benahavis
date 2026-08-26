/* ============================================================================
   obs-map.js — Mapa de puntos para los Observatorios de Indicadores
   ----------------------------------------------------------------------------
   Mapa con agrupación, capa de calor, filtros y línea del tiempo, declarado con
   la misma filosofía que el resto del kit: se describe qué se pinta y el
   componente resuelve el cómo.

       Obs.mapa(el, {
         puntos: [...],
         fecha:  p => p.alta,          // AAAA-MM-DD, para la línea del tiempo
         popup:  p => '<b>…</b>',
         grupo:  p => p.tipo,          // decide color y leyenda
         peso:   p => p.plazas,        // pondera la capa de calor (opcional)
         filtros: [ {id, label, valor: p => …, tipo: 'select'|'rango'} ],
         linea:  { etiqueta: 'Alta en el registro', acumulado: true }
       })

   Depende de Leaflet, Leaflet.markercluster y Leaflet.heat (CDN), además de los
   tokens de obs.css.
   ========================================================================== */
(function (global) {
  'use strict';

  var Obs = global.Obs = global.Obs || {};
  var mapas = [];

  /* Teselas grises de Esri: sobrias, sin el ruido de color del mapa estándar de
     OSM, que compite con los datos. Se usan éstas y no las de CARTO porque
     CARTO pasó a exigir clave: sin ella devuelve un PNG con «API KEY REQUIRED»
     estampado, y como responde con HTTP 200 el fallo no salta por ningún lado,
     simplemente el mapa sale rotulado con el aviso. */
  var TESELAS = {
    claro: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    oscuro: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    /* El fondo gris va sin rótulos a propósito; los topónimos son una capa
       aparte que se pinta ENCIMA de los datos, para que un nombre de
       urbanización no quede tapado por un grupo de puntos. */
    rotulosClaro: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    rotulosOscuro: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    credito: 'Teselas &copy; Esri &mdash; Esri, DeLorme, NAVTEQ · Datos &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  };

  function esOscuro() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function anyoDe(f) {
    var s = String(f || '');
    return /^\d{4}/.test(s) ? +s.slice(0, 4) : null;
  }

  /* --------------------------------------------------------------- 1. Marco */

  function marco(id, cfg) {
    var filtros = (cfg.filtros || []).map(function (f) {
      if (f.tipo === 'rango') {
        return '<label class="obs-map-f"><span>' + Obs.esc(f.label) + '</span>' +
          '<select class="obs-select" data-filtro="' + f.id + '"></select></label>';
      }
      return '<label class="obs-map-f"><span>' + Obs.esc(f.label) + '</span>' +
        '<select class="obs-select" data-filtro="' + f.id + '"></select></label>';
    }).join('');

    var linea = cfg.linea ? (
      '<div class="obs-map-linea">' +
        '<button type="button" class="obs-icon-btn" data-act="play" title="Reproducir la evolución">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
        '</button>' +
        '<div class="obs-map-linea-in">' +
          '<div class="obs-map-linea-lbl"><span>' + Obs.esc(cfg.linea.etiqueta || 'Periodo') + '</span>' +
            '<b data-rol="anyo"></b></div>' +
          '<input type="range" data-rol="tiempo" step="1">' +
          '<div class="obs-map-linea-ejes"><span data-rol="min"></span><span data-rol="max"></span></div>' +
        '</div>' +
      '</div>') : '';

    return '<div class="obs-map" data-mapa="' + id + '">' +
      '<div class="obs-map-tools">' + filtros +
        '<div class="obs-map-capas">' +
          '<div class="obs-segment" role="group">' +
            '<button type="button" data-capa="puntos" aria-pressed="true">Puntos</button>' +
            '<button type="button" data-capa="calor" aria-pressed="false">Calor</button>' +
          '</div>' +
          '<button type="button" class="obs-btn" data-act="reset">Restablecer</button>' +
        '</div>' +
        '<div class="obs-map-cuenta" data-rol="cuenta"></div>' +
      '</div>' +
      '<div class="obs-map-lienzo" data-rol="lienzo"></div>' +
      linea +
      '<div class="obs-map-leyenda" data-rol="leyenda"></div>' +
    '</div>';
  }

  /* --------------------------------------------------------------- 2. Motor */

  /**
   * Dibuja un mapa de puntos.
   * @param {HTMLElement|string} el contenedor
   * @param {Object} cfg ver cabecera
   */
  Obs.mapa = function (el, cfg) {
    var host = typeof el === 'string' ? document.querySelector(el) : el;
    if (!host) { console.warn('[obs-map] contenedor no encontrado:', el); return null; }
    if (typeof L === 'undefined') {
      host.innerHTML = '<div class="obs-msg error">No se pudo cargar la librería de mapas.</div>';
      return null;
    }

    var puntos = (cfg.puntos || []).filter(function (p) {
      return p && isFinite(p.lat) && isFinite(p.lon);
    });
    if (!puntos.length) {
      host.innerHTML = '<div class="obs-msg">Ningún punto georreferenciado que mostrar.</div>';
      return null;
    }

    var id = 'm' + (mapas.length + 1);
    host.innerHTML = marco(id, cfg);
    var raiz = host.querySelector('.obs-map');
    var lienzo = raiz.querySelector('[data-rol="lienzo"]');

    var T = Obs.tema();
    var mapa = L.map(lienzo, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    /* maxNativeZoom: el servicio de Esri no sirve teselas por encima de 16, pero
       el mapa sigue admitiendo acercarse: Leaflet reescala la última disponible
       en lugar de dejar el fondo en gris. */
    var teselas = L.tileLayer(esOscuro() ? TESELAS.oscuro : TESELAS.claro,
      { attribution: TESELAS.credito, maxZoom: 19, maxNativeZoom: 16 }).addTo(mapa);
    var rotulos = L.tileLayer(esOscuro() ? TESELAS.rotulosOscuro : TESELAS.rotulosClaro,
      { maxZoom: 19, maxNativeZoom: 16, pane: 'shadowPane', opacity: .9 }).addTo(mapa);
    /* Sin scroll-zoom por defecto: en una página larga, la rueda debe seguir
       desplazando la página. Con Ctrl o tras hacer clic dentro, sí hace zoom. */
    mapa.on('click', function () { mapa.scrollWheelZoom.enable(); });
    mapa.on('mouseout', function () { mapa.scrollWheelZoom.disable(); });

    /* --- grupos y colores: el color sigue a la categoría, nunca al orden --- */
    var grupos = [];
    if (cfg.grupo) {
      puntos.forEach(function (p) {
        var g = cfg.grupo(p) || 'Sin clasificar';
        if (grupos.indexOf(g) < 0) grupos.push(g);
      });
      grupos.sort();
    }
    var colorDe = function (p) {
      if (!cfg.grupo) return T.serie[0];
      var i = grupos.indexOf(cfg.grupo(p) || 'Sin clasificar');
      return T.serie[i % T.serie.length];
    };

    /* --- capas --- */
    var cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 45, disableClusteringAtZoom: 17,
      iconCreateFunction: function (c) {
        var n = c.getChildCount();
        var talla = n < 25 ? 30 : (n < 150 ? 38 : 46);
        return L.divIcon({
          html: '<span>' + Obs.fmt.num(n) + '</span>',
          className: 'obs-cluster',
          iconSize: L.point(talla, talla)
        });
      }
    });
    var calor = null;

    function marcador(p) {
      var m = L.circleMarker([p.lat, p.lon], {
        radius: 6, weight: 2, color: T.surface, fillColor: colorDe(p), fillOpacity: .92
      });
      if (cfg.popup) m.bindPopup(cfg.popup(p), { maxWidth: 320, className: 'obs-popup' });
      return m;
    }

    /* --- filtros --- */
    var estado = {};
    (cfg.filtros || []).forEach(function (f) {
      var sel = raiz.querySelector('[data-filtro="' + f.id + '"]');
      var vals = [];
      puntos.forEach(function (p) {
        var v = f.valor(p);
        if (v == null || v === '') return;
        if (vals.indexOf(v) < 0) vals.push(v);
      });
      vals.sort(function (a, b) {
        return (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b), 'es');
      });
      sel.innerHTML = '<option value="">Todas</option>' + vals.map(function (v) {
        return '<option value="' + Obs.esc(v) + '">' + Obs.esc(f.etiquetaValor ? f.etiquetaValor(v) : v) + '</option>';
      }).join('');
      estado[f.id] = '';
      sel.addEventListener('change', function () { estado[f.id] = sel.value; pintar(); });
    });

    /* --- línea del tiempo --- */
    var corte = null, anyos = [], reproduciendo = null;
    if (cfg.linea && cfg.fecha) {
      puntos.forEach(function (p) {
        var a = anyoDe(cfg.fecha(p));
        if (a && anyos.indexOf(a) < 0) anyos.push(a);
      });
      anyos.sort(function (a, b) { return a - b; });
      /* Se recorta la cola larga: un par de altas sueltas de 2000 estirarían la
         barra veinte años para no mover nada en el mapa. */
      if (anyos.length > 12) {
        var umbral = anyos[Math.max(0, anyos.length - 12)];
        var previas = puntos.filter(function (p) { var a = anyoDe(cfg.fecha(p)); return a && a < umbral; }).length;
        if (previas / puntos.length < 0.05) anyos = anyos.filter(function (a) { return a >= umbral; });
      }
      var rango = raiz.querySelector('[data-rol="tiempo"]');
      rango.min = 0; rango.max = anyos.length - 1; rango.value = anyos.length - 1;
      raiz.querySelector('[data-rol="min"]').textContent = anyos[0];
      raiz.querySelector('[data-rol="max"]').textContent = anyos[anyos.length - 1];
      corte = anyos[anyos.length - 1];
      rango.addEventListener('input', function () {
        corte = anyos[+rango.value];
        pintar();
      });
      raiz.querySelector('[data-act="play"]').addEventListener('click', function () {
        var btn = this;
        if (reproduciendo) {
          clearInterval(reproduciendo); reproduciendo = null;
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
          return;
        }
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
        if (+rango.value >= anyos.length - 1) { rango.value = 0; corte = anyos[0]; pintar(); }
        reproduciendo = setInterval(function () {
          if (+rango.value >= anyos.length - 1) {
            clearInterval(reproduciendo); reproduciendo = null;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            return;
          }
          rango.value = +rango.value + 1;
          corte = anyos[+rango.value];
          pintar();
        }, 900);
      });
    }

    /* --- pintado --- */
    var capaActiva = 'puntos';

    function visibles() {
      return puntos.filter(function (p) {
        for (var i = 0; i < (cfg.filtros || []).length; i++) {
          var f = cfg.filtros[i];
          if (estado[f.id] !== '' && String(f.valor(p)) !== String(estado[f.id])) return false;
        }
        if (corte != null && cfg.fecha) {
          var a = anyoDe(cfg.fecha(p));
          /* Acumulado: en el año N se ven todas las altas hasta N incluido.
             Sin fecha utilizable el punto se muestra siempre, y se dice cuántos son. */
          if (a != null && a > corte) return false;
        }
        return true;
      });
    }

    function pintar() {
      var vs = visibles();

      cluster.clearLayers();
      if (capaActiva === 'puntos') {
        cluster.addLayers(vs.map(marcador));
        if (!mapa.hasLayer(cluster)) mapa.addLayer(cluster);
      } else if (mapa.hasLayer(cluster)) {
        mapa.removeLayer(cluster);
      }

      if (calor) { mapa.removeLayer(calor); calor = null; }
      /* Leaflet.heat llama a getImageData sobre su propio lienzo: si la sección
         todavía está oculta el lienzo mide 0 y lanza una excepción. Se pospone. */
      if (capaActiva === 'calor' && lienzo.offsetWidth > 0) {
        var max = 1;
        var datos = vs.map(function (p) {
          var w = cfg.peso ? (+cfg.peso(p) || 1) : 1;
          if (w > max) max = w;
          return [p.lat, p.lon, w];
        });
        calor = L.heatLayer(datos, {
          radius: 22, blur: 18, maxZoom: 16, max: max,
          minOpacity: .28,
          /* Rampa secuencial de un solo tono, de claro a oscuro: la magnitud es
             continua, así que nada de arcoíris. */
          gradient: { 0.0: '#cde2fb', 0.35: '#6da7ec', 0.65: '#2a78d6', 1.0: '#0d366b' }
        }).addTo(mapa);
      }

      var cuenta = raiz.querySelector('[data-rol="cuenta"]');
      var sinFecha = cfg.fecha ? vs.filter(function (p) { return anyoDe(cfg.fecha(p)) == null; }).length : 0;
      cuenta.innerHTML = '<b>' + Obs.fmt.num(vs.length) + '</b> de ' + Obs.fmt.num(puntos.length) +
        (cfg.unidad ? ' ' + cfg.unidad : '') +
        (sinFecha ? ' <span class="obs-map-nota">(' + Obs.fmt.num(sinFecha) + ' sin fecha)</span>' : '');
      if (corte != null) {
        var lbl = raiz.querySelector('[data-rol="anyo"]');
        if (lbl) lbl.textContent = corte;
      }
    }

    /* --- leyenda --- */
    if (cfg.grupo) {
      raiz.querySelector('[data-rol="leyenda"]').innerHTML = grupos.map(function (g, i) {
        return '<span class="obs-map-item"><i style="background:' + T.serie[i % T.serie.length] + '"></i>' +
          Obs.esc(g) + '</span>';
      }).join('');
    }

    /* --- conmutador de capa y reinicio --- */
    raiz.querySelector('.obs-map-capas').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.getAttribute('data-act') === 'reset') {
        (cfg.filtros || []).forEach(function (f) {
          estado[f.id] = '';
          raiz.querySelector('[data-filtro="' + f.id + '"]').value = '';
        });
        var r = raiz.querySelector('[data-rol="tiempo"]');
        if (r) { r.value = r.max; corte = anyos[anyos.length - 1]; }
        mapa.fitBounds(L.latLngBounds(puntos.map(function (p) { return [p.lat, p.lon]; })).pad(0.08));
        pintar();
        return;
      }
      var capa = b.getAttribute('data-capa');
      if (!capa) return;
      capaActiva = capa;
      raiz.querySelectorAll('[data-capa]').forEach(function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      raiz.querySelector('[data-rol="leyenda"]').style.display = (capa === 'calor' && cfg.grupo) ? 'none' : '';
      pintar();
    });

    /* Si el contenedor se queda sin tamaño (sección oculta, captura de pantalla,
       ventana minimizada) la capa de calor intenta leer un lienzo de 0 px y
       lanza una excepción por dentro de la librería. Se retira y se repone. */
    mapa.on('resize', function () {
      var s = mapa.getSize();
      if ((!s.x || !s.y) && calor) { mapa.removeLayer(calor); calor = null; }
      else if (s.x && s.y && capaActiva === 'calor' && !calor) pintar();
    });

    mapa.fitBounds(L.latLngBounds(puntos.map(function (p) { return [p.lat, p.lon]; })).pad(0.08));
    pintar();

    /* Al mostrarse la sección el lienzo pasa de 0 a su tamaño real: hay que
       avisar a Leaflet y repintar, o el mapa queda gris a medio dibujar. */
    if (typeof ResizeObserver !== 'undefined') {
      var visto = lienzo.offsetWidth;
      new ResizeObserver(function () {
        if (lienzo.offsetWidth && lienzo.offsetWidth !== visto) {
          visto = lienzo.offsetWidth;
          mapa.invalidateSize();
          pintar();
        }
      }).observe(lienzo);
    }

    var ref = { mapa: mapa, teselas: teselas, rotulos: rotulos, repintar: pintar };
    mapas.push(ref);
    setTimeout(function () { mapa.invalidateSize(); }, 60);
    return ref;
  };

  /** Cambia las teselas al tema activo. Lo llama el armazón al conmutar. */
  Obs.mapasRepintar = function () {
    mapas.forEach(function (r) {
      r.teselas.setUrl(esOscuro() ? TESELAS.oscuro : TESELAS.claro);
      if (r.rotulos) r.rotulos.setUrl(esOscuro() ? TESELAS.rotulosOscuro : TESELAS.rotulosClaro);
      r.repintar();
    });
  };

})(window);
