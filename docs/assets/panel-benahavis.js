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

  /* Rejilla anual completa entre el primer y el último año con dato. Sin ella, una
     serie con huecos —la estación tiene años sin publicar— pinta 2013 pegado a
     2016 y la línea cruza el hueco como si no existiera. */
  var rejillaAnual = function (anyos) {
    var validos = (anyos || []).filter(Boolean).map(Number).filter(isFinite);
    if (!validos.length) return [];
    var x = [];
    for (var a = Math.min.apply(null, validos); a <= Math.max.apply(null, validos); a++) x.push(String(a));
    return x;
  };
  var alineado = function (x, filas, clave, campoT) {
    var m = {};
    (filas || []).forEach(function (r) { m[String(r[campoT || 't'])] = r[clave]; });
    return x.map(function (a) { return m[a] == null ? null : m[a]; });
  };

  /* --------------------------------------------------------------- Fuentes */

  /* Cada fuente apunta al dato concreto y no al portal del organismo: a la tabla
     del INE con su número, al informe del Big Data ya centrado en el municipio,
     a la ficha de la estación de AEMET. Comprobados uno a uno; los que devolvían
     404 eran los `operacion.htm?cid=` del INE, que ya no resuelven. */
  var CDS = 'https://www.costadelsolmalaga.org/bigdata/';
  var FTE = {
    padron:   { txt: 'INE · Padrón, tabla 2882', url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=2882' },
    renta:    { txt: 'INE · Atlas de renta, tablas 30824 y 53689', url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=53689' },
    padron_nacionalidad: { txt: 'INE · Padrón por nacionalidad, tablas 33571 y 33572',
                url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=33572' },
    sima:     { txt: 'IECA · SIMA, ficha municipal de Benahavís',
                url: 'https://www.juntadeandalucia.es/institutodeestadisticaycartografia/sima/ficha.htm?mun=29023' },
    dirce:    { txt: 'INE · DIRCE, empresas por municipio, tabla 4721',
                url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=4721' },
    /* El portal de BADEA no tiene dirección estable para esta consulta, así que
       se enlaza la petición de la API ya filtrada por Benahavís: es exactamente
       el dato que alimenta la tarjeta. */
    badea_regimen: { txt: 'IECA/BADEA · afiliaciones por régimen, consulta 876',
                url: 'https://www.juntadeandalucia.es/institutodeestadisticaycartografia/intranet/admin/rest/v1.0/consulta/876?D_TERRITORIO_0=2934' },
    gini:     { txt: 'INE · Gini y P80/P20, tabla 37677', url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=37677' },
    padron_edad: { txt: 'INE · Padrón por edad, tabla 33570', url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=33570' },
    padron_nacimiento: { txt: 'INE · Padrón por lugar de nacimiento, tabla 33574',
                url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=33574' },
    atlas_demografia: { txt: 'INE · Atlas de renta, indicadores demográficos, tabla 30832',
                url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=30832' },
    atlas_ingresos: { txt: 'INE · Atlas de renta, fuente de ingresos, tabla 30825',
                url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=30825' },
    atlas_umbrales: { txt: 'INE · Atlas de renta, umbrales de ingreso, tabla 30826',
                url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=30826' },
    migraciones: { txt: 'INE · Migraciones y cambios de residencia, tabla 69767',
                url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=69767' },
    /* El portal de datos abiertos de la Junta responde 503 en la ficha del
       conjunto, así que se enlaza la consulta de la API ya filtrada por
       Benahavís: es literalmente el dato que alimenta esta pestaña. */
    rta:      { txt: 'Junta de Andalucía · RTA, consulta de Benahavís',
                url: 'https://datos.juntadeandalucia.es/api/v0/openrta/search?id=-&object_type=-&category=-&group=-&modality=-&province=M%C3%81LAGA&municipality=BENAHAVIS&order_by=id&mode=ASC&format=json&size=5000' },
    ine_vut:  { txt: 'INE · Viviendas turísticas, tabla 39363', url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=39363' },
    moviles:  { txt: 'Dataestur · turismo según posición de móviles',
                url: 'https://www.dataestur.es/viajes-ocio/medicion-del-turismo-a-partir-de-telefonia-movil/' },
    eoh:      { txt: 'Dataestur · Encuesta de Ocupación Hotelera',
                url: 'https://www.dataestur.es/alojamientos/encuesta-ocupacion-hoteles/' },
    sepe:     { txt: 'SEPE · paro y contratos por municipios',
                url: 'https://www.sepe.es/HomeSepe/que-es-el-sepe/estadisticas/datos-estadisticos/municipios.html' },
    ss:       { txt: 'Seguridad Social · afiliación por municipio',
                url: 'https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas/EST8/EST10/EST304/1470' },
    aemet:    { txt: 'AEMET · estación 6069X Benahavís',
                url: 'https://www.aemet.es/es/serviciosclimaticos/datosclimatologicos/valoresclimatologicos?l=6069X&k=and' },
    hacienda: { txt: 'Hacienda · deuda viva de las entidades locales',
                url: 'https://www.hacienda.gob.es/es-ES/Areas%20Tematicas/Administracion%20Electronica/OVEELL/Paginas/DeudaViva.aspx' },
    /* Big Data: cada informe tiene su propia dirección y admite ?mun=, así que
       el enlace abre el informe correspondiente ya centrado en Benahavís. */
    cds:         { txt: 'Turismo Costa del Sol · Big Data', url: CDS + '?mun=29023' },
    cds_vut:     { txt: 'Big Data Costa del Sol · viviendas turísticas', url: CDS + 'com1_tc-364273/viviendas-turisticas?mun=29023' },
    cds_oferta:  { txt: 'Big Data Costa del Sol · oferta de alojamiento', url: CDS + 'com1_tc-357992/oferta-alojamiento?mun=29023' },
    cds_precios: { txt: 'Big Data Costa del Sol · precios de alojamiento', url: CDS + 'com1_tc-461998/precios-hoteles?mun=29023' },
    cds_empleo:  { txt: 'Big Data Costa del Sol · empleo turístico', url: CDS + 'com1_tc-357987/empleo-turismo?mun=29023' },
    cds_origen:  { txt: 'Big Data Costa del Sol · concentración en el territorio',
                   url: CDS + 'com1_tc-357993/concentracion-territorio?mun=29023' },
    ieca_ficha:  { txt: 'IECA · SIMA, ficha municipal de Benahavís',
                   url: 'https://www.juntadeandalucia.es/institutodeestadisticaycartografia/sima/ficha.htm?mun=29023' }
  };

  /* La ficha del IECA trae cada indicador con SU año: mezcla el padrón de 2025
     con el censo de viviendas de 2021 y la superficie de 2019. No hay un «año de
     la ficha», así que cada cifra se rotula con el suyo y nunca se presentan
     juntas bajo una etiqueta temporal común. */
  var fichaIECA = function () { return (D.demografia || {}).ficha_ieca || {}; };
  var fv = function (clave) { var x = fichaIECA()[clave]; return x ? x.v : null; };
  var fa = function (clave) { var x = fichaIECA()[clave]; return x ? x.anyo : null; };
  var fcensura = function (clave) { var x = fichaIECA()[clave]; return x ? x.censura : null; };

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
  /* Los doce meses caben en el eje si se abrevian; con el nombre entero, la
     gráfica descarta uno de cada dos y deja el eje a medio rotular. */
  var MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                   'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var mesAnyo = function (t) {
    if (!t) return null;
    var p = String(t).split('-');
    return p.length < 2 ? String(t) : MES[+p[1] - 1] + ' de ' + p[0];
  };
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

  /* Bloque de la ficha municipal del IECA. Son cifras de un solo año cada una
     —no series—, así que la forma honesta de publicarlas es una tabla con su año
     al lado, y no una gráfica que insinúe evolución donde no la hay. */
  var GRUPOS_FICHA = [
    { titulo: 'Territorio y poblamiento', filas: [
      ['superficie_km2', 'Extensión superficial', 'km²', 2],
      ['nucleos', 'Núcleos de población', '', 0],
      ['poblacion_nucleos', 'Población en núcleos', 'hab.', 0],
      ['poblacion_diseminados', 'Población en diseminados', 'hab.', 0],
      ['variacion_10_anyos', 'Variación de la población en diez años', '%', 1]
    ] },
    { titulo: 'Movimiento natural y migraciones', filas: [
      ['nacimientos', 'Nacimientos', '', 0],
      ['defunciones', 'Defunciones', '', 0],
      ['matrimonios', 'Matrimonios', '', 0],
      ['inmigraciones', 'Inmigraciones', '', 0],
      ['emigraciones', 'Emigraciones', '', 0]
    ] },
    { titulo: 'Vivienda y suelo', filas: [
      ['viviendas_principales', 'Viviendas familiares principales', '', 0],
      ['transacciones_usada', 'Compraventas de vivienda de segunda mano', '', 0],
      ['transacciones_nueva', 'Compraventas de vivienda nueva', '', 0],
      ['ibi_urbana_recibos', 'Recibos de IBI urbano', '', 0],
      ['parcelas_edificadas', 'Parcelas catastrales edificadas', '', 0],
      ['solares', 'Solares', '', 0]
    ] },
    { titulo: 'Consumo y equipamiento', filas: [
      ['energia_total_mwh', 'Consumo de energía eléctrica', 'MWh', 0],
      ['energia_residencial_mwh', 'Consumo de energía eléctrica residencial', 'MWh', 0],
      ['turismos', 'Parque de turismos', '', 0],
      ['hoteles', 'Hoteles', '', 0],
      ['plazas_hoteles', 'Plazas hoteleras', '', 0]
    ] },
    { titulo: 'Actividad económica', filas: [
      ['establecimientos', 'Establecimientos con actividad', '', 0],
      ['est_sin_asalariados', 'Establecimientos sin asalariados', '', 0],
      ['est_hasta_5', 'Establecimientos de hasta 5 asalariados', '', 0],
      ['est_6_a_19', 'Establecimientos de 6 a 19 asalariados', '', 0],
      ['est_20_y_mas', 'Establecimientos de 20 o más asalariados', '', 0],
      ['tasa_paro', 'Tasa municipal de desempleo', '%', 1]
    ] },
    { titulo: 'Hacienda municipal y renta declarada', filas: [
      ['presupuesto_ingresos', 'Presupuesto liquidado de ingresos', '€', 0],
      ['presupuesto_gastos', 'Presupuesto liquidado de gastos', '€', 0],
      ['ingresos_por_habitante', 'Ingresos por habitante', '€', 0],
      ['gastos_por_habitante', 'Gastos por habitante', '€', 0],
      ['declaraciones_irpf', 'Declaraciones de IRPF', '', 0],
      ['renta_bruta_aeat', 'Renta bruta media declarada (AEAT)', '€', 0],
      ['renta_disponible_aeat', 'Renta disponible media declarada (AEAT)', '€', 0]
    ] }
  ];

  function bloqueFichaIECA() {
    var ficha = fichaIECA();
    if (!Object.keys(ficha).length) return '';
    var cuerpo = GRUPOS_FICHA.map(function (g) {
      var filas = g.filas.filter(function (f) { return ficha[f[0]]; }).map(function (f) {
        var e = ficha[f[0]];
        var valor = e.censura === 'secreto_estadistico'
          ? '<span class="obs-chip warn">secreto estadístico</span>'
          : e.censura ? '<span class="obs-map-nota">sin dato</span>'
          : F.num(e.v, f[3]) + (f[2] ? ' ' + f[2] : '');
        return '<tr><td style="text-align:left">' + f[1] + '</td>' +
               '<td style="text-align:right">' + valor + '</td>' +
               '<td style="text-align:right">' + (e.anyo || '—') + '</td></tr>';
      }).join('');
      if (!filas) return '';
      return '<tr><th colspan="3" style="text-align:left">' + g.titulo + '</th></tr>' + filas;
    }).join('');

    return '<article class="obs-card span-2">' +
      '<div class="obs-card-head"><div class="t"><h3>Ficha municipal del IECA</h3>' +
        '<div class="cs">Treinta y siete indicadores que no publica ninguna otra fuente a escala municipal</div></div></div>' +
      '<div class="obs-table-wrap completa">' +
        '<table class="obs-table"><thead><tr>' +
          '<th style="text-align:left">Indicador</th><th>Valor</th><th>Año</th>' +
        '</tr></thead><tbody>' + cuerpo + '</tbody></table></div>' +
      '<div class="obs-card-foot"><span class="obs-chip">Ficha municipal</span>' +
        '<span>Fuente: <a href="' + FTE.ieca_ficha.url + '" target="_blank" rel="noopener">' +
          FTE.ieca_ficha.txt + '</a></span>' +
        '<span style="flex-basis:100%;font-style:italic">Cada indicador lleva su propio año porque la ficha ' +
          'mezcla operaciones distintas: el padrón es de 2025, el censo de viviendas de 2021 y la superficie ' +
          'de 2019. No hay «año de la ficha», y por eso no se presentan bajo una etiqueta común. Las celdas ' +
          'marcadas como secreto estadístico no son ceros: hay dato, pero identificaría al titular. La renta ' +
          'de la AEAT se calcula sobre declarantes y NO es comparable con la del Atlas del INE, que reparte ' +
          'entre toda la población residente.</span>' +
      '</div></article>';
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
        /* El denominador que le faltaba al censo: cuántas viviendas turísticas
           hay por cada cien viviendas donde vive alguien todo el año. Es la
           cifra que mide de verdad la presión, y no la que se calcula sobre
           población, porque una vivienda turística no compite por habitantes:
           compite por vivienda. */
        { label: 'Viviendas turísticas por cada 100 viviendas principales' +
                 (fa('viviendas_principales') ? ' (' + fa('viviendas_principales') + ')' : ''),
          valor: fv('viviendas_principales') ? totalVUT / fv('viviendas_principales') * 100 : null,
          formato: function (x) { return F.num(x, 1); } },
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
          sub: F.num(viviendas.length) + ' viviendas situadas · cambia a satélite para verlas sobre la ortofoto · acerca el mapa para ver cada una y pinchar sus datos · mueve la línea del tiempo para ver cómo se ha ido poblando el municipio',
          chips: [{ txt: 'Por vivienda', tipo: 'live' }], fuente: FTE.rta, ancho: 'full', alto: 'tall',
          nota: 'El color mide densidad de viviendas, no plazas: de azul donde hay pocas a rojo donde se amontonan, ' +
                'pasando por cian, verde y amarillo. Es la misma escala que el mapa de viviendas turísticas del ' +
                'observatorio de Marbella, de modo que los dos municipios se pueden mirar uno al lado del otro sin ' +
                'traducir colores. El techo de la escala sube al alejar el zoom, porque de lejos cualquier celda con ' +
                'unas decenas de viviendas llegaría al rojo y el término entero saldría saturado. Fuera del término ' +
                'municipal el fondo va atenuado: lo que se derrama sobre San Pedro o Cancelada son viviendas de ' +
                'Benahavís pegadas al límite, no viviendas de esos municipios. Al acercarse aparece cada vivienda en la ' +
                'coordenada que consta en el registro, con el tamaño del punto proporcional a sus plazas.',
          mapa: {
            puntos: viviendas,
            unidad: 'viviendas',
            /* El mapa decide solo qué enseñar: de lejos, la densidad; al
               acercarse, cada vivienda como un punto que se puede pinchar. */
            modo: 'auto',
            zoomDetalle: 14,
            agrupar: false,
            limite: D.limite,
            unidadSingular: 'vivienda',
            calorEtiqueta: 'Densidad de VUT',
            calorBoton: 'Densidad', puntosBoton: 'Viviendas',
            /* Mismo formato de calor que el mapa de VUT del observatorio de
               Marbella, para que los dos municipios se lean con la misma escala
               y se puedan poner uno al lado del otro sin traducir colores.

               La rampa térmica —azul noche, cian, verde, amarillo, rojo— separa
               mucho más los niveles intermedios que la cálida, que es lo que
               interesa cuando la pregunta es dónde están los focos.

               El techo (`max`) SUBE al alejar el zoom: de lejos cualquier celda
               con unas decenas de viviendas alcanzaría el rojo y el término
               entero saldría saturado. Y el suelo de opacidad se queda en 0,05
               porque cada sello parte de esa alfa y los solapes suman: con 0,4
               el mapa sale rojo se ponga el techo que se ponga. */
            gradiente: 'termica',
            calorZoom: [
              [10, { radius: 8,  blur: 6,  max: 3 }],
              [11, { radius: 9,  blur: 7,  max: 2.2 }],
              [12, { radius: 10, blur: 8,  max: 2 }],
              [13, { radius: 12, blur: 9,  max: 1.2 }],
              [14, { radius: 14, blur: 10, max: 1 }]
            ],
            calorZoomFondo: { radius: 16, blur: 12, max: 0.8 },
            calorMaxZoom: 18,
            calorSuelo: 0.05,
            /* El tamaño del punto son las plazas. Se recorta en 20 porque el RTA
               tiene cuatro registros de 188 a 342 plazas —complejos enteros
               inscritos como una sola vivienda— que, sin tope, saldrían como un
               disco del tamaño de media urbanización. */
            radio: function (p) {
              return 3.0 + Math.sqrt(Math.min(Math.max(+p.plazas || 2, 1), 20)) * 1.25;
            },
            radioEtiqueta: 'Plazas de la vivienda',
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
          chips: [MENSUAL], fuente: FTE.cds_vut, ancho: 'full',
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
          chips: [MENSUAL], fuente: FTE.cds_vut,
          spec: {
            type: 'line', xType: 'mes', x: ejeT(serieCDS), yFormat: 'pct',
            series: [{ name: 'Ocupación', data: serieCDS.map(function (r) { return r.ocupacion; }) }]
          }
        },
        {
          titulo: 'Precio medio por plaza', sub: 'Euros por plaza y noche',
          chips: [MENSUAL], fuente: FTE.cds_vut,
          spec: {
            type: 'line', xType: 'mes', x: ejeT(serieCDS), yFormat: 'eur',
            series: [{ name: 'Precio por plaza', data: serieCDS.map(function (r) { return r.precio_plaza; }) }]
          }
        },
        (fv('viviendas_principales') ? {
          titulo: 'La vivienda turística dentro del parque residencial',
          sub: 'Cuántas viviendas hay en Benahavís y de qué tipo',
          chips: [{ txt: 'Ficha municipal' }], fuente: FTE.ieca_ficha, ancho: 'full',
          nota: 'Las tres cifras salen de fuentes distintas y por eso no encajan como un reparto exacto, pero ' +
                'juntas dicen lo esencial: en Benahavís hay muchas más viviendas que hogares. Los recibos de IBI ' +
                'urbano (' + fa('ibi_urbana_recibos') + ') cuentan todo el parque construido; las viviendas ' +
                'principales (censo de ' + fa('viviendas_principales') + ') solo aquellas donde alguien reside ' +
                'todo el año. La diferencia es segunda residencia, vivienda vacía y vivienda turística.',
          spec: {
            type: 'barh', yFormat: 'num', xLabel: 'Parque de vivienda',
            x: ['Viviendas turísticas inscritas en el RTA',
                'Viviendas principales (censo ' + fa('viviendas_principales') + ')',
                'Recibos de IBI urbano (' + fa('ibi_urbana_recibos') + ')'],
            series: [{ name: 'Viviendas',
                       data: [totalVUT, fv('viviendas_principales'), fv('ibi_urbana_recibos')] }]
          }
        } : null),
        (fv('transacciones_usada') ? {
          titulo: 'Compraventa de vivienda', sub: 'Transacciones inmobiliarias registradas en ' + fa('transacciones_usada'),
          chips: [ANUAL], fuente: FTE.ieca_ficha,
          nota: 'Casi todo el mercado es de segunda mano. Es un dato anual y de la ficha del IECA, no una serie: ' +
                'sirve para dimensionar el año en curso, no para ver una tendencia.',
          spec: {
            type: 'barh', yFormat: 'num', xLabel: 'Tipo de vivienda',
            x: ['Vivienda de segunda mano', 'Vivienda nueva'],
            series: [{ name: 'Transacciones', data: [fv('transacciones_usada'), fv('transacciones_nueva')] }]
          }
        } : null),
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
      desc: 'Padrón municipal y Atlas de distribución de renta del INE. Benahavís no llega a 10.000 habitantes ' +
            'y casi dos tercios de ellos son extranjeros: es un municipio pequeño y muy internacional, y esas dos ' +
            'cosas condicionan qué estadística oficial baja hasta aquí y cuál no.',
      render: function () {
        var d = D.demografia || {}, p = d.padron || {}, r = d.renta || {}, g = d.desigualdad || {};
        var nac = d.nacionalidad || {}, pais = d.nacionalidades || {}, ieca = d.extranjeros_ieca || {};
        var rc = d.renta_contexto || {};
        var ed = d.edad || {}, nacim = d.nacimiento || {}, saldo = d.saldo_migratorio || {};
        var atl = d.atlas_demografia || {}, ingr = d.fuente_ingresos || {}, umbr = d.umbrales_ingreso || {};

        /* --- estructura por edad ---
           El Padrón la publica por grupos quinquenales desde 2003 y hasta 2022,
           que es cuando el INE dejó de bajar la edad al municipio. Se pinta como
           barras emparejadas y no como pirámide con valores negativos: el eje
           saldría rotulado con «−300 hombres», que no es una cantidad de nadie. */
        var gruposEdad = (ed.grupos || []).map(function (g) {
          return g.replace(/^De /, '').replace(/ años$/, '').replace(/^100 y más$/, '100+');
        });
        var anyosEdad = ed.anyos || [];
        var anyoEdad = anyosEdad.length ? anyosEdad[anyosEdad.length - 1] : null;
        function specEdad(anyo) {
          var filas = (ed.por_anyo || {})[anyo] || [];
          return {
            type: 'bar', xLabel: 'Grupo de edad', xTodas: true, yFormat: 'num',
            x: gruposEdad,
            series: [
              { name: 'Hombres', color: '#2a78d6', data: filas.map(function (f) { return f.hombres; }) },
              { name: 'Mujeres', color: '#d1541f', data: filas.map(function (f) { return f.mujeres; }) }
            ]
          };
        }

        /* --- lugar de nacimiento ---
           Las cinco categorías son excluyentes entre sí y suman el padrón del
           año: el INE publica además los subtotales anidados, que aquí se
           descartan porque apilados darían el doble de población de la que hay. */
        var ejeNacim = ejeT(nacim.total || []);
        var NACIMIENTO = [
          { k: 'mismo_municipio', n: 'En Benahavís' },
          { k: 'misma_provincia', n: 'En otro municipio de Málaga' },
          { k: 'otra_provincia', n: 'En otra provincia andaluza' },
          { k: 'otra_comunidad', n: 'En otra comunidad autónoma' },
          { k: 'extranjero', n: 'En el extranjero' }
        ];

        var ejeSaldo = rejillaAnual(ejeT(saldo.total || []));
        var ejeAtlas = ejeT(atl.edad_media || []);
        var ejeIngr = ejeT(ingr.salario || []);
        var alinearEn = function (eje, puntos) { return alineado(eje, puntos, 'v'); };

        /* Nacionalidad y sexo comparten eje: son el mismo padrón desagregado dos
           veces, así que el apilado suma exactamente la población del año. */
        var esp = nac.espanola || {}, ext = nac.extranjera || {};
        var ejeNac = ejeT(ext.total || []);

        /* Reparto por países: seis nombres y un «Otros». Más porciones no se
           distinguen ni se recuerdan, y las cinco primeras ya son el 80 %. */
        var anyosPais = (pais.anyos || []).slice().reverse();
        var anyoPais = anyosPais[0];
        function repartoPaises(anyo) {
          var filas = ((pais.por_anyo || {})[anyo] || []).slice();
          var propios = filas.filter(function (f) { return f.pais !== 'Resto de países'; });
          var resto = filas.filter(function (f) { return f.pais === 'Resto de países'; });
          var cabeza = propios.slice(0, 6);
          var cola = suma(propios.slice(6).map(function (f) { return f.v; })) +
                     suma(resto.map(function (f) { return f.v; }));
          var datos = cabeza.map(function (f) { return { name: f.pais, value: f.v }; });
          if (cola > 0) datos.push({ name: 'Otras', value: cola });
          return {
            type: 'donut', yFormat: 'num', xLabel: 'Nacionalidad',
            x: datos.map(function (t) { return t.name; }),
            series: [{ name: 'Personas empadronadas en ' + anyo,
                       data: datos.map(function (t) { return t.value; }) }]
          };
        }

        /* Contexto de la renta: la misma operación del INE resuelve el municipio,
           la provincia, la comunidad y España, de modo que la comparación es
           homogénea en definición y en año de referencia. */
        function serieRenta(indicador) {
          var eje = ejeT(r[indicador] || []);
          var alinear = function (puntos) {
            var m = {};
            (puntos || []).forEach(function (x) { m[x.t] = x.v; });
            return eje.map(function (t) { return m[t] == null ? null : m[t]; });
          };
          return {
            type: 'line', xType: 'anual', xLabel: 'Año', x: eje, yFormat: 'eur',
            series: [
              { name: 'Benahavís', data: vals(r[indicador] || []) },
              { name: 'Provincia de Málaga', data: alinear((rc.malaga || {})[indicador]) },
              { name: 'Andalucía', data: alinear((rc.andalucia || {})[indicador]) },
              { name: 'España', data: alinear((rc.espana || {})[indicador]) }
            ]
          };
        }

        return {
          kpis: [
            { label: 'Población empadronada', valor: (d.poblacion_actual || {}).v, serie: vals(p.total).slice(-15) },
            { label: 'Población extranjera' + (ieca.anyo ? ' (' + ieca.anyo + ')' : ''),
              valor: ieca.extranjeros, unidad: ieca.porcentaje != null ? F.pct(ieca.porcentaje) + ' del total' : '' },
            { label: 'Renta neta media por persona', valor: ultV(r.renta_neta_persona), unidad: '€', serie: vals(r.renta_neta_persona) },
            { label: 'Índice de Gini', valor: ultV(g.gini), dec: 1, formato: F.num, serie: vals(g.gini) },
            /* Los dos indicadores más recientes de la pestaña: el saldo migratorio
               llega un año más lejos que el Atlas y dos más que el Padrón. */
            { label: 'Saldo migratorio' + (ejeSaldo.length ? ' (' + ejeSaldo[ejeSaldo.length - 1] + ')' : ''),
              valor: ultV(saldo.total), formato: function (x) { return F.signo(x, 0); },
              unidad: 'residentes', serie: vals(saldo.total) },
            { label: 'Renta que no viene del salario' +
                     ((ejeIngr.length) ? ' (' + ejeIngr[ejeIngr.length - 1] + ')' : ''),
              valor: ultV(ingr.salario) == null ? null : 100 - ultV(ingr.salario),
              unidad: '%', dec: 1, formato: F.num,
              serie: vals(ingr.salario).map(function (v) { return v == null ? null : 100 - v; }) }
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
              titulo: 'Población por nacionalidad y sexo', sub: 'Españoles y extranjeros empadronados',
              chips: [ANUAL], fuente: FTE.padron_nacionalidad, ancho: 'full',
              nota: 'El INE dejó de publicar la nacionalidad a escala municipal después de 2022: la Estadística ' +
                    'Continua de Población solo la baja a los 83 municipios mayores. La serie termina ahí y no se ' +
                    'prolonga con estimaciones' +
                    (ieca.anyo ? '; la cifra de ' + ieca.anyo + ' del indicador es del IECA, otra explotación del padrón.' : '.'),
              spec: {
                type: 'stack', xType: 'anual', xLabel: 'Año', x: ejeNac, yFormat: 'num',
                /* Dos familias de color, no cuatro colores sueltos: el tono dice la
                   nacionalidad y la intensidad, el sexo. Así se lee de un vistazo
                   cuánto pesa cada bloque sin ir a la leyenda. */
                series: [
                  { name: 'Españoles', color: '#2a78d6', data: vals(esp.hombres || []) },
                  { name: 'Españolas', color: '#8fbcec', data: vals(esp.mujeres || []) },
                  { name: 'Extranjeros', color: '#d1541f', data: vals(ext.hombres || []) },
                  { name: 'Extranjeras', color: '#f2a882', data: vals(ext.mujeres || []) }
                ]
              }
            },
            {
              titulo: 'Nacionalidades de la población extranjera',
              sub: 'Reparto por país de nacionalidad',
              chips: [ANUAL], fuente: FTE.padron_nacionalidad,
              control: {
                label: 'Año', valor: anyoPais,
                opciones: anyosPais.map(function (a) { return { v: a, txt: a }; }),
                spec: repartoPaises
              },
              nota: 'Se detallan los seis países con más residentes; el resto se agrupa. El reparto cierra ' +
                    'contra el total de extranjeros del padrón, así que los porcentajes son sobre toda la ' +
                    'población extranjera.',
              spec: repartoPaises(anyoPais)
            },
            {
              titulo: 'Población por sexo', sub: 'Serie completa del padrón municipal',
              chips: [ANUAL], fuente: FTE.padron,
              spec: {
                type: 'stack', xType: 'anual', xLabel: 'Año', x: ejeT(p.total), yFormat: 'num',
                series: [
                  { name: 'Mujeres', data: vals(p.mujeres) },
                  { name: 'Hombres', data: vals(p.hombres) }
                ]
              }
            },
            {
              titulo: 'Renta neta media por persona', sub: 'Benahavís frente a su provincia, Andalucía y España',
              chips: [ANUAL], fuente: FTE.renta, ancho: 'full',
              nota: 'Los cuatro ámbitos salen de la misma operación del INE —el Atlas de Distribución de Renta ' +
                    'de los Hogares—, que es la fuente que republican los portales de datos macroeconómicos. ' +
                    'La serie municipal oscila mucho más que las agregadas —el salto de 2022 a 2023 es del 54 % y ' +
                    'lo publica así el INE—: con 9.000 habitantes y una renta muy concentrada, unos pocos ' +
                    'declarantes mueven la media del municipio.',
              spec: serieRenta('renta_neta_persona')
            },
            {
              titulo: 'Renta neta media por hogar', sub: 'Mismos ámbitos, renta del hogar',
              chips: [ANUAL], fuente: FTE.renta,
              spec: serieRenta('renta_neta_hogar')
            },
            {
              titulo: 'Desigualdad', sub: 'Índice de Gini y relación entre el 20 % más rico y el 20 % más pobre',
              chips: [ANUAL], fuente: FTE.gini,
              nota: 'El Gini viene en escala 0–100. Cuanto más alto, más desigual es el reparto de la renta.',
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', x: ejeT(g.gini), yFormat: 'dec1',
                series: [
                  { name: 'Gini (0–100)', data: vals(g.gini) },
                  { name: 'P80 / P20', data: vals(g.p80_p20) }
                ]
              }
            },
            {
              titulo: 'Estructura por edad', sub: 'Población empadronada por grupo quinquenal y sexo',
              chips: [ANUAL], fuente: FTE.padron_edad, ancho: 'full',
              control: anyosEdad.length ? {
                label: 'Año', valor: anyoEdad,
                opciones: anyosEdad.slice().reverse().map(function (a) { return { v: a, txt: a }; }),
                spec: specEdad
              } : null,
              nota: 'Serie 2003–2022: el Padrón Continuo dejó de bajar la edad al municipio después de 2022 y aquí ' +
                    'no se prolonga con estimaciones. La forma no es la de un municipio envejecido —hay más gente ' +
                    'entre 40 y 55 años que en ningún otro tramo— porque quien llega a Benahavís llega ya en edad ' +
                    'de trabajar.',
              spec: specEdad(anyoEdad)
            },
            {
              titulo: 'Dónde nació la población empadronada', sub: 'Cinco orígenes que suman el padrón del año',
              chips: [ANUAL], fuente: FTE.padron_nacimiento, ancho: 'full',
              nota: 'Es el indicador que mejor mide lo internacional que es el municipio, y no dice lo mismo que la ' +
                    'nacionalidad: hay vecinos con pasaporte español nacidos fuera y al revés. Solo se apilan las ' +
                    'cinco categorías que no se solapan; el INE publica además los subtotales anidados, que sumados ' +
                    'a estas darían el doble de población de la que hay.',
              spec: {
                type: 'stack', xType: 'anual', xLabel: 'Año', x: ejeNacim, yFormat: 'num',
                series: NACIMIENTO.map(function (c) {
                  return { name: c.n, data: alinearEn(ejeNacim, nacim[c.k]) };
                })
              }
            },
            {
              titulo: 'Saldo migratorio', sub: 'Población que el municipio gana o pierde cada año por migración',
              chips: [ANUAL], fuente: FTE.migraciones, ancho: 'full',
              nota: 'Es el dato municipal más reciente de esta pestaña: llega a ' +
                    (ejeSaldo.length ? ejeSaldo[ejeSaldo.length - 1] : 'el último año publicado') +
                    ', un año por delante del Atlas de renta y dos por delante del Padrón por nacionalidad. ' +
                    'El crecimiento de Benahavís no lo explican los nacimientos sino la llegada de residentes, y ' +
                    'sobre todo desde el extranjero: el saldo exterior es casi todo el saldo total. La excepción es ' +
                    '2023, el único año en que el municipio pierde población por migración, y la pierde justo por ' +
                    'donde suele ganarla: el saldo con el extranjero se va a −136.',
              spec: {
                type: 'bar', xType: 'anual', xLabel: 'Año', x: ejeSaldo, yFormat: 'num',
                series: [
                  { name: 'Saldo con el extranjero', data: alinearEn(ejeSaldo, saldo.exterior) },
                  { name: 'Saldo con el resto de España', data: alinearEn(ejeSaldo, saldo.interior) },
                  { name: 'Saldo total', data: alinearEn(ejeSaldo, saldo.total) }
                ]
              }
            },
            {
              titulo: 'De dónde sale la renta de los hogares', sub: 'Reparto del ingreso declarado por fuente, %',
              chips: [ANUAL], fuente: FTE.atlas_ingresos, ancho: 'full',
              nota: 'Los cinco conceptos suman 100. Lo que distingue a Benahavís es el peso de los otros ingresos ' +
                    '—rentas del capital, de la propiedad y de actividades económicas—: en un municipio medio el ' +
                    'salario se lleva la mayor parte y aquí no llega a la mitad. Sale de la misma operación del INE ' +
                    'que la renta media, así que se lee contra ella sin cambiar de fuente.',
              spec: {
                type: 'stack', xType: 'anual', xLabel: 'Año', x: ejeIngr, yFormat: 'dec1', yMax: 100,
                series: [
                  { name: 'Salario', data: alinearEn(ejeIngr, ingr.salario) },
                  { name: 'Otros ingresos', data: alinearEn(ejeIngr, ingr.otros_ingresos) },
                  { name: 'Pensiones', data: alinearEn(ejeIngr, ingr.pensiones) },
                  { name: 'Otras prestaciones', data: alinearEn(ejeIngr, ingr.otras_prestaciones) },
                  { name: 'Prestaciones por desempleo', data: alinearEn(ejeIngr, ingr.desempleo) }
                ]
              }
            },
            {
              titulo: 'Hogares y estructura de la población', sub: 'Indicadores demográficos del Atlas de renta',
              chips: [ANUAL], fuente: FTE.atlas_demografia,
              nota: 'Un tercio de los hogares del municipio son de una sola persona. La edad media apenas se mueve ' +
                    'en toda la serie: el municipio crece mucho pero no envejece, porque crece por llegada de ' +
                    'población adulta y no por acumulación de años.',
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', x: ejeAtlas, yFormat: 'dec1',
                series: [
                  { name: 'Edad media (años)', data: alinearEn(ejeAtlas, atl.edad_media) },
                  { name: 'Hogares unipersonales (%)', data: alinearEn(ejeAtlas, atl.pct_hogares_unipersonales) },
                  { name: 'Menores de 18 (%)', data: alinearEn(ejeAtlas, atl.pct_menores_18) },
                  { name: '65 y más años (%)', data: alinearEn(ejeAtlas, atl.pct_65_y_mas) },
                  { name: 'Tamaño medio del hogar', data: alinearEn(ejeAtlas, atl.tamanyo_hogar) }
                ]
              }
            },
            (fv('nacimientos') ? {
              titulo: 'De dónde sale el crecimiento',
              sub: 'Altas y bajas de población en ' + fa('nacimientos'),
              chips: [ANUAL], fuente: FTE.ieca_ficha, ancho: 'full',
              nota: 'Puesto uno al lado del otro se ve que Benahavís no crece por nacimientos: llegan más de ' +
                    'veinte veces más personas de las que nacen. El saldo que resulta —' +
                    F.num((fv('inmigraciones') || 0) - (fv('emigraciones') || 0)) + ' por migración y ' +
                    F.num((fv('nacimientos') || 0) - (fv('defunciones') || 0)) + ' por movimiento natural— ' +
                    'coincide con el que publica el INE en la tarjeta anterior, que es la comprobación de que ' +
                    'las dos fuentes están contando lo mismo.',
              spec: {
                type: 'barh', yFormat: 'num', xLabel: 'Concepto',
                x: ['Inmigraciones', 'Emigraciones', 'Nacimientos', 'Defunciones'],
                series: [{ name: 'Personas en ' + fa('nacimientos'),
                           data: [fv('inmigraciones'), fv('emigraciones'),
                                  fv('nacimientos'), fv('defunciones')] }]
              }
            } : null),
            (fv('energia_total_mwh') ? {
              titulo: 'Consumo de energía eléctrica', sub: 'Total del municipio y parte residencial, ' + fa('energia_total_mwh'),
              chips: [ANUAL], fuente: FTE.ieca_ficha,
              nota: 'El consumo es el proxy de presión que más se acerca al de agua, que es el que pedía el ' +
                    'expediente y que exige convenio con Acosol. Este no: viene en la ficha del IECA. Lo que ' +
                    'no es residencial —' + F.num((fv('energia_total_mwh') || 0) - (fv('energia_residencial_mwh') || 0)) +
                    ' MWh— es actividad económica, alumbrado y servicios.',
              spec: {
                type: 'barh', yFormat: 'num', xLabel: 'Consumo',
                x: ['Residencial', 'Resto (actividad y servicios)'],
                series: [{ name: 'MWh en ' + fa('energia_total_mwh'),
                           data: [fv('energia_residencial_mwh'),
                                  (fv('energia_total_mwh') || 0) - (fv('energia_residencial_mwh') || 0)] }]
              }
            } : null),
            {
              titulo: 'Población bajo umbrales de ingreso', sub: 'Porcentaje por debajo de cada umbral, en euros por unidad de consumo',
              chips: [ANUAL], fuente: FTE.atlas_umbrales,
              nota: 'Son umbrales absolutos en euros, no la tasa de riesgo de pobreza: no dependen de la mediana ' +
                    'del propio municipio, de modo que se pueden comparar entre municipios y a lo largo del tiempo. ' +
                    'Conviene leerlos junto al Gini: que la renta media sea alta no impide que una parte de la ' +
                    'población esté por debajo de estos umbrales.',
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', x: ejeT(umbr.bajo_5000 || []), yFormat: 'dec1',
                series: [
                  { name: 'Menos de 5.000 €', data: vals(umbr.bajo_5000) },
                  { name: 'Menos de 7.500 €', data: vals(umbr.bajo_7500) },
                  { name: 'Menos de 10.000 €', data: vals(umbr.bajo_10000) }
                ]
              }
            }
          ],
          extra: bloqueFichaIECA()
        };
      }
    },

    /* ------------------------------------------------------- Alojamiento --- */
    {
      id: 'alojamiento', nombre: 'Alojamiento',
      titulo: 'Oferta de alojamiento',
      desc: 'Todo el alojamiento reglado del municipio según el Registro de Turismo de Andalucía, con el contraste ' +
            'de la estadística experimental del INE, que mide oferta <i>anunciada</i> y no oferta <i>inscrita</i>.',
      render: function () {
        var o = D.oferta || {}, rta = o.rta || {}, ie = o.ine_experimental || {};
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
              titulo: 'Plazas por tipología, serie histórica', sub: 'Big Data de Turismo Costa del Sol',
              chips: [MENSUAL], fuente: FTE.cds_oferta, ancho: 'full',
              nota: 'La vivienda turística es prácticamente toda la oferta del municipio: el alojamiento hotelero ' +
                    'son cuatro establecimientos y no admite comparación de escala con las más de dos mil viviendas.',
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
            },
            {
              titulo: 'Viviendas turísticas anunciadas', sub: 'Estadística experimental del INE',
              chips: [EXPERIMENTAL], fuente: FTE.ine_vut, ancho: 'full',
              nota: 'El INE publica esta operación por oleadas, no todos los meses.',
              spec: {
                type: 'line', xType: 'mes', x: ejeT(ie.viviendas), yFormat: 'num',
                series: [
                  { name: 'Plazas', data: vals(ie.plazas) },
                  { name: 'Viviendas', data: vals(ie.viviendas) }
                ]
              }
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

    /* ---------------------------------------------------------- Viajeros --- */
    {
      id: 'viajeros', nombre: 'Viajeros',
      titulo: 'Viajeros',
      desc: 'Turistas que pernoctan en el municipio según la estadística experimental del INE construida sobre el ' +
            'posicionamiento de teléfonos móviles. Es la única fuente que resuelve la demanda a escala municipal: ' +
            'la Encuesta de Ocupación Hotelera no baja hasta Benahavís.',
      render: function () {
        var d = D.demanda || {}, rec = d.receptor || {}, itn = d.interno || {}, eoh = d.eoh_zona_turistica || {};
        var top = rec.top_paises_12m || [];

        /* --- mercados emisores por año ---
           El fichero trae la serie mensual completa de cada país desde julio de
           2019, así que el ranking de un año se arma aquí sin pedir nada más. Se
           deja «Últimos 12 meses» como opción por defecto porque es la que
           responde a «cómo está esto ahora», y los años cerrados debajo.

           2019 se excluye de la lista: la serie empieza en julio, de modo que su
           total no es un año y quedaría a la mitad frente a los demás. */
        var DOCE = '12m';
        var porPais = rec.por_pais || {};
        var anyosPais = (function () {
          var vistos = {};
          Object.keys(porPais).forEach(function (p) {
            porPais[p].forEach(function (x) { vistos[String(x.t).slice(0, 4)] = true; });
          });
          return Object.keys(vistos).sort().filter(function (a) { return a !== '2019'; });
        })();
        function paisesDe(anyo) {
          if (anyo === DOCE) return top.slice(0, 10);
          return Object.keys(porPais).map(function (p) {
            return {
              pais: p,
              v: suma(porPais[p].filter(function (x) { return String(x.t).slice(0, 4) === anyo; })
                               .map(function (x) { return x.v; }))
            };
          }).filter(function (r) { return r.v > 0; })
            .sort(function (a, b) { return b.v - a.v; }).slice(0, 10);
        }
        function specPaises(anyo) {
          var filas = paisesDe(anyo);
          return {
            type: 'barh', yFormat: 'num', xLabel: 'País de origen',
            x: filas.map(function (r) { return r.pais; }),
            series: [{ name: anyo === DOCE ? 'Turistas (últimos 12 meses)' : 'Turistas en ' + anyo,
                       data: filas.map(function (r) { return r.v; }) }]
          };
        }

        /* --- origen del turismo, por el observatorio provincial ---
           Es la única fuente que sube la procedencia de municipio a PROVINCIA y
           COMUNIDAD AUTÓNOMA, que es como se habla del mercado nacional. Va en
           tarjeta aparte de la del INE y no se mezcla con ella: contrastadas mes
           a mes, la parte nacional es el mismo dato pero la internacional sale
           2,5 veces más alta. */
        var org = (D.costadelsol || {}).origen || {};
        var ambitosOrg = Object.keys(org.por_ambito || {});
        var anyosOrg = (org.anyos || []).slice().reverse();
        function specOrigenBD(v) {
          var filas = ((org.por_ambito || {})[v.ambito] || {})[v.anyo] || [];
          filas = filas.slice(0, 12);
          return {
            type: 'barh', yFormat: 'num', xLabel: v.ambito,
            x: filas.map(function (r) { return r.territorio; }),
            series: [{ name: 'Turistas en ' + v.anyo, data: filas.map(function (r) { return r.v; }) }]
          };
        }
        var origenBDInicial = { ambito: ambitosOrg.indexOf('Provincia') >= 0 ? 'Provincia' : ambitosOrg[0],
                                anyo: anyosOrg[0] };

        /* --- procedencia nacional por año ---
           El pipeline ya guarda un ranking por año; si por lo que sea solo hay el
           acumulado —un año cuyo fichero de 30 MB expiró—, la tarjeta sigue
           funcionando con él y no ofrece selector. */
        var origenAnyo = itn.top_origenes_por_anyo || {};
        var anyosOrigen = Object.keys(origenAnyo).sort();
        var origenPorDefecto = anyosOrigen.length ? anyosOrigen[anyosOrigen.length - 1] : null;
        function specOrigenes(anyo) {
          var filas = (origenAnyo[anyo] || itn.top_origenes || []).slice(0, 10);
          return {
            type: 'barh', yFormat: 'num', xLabel: 'Municipio de origen',
            x: filas.map(function (r) { return r.municipio; }),
            series: [{ name: anyo ? 'Turistas en ' + anyo : 'Turistas', data: filas.map(function (r) { return r.v; }) }]
          };
        }
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
              titulo: 'Mercados emisores', sub: 'Turistas extranjeros por país de origen',
              chips: [EXPERIMENTAL], fuente: FTE.moviles,
              control: { label: 'Periodo', valor: DOCE,
                         opciones: [{ v: DOCE, txt: 'Últimos 12 meses' }].concat(
                           anyosPais.slice().reverse().map(function (a) { return { v: a, txt: a }; })),
                         spec: specPaises },
              nota: 'Los diez primeros de cada periodo. El ranking se rehace por completo en cada año, así que un ' +
                    'país que aparece o desaparece de la lista es un cambio real de mercado. 2019 no está: la serie ' +
                    'empieza en julio y su total no sería un año entero.',
              spec: specPaises(DOCE)
            },
            {
              titulo: 'Turismo nacional por municipio de origen', sub: 'De dónde vienen los turistas residentes en España',
              chips: [EXPERIMENTAL], fuente: FTE.moviles,
              control: anyosOrigen.length > 1 ? {
                label: 'Año', valor: origenPorDefecto,
                opciones: anyosOrigen.slice().reverse().map(function (a) { return { v: a, txt: a }; }),
                spec: specOrigenes
              } : null,
              nota: 'La fuente resuelve el municipio de origen, no la provincia, y por eso encabezan la lista ' +
                    'ciudades y no territorios. Para verlo por provincia o por comunidad autónoma, la tarjeta ' +
                    'siguiente. El año en curso va incompleto: solo suma los meses publicados.',
              spec: specOrigenes(origenPorDefecto)
            },
            (ambitosOrg.length ? {
              titulo: 'Origen de los turistas, por territorio',
              sub: 'Provincia, comunidad autónoma o país de procedencia',
              chips: [ANUAL, EXPERIMENTAL], fuente: FTE.cds_origen, ancho: 'full',
              controles: [
                { id: 'ambito', label: 'Ver por',
                  opciones: ambitosOrg.map(function (a) { return { v: a, txt: a }; }),
                  valor: origenBDInicial.ambito },
                { id: 'anyo', label: 'Año',
                  opciones: anyosOrg.map(function (a) { return { v: a, txt: a }; }),
                  valor: origenBDInicial.anyo }
              ],
              spec2: specOrigenBD,
              nota: 'Del observatorio provincial, no del INE, y por eso va aparte. Contrastadas mes a mes las dos ' +
                    'fuentes: el turismo nacional coincide al entero en 71 de los 76 meses comunes —es el mismo ' +
                    'dato— pero el internacional sale aquí entre 2,4 y 2,5 veces más alto, con una razón muy ' +
                    'estable en siete años. No es un error de ninguna de las dos: miden universos distintos. ' +
                    'Lo que aporta esta tarjeta es el REPARTO por territorio, no la cifra absoluta, y es la única ' +
                    'fuente que sube la procedencia de municipio a provincia y a comunidad autónoma.',
              spec: specOrigenBD(origenBDInicial)
            } : null),
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
      id: 'empleo', nombre: 'Empleo y empresas',
      titulo: 'Mercado de trabajo y tejido empresarial',
      desc: 'Paro registrado y contratación del SEPE, afiliación a la Seguridad Social por actividad, empresas ' +
            'del DIRCE y trabajo autónomo. En un municipio de este tamaño casi la mitad de las celdas de afiliación ' +
            'por rama están enmascaradas por secreto estadístico, así que esa afiliación se publica como ' +
            '<b>intervalo</b> y no como una cifra falsamente exacta.',
      render: function () {
        var t = D.trabajo || {}, paro = (t.paro || {}).serie || [], con = (t.contratos || {}).serie || [];
        var afi = (t.afiliacion || {});
        var cdsEmpleo = ((D.costadelsol || {}).empleo || {});
        var eco = D.economia || {}, emp = eco.empresas || {}, reg = (eco.afiliacion_regimen || {}).serie || [];
        var ultimoAnyoEmp = (emp.total || []).length ? emp.total[emp.total.length - 1].t : null;
        /* Los rótulos del DIRCE son la definición entera de la rama y no caben en
           un eje; se acortan sin cambiar qué agrupa cada una. «Resto de servicios»
           NO es una rama más: es la suma de las de servicios que ya están en la
           lista, así que pintarla dobla la mitad del total. */
        var RAMAS = {
          'Industrias extractivas (excepto construcción)': 'Industria y extractivas',
          'Construcción': 'Construcción',
          'Comercio al por mayor y al por menor; reparación de vehículos de motor y motocicletas; transporte y almacenamiento; hostelería':
            'Comercio, transporte y hostelería',
          'Información y comunicaciones': 'Información y comunicaciones',
          'Actividades financieras y de seguros': 'Financieras y seguros',
          'Actividades inmobiliarias': 'Actividades inmobiliarias',
          'Actividades profesionales, científicas y técnicas; actividades administrativas y servicios auxiliares':
            'Profesionales y administrativas',
          'Secciones P y Q': 'Educación y sanidad',
          'Secciones R y S': 'Ocio y otros servicios'
        };
        /* El DIRCE publica la serie completa de cada rama desde 2012, no solo el
           último corte: con el selector se puede ver cómo cambió el tejido
           empresarial —cuándo despega lo inmobiliario, cuándo la construcción— en
           lugar de una única foto fija. */
        var anyosEmp = ejeT(emp.total);
        function ramasDe(anyo) {
          return Object.keys(RAMAS).map(function (k) {
            var punto = ((emp.por_sector || {})[k] || []).filter(function (x) { return x.t === anyo; })[0];
            return { sector: RAMAS[k], v: punto ? punto.v : null };
          }).filter(function (x) { return x.v; }).sort(function (a, b) { return a.v - b.v; });
        }
        function specRamas(anyo) {
          var filas = ramasDe(anyo);
          return {
            type: 'barh', yFormat: 'num', xLabel: 'Rama de actividad',
            x: filas.map(function (x) { return x.sector; }),
            series: [{ name: 'Empresas en ' + anyo, data: filas.map(function (x) { return x.v; }) }]
          };
        }
        var porSector = ramasDe(ultimoAnyoEmp);
        return {
          kpis: [
            { label: 'Paro registrado', valor: ultV(campo(paro, 'total').map(function (v) { return { v: v }; })), invertir: true,
              delta: varIntSerie(campo(paro, 'total')), deltaRef: 'interanual', serie: campo(paro, 'total').slice(-24) },
            { label: 'Contratos del mes', valor: ult(campo(con, 'total')), serie: campo(con, 'total').slice(-24) },
            { label: 'Afiliación total', valor: ult((afi.serie_total || []).map(function (r) { return r.min; })),
              unidad: 'o más', serie: (afi.serie_total || []).map(function (r) { return r.min; }) },
            { label: 'Trabajadores autónomos', valor: (function () {
                var v = campo(reg, 'autonomos').filter(function (x) { return x != null; });
                return v.length ? v[v.length - 1] : null;
              })(), serie: campo(reg, 'autonomos').slice(-24) },
            { label: 'Empresas (DIRCE)', valor: ultV(emp.total),
              unidad: ultimoAnyoEmp || '', serie: vals(emp.total) }
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
              chips: [{ txt: 'Trimestral' }], fuente: FTE.cds_empleo, ancho: 'full',
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
            },
            {
              titulo: 'Empresas con actividad económica', sub: 'Directorio Central de Empresas, a 1 de enero',
              chips: [ANUAL], fuente: FTE.dirce, ancho: 'full',
              nota: 'El DIRCE cuenta empresas con domicilio en el municipio, no establecimientos abiertos al ' +
                    'público: en Benahavís hay mucha sociedad patrimonial e inmobiliaria domiciliada.',
              spec: {
                type: 'area', xType: 'anual', xLabel: 'Año', x: ejeT(emp.total), yFormat: 'num',
                series: [{ name: 'Empresas', data: vals(emp.total) }]
              }
            },
            {
              titulo: 'Empresas por rama de actividad',
              sub: 'Reparto del tejido empresarial, año a año',
              chips: [ANUAL], fuente: FTE.dirce, ancho: 'full',
              control: { label: 'Año', valor: ultimoAnyoEmp,
                         opciones: anyosEmp.slice().reverse().map(function (a) { return { v: a, txt: a }; }),
                         spec: specRamas },
              nota: 'Las ramas suman el total del municipio. Casi la mitad de las empresas son inmobiliarias o ' +
                    'de servicios profesionales y administrativos: el perfil de un municipio residencial de lujo, ' +
                    'no el de uno con mucha actividad productiva. El orden de las barras se recalcula en cada año, ' +
                    'así que un cambio de posición es un cambio real de tamaño y no un efecto del orden fijo.',
              spec: specRamas(ultimoAnyoEmp)
            },
            {
              titulo: 'Afiliación por régimen: autónomos y cuenta ajena',
              sub: 'Afiliados por municipio de residencia',
              chips: [MENSUAL], fuente: FTE.badea_regimen, ancho: 'full',
              nota: 'Esta fuente publica el agregado por régimen sin el enmascarado «<5» del fichero por rama de ' +
                    'actividad, de modo que el número de autónomos sí es exacto. Hasta 2021 el dato es trimestral.',
              spec: {
                type: 'line', xType: 'mes', xLabel: 'Periodo', x: ejeT(reg), yFormat: 'num',
                series: [
                  { name: 'Régimen general', data: campo(reg, 'general') },
                  { name: 'Autónomos', data: campo(reg, 'autonomos') },
                  { name: 'Empleadas y empleados del hogar', data: campo(reg, 'hogar') }
                ]
              }
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
            'Big Data de Turismo Costa del Sol. Mide <b>lo que se anuncia</b>, no lo que registra la Junta.',
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
              chips: [MENSUAL], fuente: FTE.cds_precios, ancho: 'full', alto: 'tall',
              nota: 'La categoría es la que muestra el portal de reserva, no la del Registro de Turismo de ' +
                    'Andalucía, y las dos no coinciden: aquí aparecen «Hostales y Pensiones», una categoría sin ' +
                    'ningún establecimiento inscrito en el municipio. Un hotel que cierra deja de rastrearse y ' +
                    'otro anunciado con dirección de Benahavís entra aunque el RTA lo tenga en otro término, así ' +
                    'que ninguna de estas líneas debe leerse como el precio de un establecimiento concreto.',
              spec: {
                type: 'line', xType: 'mes', x: meses, yFormat: 'eur',
                series: claves.map(function (k) { return { name: k, data: serie(k, 'precio') }; })
              }
            },
            {
              titulo: 'Valoración media de los establecimientos', sub: 'Puntuación de los portales de reserva',
              chips: [MENSUAL], fuente: FTE.cds_precios, ancho: 'full',
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
      desc: 'Todo lo que mide la estación de AEMET <b>6069X Benahavís</b>, dentro del término municipal a 392 m, ' +
            'desde que empezó a registrar: temperatura, lluvia, humedad y viento. Es <b>observación directa</b> y ' +
            'es la única estación del municipio; no hay serie anterior, comprobado pidiendo a AEMET desde 1960.',
      render: function () {
        var c = D.clima || {}, n = c.normales || [], ex = c.extremos || {};
        var idx = c.indices_anuales || [];
        var meses = n.map(function (r) { return MES_CORTO[r.mes - 1]; });

        /* Las series anuales y los recuentos tienen años sin publicar: van sobre
           rejilla completa para que el hueco se vea como hueco y la línea no
           salte por encima de los años que faltan. */
        var ejeIndices = rejillaAnual(campo(idx, 't'));
        var indice = function (nombre) { return alineado(ejeIndices, idx, nombre); };
        var ejeAnual = rejillaAnual(ejeT(c.temperatura_anual).concat(ejeT(c.precipitacion_anual)));

        /* Lluvia por año a partir de los meses publicados. Coincide al decimal con
           el resumen anual de AEMET en los años completos —comprobado en los 17
           que lo tienen—, y además permite distinguir el año incompleto del año
           seco: una barra que falta se lee como «no llovió», y en 2020 y 2021
           llovió, lo que pasa es que a la estación le faltan los meses de otoño. */
        var lluviaAnyo = {};
        (c.precipitacion_mensual || []).forEach(function (x) {
          var a = String(x.t).slice(0, 4);
          var e = lluviaAnyo[a] || (lluviaAnyo[a] = { suma: 0, meses: 0 });
          e.suma += x.v; e.meses++;
        });
        var mesesDe = function (a) { return (lluviaAnyo[a] || {}).meses || 0; };
        var lluviaSi = function (completo) {
          return ejeAnual.map(function (a) {
            var e = lluviaAnyo[a];
            if (!e || (e.meses === 12) !== completo) return null;
            return Math.round(e.suma * 10) / 10;
          });
        };
        var incompletos = ejeAnual.filter(function (a) {
          var m = mesesDe(a);
          return m > 0 && m < 12;
        });
        var detalleIncompletos = incompletos.map(function (a) {
          return a + ' (' + mesesDe(a) + ' meses, ' + F.num(lluviaAnyo[a].suma) + ' mm)';
        }).join(', ');
        var sinTemperatura = ejeAnual.filter(function (a) {
          return !(c.temperatura_anual || []).some(function (x) { return String(x.t) === a; });
        });

        /* --- ciclo anual: la media de la serie o un año concreto ---
           Las dos tarjetas del ciclo mensual enseñaban solo los valores normales,
           es decir el año medio de veintidós. Con el selector se puede además
           mirar un año concreto y ver si fue seco o caluroso frente a esa media,
           que es la pregunta que se le hace a una estación.

           La lista de años NO es la misma para lluvia que para temperatura: AEMET
           publica cada mes con unos campos y sin otros, y hay años con los doce
           meses de lluvia y solo seis de temperatura. Cada tarjeta ofrece los
           suyos. */
        var porAnyoClima = c.mensual_por_anyo || {};
        var NORMAL = 'normal';
        function opcionesAnyo(anyos) {
          return [{ v: NORMAL, txt: 'Media de la serie' }].concat(
            (anyos || []).slice().reverse().map(function (a) { return { v: a, txt: a }; }));
        }
        function filasClima(anyo) {
          return anyo === NORMAL ? n : (porAnyoClima[anyo] || []);
        }
        /* La media de toda la serie se queda de fondo al elegir un año suelto: un
           ciclo anual sin referencia no dice si ese año fue normal o raro. Va en
           gris neutro y con el rótulo completo —«media de los 22 años»— para que
           no se confunda con la media mensual del propio año. */
        var GRIS_REF = '#9aa8bb';
        function normalDe(clave) { return n.map(function (r) { return r[clave]; }); }
        function specPluviometria(anyo) {
          var filas = filasClima(anyo);
          var series = [{ name: anyo === NORMAL ? 'Precipitación media del mes' : 'Precipitación de ' + anyo,
                          data: filas.map(function (r) { return r.precipitacion_media; }) }];
          /* Barras emparejadas, no una línea encima: en una gráfica de barras el
             kit pinta todas las series como barras, y comparar dos alturas juntas
             es justo lo que se quiere hacer aquí. */
          if (anyo !== NORMAL) {
            series.push({ name: 'Media de todos los años', color: GRIS_REF,
                          data: normalDe('precipitacion_media') });
          }
          return {
            type: 'bar', xLabel: 'Mes', xTodas: true, yFormat: 'num',
            x: meses, series: series
          };
        }
        function specTemperaturas(anyo) {
          var filas = filasClima(anyo);
          var sufijo = anyo === NORMAL ? '' : ' de ' + anyo;
          var series = [
            { name: 'Máxima media' + sufijo, data: filas.map(function (r) { return r.temperatura_maxima_media; }) },
            { name: 'Media' + sufijo, data: filas.map(function (r) { return r.temperatura_media; }) },
            { name: 'Mínima media' + sufijo, data: filas.map(function (r) { return r.temperatura_minima_media; }) }
          ];
          if (anyo !== NORMAL) {
            series.push({ name: 'Media de todos los años', color: GRIS_REF, dashed: true,
                          data: normalDe('temperatura_media') });
          }
          return {
            type: 'line', xLabel: 'Mes', xTodas: true, yFormat: 'dec1',
            x: meses, series: series
          };
        }

        return {
          kpis: [
            { label: 'Temperatura media anual', valor: ultV(c.temperatura_anual), unidad: '°C', dec: 1, formato: F.num, serie: vals(c.temperatura_anual) },
            { label: 'Precipitación anual', valor: ultV(c.precipitacion_anual), unidad: 'mm', formato: F.num, serie: vals(c.precipitacion_anual) },
            /* Un extremo sin fecha no es un dato: dice cuánto, pero no cuándo. */
            { label: 'Temperatura máxima registrada', valor: (ex.ta_max || {}).valor, dec: 1, formato: F.num,
              unidad: '°C · ' + (mesAnyo((ex.ta_max || {}).fecha) || 'fecha no publicada') },
            { label: 'Temperatura mínima registrada', valor: (ex.ta_min || {}).valor, dec: 1, formato: F.num,
              unidad: '°C · ' + (mesAnyo((ex.ta_min || {}).fecha) || 'fecha no publicada') },
            { label: 'Racha de viento más fuerte', valor: (ex.w_racha || {}).valor, dec: 0, formato: F.num,
              unidad: 'km/h · ' + (mesAnyo((ex.w_racha || {}).fecha) || 'fecha no publicada') }
          ],
          cards: [
            {
              titulo: 'Temperatura media mes a mes',
              sub: 'Serie completa de la estación · ' + F.num((c.temperatura_mensual || []).length) + ' meses desde ' +
                   (mesAnyo(c.primer_mes) || ''),
              chips: [MENSUAL], fuente: FTE.aemet, ancho: 'full',
              nota: 'Es toda la serie que existe para el municipio. Se puede acercar el tramo que interese con la ' +
                    'barra inferior, y ver los valores en tabla o descargarlos en CSV con los botones de la tarjeta.',
              spec: {
                type: 'line', xType: 'mes', xLabel: 'Mes', yFormat: 'dec1', yLabel: '°C',
                x: ejeT(c.temperatura_mensual), zoom: true, zoomDesde: 0,
                series: [{ name: 'Temperatura media mensual', data: vals(c.temperatura_mensual) }]
              }
            },
            {
              titulo: 'Precipitación mes a mes',
              sub: 'Litros por metro cuadrado recogidos cada mes',
              chips: [MENSUAL], fuente: FTE.aemet, ancho: 'full',
              nota: 'El régimen es mediterráneo de montaña: inviernos húmedos, veranos con meses enteros a cero. ' +
                    'La media anual dice poco por sí sola cuando la lluvia se concentra así.',
              spec: {
                type: 'bar', xType: 'mes', xLabel: 'Mes', yFormat: 'num', yLabel: 'mm',
                x: ejeT(c.precipitacion_mensual), zoom: true, zoomDesde: 0,
                series: [{ name: 'Precipitación mensual', data: vals(c.precipitacion_mensual) }]
              }
            },
            {
              titulo: 'Temperatura media anual', sub: 'Resumen anual que publica AEMET',
              chips: [ANUAL], fuente: FTE.aemet,
              nota: 'Faltan ' + (sinTemperatura.length ? sinTemperatura.join(', ') : 'algunos años') +
                    ': a esos años les faltó algún mes en la estación. No se rellenan ni se calcula la media con ' +
                    'lo que hay, porque la media de un año al que le falta noviembre y diciembre sale alta y no es ' +
                    'comparable con la de un año entero.',
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', x: ejeAnual, yFormat: 'dec1', yLabel: '°C',
                series: [{ name: 'Temperatura media', data: alineado(ejeAnual, c.temperatura_anual, 'v') }]
              }
            },
            {
              titulo: 'Precipitación anual', sub: 'Total recogido en el año',
              chips: [ANUAL], fuente: FTE.aemet, ancho: 'full',
              nota: (incompletos.length
                      ? 'Ojo con ' + detalleIncompletos + ': no son años secos, son años a los que la estación ' +
                        'no publicó todos los meses, y justo los que faltan son los del otoño, que es cuando más ' +
                        'llueve aquí. Van en otro color para que no se lean como un año entero.'
                      : 'Todos los años de la serie tienen sus doce meses publicados.') +
                    ' En los años completos la suma de los meses coincide al decimal con el resumen anual de AEMET.',
              spec: {
                type: 'bar', xType: 'anual', xLabel: 'Año', x: ejeAnual, yFormat: 'num', yLabel: 'mm',
                series: [
                  { name: 'Año completo', data: lluviaSi(true) },
                  { name: 'Año incompleto (solo los meses publicados)', color: 'warn', data: lluviaSi(false) }
                ]
              }
            },
            {
              titulo: 'Pluviometría', sub: 'Precipitación de cada mes del año, mm',
              chips: [{ txt: 'Ciclo anual' }], fuente: FTE.aemet,
              control: { label: 'Año', valor: NORMAL, opciones: opcionesAnyo(c.anyos_precipitacion),
                         spec: specPluviometria },
              nota: 'Precipitación y temperatura no comparten eje: son magnitudes distintas y superponerlas en una ' +
                    'sola escala falsearía la lectura. En el selector solo aparecen los ' +
                    F.num((c.anyos_precipitacion || []).length) + ' años con los doce meses de lluvia publicados; ' +
                    'al elegir uno, la media de toda la serie se queda de fondo para poder compararlo.',
              spec: specPluviometria(NORMAL)
            },
            {
              titulo: 'Temperatura media, máxima y mínima', sub: 'Ciclo anual de la estación, °C',
              chips: [{ txt: 'Ciclo anual' }], fuente: FTE.aemet,
              control: { label: 'Año', valor: NORMAL, opciones: opcionesAnyo(c.anyos_temperatura),
                         spec: specTemperaturas },
              nota: 'Máxima y mínima son las medias de las máximas y las mínimas diarias del mes, no los récords. ' +
                    'Hay menos años que en la lluvia (' + F.num((c.anyos_temperatura || []).length) + ' frente a ' +
                    F.num((c.anyos_precipitacion || []).length) + ') porque AEMET publica cada mes con unos campos ' +
                    'y sin otros: hay años con los doce meses de precipitación y solo la mitad de temperatura.',
              spec: specTemperaturas(NORMAL)
            },
            {
              titulo: 'Días de calor, de lluvia y de viento fuerte', sub: 'Recuento observado en la estación',
              chips: [ANUAL], fuente: FTE.aemet, ancho: 'full',
              nota: 'Recuento de la propia AEMET, no un umbral aplicado sobre una media: días con máxima de 30 °C ' +
                    'o más, días con 1 mm de lluvia o más, días con 10 mm o más y días con rachas de 55 km/h o más. ' +
                    'Solo aparecen los años con los doce meses publicados de ese contador, y por eso hay huecos.',
              spec: {
                type: 'line', xType: 'anual', xLabel: 'Año', yFormat: 'num', yLabel: 'días',
                x: ejeIndices,
                series: [
                  { name: 'Días de 30 °C o más', data: indice('dias_calor') },
                  { name: 'Días de lluvia (≥ 1 mm)', data: indice('dias_lluvia') },
                  { name: 'Días de lluvia fuerte (≥ 10 mm)', data: indice('dias_lluvia_fuerte') },
                  { name: 'Días de viento fuerte (≥ 55 km/h)', data: indice('dias_viento_fuerte') }
                ]
              }
            },
            {
              titulo: 'Humedad relativa media', sub: 'Media mensual de la estación, %',
              chips: [MENSUAL], fuente: FTE.aemet,
              spec: {
                type: 'line', xType: 'mes', xLabel: 'Mes', yFormat: 'num', yLabel: '%',
                x: ejeT(c.humedad_mensual), zoom: true, zoomDesde: 0,
                series: [{ name: 'Humedad relativa media', data: vals(c.humedad_mensual) }]
              }
            },
            {
              titulo: 'Viento medio', sub: 'Velocidad media mensual, km/h',
              chips: [MENSUAL], fuente: FTE.aemet,
              nota: 'La racha máxima de la serie, ' + F.num((ex.w_racha || {}).valor) + ' km/h, se registró en ' +
                    (mesAnyo((ex.w_racha || {}).fecha) || 'fecha no publicada') + '. AEMET publica la racha en metros ' +
                    'por segundo y la velocidad media en km/h; aquí las dos van en km/h.',
              spec: {
                type: 'line', xType: 'mes', xLabel: 'Mes', yFormat: 'num', yLabel: 'km/h',
                x: ejeT(c.viento_medio_mensual), zoom: true, zoomDesde: 0,
                series: [{ name: 'Velocidad media del viento', data: vals(c.viento_medio_mensual) }]
              }
            }
          ]
        };
      }
    }
  ];

  /* ----------------------------------------------------------- Arranque --- */

  var FICHEROS = ['meta', 'demografia', 'oferta', 'vut', 'demanda', 'trabajo',
                  'economia', 'clima', 'visitantes', 'costadelsol', 'validacion', 'limite'];

  function arrancar() {
    var meta = D.meta || {};
    Obs.init({
      titulo: 'Observatorio de Benahavís',
      subtitulo: 'Datos abiertos del municipio (29023) para el expediente de Municipio Turístico de Andalucía',
      secciones: SECCIONES,
      actualizado: meta.generado,
      fuentes: [FTE.padron, FTE.padron_nacionalidad, FTE.sima, FTE.renta, FTE.gini, FTE.rta,
                FTE.ine_vut, FTE.moviles, FTE.eoh, FTE.cds, FTE.sepe, FTE.ss, FTE.dirce,
                FTE.badea_regimen, FTE.aemet, FTE.hacienda],
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
