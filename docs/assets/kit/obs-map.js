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
    /* Ortofoto del mismo servicio, sin clave. Sirve para reconocer el terreno
       —urbanizaciones, campos de golf, monte— cuando el fondo gris no basta;
       sus rótulos van en la capa de referencia híbrida, no en la imagen. */
    satelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    rotulosSatelite: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    credito: 'Teselas &copy; Esri &mdash; Esri, DeLorme, NAVTEQ · Datos &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    creditoSatelite: 'Ortofoto &copy; Esri &mdash; Maxar, Earthstar Geographics y la comunidad de usuarios de Esri'
  };

  /* Zoom máximo con tesela propia de cada fondo: el gris de Esri se acaba en 16
     y la ortofoto llega a 19. Poner 16 a las dos dejaría la foto borrosa de más. */
  var ZOOM_NATIVO = { mapa: 16, satelite: 18 };


  /* Rampa cálida de densidad (ColorBrewer YlOrBr): del crema donde hay poco al
     marrón rojizo donde se concentran. Es secuencial y monótona en luminosidad,
     así que se lee bien también impresa en gris y con daltonismo: lo que ordena
     la escala es el brillo, no solo el tono.

     El extremo frío se ha alargado a propósito. Leaflet.heat usa el canal alfa
     acumulado como índice de la rampa, de modo que el tramo bajo es el que pinta
     casi todo el mapa: si arranca en un amarillo saturado, una casa suelta mancha
     igual que un barrio entero. */
  var CALOR = {
    0.00: '#fff7bc',
    0.18: '#fee391',
    0.36: '#fec44f',
    0.54: '#fe9929',
    0.70: '#ec7014',
    0.85: '#cc4c02',
    1.00: '#8c2d04'
  };

  /* Geometría del pincel de calor, en píxeles de pantalla. Radio corto y desenfoque
     largo: la mancha sigue siendo continua, pero conserva la forma de las
     urbanizaciones en lugar de fundirlas en un borrón. */
  var CALOR_RADIO = 17;
  var CALOR_BLUR = 21;
  /* Suelo de opacidad por punto. Es EL parámetro que decide si el mapa satura:
     como las circunferencias se componen unas sobre otras, con 0,30 bastaban
     tres viviendas solapadas para llegar al 66 % de alfa —y por tanto al rojo—.
     Con 0,07 hacen falta decenas, que es justo lo que se quiere señalar. */
  var CALOR_SUELO = 0.07;
  /* Percentil de la densidad local que se lleva el extremo caliente de la rampa.
     No se usa el máximo absoluto: un único rascacielos de apartamentos dejaría
     el resto del municipio en el primer escalón de color. */
  var CALOR_PERCENTIL = 0.96;
  /* Opacidad de la mancha cuando comparte mapa con los puntos. Baja lo justo
     para que los círculos se despeguen del fondo; por debajo de esto la
     densidad deja de leerse y la capa sobra. */
  var CALOR_ATENUADO = 0.8;
  /* Suelo del tope de densidad. Al acercarse, la mayoría de las celdas tienen
     una sola vivienda y el percentil valdría 1: cada casa saldría como un punto
     rojo saturado y la escala dejaría de significar nada. Con este suelo, de
     cerca la mancha se lee como lo que es —dónde se agrupan— y no como un mapa
     de chinchetas de colores. */
  var CALOR_TOPE_MINIMO = 3;

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

    /* Dos interruptores independientes, no un selector de una capa entre dos: la
       densidad y los registros se pueden ver a la vez, y de hecho es lo normal
       al mirar el detalle. El zoom los mueve solo mientras el usuario no los
       toque; en cuanto los toca, manda él. */
    var conmutador = cfg.capas === false ? '' :
      '<label class="obs-map-f obs-map-fondo"><span>Capas</span>' +
        '<span class="obs-segment obs-segment-multi" role="group">' +
          '<button type="button" data-capa="calor" aria-pressed="true">' +
            Obs.esc(cfg.calorBoton || 'Densidad') + '</button>' +
          '<button type="button" data-capa="puntos" aria-pressed="false">' +
            Obs.esc(cfg.puntosBoton || 'Registros') + '</button>' +
        '</span>' +
      '</label>';

    /* Fondo del mapa. Va aparte del conmutador de capas de datos: una cosa es
       cómo se pintan los datos y otra sobre qué se pintan. */
    var fondo = cfg.satelite === false ? '' :
      '<label class="obs-map-f obs-map-fondo"><span>Fondo del mapa</span>' +
        '<span class="obs-segment" role="group">' +
          '<button type="button" data-fondo="mapa" aria-pressed="true">Mapa</button>' +
          '<button type="button" data-fondo="satelite" aria-pressed="false">Satélite</button>' +
        '</span>' +
      '</label>';

    return '<div class="obs-map" data-mapa="' + id + '">' +
      '<div class="obs-map-tools">' + filtros +
        '<div class="obs-map-capas">' + fondo + conmutador +
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
    /* `zoomSnap` en cuartos: con el salto de 1 que trae Leaflet por defecto,
       `fitBounds` redondea hacia abajo y un término que cabría a zoom 11,9 se
       encuadra a 11, es decir a la mitad de tamaño y rodeado de vacío. */
    var mapa = L.map(lienzo, { scrollWheelZoom: false, zoomControl: true,
                               attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 });
    /* Panel propio para el velo del término, entre el fondo y los datos. Sin él
       habría que meterlo en el panel de teselas, y allí el orden lo decide el
       orden de inserción en el DOM: cualquier capa de fondo añadida después
       taparía el velo. */
    mapa.createPane('obsVelo');
    mapa.getPane('obsVelo').style.zIndex = 250;
    mapa.getPane('obsVelo').style.pointerEvents = 'none';

    /* Las dos parejas de capas —fondo y rótulos— se crean de una vez y se
       intercambian añadiéndolas y quitándolas.

       No se reutiliza una sola capa con `setUrl`: en Leaflet 1.9 `setUrl` llama a
       `redraw()`, que fija el zoom de tesela con `_clampZoom(map.getZoom())` SIN
       redondear. Con `zoomSnap` fraccionado eso mete el zoom decimal en la URL
       —«…/tile/11.75/1345/1673»—, el servidor no devuelve nada y el mapa se queda
       negro sin dar ningún error. Añadir la capa vuelve a pasar por `onAdd`, que
       sí redondea.

       maxNativeZoom: el gris de Esri no sirve teselas por encima de 16 y la
       ortofoto llega a 18; por encima Leaflet reescala la última en lugar de
       dejar el fondo vacío. */
    var fondoActivo = 'mapa';
    function tesela(url, extra) {
      return L.tileLayer(url, Object.assign({ maxZoom: 19 }, extra));
    }
    var CAPAS = {
      mapa: {
        base: function () { return esOscuro() ? TESELAS.oscuro : TESELAS.claro; },
        rot: function () { return esOscuro() ? TESELAS.rotulosOscuro : TESELAS.rotulosClaro; },
        nativo: ZOOM_NATIVO.mapa, credito: TESELAS.credito, opacidadRot: .9, velo: .30
      },
      satelite: {
        base: function () { return TESELAS.satelite; },
        rot: function () { return TESELAS.rotulosSatelite; },
        nativo: ZOOM_NATIVO.satelite, credito: TESELAS.creditoSatelite, opacidadRot: 1, velo: .45
      }
    };
    var teselas = null, rotulos = null;

    function ponerFondo(cual) {
      var c = CAPAS[cual] || CAPAS.mapa;
      fondoActivo = cual;
      if (teselas) { mapa.removeLayer(teselas); mapa.removeLayer(rotulos); }
      teselas = tesela(c.base(), { attribution: c.credito, maxNativeZoom: c.nativo }).addTo(mapa);
      /* Los topónimos van en una capa aparte y por encima de los datos: si
         fuesen parte del fondo, un grupo de puntos taparía el nombre de la
         urbanización que se está mirando. */
      rotulos = tesela(c.rot(), { maxNativeZoom: c.nativo, pane: 'shadowPane',
                                  opacity: c.opacidadRot }).addTo(mapa);
      if (velo) velo.setStyle({ fillOpacity: cual === 'satelite' ? c.velo : (esOscuro() ? .22 : c.velo) });
      raiz.classList.toggle('es-satelite', cual === 'satelite');
      mapa.attributionControl.removeAttribution(TESELAS.credito);
      mapa.attributionControl.removeAttribution(TESELAS.creditoSatelite);
      mapa.attributionControl.addAttribution(c.credito);
    }
    /* --- término municipal ---
       Sin el límite dibujado, una mancha de densidad no dice dónde acaba el
       municipio: la de Benahavís se derrama visualmente sobre San Pedro y
       Estepona y cualquiera diría que hay viviendas allí. Con el contorno puesto
       —y el exterior atenuado— se ve de un vistazo qué se está midiendo.

       Se pinta con dos trazos superpuestos, uno claro y ancho por debajo y otro
       fino por encima, para que la línea se lea igual sobre el gris que sobre la
       ortofoto sin tener que cambiarla de color. */
    var limite = null, velo = null;
    if (cfg.limite && cfg.limite.geometry) {
      var anillo = cfg.limite.geometry.coordinates[0].map(function (c) { return [c[1], c[0]]; });
      /* Velo exterior: un polígono con el mundo entero como contorno y el término
         como hueco. Es un rectángulo con agujero, no un borrado del lienzo, así
         que funciona igual con teselas grises que con la foto aérea. */
      velo = L.polygon([[[90, -180], [90, 180], [-90, 180], [-90, -180]], anillo], {
        stroke: false, fillColor: '#0b1b2b', fillOpacity: .30,
        interactive: false, pane: 'obsVelo', className: 'obs-map-velo'
      }).addTo(mapa);
      limite = L.polygon(anillo, {
        color: '#ffffff', weight: 5, opacity: .55, fill: false,
        interactive: false, pane: 'overlayPane'
      }).addTo(mapa);
      L.polygon(anillo, {
        color: '#0d3b66', weight: 1.6, opacity: .95, dashArray: '7 4', fill: false,
        interactive: false, pane: 'overlayPane'
      }).addTo(mapa);
    }

    ponerFondo('mapa');

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
    /* `agrupar: false` pinta un punto por registro en lugar de burbujas con el
       recuento. Con miles de puntos hay que dibujar sobre lienzo (`L.canvas`) o
       el navegador crea un nodo SVG por punto y la pestaña se arrastra. */
    var agrupa = cfg.agrupar !== false;
    var lienzoPuntos = L.canvas({ padding: 0.3 });
    var cluster = agrupa ? L.markerClusterGroup({
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
    }) : L.layerGroup();
    var calor = null;

    /* El radio admite una función: sirve para que el punto diga además cuánto
       vale el registro —plazas, superficie, importe— sin gastar otro canal.
       Se escala con la raíz cuadrada porque lo que compara el ojo es el ÁREA del
       círculo: con escala lineal, una vivienda de 12 plazas se ve seis veces más
       grande que una de dos, no tres. */
    var RADIO = cfg.radio || (agrupa ? 6 : 4.5);
    var radioDe = typeof RADIO === 'function' ? RADIO : function () { return RADIO; };

    function marcador(p) {
      var m = L.circleMarker([p.lat, p.lon], {
        renderer: agrupa ? undefined : lienzoPuntos,
        radius: radioDe(p),
        /* El anillo del color del fondo separa los puntos que se solapan; sin
           agrupación, además, la semitransparencia deja que el amontonamiento
           se lea por sí solo. Sobre la ortofoto el anillo se pone blanco: el
           color de la interfaz se pierde contra el verde del monte. */
        weight: fondoActivo === 'satelite' ? 1.6 : (agrupa ? 2 : 1.1),
        color: fondoActivo === 'satelite' ? '#ffffff' : T.surface,
        opacity: fondoActivo === 'satelite' ? .95 : 1,
        fillColor: colorDe(p),
        fillOpacity: fondoActivo === 'satelite' ? .95 : (agrupa ? .92 : .85)
      });
      /* El globo se compone al hacer clic: preparar miles por adelantado
         cuesta más que dibujar el mapa entero. */
      if (cfg.popup) {
        m.on('click', function (ev) {
          L.popup({ maxWidth: 320, className: 'obs-popup' })
            .setLatLng(ev.latlng).setContent(cfg.popup(p)).openOn(mapa);
        });
      }
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

    /* Encuadre de partida: si hay término municipal manda él, para que el mapa
       abra enseñando el municipio entero y no la nube de puntos, que se queda
       corta por el norte cuando no hay viviendas en la sierra. */
    function encuadre() {
      var b = limite ? limite.getBounds()
                     : L.latLngBounds(puntos.map(function (p) { return [p.lat, p.lon]; }));
      mapa.fitBounds(b.pad(0.04));
    }

    /* --- normalización del calor ---
       El problema clásico de una capa de calor es que satura: la librería divide
       la intensidad acumulada de cada celda entre un `max` fijo, de modo que si
       ese tope se queda corto —y con `max: 1` se queda corto siempre— cualquier
       sitio con unos pocos puntos encima ya llega al extremo de la rampa y el
       mapa entero sale rojo. Además la densidad por píxel depende del zoom: lo
       que a escala de comarca es un borrón, a escala de urbanización son cuatro
       casas sueltas, así que un tope calculado una sola vez no vale.

       Aquí se mide la densidad que hay de verdad a cada zoom, replicando la
       misma rejilla que usa la librería (celdas de radio/2 en píxeles de
       pantalla), y se toma un percentil alto de las celdas ocupadas. Así el
       extremo caliente lo alcanza lo que de verdad es excepcional en ese
       encuadre, y el resto reparte color por todo el recorrido de la rampa. */
    var calorRef = null, calorZoom = null;

    function densidadDeReferencia(vs, zoom) {
      var celda = CALOR_RADIO / 2;
      var suma = {}, i, k;
      for (i = 0; i < vs.length; i++) {
        var pt = mapa.project([vs[i].lat, vs[i].lon], zoom);
        k = Math.floor(pt.x / celda) + ':' + Math.floor(pt.y / celda);
        suma[k] = (suma[k] || 0) + (cfg.peso ? (+cfg.peso(vs[i]) || 1) : 1);
      }
      var cargas = [];
      for (k in suma) if (suma.hasOwnProperty(k)) cargas.push(suma[k]);
      if (!cargas.length) return 1;
      cargas.sort(function (a, b) { return a - b; });
      var ref = cargas[Math.min(cargas.length - 1, Math.floor(cargas.length * CALOR_PERCENTIL))];
      return Math.max(CALOR_TOPE_MINIMO, ref);
    }

    /* --- pintado ---
       Las dos capas son independientes y NO se excluyen. La densidad es la
       lectura de conjunto y sigue diciendo algo por muy cerca que se mire —qué
       parte de la urbanización concentra las viviendas—, así que quitarla al
       acercarse deja al usuario sin la mitad de la información justo cuando
       está mirando el detalle.

       Lo que decide el zoom es solo si además aparece cada registro: de lejos,
       con miles de puntos amontonados, lo único legible es la mancha. Ese
       automatismo se puede sobrescribir con los dos conmutadores. */
    var ZOOM_DETALLE = cfg.zoomDetalle || 15;
    var automatico = cfg.modo === 'auto';
    var verCalor = true;
    var verPuntos = !automatico;
    /* Deja de mandar el zoom en cuanto el usuario toca el conmutador de puntos:
       si no, el siguiente acercamiento le desharía la elección. */
    var puntosManual = false;

    function puntosSegunZoom() {
      return mapa.getZoom() >= ZOOM_DETALLE;
    }

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
      if (verPuntos) {
        var marcas = vs.map(marcador);
        if (agrupa) cluster.addLayers(marcas);
        else marcas.forEach(function (m) { cluster.addLayer(m); });
        if (!mapa.hasLayer(cluster)) mapa.addLayer(cluster);
      } else {
        if (mapa.hasLayer(cluster)) mapa.removeLayer(cluster);
        /* El lienzo de los puntos es un renderizador propio: quitar el grupo de
           capas lo vacía, pero deja el elemento colgado en el panel. */
        if (!agrupa && mapa.hasLayer(lienzoPuntos)) mapa.removeLayer(lienzoPuntos);
      }

      if (calor) { mapa.removeLayer(calor); calor = null; }
      /* Leaflet.heat llama a getImageData sobre su propio lienzo: si la sección
         todavía está oculta el lienzo mide 0 y lanza una excepción. Se pospone. */
      if (verCalor && lienzo.offsetWidth > 0) {
        var z = mapa.getZoom();
        var ref = densidadDeReferencia(vs, z);
        calor = L.heatLayer(vs.map(function (p) {
          return [p.lat, p.lon, cfg.peso ? (+cfg.peso(p) || 1) : 1];
        }), {
          radius: CALOR_RADIO, blur: CALOR_BLUR,
          /* `maxZoom` no es hasta dónde se dibuja: es el zoom en que la librería
             considera que un punto vale su peso entero, y por debajo lo divide
             por 2^((maxZoom−zoom)/2). Ese reescalado oculto es incompatible con
             normalizar por densidad medida, así que se ancla al zoom actual
             —factor 1— y la normalización la lleva `max`. */
          maxZoom: z,
          max: ref,
          /* Suelo bajo: una vivienda aislada deja un tinte, no una mancha. */
          minOpacity: CALOR_SUELO,
          gradient: cfg.gradiente || CALOR
        }).addTo(mapa);
        /* Con los puntos encima, la mancha pasa a ser fondo: a plena intensidad
           se comería los círculos y no se distinguiría cuál es cuál. Se atenúa
           por CSS sobre su lienzo, que es lo único que expone la librería. */
        if (calor._canvas) {
          calor._canvas.style.opacity = verPuntos ? CALOR_ATENUADO : 1;
        }
        calorRef = ref;
        calorZoom = z;
      }

      visiblesAhora = vs;
      actualizarCuenta();
      if (corte != null) {
        var lbl = raiz.querySelector('[data-rol="anyo"]');
        if (lbl) lbl.textContent = corte;
      }
    }

    /* --- recuento ---
       Se dice cuántos hay y, en la vista de detalle, cuántos caben en pantalla.
       Sin ese segundo número, ver veinte puntos bajo un rótulo que pone 2.205
       hace pensar que faltan datos, cuando lo que pasa es que el resto está
       fuera del encuadre. */
    var visiblesAhora = puntos;

    function actualizarCuenta() {
      var cuenta = raiz.querySelector('[data-rol="cuenta"]');
      if (!cuenta) return;
      var vs = visiblesAhora;
      var sinFecha = cfg.fecha ? vs.filter(function (p) { return anyoDe(cfg.fecha(p)) == null; }).length : 0;
      var unidad = cfg.unidad ? ' ' + cfg.unidad : '';

      var txt = '<b>' + Obs.fmt.num(vs.length) + '</b>' +
        (vs.length !== puntos.length ? ' de ' + Obs.fmt.num(puntos.length) : '') + unidad;

      if (verPuntos && mapa._loaded) {
        var b = mapa.getBounds();
        var enPantalla = vs.filter(function (p) { return b.contains([p.lat, p.lon]); }).length;
        if (enPantalla !== vs.length) {
          txt += ' <span class="obs-map-nota">·</span> <b>' + Obs.fmt.num(enPantalla) + '</b> en pantalla';
        }
      }
      if (sinFecha) txt += ' <span class="obs-map-nota">(' + Obs.fmt.num(sinFecha) + ' sin fecha)</span>';
      if (automatico && !verPuntos && !puntosManual) {
        txt += ' <span class="obs-map-pista">acerca el mapa para ver cada ' +
          Obs.esc(cfg.unidadSingular || 'punto') + '</span>';
      }
      cuenta.innerHTML = txt;
    }

    /* Al desplazar el mapa cambia lo que cabe en pantalla, no lo que hay. */
    mapa.on('moveend', actualizarCuenta);

    /* --- leyenda ---
       Cada capa codifica el color de una forma distinta, así que cada una lleva
       su leyenda: identidad (tipología) en la de puntos, y escala continua de
       densidad en la de calor. Un color que significa algo sin leyenda que lo
       diga no es legible. */
    var cajaLeyenda = raiz.querySelector('[data-rol="leyenda"]');

    function leyendaCategorias() {
      if (!cfg.grupo) return '';
      var cats = grupos.map(function (g, i) {
        return '<span class="obs-map-item"><i style="background:' + T.serie[i % T.serie.length] + '"></i>' +
          Obs.esc(g) + '</span>';
      }).join('');
      /* Si el tamaño del punto codifica algo, hay que decirlo: un círculo más
         grande que otro es una afirmación, y sin leyenda no se sabe cuál. */
      if (typeof RADIO === 'function' && cfg.radioEtiqueta) {
        cats += '<span class="obs-map-item obs-map-tallas">' +
          '<i class="talla" style="width:7px;height:7px;border-radius:50%;background:' + T.serie[0] + '"></i>' +
          '<i class="talla" style="width:11px;height:11px;border-radius:50%;background:' + T.serie[0] + '"></i>' +
          '<i class="talla" style="width:16px;height:16px;border-radius:50%;background:' + T.serie[0] + '"></i>' +
          Obs.esc(cfg.radioEtiqueta) + '</span>';
      }
      return cats;
    }

    function leyendaCalor() {
      var g = cfg.gradiente || CALOR;
      var paradas = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
      var css = paradas.map(function (p) { return g[p] + ' ' + Math.round(p * 100) + '%'; }).join(', ');
      return '<span class="obs-map-item">' + Obs.esc(cfg.calorEtiqueta || 'Densidad') + '</span>' +
        '<span class="obs-map-escala">' +
          '<span class="ext">menos</span>' +
          '<span class="barra" style="background:linear-gradient(90deg,' + css + ')"></span>' +
          '<span class="ext">más</span>' +
        '</span>';
    }

    /* Con las dos capas puestas hacen falta las dos leyendas: el color de la
       mancha y el color del punto significan cosas distintas —densidad una,
       tipología el otro— y sin decirlo se leerían como la misma escala. */
    function leyenda() {
      var partes = [];
      if (verCalor) partes.push(leyendaCalor());
      if (verPuntos) partes.push(leyendaCategorias());
      cajaLeyenda.innerHTML = partes.filter(Boolean).join('');
      cajaLeyenda.style.display = cajaLeyenda.innerHTML ? '' : 'none';
    }

    /* --- conmutadores de capa y reinicio --- */
    /* Al acercarse aparecen los registros uno a uno; la mancha de densidad NO se
       quita: sigue diciendo dónde se concentran dentro de lo que se está
       mirando. Y en cualquier caso hay que rehacerla, porque su tope se calculó
       para el zoom anterior y con otro la escala mentiría. */
    mapa.on('zoomend', function () {
      var antes = verPuntos;
      if (automatico && !puntosManual) verPuntos = puntosSegunZoom();
      if (verPuntos !== antes) {
        sincronizarBotones();
        leyenda();
      }
      if (verPuntos !== antes || (verCalor && calorZoom !== mapa.getZoom())) pintar();
    });

    /* Deja los botones diciendo lo que de verdad se está viendo. */
    function sincronizarBotones() {
      var b = raiz.querySelector('[data-capa="calor"]');
      if (b) b.setAttribute('aria-pressed', verCalor ? 'true' : 'false');
      b = raiz.querySelector('[data-capa="puntos"]');
      if (b) b.setAttribute('aria-pressed', verPuntos ? 'true' : 'false');
    }

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
        encuadre();
        pintar();
        return;
      }
      var elFondo = b.getAttribute('data-fondo');
      if (elFondo) {
        if (elFondo === fondoActivo) return;
        ponerFondo(elFondo);
        raiz.querySelectorAll('[data-fondo]').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        pintar();
        return;
      }
      var capa = b.getAttribute('data-capa');
      if (!capa) return;
      /* Interruptores independientes, no un selector de una entre dos: las dos
         capas se pueden ver a la vez, que es lo normal al mirar el detalle. */
      if (capa === 'calor') {
        /* Nunca las dos apagadas: quedaría un mapa vacío sin explicación. */
        if (verCalor && !verPuntos) return;
        verCalor = !verCalor;
      } else {
        if (verPuntos && !verCalor) return;
        verPuntos = !verPuntos;
        puntosManual = true;
      }
      sincronizarBotones();
      leyenda();
      pintar();
    });

    /* Si el contenedor se queda sin tamaño (sección oculta, captura de pantalla,
       ventana minimizada) la capa de calor intenta leer un lienzo de 0 px y
       lanza una excepción por dentro de la librería. Se retira y se repone. */
    mapa.on('resize', function () {
      var s = mapa.getSize();
      if ((!s.x || !s.y) && calor) { mapa.removeLayer(calor); calor = null; }
      else if (s.x && s.y && verCalor && !calor) pintar();
    });

    encuadre();
    if (automatico) verPuntos = puntosSegunZoom();
    sincronizarBotones();
    leyenda();
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

    var ref = { mapa: mapa, repintar: pintar,
                fondo: function () { return fondoActivo; },
                /* Rehace el fondo con el tema activo. Las capas se recrean al
                   conmutar, así que no se pueden guardar aquí. */
                retema: function () { ponerFondo(fondoActivo); } };
    mapas.push(ref);
    setTimeout(function () { mapa.invalidateSize(); }, 60);
    return ref;
  };

  /** Mapas vivos de la página. Útil para diagnosticar desde la consola. */
  Obs.mapasActivos = function () { return mapas; };

  /** Cambia las teselas al tema activo. Lo llama el armazón al conmutar. */
  Obs.mapasRepintar = function () {
    mapas.forEach(function (r) {
      /* Con la ortofoto puesta, el tema de la página no manda sobre el fondo:
         una foto aérea no tiene versión oscura, solo cambia el velo. */
      r.retema();
      r.repintar();
    });
  };

})(window);
