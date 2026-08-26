/* ============================================================================
   Observatorio Turístico y Socioeconómico de Benahavís
   Declaración del panel sobre el kit de observatorios (assets/kit/).
   Datos: docs/data/*.json, que escribe el pipeline de src/.
   ========================================================================== */
(function () {
  'use strict';

  var F = Obs.fmt;
  var D = {};

  /* ------------------------------------------------------------- Adaptadores */

  var ejeT = function (a) { return (a || []).map(function (p) { return p.t; }); };
  var vals = function (a) { return (a || []).map(function (p) { return p.v; }); };
  var campo = function (a, k, sub) {
    return (a || []).map(function (r) { return sub ? (r[k] || {})[sub] : r[k]; });
  };
  var ult = function (a) { return a && a.length ? a[a.length - 1] : null; };
  var ultV = function (a) { var x = ult(a); return x ? x.v : null; };
  var varIntSerie = function (a) {
    if (!a || a.length < 13) return null;
    var c = a[a.length - 1], p = a[a.length - 13];
    return (c == null || !p) ? null : (c - p) / p * 100;
  };
  var suma = function (a) { return (a || []).reduce(function (s, v) { return s + (+v || 0); }, 0); };

  /* --------------------------------------------------------------- Fuentes */

  var FTE = {
    padron:   { txt: 'INE · Cifras oficiales de población', url: 'https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736177011' },
    atlas:    { txt: 'INE · Atlas de distribución de renta de los hogares', url: 'https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736177088' },
    rta:      { txt: 'Junta de Andalucía · Registro de Turismo de Andalucía', url: 'https://www.juntadeandalucia.es/datosabiertos/portal/dataset/registro-de-turismo-de-andalucia' },
    ine_vut:  { txt: 'INE · Medición del alquiler de viviendas turísticas', url: 'https://www.ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736177015' },
    cds:      { txt: 'Turismo Costa del Sol · Big Data', url: 'https://www.costadelsolmalaga.org/bigdata/?mun=29023' },
    moviles:  { txt: 'INE · Turismo a partir del posicionamiento de móviles', url: 'https://www.ine.es/experimental/turismo/experimental_turismo.htm' },
    eoh:      { txt: 'INE · Encuesta de Ocupación Hotelera por zonas turísticas', url: 'https://www.dataestur.es/' },
    sepe:     { txt: 'SEPE · datos abiertos por municipios', url: 'https://www.sepe.es/HomeSepe/que-es-el-sepe/estadisticas/datos-estadisticos/municipios.html' },
    ss:       { txt: 'Seguridad Social · afiliación por municipio y CNAE', url: 'https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas' },
    aemet:    { txt: 'AEMET OpenData · estación 6069X Benahavís', url: 'https://opendata.aemet.es/' },
    hacienda: { txt: 'Ministerio de Hacienda · deuda viva de entidades locales', url: 'https://www.hacienda.gob.es/es-ES/CDI/Paginas/EstabilidadPresupuestaria/InformacionAAPPs/Deuda-Viva-Ayuntamientos.aspx' }
  };

  var MENSUAL = { txt: 'Mensual', tipo: 'live' };
  var ANUAL = { txt: 'Anual' };
  var SUPRA = { txt: 'Supramunicipal', tipo: 'warn' };
  var EXPERIMENTAL = { txt: 'Experimental', tipo: 'warn' };

  /* ================================================================== VUT === */

  var TRAMOS = [
    { max: 4,  txt: 'Hasta 4 plazas' },
    { max: 6,  txt: 'De 5 a 6 plazas' },
    { max: 8,  txt: 'De 7 a 8 plazas' },
    { max: 12, txt: 'De 9 a 12 plazas' },
    { max: Infinity, txt: 'Más de 12 plazas' }
  ];
  var tramoDe = function (p) {
    for (var i = 0; i < TRAMOS.length; i++) if ((p.plazas || 0) <= TRAMOS[i].max) return TRAMOS[i].txt;
    return TRAMOS[TRAMOS.length - 1].txt;
  };

  var DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
             'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var fechaLarga = function (iso) {
    if (!iso) return '—';
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    return +p[2] + ' de ' + MES[+p[1] - 1] + ' de ' + p[0];
  };

  /* Ficha emergente de una vivienda. Publica lo que consta en el RTA, que es un
     registro público, más lo que el Big Data sabe de ella si el cruce existe. */
  function fichaVUT(p) {
    var e = Obs.esc;
    var fila = function (k, v) { return v == null || v === '' ? '' : '<dt>' + e(k) + '</dt><dd>' + v + '</dd>'; };
    var m = p.mercado || {};
    var conMercado = m.precio_plaza != null || m.ocupacion != null || m.rating != null;
    return '<div class="obs-ficha">' +
      '<h4>' + e(p.nombre || 'Sin denominación') + '</h4>' +
      '<div class="ref">' + e(p.ref || '') + ' · ' + e(p.tipo) + (p.grupo ? ' · ' + e(p.grupo) : '') + '</div>' +
      (p.direccion ? '<div class="dir">' + e(p.direccion) + (p.cp ? '<br>' + e(p.cp) + ' Benahavís' : '') + '</div>' : '') +
      '<dl>' +
        fila('Alta en el RTA', fechaLarga(p.alta)) +
        fila('Plazas', F.num(p.plazas)) +
        fila('Unidades de alojamiento', F.num(p.unidades)) +
        (p.titular ? fila('Titular', e(p.titular)) : '') +
        (p.catastro ? fila('Ref. catastral', '<span style="font-size:11px">' + e(p.catastro) + '</span>') : '') +
        (conMercado ?
          '<div class="sep"></div>' +
          fila('Precio medio por plaza', m.precio_plaza != null ? F.eur(m.precio_plaza, 2) : null) +
          fila('Grado de ocupación', m.ocupacion != null ? F.pct(m.ocupacion) : null) +
          fila('Valoración', m.rating != null ? F.num(m.rating, 2) + ' / 5' : null)
        : '') +
      '</dl>' +
      '<div class="dir" style="margin-top:8px;opacity:.8">Fuente: RTA' +
        (conMercado ? ' · Big Data Costa del Sol' : '') + '</div>' +
    '</div>';
  }

  /* Listado de las inscripciones que no se pueden situar en el mapa. Se publica
     entero: decir «hay 45» sin decir cuáles no sirve para depurar el registro. */
  function bloqueSinUbicar(sin) {
    if (!sin || !sin.length) return '';
    var e = Obs.esc;
    var filas = sin.map(function (p) {
      return '<tr><td>' + e(p.ref || '—') + '</td><td>' + e(p.nombre || '—') + '</td>' +
        '<td style="text-align:left">' + e(p.tipo) + '</td>' +
        '<td>' + F.num(p.plazas) + '</td>' +
        '<td>' + (p.alta ? p.alta : '—') + '</td>' +
        '<td style="text-align:left">' + e(p.motivo) +
          (p.lat_erronea != null ? ' (' + p.lat_erronea + ', ' + p.lon_erronea + ')' : '') + '</td></tr>';
    }).join('');
    return '<article class="obs-card span-2" style="margin-top:16px">' +
      '<div class="obs-card-head"><div class="t">' +
        '<h3>Inscripciones que no aparecen en el mapa</h3>' +
        '<div class="cs">' + sin.length + ' de ' + F.num(D.vut.registro.total) +
          ' inscripciones no se pueden situar. No se reubican ni se corrigen: el dato de origen es el que es.</div>' +
      '</div></div>' +
      '<div class="obs-table-wrap" style="display:block;max-height:340px">' +
        '<table class="obs-table"><thead><tr>' +
          '<th style="text-align:left">Nº inscripción</th><th style="text-align:left">Denominación</th>' +
          '<th style="text-align:left">Tipología</th><th>Plazas</th><th>Alta</th>' +
          '<th style="text-align:left">Motivo</th>' +
        '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<div class="obs-card-foot"><span class="obs-chip warn">Depuración</span>' +
        '<span>Fuente: <a href="' + FTE.rta.url + '" target="_blank" rel="noopener">' + FTE.rta.txt + '</a></span></div>' +
    '</article>';
  }

  function seccionVUT() {
    var v = D.vut || {};
    var reg = v.registro || {}, mer = v.mercado || {};
    var fichas = (reg.fichas || []);
    var TIPOS_VIVIENDA = ['Vivienda de uso turístico', 'Vivienda turística de alojamiento rural',
                          'Apartamento turístico', 'Casa rural'];
    var viviendas = fichas.filter(function (p) { return TIPOS_VIVIENDA.indexOf(p.tipo) >= 0; });
    var sinUbicarViv = (reg.sin_ubicar || []).filter(function (p) { return TIPOS_VIVIENDA.indexOf(p.tipo) >= 0; });

    var totalVUT = viviendas.length + sinUbicarViv.length;
    var plazasVUT = suma(viviendas.map(function (p) { return p.plazas; })) +
                    suma(sinUbicarViv.map(function (p) { return p.plazas; }));

    /* Altas por año y acumulado, contando también las que no se sitúan. */
    var todas = viviendas.concat(sinUbicarViv);
    var porAnyo = {};
    todas.forEach(function (p) {
      var a = p.alta ? p.alta.slice(0, 4) : null;
      if (a) porAnyo[a] = (porAnyo[a] || 0) + 1;
    });
    var anyos = Object.keys(porAnyo).sort();
    var acum = 0, acumulado = anyos.map(function (a) { acum += porAnyo[a]; return acum; });

    /* Distribución por tamaño. */
    var porTramo = {};
    todas.forEach(function (p) { var t = tramoDe(p); porTramo[t] = (porTramo[t] || 0) + 1; });
    var tramosOrden = TRAMOS.map(function (t) { return t.txt; }).filter(function (t) { return porTramo[t]; });

    /* Acumulado de inscripciones vivas mes a mes, alineado con los meses que
       publica el mercado, para poder comparar registro y mercado en un solo eje. */
    var mesesMercado = ejeT(mer.activas);
    var altasMes = {};
    todas.forEach(function (p) {
      if (p.alta) { var k = p.alta.slice(0, 7); altasMes[k] = (altasMes[k] || 0) + 1; }
    });
    var clavesAlta = Object.keys(altasMes).sort();
    var inscritasPorMes = (function () {
      var i = 0, corrido = 0;
      return mesesMercado.map(function (t) {
        while (i < clavesAlta.length && clavesAlta[i] <= t) { corrido += altasMes[clavesAlta[i]]; i++; }
        return corrido;
      });
    })();

    var serieCDS = ((D.costadelsol || {}).vivienda_turistica || {}).serie || [];
    var pobl = ((D.demografia || {}).padron || {}).total || [];
    var poblacion = ultV(pobl);

    return {
      hero: {
        valor: totalVUT,
        label: 'Viviendas turísticas inscritas en el Registro de Turismo de Andalucía',
        extra: [
          { label: 'Plazas inscritas', valor: plazasVUT },
          { label: 'Plazas por cada 100 habitantes', valor: poblacion ? plazasVUT / poblacion * 100 : null, formato: function (x) { return F.num(x, 1); } },
          { label: 'Anunciadas en portales (' + Obs.periodo(mer.mes_ultimo, 'mes') + ')', valor: (mer.ultimo || []).length }
        ]
      },
      kpis: [
        { label: 'Viviendas inscritas', valor: totalVUT, delta: (function () {
            var i = anyos.indexOf(String(new Date().getFullYear() - 1));
            return (i > 0 && acumulado[i - 1]) ? (acumulado[i] - acumulado[i - 1]) / acumulado[i - 1] * 100 : null;
          })(), deltaRef: 'último año cerrado', serie: acumulado },
        { label: 'Plazas medias por vivienda', valor: totalVUT ? plazasVUT / totalVUT : null, dec: 1, formato: F.num },
        { label: 'Ocupación de la vivienda turística', valor: ultV(serieCDS.map(function (r) { return { v: r.ocupacion }; })), unidad: '%', dec: 1, formato: F.num,
          serie: serieCDS.slice(-24).map(function (r) { return r.ocupacion; }) },
        { label: 'Precio medio por plaza y noche', valor: ultV(serieCDS.map(function (r) { return { v: r.precio_plaza }; })), unidad: '€', dec: 2, formato: F.num,
          serie: serieCDS.slice(-24).map(function (r) { return r.precio_plaza; }) }
      ],
      nota: 'Esta pestaña cruza las <b>dos únicas fuentes que bajan a la vivienda concreta</b>, y no las mezcla en una sola capa porque no miden lo mismo. ' +
            'El <b>RTA</b> es el registro administrativo: dice qué está inscrito y desde cuándo. El <b>Big Data de Turismo Costa del Sol</b> rastrea lo que está ' +
            '<i>anunciado</i> en plataformas: dice qué se está comercializando, a qué precio y con qué ocupación. Una vivienda inscrita puede no estar anunciada, y al revés.',
      cards: [
        {
          titulo: 'Mapa de las viviendas turísticas de Benahavís',
          sub: F.num(viviendas.length) + ' viviendas situadas · acerca el mapa para ver cada una y pinchar sus datos · mueve la línea del tiempo para ver cómo se ha ido poblando el municipio',
          chips: [{ txt: 'Por vivienda', tipo: 'live' }], fuente: FTE.rta, ancho: 'full', alto: 'tall',
          nota: 'El color mide densidad de viviendas, no plazas: del amarillo (poca) al rojo (mucha). Al acercarse aparece cada vivienda en la coordenada que consta en el registro.',
          mapa: {
            puntos: viviendas,
            unidad: 'viviendas',
            /* El mapa decide solo qué enseñar: de lejos, la densidad; al
               acercarse, cada vivienda como un punto que se puede pinchar. */
            modo: 'auto',
            zoomDetalle: 14,
            agrupar: false,
            unidadSingular: 'vivienda',
            calorEtiqueta: 'Densidad de viviendas turísticas',
            fecha: function (p) { return p.alta; },
            grupo: function (p) { return p.tipo; },
            popup: fichaVUT,
            linea: { etiqueta: 'Inscritas hasta', acumulado: true },
            filtros: [
              { id: 'tipo', label: 'Tipología', valor: function (p) { return p.tipo; } },
              { id: 'tramo', label: 'Tamaño', valor: tramoDe },
              { id: 'mercado', label: 'Anunciada en portales',
                valor: function (p) { return p.mercado ? 'Sí' : 'No'; } }
            ]
          }
        },
        {
          titulo: 'Altas en el registro por año', sub: 'Nuevas inscripciones de vivienda turística',
          chips: [ANUAL], fuente: FTE.rta,
          spec: {
            type: 'bar', xType: 'anual', xLabel: 'Año', x: anyos, yFormat: 'num',
            series: [{ name: 'Altas', data: anyos.map(function (a) { return porAnyo[a]; }) }]
          }
        },
        {
          titulo: 'Parque acumulado de vivienda turística', sub: 'Inscripciones vivas acumuladas',
          chips: [ANUAL], fuente: FTE.rta,
          spec: {
            type: 'area', xType: 'anual', xLabel: 'Año', x: anyos, yFormat: 'num',
            series: [{ name: 'Viviendas inscritas', data: acumulado }]
          }
        },
        {
          titulo: 'Registro frente a mercado', sub: 'Viviendas inscritas en el RTA y viviendas efectivamente anunciadas',
          chips: [MENSUAL], fuente: FTE.cds, ancho: 'full',
          nota: 'Que el mercado vaya muy por debajo del registro es lo esperable: no toda vivienda inscrita se anuncia, ' +
                'y las que se anuncian no lo están todos los meses. La distancia entre ambas líneas es la que interesa al Ayuntamiento.',
          /* Las dos series cuentan viviendas: son comparables en el mismo eje.
             Las plazas van en otra tarjeta, porque mezclar recuentos de viviendas
             con recuentos de plazas en una sola escala no dice nada. */
          spec: {
            type: 'line', xType: 'mes', x: mesesMercado, yFormat: 'num',
            series: [
              { name: 'Inscritas en el RTA (acumulado)', data: inscritasPorMes },
              { name: 'Anunciadas en portales', data: vals(mer.activas) }
            ]
          }
        },
        {
          titulo: 'Ocupación y precio de la vivienda turística', sub: 'Grado de ocupación mensual del municipio',
          chips: [MENSUAL], fuente: FTE.cds,
          spec: {
            type: 'line', xType: 'mes', x: ejeT(serieCDS), yFormat: 'pct',
            series: [{ name: 'Ocupación', data: serieCDS.map(function (r) { return r.ocupacion; }) }]
          }
        },
        {
          titulo: 'Precio medio por plaza', sub: 'Euros por plaza y noche',
          chips: [MENSUAL], fuente: FTE.cds,
          spec: {
            type: 'line', xType: 'mes', x: ejeT(serieCDS), yFormat: 'eur',
            series: [{ name: 'Precio por plaza', data: serieCDS.map(function (r) { return r.precio_plaza; }) }]
          }
        },
        {
          titulo: 'Tamaño de las viviendas', sub: 'Inscripciones por tramo de plazas',
          chips: [{ txt: 'Censo' }], fuente: FTE.rta,
          spec: {
            type: 'barh', x: tramosOrden, yFormat: 'num',
            series: [{ name: 'Viviendas', data: tramosOrden.map(function (t) { return porTramo[t]; }) }]
          }
        }
      ],
      extra: bloqueSinUbicar(reg.sin_ubicar)
    };
  }

  /* ============================================================== Secciones = */

  var SECCIONES = [

    /* --------------------------------------------------------- Población --- */
    {
      id: 'poblacion', nombre: 'Población y renta',
      titulo: 'Población y renta',
      desc: 'Padrón municipal y Atlas de distribución de renta del INE. Benahavís es un municipio pequeño, ' +
            'así que muchas estadísticas oficiales no bajan hasta aquí; las que sí lo hacen están en esta pestaña.',
      render: function () {
        var d = D.demografia || {}, p = d.padron || {}, r = d.renta || {}, g = d.desigualdad || {};
        return {
          kpis: [
            { label: 'Población empadronada', valor: (d.poblacion_actual || {}).v, serie: vals(p.total).slice(-15) },
            { label: 'Renta neta media por persona', valor: ultV(r.renta_neta_persona), unidad: '€', serie: vals(r.renta_neta_persona) },
            { label: 'Índice de Gini', valor: ultV(g.gini), dec: 1, formato: F.num, serie: vals(g.gini) },
            { label: 'Relación P80/P20', valor: ultV(g.p80_p20), dec: 1, formato: F.num, serie: vals(g.p80_p20) }
          ],
          cards: [
            {
              titulo: 'Evolución de la población', sub: 'Padrón a 1 de enero',
              chips: [ANUAL], fuente: FTE.padron, ancho: 'full',
              spec: {
                type: 'area', xType: 'anual', xLabel: 'Año', x: ejeT(p.total), yFormat: 'num',
                series: [{ name: 'Población', data: vals(p.total) }]
              }
            },
            {
              titulo: 'Renta media por persona y por hogar', sub: 'Renta neta anual',
              chips: [ANUAL], fuente: FTE.atlas,
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', x: ejeT(r.renta_neta_hogar), yFormat: 'eur',
                series: [
                  { name: 'Por hogar', data: vals(r.renta_neta_hogar) },
                  { name: 'Por persona', data: vals(r.renta_neta_persona) }
                ]
              }
            },
            {
              titulo: 'Desigualdad', sub: 'Índice de Gini y relación entre el 20 % más rico y el 20 % más pobre',
              chips: [ANUAL], fuente: FTE.atlas,
              nota: 'El Gini viene en escala 0–100. Cuanto más alto, más desigual es el reparto de la renta.',
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', x: ejeT(g.gini), yFormat: 'dec1',
                series: [
                  { name: 'Gini (0–100)', data: vals(g.gini) },
                  { name: 'P80 / P20', data: vals(g.p80_p20) }
                ]
              }
            }
          ]
        };
      }
    },

    /* ------------------------------------------------------------ Oferta --- */
    {
      id: 'oferta', nombre: 'Oferta',
      titulo: 'Oferta de alojamiento',
      desc: 'Todo el alojamiento reglado del municipio según el Registro de Turismo de Andalucía, con el contraste ' +
            'de la estadística experimental del INE, que mide oferta <i>anunciada</i> y no oferta <i>inscrita</i>.',
      render: function () {
        var o = D.oferta || {}, rta = o.rta || {}, ie = o.ine_experimental || {};
        var tipos = Object.keys(rta.por_tipo || {});
        var cds = ((D.costadelsol || {}).oferta || {});
        return {
          nota: 'El RTA y el INE <b>no se fusionan nunca</b>: el registro mide inscripción administrativa y el INE, ' +
                'viviendas anunciadas en plataformas. Sumarlos o cruzarlos como si midieran lo mismo es el error clásico de este indicador.',
          kpis: [
            { label: 'Inscripciones en el RTA', valor: rta.total_inscripciones },
            { label: 'Plazas de alojamiento', valor: rta.plazas_alojamiento },
            { label: 'Viviendas anunciadas (INE)', valor: ultV(ie.viviendas), serie: vals(ie.viviendas) },
            { label: 'Plazas anunciadas (INE)', valor: ultV(ie.plazas), serie: vals(ie.plazas) }
          ],
          cards: [
            {
              titulo: 'Oferta inscrita por tipología', sub: 'Establecimientos y plazas en el RTA',
              chips: [{ txt: 'Censo' }], fuente: FTE.rta, ancho: 'full',
              spec: {
                type: 'barh', x: tipos, yFormat: 'num',
                series: [{ name: 'Plazas', data: tipos.map(function (t) { return rta.por_tipo[t].plazas; }) }]
              }
            },
            {
              titulo: 'Viviendas turísticas anunciadas', sub: 'Estadística experimental del INE',
              chips: [EXPERIMENTAL], fuente: FTE.ine_vut,
              nota: 'El INE publica esta operación por oleadas, no todos los meses.',
              spec: {
                type: 'line', xType: 'mes', x: ejeT(ie.viviendas), yFormat: 'num',
                series: [
                  { name: 'Plazas', data: vals(ie.plazas) },
                  { name: 'Viviendas', data: vals(ie.viviendas) }
                ]
              }
            },
            {
              titulo: 'Plazas por tipología, serie histórica', sub: 'Big Data de Turismo Costa del Sol',
              chips: [MENSUAL], fuente: FTE.cds,
              spec: (function () {
                var pt = cds.por_tipologia || {};
                var claves = Object.keys(pt).filter(function (k) { return (pt[k] || []).length; });
                var meses = cds.meses || [];
                return {
                  type: 'stack', xType: 'mes', x: meses, yFormat: 'num',
                  series: claves.map(function (k) {
                    var m = {};
                    (pt[k] || []).forEach(function (r) { m[r.t] = r.plazas; });
                    return { name: k, data: meses.map(function (t) { return m[t] == null ? null : m[t]; }) };
                  })
                };
              })()
            }
          ]
        };
      }
    },

    /* --------------------------------------------------------------- VUT --- */
    {
      id: 'vut', nombre: 'Viviendas turísticas',
      titulo: 'Viviendas de uso turístico',
      desc: 'Dónde están, cuántas son, desde cuándo y cómo se comercializan. Es el indicador que más ha cambiado ' +
            'el municipio en la última década y el que más peso tiene en el expediente de Municipio Turístico.',
      render: seccionVUT
    },

    /* ----------------------------------------------------------- Demanda --- */
    {
      id: 'demanda', nombre: 'Demanda',
      titulo: 'Demanda turística',
      desc: 'Turistas que pernoctan en el municipio según la estadística experimental del INE construida sobre el ' +
            'posicionamiento de teléfonos móviles. Es la única fuente que resuelve la demanda a escala municipal: ' +
            'la Encuesta de Ocupación Hotelera no baja hasta Benahavís.',
      render: function () {
        var d = D.demanda || {}, rec = d.receptor || {}, itn = d.interno || {}, eoh = d.eoh_zona_turistica || {};
        var top = rec.top_paises_12m || [];
        return {
          nota: 'Estadística <b>experimental</b> del INE. Mide presencia detectada por posicionamiento de móviles, no encuestas a viajeros: ' +
                'sirve perfectamente para la evolución y el peso relativo de cada mercado, y con más cautela para las cifras absolutas.',
          kpis: [
            { label: 'Turistas extranjeros (último mes)', valor: ultV(rec.serie), delta: varIntSerie(vals(rec.serie)), deltaRef: 'interanual', serie: vals(rec.serie).slice(-24) },
            { label: 'Turistas extranjeros (12 meses)', valor: suma((rec.serie || []).slice(-12).map(function (r) { return r.v; })) },
            { label: 'Turistas nacionales (último mes)', valor: ultV(itn.serie), serie: vals(itn.serie).slice(-18) },
            { label: 'Principal mercado emisor', valor: top.length ? top[0].v : null, unidad: top.length ? top[0].pais : '' }
          ],
          cards: [
            {
              titulo: 'Turistas extranjeros por mes', sub: 'Posicionamiento de móviles, municipio de destino',
              chips: [MENSUAL, EXPERIMENTAL], fuente: FTE.moviles, ancho: 'full',
              spec: {
                type: 'line', xType: 'mes', x: ejeT(rec.serie), yFormat: 'num',
                series: [{ name: 'Turistas extranjeros', data: vals(rec.serie) }]
              }
            },
            {
              titulo: 'Mercados emisores', sub: 'Turistas por país de origen, últimos 12 meses',
              chips: [EXPERIMENTAL], fuente: FTE.moviles,
              spec: {
                type: 'barh', x: top.slice(0, 10).map(function (r) { return r.pais; }), yFormat: 'num',
                series: [{ name: 'Turistas', data: top.slice(0, 10).map(function (r) { return r.v; }) }]
              }
            },
            {
              titulo: 'Turismo nacional por provincia de origen', sub: 'Principales orígenes',
              chips: [EXPERIMENTAL], fuente: FTE.moviles,
              spec: {
                type: 'barh', yFormat: 'num',
                x: (itn.top_origenes || []).slice(0, 10).map(function (r) { return r.municipio; }),
                series: [{ name: 'Turistas', data: (itn.top_origenes || []).slice(0, 10).map(function (r) { return r.v; }) }]
              }
            },
            {
              titulo: 'Ocupación hotelera de la zona turística', sub: 'Costa del Sol (Málaga) — indicador sustitutivo',
              chips: [MENSUAL, SUPRA], fuente: FTE.eoh, ancho: 'full',
              nota: 'Ámbito supramunicipal: describe la Costa del Sol, no Benahavís. Se incluye como contexto y NO acredita al municipio ante la Junta.',
              spec: {
                type: 'line', xType: 'mes', yFormat: 'pct',
                x: ejeT(eoh.serie_mensual),
                series: [{ name: 'Ocupación por plazas', data: campo(eoh.serie_mensual, 'ocupacion_plazas') }]
              }
            }
          ]
        };
      }
    },

    /* ------------------------------------------------------------ Empleo --- */
    {
      id: 'empleo', nombre: 'Empleo',
      titulo: 'Mercado de trabajo',
      desc: 'Paro registrado y contratación del SEPE, y afiliación a la Seguridad Social por actividad. ' +
            'En un municipio de este tamaño casi la mitad de las celdas de afiliación están enmascaradas por secreto ' +
            'estadístico, así que la afiliación se publica como <b>intervalo</b> y no como una cifra falsamente exacta.',
      render: function () {
        var t = D.trabajo || {}, paro = (t.paro || {}).serie || [], con = (t.contratos || {}).serie || [];
        var afi = (t.afiliacion || {});
        var cdsEmpleo = ((D.costadelsol || {}).empleo || {});
        return {
          kpis: [
            { label: 'Paro registrado', valor: ultV(campo(paro, 'total').map(function (v) { return { v: v }; })), invertir: true,
              delta: varIntSerie(campo(paro, 'total')), deltaRef: 'interanual', serie: campo(paro, 'total').slice(-24) },
            { label: 'Contratos del mes', valor: ult(campo(con, 'total')), serie: campo(con, 'total').slice(-24) },
            { label: 'Afiliación total', valor: ult((afi.serie_total || []).map(function (r) { return r.min; })),
              unidad: 'o más', serie: (afi.serie_total || []).map(function (r) { return r.min; }) },
            { label: 'Afiliación en actividades turísticas', valor: ult((afi.serie_turistico || []).map(function (r) { return r.min; })),
              unidad: 'o más', serie: (afi.serie_turistico || []).map(function (r) { return r.min; }) }
          ],
          cards: [
            {
              titulo: 'Paro registrado por sexo', sub: 'Demandantes inscritos a último día de mes',
              chips: [MENSUAL], fuente: FTE.sepe, ancho: 'full',
              spec: {
                type: 'stack', xType: 'mes', x: ejeT(paro), yFormat: 'num',
                series: [
                  { name: 'Mujeres', data: campo(paro, 'mujeres') },
                  { name: 'Hombres', data: campo(paro, 'hombres') }
                ]
              }
            },
            {
              titulo: 'Afiliación a la Seguridad Social', sub: 'Horquilla por el enmascarado de celdas pequeñas',
              chips: [MENSUAL], fuente: FTE.ss,
              nota: 'Los valores entre 1 y 4 se publican como «<5». La franja entre mínimo y máximo es la incertidumbre real, no una estimación.',
              spec: {
                type: 'line', xType: 'mes', x: (afi.serie_total || []).map(function (r) { return r.t; }), yFormat: 'num',
                series: [
                  { name: 'Máximo posible', data: (afi.serie_total || []).map(function (r) { return r.max; }) },
                  { name: 'Mínimo seguro', data: (afi.serie_total || []).map(function (r) { return r.min; }) }
                ]
              }
            },
            {
              titulo: 'Contratación indefinida y temporal', sub: 'Contratos registrados en el mes',
              chips: [MENSUAL], fuente: FTE.sepe,
              spec: {
                type: 'stack', xType: 'mes', x: ejeT(con), yFormat: 'num',
                series: [
                  { name: 'Indefinidos', data: campo(con, 'indefinidos') },
                  { name: 'Temporales', data: campo(con, 'temporales') }
                ]
              }
            },
            {
              titulo: 'Empleo turístico por subsector', sub: 'Trabajadores afiliados, Big Data de Turismo Costa del Sol',
              chips: [{ txt: 'Trimestral' }], fuente: FTE.cds, ancho: 'full',
              nota: 'Esta fuente no aplica el enmascarado «<5», así que da el desglose por subsector que la descarga directa de la Seguridad Social oculta.',
              spec: (function () {
                var ps = cdsEmpleo.por_subsector || {};
                var claves = Object.keys(ps);
                var per = cdsEmpleo.periodos || [];
                return {
                  type: 'stack', xType: 'mes', x: per, yFormat: 'num',
                  series: claves.map(function (k) {
                    var m = {};
                    (ps[k] || []).forEach(function (r) { m[r.t] = r.trabajadores; });
                    return { name: k, data: per.map(function (t) { return m[t] == null ? null : m[t]; }) };
                  })
                };
              })()
            }
          ]
        };
      }
    },

    /* ------------------------------------------------------------ Precios -- */
    {
      id: 'precios', nombre: 'Precios',
      titulo: 'Precios del alojamiento',
      desc: 'Precio medio y valoración por tipología, a partir del rastreo de portales de reserva que publica el ' +
            'Big Data de Turismo Costa del Sol.',
      render: function () {
        var p = ((D.costadelsol || {}).precios || {});
        var series = p.series || {}, meses = p.meses || [];
        var claves = Object.keys(series).filter(function (k) { return (series[k] || []).length > 6; }).slice(0, 6);
        var serie = function (k, campoN) {
          var m = {};
          (series[k] || []).forEach(function (r) { m[r.t] = r[campoN]; });
          return meses.map(function (t) { return m[t] == null ? null : m[t]; });
        };
        return {
          kpis: claves.slice(0, 4).map(function (k) {
            var s = serie(k, 'precio').filter(function (x) { return x != null; });
            return { label: k, valor: s.length ? s[s.length - 1] : null, unidad: '€', dec: 0, formato: F.num, serie: s.slice(-24) };
          }),
          cards: [
            {
              titulo: 'Precio medio por tipología', sub: 'Euros por noche',
              chips: [MENSUAL], fuente: FTE.cds, ancho: 'full', alto: 'tall',
              spec: {
                type: 'line', xType: 'mes', x: meses, yFormat: 'eur',
                series: claves.map(function (k) { return { name: k, data: serie(k, 'precio') }; })
              }
            },
            {
              titulo: 'Valoración media de los establecimientos', sub: 'Puntuación de los portales de reserva',
              chips: [MENSUAL], fuente: FTE.cds, ancho: 'full',
              spec: {
                type: 'line', xType: 'mes', x: meses, yFormat: 'dec2',
                series: claves.map(function (k) { return { name: k, data: serie(k, 'valoracion') }; })
              }
            }
          ]
        };
      }
    },

    /* -------------------------------------------------------------- Clima -- */
    {
      id: 'clima', nombre: 'Clima',
      titulo: 'Clima',
      desc: 'Serie de la estación de AEMET <b>6069X Benahavís</b>, situada dentro del término municipal a 392 m de altitud. ' +
            'Tener estación propia evita recurrir a la de un municipio vecino, que es lo que suele objetarse en el expediente.',
      render: function () {
        var c = D.clima || {}, n = c.normales || [], ex = c.extremos || {};
        return {
          kpis: [
            { label: 'Temperatura media anual', valor: ultV(c.temperatura_anual), unidad: '°C', dec: 1, formato: F.num, serie: vals(c.temperatura_anual) },
            { label: 'Precipitación anual', valor: ultV(c.precipitacion_anual), unidad: 'mm', formato: F.num, serie: vals(c.precipitacion_anual) },
            { label: 'Temperatura máxima registrada', valor: (ex.ta_max || {}).valor, unidad: '°C', dec: 1, formato: F.num },
            { label: 'Meses observados', valor: c.meses_observados }
          ],
          cards: [
            {
              titulo: 'Climograma', sub: 'Valores normales del periodo observado en la estación 6069X',
              chips: [{ txt: 'Normales' }], fuente: FTE.aemet, ancho: 'full',
              nota: 'Precipitación y temperatura no comparten eje: son magnitudes distintas y superponerlas en una sola escala falsearía la lectura.',
              spec: {
                type: 'bar', x: n.map(function (r) { return MES[r.mes - 1]; }), yFormat: 'num', yLabel: 'mm',
                series: [{ name: 'Precipitación media (mm)', data: n.map(function (r) { return r.precipitacion_media; }) }]
              }
            },
            {
              titulo: 'Temperatura media mensual', sub: 'Valores normales, °C',
              chips: [{ txt: 'Normales' }], fuente: FTE.aemet,
              spec: {
                type: 'line', x: n.map(function (r) { return MES[r.mes - 1]; }), yFormat: 'dec1', yLabel: '°C',
                series: [{ name: 'Temperatura media', data: n.map(function (r) { return r.temperatura_media; }) }]
              }
            },
            {
              titulo: 'Temperatura media anual', sub: 'Serie de la estación',
              chips: [ANUAL], fuente: FTE.aemet,
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', x: ejeT(c.temperatura_anual), yFormat: 'dec1',
                series: [{ name: 'Temperatura media', data: vals(c.temperatura_anual) }]
              }
            }
          ]
        };
      }
    }
  ];

  /* ----------------------------------------------------------- Arranque --- */

  var FICHEROS = ['meta', 'demografia', 'oferta', 'vut', 'demanda', 'trabajo',
                  'economia', 'clima', 'visitantes', 'costadelsol', 'validacion'];

  function arrancar() {
    var meta = D.meta || {};
    Obs.init({
      titulo: 'Observatorio de Benahavís',
      subtitulo: 'Datos abiertos del municipio (29023) para el expediente de Municipio Turístico de Andalucía',
      secciones: SECCIONES,
      actualizado: meta.generado,
      fuentes: [FTE.padron, FTE.atlas, FTE.rta, FTE.ine_vut, FTE.moviles, FTE.cds, FTE.sepe, FTE.ss, FTE.aemet, FTE.hacienda],
      metodologia: 'Un proceso automático descarga las fuentes oficiales, las normaliza y vuelca <code>docs/data/*.json</code>. ' +
        'Cada tarjeta enlaza a su fuente y permite ver los datos en tabla y descargarlos en CSV. ' +
        'El inventario completo de fuentes, con sus limitaciones, está en ' +
        '<a href="inventario-fuentes.md">inventario-fuentes.md</a> y en la ' +
        '<a href="metodologia.html">nota metodológica</a>.',
      pie: 'Los indicadores de ámbito supramunicipal van marcados como tales y <b>no acreditan al municipio</b> ante la Junta. ' +
        'La estadística de posicionamiento de móviles es experimental. Las cifras de afiliación se publican como intervalo ' +
        'por el enmascarado de celdas pequeñas. Trabajo técnico: Consultoría AMMA para el Ayuntamiento de Benahavís.'
    });
    var v = (D.vut || {}).registro;
    if (v) Obs.estado(F.num(v.total) + ' inscripciones en el RTA · ' + F.num(v.ubicadas) + ' situadas en el mapa', 'live');
  }

  Promise.all(FICHEROS.map(function (f) {
    return fetch('data/' + f + '.json?v=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { D[f] = j; })
      .catch(function () { D[f] = {}; });
  })).then(arrancar);

})();
