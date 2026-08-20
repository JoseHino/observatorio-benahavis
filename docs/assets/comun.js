/* Observatorio de Benahavís — utilidades compartidas.
   Sin dependencias más allá de ECharts, cargado por CDN desde las páginas. */

export const PALETA = ['#1d4e89', '#2f9e8f', '#c1743a', '#7a5ea8', '#4a7d34', '#a8456a'];

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Dirección pública de cada fuente, para que el pie de cada gráfico lleve al
 * origen del dato. Se centraliza aquí —y no en cada ficha— porque la misma fuente
 * alimenta varios gráficos y un enlace roto debe corregirse en un solo sitio.
 *
 * Se apunta a la página consultable por una persona, no al endpoint que usa el
 * pipeline: quien pulsa quiere ver la estadística, no descargar un CSV. Las del
 * Big Data provincial llevan ya el municipio en la dirección.
 */
export const FUENTES = {
  INE_PADRON: 'https://www.ine.es/jaxiT3/Tabla.htm?t=2882',
  INE_RENTA: 'https://www.ine.es/jaxiT3/Tabla.htm?t=30824',
  INE_GINI: 'https://www.ine.es/jaxiT3/Tabla.htm?t=37677',
  INE_VUT: 'https://www.ine.es/jaxiT3/Tabla.htm?t=39363',
  DATAESTUR_MOVIL: 'https://www.dataestur.es/viajes-ocio/medicion-del-turismo-a-partir-de-telefonia-movil/',
  DATAESTUR_EOH: 'https://www.dataestur.es/alojamientos/encuesta-ocupacion-hoteles/',
  OPENRTA: 'https://www.juntadeandalucia.es/datosabiertos/portal/dataset/openrta',
  IECA_SIMA: 'https://www.juntadeandalucia.es/institutodeestadisticaycartografia/sima/ficha.htm?mun=29023',
  SEPE: 'https://www.sepe.es/HomeSepe/que-es-el-sepe/estadisticas/datos-estadisticos/municipios.html',
  SEGURIDAD_SOCIAL: 'https://www.seg-social.es/wps/portal/wss/internet/EstadisticasPresupuestosEstudios/Estadisticas/EST8',
  AEMET: 'https://opendata.aemet.es/centrodedescargas/inicio',
  HACIENDA_DEUDA: 'https://www.hacienda.gob.es/es-ES/CDI/Paginas/SistemasFinanciacionDeuda/InformacionEELLs/DeudaViva.aspx',
  CDS_PORTAL: 'https://www.costadelsolmalaga.org/bigdata/',
  CDS_VIVIENDAS: 'https://www.costadelsolmalaga.org/bigdata/com1_tc-364273/viviendas-turisticas?mun=29023',
  CDS_OFERTA: 'https://www.costadelsolmalaga.org/bigdata/com1_tc-357992/oferta-alojamiento?mun=29023',
  CDS_PRECIOS: 'https://www.costadelsolmalaga.org/bigdata/com1_tc-461998/precios-hoteles?mun=29023',
  CDS_EMPLEO: 'https://www.costadelsolmalaga.org/bigdata/com1_tc-357987/empleo-turismo?mun=29023',
  CDS_VIAJEROS: 'https://www.costadelsolmalaga.org/bigdata/com1_tc-357990/viajeros-pernoctaciones?mun=29023',
};

/** Envuelve el nombre de la fuente en un enlace a su página oficial. */
export function enlaceFuente(texto, url) {
  if (!url) return texto;
  return `<a class="enlace-fuente" href="${url}" target="_blank" rel="noopener">${texto}</a>`;
}

const fmtEntero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const fmtDecimal = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// En un eje conviven cifras de cuatro y de cinco dígitos. La norma española omite el
// separador de millar en las de cuatro, lo que en una escala produce «3000» junto a
// «12.000». Dentro del eje se fuerza el agrupamiento para que la escala sea uniforme;
// en el texto corrido se mantiene la norma.
const fmtEje = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' });

/** Formatea un número al uso español. Devuelve un guion si no hay dato. */
export function num(v, decimales = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return decimales > 0 ? fmtDecimal.format(v) : fmtEntero.format(v);
}

/** Formatea un valor para un rótulo de eje, con separador de millar uniforme. */
export function numEje(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  return fmtEje.format(v);
}

/** Convierte «2025-07» en «julio de 2025»; deja pasar los años sueltos. */
export function periodoLargo(t) {
  if (!t) return '—';
  if (t.length === 4) return t;
  const [a, m] = t.split('-');
  return `${MESES[Number(m) - 1]} de ${a}`;
}

