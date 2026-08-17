/* Observatorio de Benahavís — utilidades compartidas.
   Sin dependencias más allá de ECharts, cargado por CDN desde las páginas. */

export const PALETA = ['#1d4e89', '#2f9e8f', '#c1743a', '#7a5ea8', '#4a7d34', '#a8456a'];

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const fmtEntero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const fmtDecimal = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Formatea un número al uso español. Devuelve un guion si no hay dato. */
export function num(v, decimales = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return decimales > 0 ? fmtDecimal.format(v) : fmtEntero.format(v);
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
export function ficha({ titulo, unidad, ambito, fuente, referencia, actualizado, nota, alto = false }) {
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
  pie.innerHTML = `<strong>Fuente:</strong> ${fuente}.
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
    grid: { left: 14, right: 18, top: 34, bottom: 8, containLabel: true },
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
      axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => num(v, v % 1 ? 1 : 0) }
    }
  };
}

/** Eje de valores horizontal para los gráficos de barras apaisados. */
export function ejeValorHorizontal() {
  return {
    type: 'value',
    splitLine: { lineStyle: { color: '#eef1f4' } },
    axisLabel: { fontSize: 11.5, color: '#6b7883', formatter: (v) => num(v) }
  };
}

/** Instancia un gráfico ECharts que se redimensiona con la ventana. */
export function pintar(nodo, opciones) {
  const g = echarts.init(nodo, null, { renderer: 'canvas' });
  g.setOption(opciones);
  window.addEventListener('resize', () => g.resize());
  return g;
}

/** Marca en la navegación el bloque visible. */
export function activarNavegacion() {
  const enlaces = [...document.querySelectorAll('.nav__lista a[href^="#"]')];
  const secciones = enlaces
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if (!secciones.length) return;

  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      enlaces.forEach((a) => a.removeAttribute('aria-current'));
      const activo = enlaces.find((a) => a.getAttribute('href') === `#${e.target.id}`);
      if (activo) activo.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-80px 0px -70% 0px' });

  secciones.forEach((s) => obs.observe(s));
}
