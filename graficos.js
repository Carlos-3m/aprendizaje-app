'use strict';
/* Gráficos de la pantalla «Progreso». Se dibujan en SVG, sin bibliotecas.
   Los colores salen de estilos.css (variables --serie, --banda, etc.). */
const Graficos = (() => {
  const ALTO = 200;
  const MARGEN = { izq: 36, der: 12, sup: 18, inf: 26 };

  const esc = (texto) => String(texto).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Paso «redondo» para las marcas del eje vertical. */
  function pasoRedondo(maximo, marcas) {
    const bruto = maximo / marcas;
    const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
    const base = bruto / potencia;
    const elegido = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
    return elegido * potencia;
  }

  function fechaCorta(fecha) {
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const [, mes, dia] = fecha.split('-').map(Number);
    return dia + ' ' + meses[mes - 1];
  }

  /** Estructura común: ejes, franja prevista y una columna invisible por sesión
      que muestra los datos al pasar el ratón o al llegar con el teclado. */
  function lienzo(contenedor, sesiones, opciones) {
    const ancho = Math.max(280, Math.floor(contenedor.clientWidth || 600));
    const areaAncho = ancho - MARGEN.izq - MARGEN.der;
    const areaAlto = ALTO - MARGEN.sup - MARGEN.inf;
    const paso = pasoRedondo(opciones.techo, 4);
    const techo = Math.ceil(opciones.techo / paso) * paso;
    const y = (valor) => MARGEN.sup + areaAlto - (valor / techo) * areaAlto;
    const banda = areaAncho / Math.max(sesiones.length, 1);
    const centro = (i) => MARGEN.izq + banda * (i + 0.5);

    let svg = `<svg viewBox="0 0 ${ancho} ${ALTO}" width="${ancho}" height="${ALTO}" role="img" aria-label="${esc(opciones.titulo)}">`;

    // Franja prevista
    if (opciones.franja) {
      const [desde, hasta] = opciones.franja;
      svg += `<rect class="g-franja" x="${MARGEN.izq}" y="${y(hasta)}" width="${areaAncho}" height="${y(desde) - y(hasta)}"/>`;
    }
    // Líneas de referencia y marcas del eje vertical
    for (let valor = 0; valor <= techo + 1e-9; valor += paso) {
      const clase = valor === 0 ? 'g-base' : 'g-rejilla';
      svg += `<line class="${clase}" x1="${MARGEN.izq}" x2="${ancho - MARGEN.der}" y1="${y(valor)}" y2="${y(valor)}"/>`;
      svg += `<text class="g-eje" x="${MARGEN.izq - 6}" y="${y(valor) + 4}" text-anchor="end">${valor}${opciones.sufijo || ''}</text>`;
    }
    // Etiquetas del eje horizontal (si no caben todas, una de cada dos)
    const salto = banda < 30 ? 2 : 1;
    sesiones.forEach((s, i) => {
      if ((sesiones.length - 1 - i) % salto === 0) {
        svg += `<text class="g-eje" x="${centro(i)}" y="${ALTO - 8}" text-anchor="middle">#${s.numero}</text>`;
      }
    });

    svg += opciones.marcas({ y, centro, banda, techo });

    // Zonas sensibles
    sesiones.forEach((s, i) => {
      svg += `<rect class="g-zona" data-i="${i}" tabindex="0" role="img" aria-label="${esc(opciones.descripcion(s))}" x="${MARGEN.izq + banda * i}" y="${MARGEN.sup}" width="${banda}" height="${areaAlto}"/>`;
    });
    svg += '</svg><div class="g-globo" hidden></div>';
    contenedor.innerHTML = svg;

    const globo = contenedor.querySelector('.g-globo');
    const mostrar = (zona) => {
      const i = Number(zona.dataset.i);
      globo.innerHTML = opciones.detalle(sesiones[i]);
      globo.hidden = false;
      const mitad = centro(i);
      globo.style.left = Math.min(Math.max(mitad, 80), ancho - 80) + 'px';
      globo.style.top = '0px';
    };
    contenedor.querySelectorAll('.g-zona').forEach((zona) => {
      zona.addEventListener('mouseenter', () => mostrar(zona));
      zona.addEventListener('focus', () => mostrar(zona));
      zona.addEventListener('mouseleave', () => { globo.hidden = true; });
      zona.addEventListener('blur', () => { globo.hidden = true; });
    });
  }

  /** Columnas: minutos reales de cada sesión, con la franja prevista detrás. */
  function minutos(contenedor, sesiones, minutosProyecto, nombreTipo) {
    const datos = sesiones.filter((s) => typeof s.min_reales === 'number').slice(-12);
    if (!datos.length) { contenedor.innerHTML = '<p class="nota">Todavía no hay duraciones registradas.</p>'; return; }
    const maximo = minutosProyecto.maximo;
    lienzo(contenedor, datos, {
      titulo: 'Minutos reales por sesión',
      techo: Math.max(...datos.map((s) => s.min_reales), maximo) * 1.12,
      franja: [minutosProyecto.minimo, maximo],
      descripcion: (s) => `Sesión ${s.numero}, ${fechaCorta(s.fecha)}: ${s.min_reales} minutos; máximo previsto ${maximo}`,
      detalle: (s) => `<strong>#${s.numero} · ${esc(fechaCorta(s.fecha))}</strong><span>${esc(nombreTipo(s.tipo))}</span><span>${s.min_reales} min · máximo ${maximo}</span>`,
      marcas: ({ y, centro, banda }) => {
        const grosor = Math.min(24, banda * 0.6);
        return datos.map((s, i) => {
          const x = centro(i) - grosor / 2;
          const arriba = y(s.min_reales);
          const abajo = y(0);
          const radio = Math.min(4, grosor / 2, abajo - arriba);
          let marca = `<path class="g-columna" d="M${x},${abajo} V${arriba + radio} Q${x},${arriba} ${x + radio},${arriba} H${x + grosor - radio} Q${x + grosor},${arriba} ${x + grosor},${arriba + radio} V${abajo} Z"/>`;
          // Solo se rotulan las que se pasan del máximo: son las que importan.
          if (s.min_reales > maximo) {
            marca += `<text class="g-valor" x="${centro(i)}" y="${arriba - 5}" text-anchor="middle">${s.min_reales}</text>`;
          }
          return marca;
        }).join('');
      },
    });
  }

  /** Puntos: porcentaje de acierto de cada sesión, con la banda justa detrás. */
  function acierto(contenedor, sesiones, nombreTipo) {
    const datos = sesiones.filter((s) => typeof s.aciertos === 'number' && s.intentos > 0).slice(-12);
    if (!datos.length) { contenedor.innerHTML = '<p class="nota">Todavía no hay aciertos registrados.</p>'; return; }
    const porcentaje = (s) => Math.round((s.aciertos / s.intentos) * 100);
    lienzo(contenedor, datos, {
      titulo: 'Porcentaje de acierto por sesión',
      techo: 100,
      sufijo: '',
      franja: [60, 85],
      descripcion: (s) => `Sesión ${s.numero}, ${fechaCorta(s.fecha)}: ${porcentaje(s)} por ciento de acierto`,
      detalle: (s) => `<strong>#${s.numero} · ${esc(fechaCorta(s.fecha))}</strong><span>${esc(nombreTipo(s.tipo))}</span><span>${porcentaje(s)} % (${s.aciertos} de ${s.intentos})</span>`,
      marcas: ({ y, centro }) => datos.map((s, i) => {
        const valor = porcentaje(s);
        let marca = `<circle class="g-punto" cx="${centro(i)}" cy="${y(valor)}" r="5"/>`;
        if (i === datos.length - 1) {
          const debajo = valor > 88;
          marca += `<text class="g-valor" x="${centro(i)}" y="${y(valor) + (debajo ? 19 : -10)}" text-anchor="middle">${valor} %</text>`;
        }
        return marca;
      }).join(''),
    });
  }

  return { minutos, acierto, fechaCorta };
})();