/** Convierte «2025-07» en «jul 25» para los ejes. */
export function periodoCorto(t) {
  if (!t || t.length === 4) return t;
  const [a, m] = t.split('-');
  return `${MESES[Number(m) - 1].slice(0, 3)} ${a.slice(2)}`;
}

/** Carga un JSON de docs/data. Devuelve null si no existe, sin romper la página. */
export async function cargar(nombre) {
  try {
    const r = await fetch(`data/${nombre}.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn(`No se pudo cargar ${nombre}.json`, e);
    return null;
  }
}

/**
 * Crea la ficha contenedora de un gráfico con su rótulo normativo completo.
 * Todo gráfico del observatorio lleva obligatoriamente título, unidad, ámbito
 * territorial, fuente, año de referencia y fecha de actualización.
 */
export function ficha({ titulo, unidad, ambito, fuente, enlace, referencia, actualizado, nota,
                        alto = false }) {
  const art = document.createElement('article');
  art.className = 'ficha';

  const etq = etiquetaAmbito(ambito);
  const cab = document.createElement('div');
  cab.className = 'ficha__cabecera';
  cab.innerHTML = `
    <h3 class="ficha__titulo">${titulo}</h3>
    <div class="ficha__meta">
      <span class="etiqueta ${etq.clase}">${etq.texto}</span>
      ${unidad ? `<span>Unidad: ${unidad}</span>` : ''}
      ${referencia ? `<span>Referencia: ${referencia}</span>` : ''}
    </div>`;

  const lienzo = document.createElement('div');
  lienzo.className = alto ? 'ficha__lienzo ficha__lienzo--alto' : 'ficha__lienzo';

  const pie = document.createElement('div');
  pie.className = 'ficha__pie';
  pie.innerHTML = `<strong>Fuente:</strong> ${enlaceFuente(fuente, enlace)}.
    ${nota ? `${nota} ` : ''}Actualizado el ${actualizado || '—'}.`;

  art.append(cab, lienzo, pie);
  return { art, lienzo };
}

function etiquetaAmbito(ambito) {
  switch (ambito) {
    case 'municipal': return { clase: 'etiqueta--municipal', texto: 'Ámbito municipal' };
    case 'municipal-experimental':
      return { clase: 'etiqueta--experimental', texto: 'Municipal · estadística experimental' };
    case 'provincial':
      return { clase: 'etiqueta--proxy', texto: 'Proxy · provincia de Málaga' };
    case 'zona_turistica':
      return { clase: 'etiqueta--proxy', texto: 'Proxy · zona turística Costa del Sol' };
    case 'estacion':
      return { clase: 'etiqueta--proxy', texto: 'Estación de contraste · no municipal' };
    default: return { clase: 'etiqueta--nodisponible', texto: 'Sin ámbito declarado' };
  }
}

/** Bloque que documenta un indicador que la fuente no publica para el municipio. */
export function hueco(indicador, causa, sustituto) {
  const div = document.createElement('div');
  div.className = 'hueco';
  div.innerHTML = `<strong>${indicador} · NO DISPONIBLE A NIVEL MUNICIPAL</strong>
    ${causa}${sustituto ? `<br>Indicador sustitutivo: ${sustituto}` : ''}`;
  return div;
}

/** Párrafo de lectura técnica en prosa impersonal. */
export function lectura(texto) {
  const div = document.createElement('div');
  div.className = 'lectura';
  div.innerHTML = `<div class="lectura__titulo">Lectura técnica</div><p>${texto}</p>`;
  return div;
}

/** Tarjeta de cifra destacada. */
export function cifra(etiqueta, valor, unidad, pie) {
  const div = document.createElement('div');
  div.className = 'cifra';
  div.innerHTML = `
    <div class="cifra__etiqueta">${etiqueta}</div>
    <div class="cifra__valor">${valor}${unidad ? `<span class="cifra__unidad">${unidad}</span>` : ''}</div>
    ${pie ? `<div class="cifra__pie">${pie}</div>` : ''}`;
  return div;
}

/** Opciones base comunes a todos los gráficos: sobrias y legibles. */
export function baseOpciones() {
  return {
    color: PALETA,
    textStyle: { fontFamily: 'Montserrat, Arial, sans-serif', color: '#4a5866' },
    grid: { left: 16, right: 22, top: 36, bottom: 10, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#ffffff',
      borderColor: '#d8dee5',
      borderWidth: 1,
      textStyle: { color: '#1b2733', fontSize: 12.5 },
      extraCssText: 'box-shadow:0 4px 14px rgba(15,44,82,.12);border-radius:4px;'
    },
    legend: { top: 2, icon: 'roundRect', itemWidth: 11, itemHeight: 11,
              textStyle: { fontSize: 12, color: '#4a5866' } },
    xAxis: {
      type: 'category',
      axisLine: { lineStyle: { color: '#d8dee5' } },
      axisTick: { show: false },
      axisLabel: { fontSize: 11.5, color: '#6b7883' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#eef1f4' } },
      // ECharts rotula por defecto en formato inglés («10,000»), que conviviría en la
      // misma página con las cifras en español («14.248»). Se fuerza el formato local.
      axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => numEje(v) }
    }
  };
}

/** Eje de valores horizontal para los gráficos de barras apaisados. */
export function ejeValorHorizontal() {
  return {
    type: 'value',
    splitLine: { lineStyle: { color: '#eef1f4' } },
    axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => numEje(v) }
  };
}

/**
 * Instancia un gráfico ECharts que se adapta al tamaño de SU CONTENEDOR.
 *
 * No basta con escuchar `resize` de la ventana. Los gráficos se pintan a medida que
 * llegan los datos, y el primero de cada bloque se inicializa cuando su rejilla
 * todavía tiene un único hijo: CSS le da entonces el ancho completo. Al añadirse el
 * segundo gráfico la rejilla pasa a dos columnas, pero la ventana no ha cambiado de
 * tamaño, así que ECharts conservaba el ancho antiguo y el lienzo quedaba cortado a
 * la mitad. Un ResizeObserver sobre el propio nodo cubre ese caso y también el de
 * rotar el dispositivo o cambiar el zoom.
 */
const GRAFICOS = [];

/**
 * Redibuja todos los gráficos ya creados.
 *
 * Hace falta al cambiar de pestaña: los gráficos de un panel oculto se
 * inicializaron con anchura cero y el ResizeObserver no siempre llega a tiempo
 * en el primer cambio.
 */
export function redibujar() {
  GRAFICOS.forEach((g) => {
    const nodo = g.getDom();
    if (nodo && nodo.clientWidth > 0) g.resize();
  });
}

export function pintar(nodo, opciones) {
  const g = echarts.init(nodo, null, { renderer: 'canvas' });
  g.setOption(opciones);
  GRAFICOS.push(g);

  if (typeof ResizeObserver === 'function') {
    let pendiente = null;
    const obs = new ResizeObserver(() => {
      // Se agrupa en un frame para no redimensionar una vez por cada mutación.
      if (pendiente) cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => {
        pendiente = null;
        if (nodo.clientWidth > 0) g.resize();
      });
    });
    obs.observe(nodo);
  } else {
    window.addEventListener('resize', () => g.resize());
  }
  return g;
}

/**
 * Convierte las secciones temáticas en pestañas.
 *
 * La pestaña activa se refleja en el fragmento de la URL, de modo que un enlace
 * a `index.html#demanda` —los hay en las otras páginas del observatorio— sigue
 * abriendo la temática correcta y la dirección se puede compartir.
 *
 * Al mostrar una pestaña se avisa a quien lo necesite: un gráfico creado dentro
 * de un panel oculto se dibujó con anchura cero, y tanto ECharts como Leaflet
 * necesitan recalcular su tamaño en cuanto el panel se hace visible.
 */
export function activarPestanas(alMostrar) {
  const pestanas = [...document.querySelectorAll('.nav__pestana')];
  if (!pestanas.length) return;
  const paneles = pestanas.map((b) => document.getElementById(b.dataset.panel)).filter(Boolean);

  function mostrar(id, conHistorial = true) {
    const destino = paneles.some((p) => p.id === id) ? id : paneles[0].id;
    paneles.forEach((p) => { p.hidden = p.id !== destino; });
    pestanas.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === destino)));

    // En móvil la barra de pestañas se desplaza en horizontal: la activa debe quedar
    // a la vista, o el usuario no ve en qué temática está.
    const activa = pestanas.find((b) => b.dataset.panel === destino);
    if (activa) activa.scrollIntoView({ block: 'nearest', inline: 'center' });

    if (conHistorial && location.hash.slice(1) !== destino) {
      history.replaceState(null, '', `#${destino}`);
    }
    if (typeof alMostrar === 'function') alMostrar(destino);
  }

  pestanas.forEach((b) => b.addEventListener('click', () => {
    mostrar(b.dataset.panel);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  window.addEventListener('hashchange', () => mostrar(location.hash.slice(1), false));

  mostrar(location.hash.slice(1) || paneles[0].id, false);
}

/** Oculta la pestaña de una temática que no ha podido publicar ningún dato. */
export function ocultarPestana(id) {
  const boton = document.querySelector(`.nav__pestana[data-panel="${id}"]`);
  const panel = document.getElementById(id);
  if (boton) boton.closest('li').hidden = true;
  if (panel) panel.hidden = true;
}
