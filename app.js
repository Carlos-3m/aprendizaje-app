'use strict';
/* Aplicación de aprendizaje · versión 0.1
   Dos pantallas: «Hoy» (guía y cronometra la sesión) y «Progreso»
   (muestra si las sesiones salen fáciles, justas o difíciles). */
(() => {
  // ───────────────────────── Vocabulario ─────────────────────────
  const TIPOS = {
    predecir: 'Leer y predecir',
    completar: 'Completar con huecos',
    producir: 'Producir desde cero',
    nuevo: 'Material nuevo',
    revision: 'Revisión o decisión',
  };
  const TIPOS_CALIBRADOS = ['predecir', 'completar', 'producir', 'nuevo'];
  const ESCALONES = { ninguno: 'No llegué al mínimo', minimo: 'Mínimo', objetivo: 'Objetivo', extra: 'Extra' };
  const AYUDAS = ['Sin ayuda', 'Pista mínima', 'Explicación parcial', 'Explicación completa'];
  const FASES = [['tarjetas', 'Tarjetas'], ['calentamiento', 'Calentamiento'], ['nucleo', 'Núcleo'], ['cierre', 'Cierre']];
  const BANDA = { baja: 60, alta: 85 };

  // ───────────────────────── Utilidades ─────────────────────────
  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nombreTipo = (tipo) => TIPOS[tipo] || 'Sin clasificar';
  const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor);
  const media = (lista) => lista.reduce((a, b) => a + b, 0) / lista.length;
  const dosCifras = (n) => String(n).padStart(2, '0');

  const Memoria = {
    leer(clave, porDefecto) {
      try { const v = localStorage.getItem('apr.' + clave); return v == null ? porDefecto : JSON.parse(v); }
      catch { return porDefecto; }
    },
    guardar(clave, valor) { try { localStorage.setItem('apr.' + clave, JSON.stringify(valor)); } catch { /* sin espacio */ } },
    borrar(clave) { try { localStorage.removeItem('apr.' + clave); } catch { /* nada */ } },
  };

  function fechaISO(fecha = new Date()) {
    return fecha.getFullYear() + '-' + dosCifras(fecha.getMonth() + 1) + '-' + dosCifras(fecha.getDate());
  }
  function aFecha(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }
  function diasDesde(iso) { return Math.round((aFecha(fechaISO()) - aFecha(iso)) / 86400000); }
  function haceCuanto(iso) {
    const dias = diasDesde(iso);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return 'hace ' + dias + ' días';
  }
  function lunesDeEstaSemana() {
    const hoy = aFecha(fechaISO());
    hoy.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return hoy;
  }
  function reloj(ms) {
    const segundos = Math.max(0, Math.floor(ms / 1000));
    return dosCifras(Math.floor(segundos / 60)) + ':' + dosCifras(segundos % 60);
  }
  const aMinutos = (ms) => Math.max(0, Math.round(ms / 60000));
  const porcentaje = (s) => (s.aciertos / s.intentos) * 100;
  const tieneAcierto = (s) => esNumero(s.aciertos) && esNumero(s.intentos) && s.intentos > 0;

  let audio;
  function pitido(veces = 1) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < veces; i++) {
        const oscilador = audio.createOscillator();
        const volumen = audio.createGain();
        const t = audio.currentTime + i * 0.4;
        oscilador.frequency.value = 880;
        oscilador.connect(volumen); volumen.connect(audio.destination);
        volumen.gain.setValueAtTime(0.0001, t);
        volumen.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        volumen.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        oscilador.start(t); oscilador.stop(t + 0.32);
      }
    } catch { /* sin sonido: el aviso también se ve en pantalla */ }
  }

  let temporizadorGlobo;
  function globo(texto) {
    const caja = $('#globo');
    caja.textContent = texto; caja.hidden = false;
    clearTimeout(temporizadorGlobo);
    temporizadorGlobo = setTimeout(() => { caja.hidden = true; }, 3500);
  }

  // ───────────────────────── Estado ─────────────────────────
  const estado = {
    vista: 'hoy',
    cargando: true,
    error: null,
    proyectos: [],
    slug: null,
    sesiones: [],
    proxima: null,
    enCurso: Memoria.leer('enCurso', null),
    guardada: null,
    mensajeFormulario: '',
  };
  const proyecto = () => estado.proyectos.find((p) => p.slug === estado.slug);
  const rutaSesiones = (slug) => '02-proyectos/' + slug + '/datos/sesiones.json';
  const rutaProxima = (slug) => '02-proyectos/' + slug + '/datos/proxima.json';

  function guardarEnCurso() {
    if (estado.enCurso) Memoria.guardar('enCurso', estado.enCurso); else Memoria.borrar('enCurso');
  }
  /** La sesión preparada por el coach, si todavía no se ha hecho. */
  function proximaPendiente() {
    const p = estado.proxima;
    if (!p || !esNumero(p.numero)) return null;
    return estado.sesiones.some((s) => s.numero === p.numero) ? null : p;
  }

  // ───────────────────────── Datos ─────────────────────────
  async function cargarProyecto() {
    const [archivo, proxima] = await Promise.all([
      Almacen.leer(rutaSesiones(estado.slug)),
      Almacen.leer(rutaProxima(estado.slug)),
    ]);
    const sesiones = (archivo && Array.isArray(archivo.sesiones)) ? archivo.sesiones.slice() : [];
    sesiones.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.numero || 0) - (b.numero || 0));
    estado.sesiones = sesiones;
    estado.proxima = proxima;
  }

  /** Añade un registro al archivo de sesiones, releyéndolo antes para no pisar
      lo que el coach haya escrito mientras tanto. */
  async function anexar(slug, registro) {
    const ruta = rutaSesiones(slug);
    const archivo = (await Almacen.leer(ruta)) || {};
    if (!Array.isArray(archivo.sesiones)) archivo.sesiones = [];
    if (!archivo.sesiones.some((s) => s.id && s.id === registro.id)) archivo.sesiones.push(registro);
    await Almacen.escribir(ruta, archivo);
  }

  /** Sesiones que no se pudieron guardar (por ejemplo, servidor cerrado). */
  async function enviarPendientes() {
    const pendientes = Memoria.leer('pendientes', []);
    if (!pendientes.length) return 0;
    const siguen = [];
    for (const item of pendientes) {
      try { await anexar(item.slug, item.registro); } catch { siguen.push(item); }
    }
    Memoria.guardar('pendientes', siguen);
    return siguen.length;
  }

  // ───────────────────────── Cronómetro ─────────────────────────
  function msFase(sesion, fase) {
    let ms = sesion.acum[fase] || 0;
    if (sesion.fase === fase && sesion.faseDesde && !sesion.pausaDesde) ms += Date.now() - sesion.faseDesde;
    return ms;
  }
  function cambiarFase(nueva) {
    const s = estado.enCurso;
    const t = Date.now();
    if (s.pausaDesde) { s.msPausas += t - s.pausaDesde; s.pausaDesde = null; }
    else if (s.faseDesde && s.fase in s.acum) s.acum[s.fase] += t - s.faseDesde;
    s.fase = nueva;
    s.faseDesde = t;
    guardarEnCurso();
  }
  function alternarPausa() {
    const s = estado.enCurso;
    const t = Date.now();
    if (s.pausaDesde) {
      s.msPausas += t - s.pausaDesde; s.pausaDesde = null; s.faseDesde = t;
    } else {
      s.acum[s.fase] += t - s.faseDesde; s.pausaDesde = t; s.pausas += 1;
    }
    guardarEnCurso();
  }
  const objetivoFase = (s, fase) => (s.minutos[fase] || 0) * 60000;

  /** Se ejecuta dos veces por segundo: mueve el reloj y lanza los avisos. */
  function latido() {
    const s = estado.enCurso;
    if (!s) { document.title = 'Aprendizaje'; return; }
    if (s.fase === 'nucleo' && !s.pausaDesde) {
      const ms = msFase(s, 'nucleo');
      const objetivo = objetivoFase(s, 'nucleo');
      let cambio = false;
      if (!s.avisoFin && ms >= objetivo) {
        s.avisoFin = true; s.controlPendiente = false; pitido(2); cambio = true;
      } else if (!s.avisoFin && s.controlMitad === null && !s.controlPendiente && ms >= objetivo / 2) {
        s.controlPendiente = true; pitido(1); cambio = true;
      }
      if (cambio) { guardarEnCurso(); pintar(); }
    }
    if (!(s.fase in s.acum)) return;
    const ms = msFase(s, s.fase);
    const objetivo = objetivoFase(s, s.fase);
    document.title = (s.pausaDesde ? 'En pausa' : reloj(ms)) + ' · ' + FASES.find((f) => f[0] === s.fase)[1];
    const cifra = $('#reloj');
    if (!cifra) return;
    cifra.textContent = reloj(ms);
    const pasado = objetivo > 0 && ms >= objetivo;
    cifra.classList.toggle('pasado', pasado && s.fase === 'nucleo');
    const barra = $('#barra-relleno');
    if (barra) {
      barra.style.width = Math.min(100, objetivo ? (ms / objetivo) * 100 : 0) + '%';
      barra.classList.toggle('pasado', pasado && s.fase === 'nucleo');
    }
  }

  // ───────────────────────── Pantalla «Hoy» ─────────────────────────
  function etiqueta(clase, simbolo, texto) {
    return `<span class="etiqueta ${clase}"><span aria-hidden="true">${simbolo}</span> ${esc(texto)}</span>`;
  }

  function bloqueEscalones(plan, destacarMinimo) {
    if (!plan || !plan.escalones) return '';
    const e = plan.escalones;
    const fila = (clave, nombre, texto) => (texto
      ? `<li class="${clave === 'minimo' && destacarMinimo ? 'destacado' : ''}"><span class="escalon-nombre">${nombre}</span><span>${esc(texto)}</span></li>`
      : '');
    return `<h3>Escalones</h3><ol class="escalones">${fila('minimo', 'Mínimo', e.minimo)}${fila('objetivo', 'Objetivo', e.objetivo)}${fila('extra', 'Extra', e.extra)}</ol>`;
  }

  function vistaPreparacion() {
    const p = proyecto();
    const plan = proximaPendiente();
    const ultima = estado.sesiones[estado.sesiones.length - 1];
    const pendientes = Memoria.leer('pendientes', []).length;
    const m = p.minutos;
    let html = '';
    if (pendientes) {
      html += `<div class="aviso aviso-atencion"><strong>${pendientes === 1 ? 'Hay 1 sesión' : 'Hay ' + pendientes + ' sesiones'} sin guardar en la carpeta.</strong> Está a salvo en este navegador. <button type="button" class="enlace" data-accion="reintentar">Reintentar ahora</button></div>`;
    }
    if (plan) {
      const nucleo = plan.min_nucleo || m.nucleo;
      html += `<section class="tarjeta">
        <p class="sobretitulo">Sesión #${esc(plan.numero)} · ${esc(nombreTipo(plan.tipo))}</p>
        <h2>${esc(plan.titulo || 'Próxima sesión')}</h2>
        <p class="tiempos">Calentamiento ${m.calentamiento} min · Núcleo ${nucleo} min · Cierre ${m.cierre} min · máximo ${m.maximo} min</p>
        ${plan.calentamiento ? `<h3>Calentamiento</h3><p>${esc(plan.calentamiento)}</p>` : ''}
        ${plan.primera_tarea ? `<h3>Primera tarea</h3><p>${esc(plan.primera_tarea)}</p>` : ''}
        ${bloqueEscalones(plan, false)}
        <div class="acciones"><button type="button" class="boton principal" data-accion="empezar">Empezar sesión</button></div>
      </section>`;
    } else {
      const hecha = estado.proxima && esNumero(estado.proxima.numero);
      html += `<section class="tarjeta">
        <p class="sobretitulo">Sin sesión preparada</p>
        <h2>${hecha ? 'La sesión #' + esc(estado.proxima.numero) + ' ya está registrada' : 'El coach todavía no ha dejado la próxima sesión'}</h2>
        <p>Al cerrar cada sesión, el coach deja escrita la siguiente con sus tres escalones. Mientras tanto puedes hacer una sesión libre: se cronometra y se registra igual.</p>
        <label class="campo">Forma de la tarea
          <select id="tipo-libre">${Object.entries(TIPOS).map(([clave, nombre]) => `<option value="${clave}">${esc(nombre)}</option>`).join('')}</select>
        </label>
        <div class="acciones"><button type="button" class="boton principal" data-accion="empezar-libre">Empezar sesión libre</button></div>
      </section>`;
    }
    if (ultima) {
      html += `<p class="nota">Última sesión registrada: #${esc(ultima.numero)}, ${haceCuanto(ultima.fecha)}${esNumero(ultima.min_reales) ? ' · ' + ultima.min_reales + ' min' : ''}.</p>`;
    }
    return html;
  }

  function pasos(fase) {
    const actual = FASES.findIndex((f) => f[0] === fase);
    return `<ol class="pasos">${FASES.map(([, nombre], i) => `<li class="${i === actual ? 'actual' : i < actual ? 'hecho' : ''}"${i === actual ? ' aria-current="step"' : ''}>${nombre}</li>`).join('')}</ol>`;
  }
  function cabeceraSesion(s) {
    return `<p class="sobretitulo">Sesión #${esc(s.numero)} · ${esc(nombreTipo(s.tipo))}</p>${pasos(s.fase)}`;
  }
  function bloqueReloj(s) {
    const objetivo = s.minutos[s.fase];
    return `<div class="reloj-caja">
      <div class="reloj-fila"><span id="reloj" class="reloj">${reloj(msFase(s, s.fase))}</span><span class="reloj-meta">${s.pausaDesde ? 'en pausa' : 'de ' + objetivo + ' min'}</span></div>
      <div class="barra"><div id="barra-relleno" class="barra-relleno"></div></div>
    </div>`;
  }
  const botonPausa = (s) => `<button type="button" class="boton" data-accion="pausa">${s.pausaDesde ? 'Reanudar' : 'Pausa'}</button>`;
  const pieSesion = () => '<p class="pie-sesion"><button type="button" class="enlace" data-accion="descartar">Descartar esta sesión</button></p>';

  function vistaTarjetas(s) {
    return `<section class="tarjeta">${cabeceraSesion(s)}
      <form id="form-tarjetas" novalidate>
        <fieldset class="opciones"><legend>¿Has repasado hoy tus tarjetas?</legend>
          <label><input type="radio" name="t_hecho" value="si"> Sí</label>
          <label><input type="radio" name="t_hecho" value="no"> No</label>
        </fieldset>
        <div class="dos-columnas">
          <label class="campo">Tarjetas repasadas <input type="number" name="t_repasadas" min="0" inputmode="numeric"></label>
          <label class="campo">Marcadas «Otra vez» <input type="number" name="t_otra_vez" min="0" inputmode="numeric"></label>
        </div>
        <p class="ayuda">El repaso se hace fuera de la sesión. Si no sabes las cifras, déjalas en blanco.</p>
        <p class="error" role="alert">${esc(estado.mensajeFormulario)}</p>
        <div class="acciones"><button type="submit" class="boton principal">Empezar el calentamiento</button></div>
      </form>${pieSesion()}
    </section>`;
  }

  function vistaCalentamiento(s) {
    const texto = (s.plan && s.plan.calentamiento) || 'Sin mirar nada, recuerda 3 o 4 cosas de las sesiones anteriores.';
    return `<section class="tarjeta">${cabeceraSesion(s)}${bloqueReloj(s)}
      <h3>Calentamiento, a libro cerrado</h3><p>${esc(texto)}</p>
      <div class="acciones"><button type="button" class="boton principal" data-accion="a-nucleo">Pasar al núcleo</button>${botonPausa(s)}</div>
      ${pieSesion()}
    </section>`;
  }

  function vistaNucleo(s) {
    const plan = s.plan;
    let avisos = '';
    if (s.avisoFin) {
      avisos += `<div class="aviso aviso-corte" role="alert"><strong>Se acabó el tiempo del núcleo.</strong> Cierra con lo conseguido. Lo que falte será la primera tarea de la próxima sesión.</div>`;
    } else if (s.controlPendiente && s.controlMitad === null) {
      avisos += `<div class="aviso aviso-pregunta" role="alert"><strong>Control de mitad.</strong> ¿Vas por la mitad del objetivo?${plan && plan.mitad ? ` <span class="referencia">Referencia: ${esc(plan.mitad)}.</span>` : ''}
        <div class="acciones"><button type="button" class="boton" data-accion="mitad" data-valor="si">Sí, voy bien</button><button type="button" class="boton" data-accion="mitad" data-valor="no">No</button></div></div>`;
    }
    if (s.controlMitad === 'no' && !s.avisoFin) {
      avisos += `<div class="aviso aviso-atencion"><strong>Baja al escalón mínimo.</strong> Termina solo eso; el resto pasa a la próxima sesión.</div>`;
    }
    return `<section class="tarjeta">${cabeceraSesion(s)}${bloqueReloj(s)}${avisos}
      ${plan && plan.primera_tarea ? `<h3>Tarea</h3><p>${esc(plan.primera_tarea)}</p>` : '<h3>Tarea</h3><p>Una sola cosa. Si terminas antes, se cierra antes.</p>'}
      ${bloqueEscalones(plan, s.controlMitad === 'no')}
      <div class="acciones"><button type="button" class="boton principal" data-accion="a-cierre">Pasar al cierre</button>${botonPausa(s)}</div>
      ${pieSesion()}
    </section>`;
  }

  function grupoEscala(nombre, leyenda, minimo, maximo) {
    let botones = '';
    for (let n = 1; n <= 5; n++) botones += `<label><input type="radio" name="${nombre}" value="${n}"><span>${n}</span></label>`;
    return `<fieldset class="escala"><legend>${leyenda}</legend><div class="escala-fila">${botones}</div><div class="escala-extremos"><span>${minimo}</span><span>${maximo}</span></div></fieldset>`;
  }

  function vistaCierre(s) {
    const trabajado = aMinutos(msFase(s, 'calentamiento') + msFase(s, 'nucleo') + msFase(s, 'cierre'));
    return `<section class="tarjeta">${cabeceraSesion(s)}
      <form id="form-cierre" novalidate>
        <label class="campo campo-grande">Sin mirar, ¿con qué te quedas de la sesión?
          <textarea name="recuerdo" rows="4" required></textarea>
          <span class="ayuda">Con tus palabras y sin releer nada. No hace falta que quede bonito.</span>
        </label>
        <fieldset class="opciones"><legend>¿Hasta qué escalón llegaste?</legend>
          ${Object.entries(ESCALONES).map(([clave, nombre]) => `<label><input type="radio" name="escalon" value="${clave}"> ${esc(nombre)}</label>`).join('')}
        </fieldset>
        ${grupoEscala('dificultad', '¿Cómo de difícil fue?', 'muy fácil', 'muy difícil')}
        ${grupoEscala('concentracion', '¿Cómo estuvo tu concentración?', 'muy baja', 'muy alta')}
        <label class="campo campo-corto">Interrupciones <input type="number" name="interrupciones" min="0" inputmode="numeric" value="${s.pausas}"></label>
        <details><summary>Aciertos y ayuda (si no lo sabes, lo completa el coach)</summary>
          <div class="dos-columnas">
            <label class="campo">Aciertos sin pista <input type="number" name="aciertos" min="0" step="0.5" inputmode="decimal"></label>
            <label class="campo">Intentos <input type="number" name="intentos" min="0" step="0.5" inputmode="decimal"></label>
          </div>
          <label class="campo">Ayuda recibida
            <select name="ayuda"><option value="">No lo sé</option>${AYUDAS.map((nombre, i) => `<option value="${i}">${i} · ${esc(nombre)}</option>`).join('')}</select>
          </label>
        </details>
        <details><summary>Corregir los minutos (medidos hasta ahora: ${trabajado} min, sin pausas)</summary>
          <label class="campo campo-corto">Minutos reales de trabajo <input type="number" name="min_reales" min="1" inputmode="numeric" placeholder="${trabajado}"></label>
        </details>
        <p class="error" role="alert">${esc(estado.mensajeFormulario)}</p>
        <div class="acciones"><button type="submit" class="boton principal">Guardar sesión</button></div>
      </form>${pieSesion()}
    </section>`;
  }

  function textoParaCoach(g) {
    const r = g.registro;
    const lineas = [
      `Sesión #${r.numero} · ${g.proyecto} · ${r.fecha}`,
      `Forma: ${nombreTipo(r.tipo)} · Escalón: ${ESCALONES[r.escalon] || 'sin dato'}`,
      `Duración: ${r.min_reales} min (núcleo ${r.min_nucleo}, máximo previsto ${g.maximo}) · Pausas: ${r.interrupciones} (${r.min_pausas} min)`,
      `Control de mitad: ${r.control_mitad === 'si' ? 'iba por la mitad' : r.control_mitad === 'no' ? 'no iba por la mitad' : 'no llegó a hacerse'}`,
      `Tarjetas: ${r.tarjetas.hecho === false ? 'no repasó' : r.tarjetas.hecho === true ? (esNumero(r.tarjetas.repasadas) ? r.tarjetas.repasadas + ' repasadas, ' + (esNumero(r.tarjetas.otra_vez) ? r.tarjetas.otra_vez : '?') + ' «Otra vez»' : 'repasó, sin cifras') : 'sin dato'}`,
      `Dificultad sentida: ${r.dificultad}/5 · Concentración: ${r.concentracion}/5`,
    ];
    if (tieneAcierto(r)) lineas.push(`Aciertos: ${r.aciertos} de ${r.intentos}${esNumero(r.ayuda) ? ' · Ayuda: ' + r.ayuda : ''}`);
    lineas.push(`Recuerdo libre: «${r.recuerdo}»`);
    return lineas.join('\n');
  }

  function vistaResumen(g) {
    const r = g.registro;
    const exceso = r.min_reales - g.maximo;
    return `<section class="tarjeta">
      <p class="sobretitulo">Sesión #${esc(r.numero)} · ${esc(nombreTipo(r.tipo))}</p>
      <h2>${g.pendiente ? 'Sesión terminada, pero sin guardar en la carpeta' : 'Sesión guardada'}</h2>
      ${g.pendiente ? '<div class="aviso aviso-atencion">No se pudo escribir en la carpeta de aprendizaje. La sesión está a salvo en este navegador y se guardará sola la próxima vez que abras la aplicación.</div>' : ''}
      <p>${exceso > 0 ? etiqueta('et-atencion', '▲', 'Se pasó ' + exceso + ' min del máximo') : etiqueta('et-bien', '✓', 'Dentro del tiempo')} <span class="junto">${r.min_reales} min de trabajo · máximo ${g.maximo}</span></p>
      <h3>Para el coach</h3>
      <p class="ayuda">El coach ya puede leer esta sesión en la carpeta. Si prefieres pegársela en el chat, copia este texto.</p>
      <pre id="texto-coach" class="bloque">${esc(textoParaCoach(g))}</pre>
      <div class="acciones"><button type="button" class="boton principal" data-accion="listo">Listo</button><button type="button" class="boton" data-accion="copiar">Copiar para el coach</button></div>
    </section>`;
  }

  function vistaHoy() {
    const s = estado.enCurso;
    if (s) {
      if (s.fase === 'tarjetas') return vistaTarjetas(s);
      if (s.fase === 'calentamiento') return vistaCalentamiento(s);
      if (s.fase === 'nucleo') return vistaNucleo(s);
      return vistaCierre(s);
    }
    if (estado.guardada) return vistaResumen(estado.guardada);
    return vistaPreparacion();
  }

  // ───────────────────────── Pantalla «Progreso» ─────────────────────────
  function calibracion() {
    const maximo = proyecto().minutos.maximo;
    return TIPOS_CALIBRADOS.map((tipo) => {
      const sesiones = estado.sesiones.filter((s) => s.tipo === tipo && !s.sin_calibrar);
      const conAcierto = sesiones.filter(tieneAcierto);
      const conMinutos = sesiones.filter((s) => esNumero(s.min_reales));
      const conDificultad = sesiones.filter((s) => esNumero(s.dificultad));
      const fila = {
        tipo,
        n: sesiones.length,
        acierto: conAcierto.length ? media(conAcierto.map(porcentaje)) : null,
        minutos: conMinutos.length ? media(conMinutos.map((s) => s.min_reales)) : null,
        pasadas: conMinutos.filter((s) => s.min_reales > maximo).length,
        conMinutos: conMinutos.length,
        dificultad: conDificultad.length ? media(conDificultad.map((s) => s.dificultad)) : null,
      };
      // El tiempo manda: una forma que se pasa de tiempo está mal medida aunque acierte.
      if (fila.conMinutos && fila.pasadas * 2 >= fila.conMinutos) {
        fila.lectura = ['et-atencion', '▲', 'Se alarga', 'La próxima de esta forma, a la mitad de tamaño o con más apoyo.'];
      } else if (fila.acierto === null) {
        fila.lectura = ['et-neutra', '·', 'Faltan datos', 'Todavía no hay aciertos registrados.'];
      } else if (fila.acierto > BANDA.alta) {
        fila.lectura = ['et-neutra', '▼', 'Sale fácil', 'Subir el nivel o dar menos apoyo.'];
      } else if (fila.acierto < BANDA.baja) {
        fila.lectura = ['et-atencion', '▲', 'Sale difícil', 'Simplificar o dar más apoyo.'];
      } else {
        fila.lectura = ['et-bien', '✓', 'En su punto', 'Mantener este tamaño.'];
      }
      return fila;
    }).filter((fila) => fila.n > 0);
  }

  function vistaProgreso() {
    const p = proyecto();
    const sesiones = estado.sesiones;
    if (!sesiones.length) return '<section class="tarjeta"><h2>Todavía no hay sesiones registradas</h2><p>Cuando cierres la primera sesión, aquí verás cómo van el tiempo y la dificultad.</p></section>';
    const lunes = lunesDeEstaSemana();
    const estaSemana = sesiones.filter((s) => s.fecha && aFecha(s.fecha) >= lunes).length;
    const ultima = sesiones[sesiones.length - 1];
    const conMinutos = sesiones.filter((s) => esNumero(s.min_reales) && !s.sin_calibrar).slice(-5);
    const pasadas = conMinutos.filter((s) => s.min_reales > p.minutos.maximo).length;
    const filas = calibracion();

    const cifra = (valor, decimales = 0) => (valor === null ? '—' : valor.toFixed(decimales).replace('.', ','));
    return `
      <section class="fichas">
        <div class="ficha"><span class="ficha-rotulo">Sesiones esta semana</span><span class="ficha-valor">${estaSemana}<small> de ${p.sesiones_semana || 5}</small></span></div>
        <div class="ficha"><span class="ficha-rotulo">Última sesión</span><span class="ficha-valor ficha-texto">${haceCuanto(ultima.fecha)}</span></div>
        <div class="ficha"><span class="ficha-rotulo">Se pasaron del máximo</span><span class="ficha-valor">${pasadas}<small> de las últimas ${conMinutos.length}</small></span></div>
      </section>

      <section class="tarjeta">
        <h2>¿Están bien medidas las sesiones?</h2>
        <p class="ayuda">Por forma de tarea. Banda justa de acierto: ${BANDA.baja}–${BANDA.alta} %. Máximo por sesión: ${p.minutos.maximo} min.</p>
        <div class="tabla-caja"><table class="tabla-medida">
          <thead><tr><th>Forma de la tarea</th><th class="num">Sesiones</th><th class="num">Acierto</th><th class="num">Minutos</th><th class="num">Dificultad</th><th>Lectura</th></tr></thead>
          <tbody>${filas.map((f) => `<tr>
            <th scope="row">${esc(nombreTipo(f.tipo))}</th>
            <td class="num" data-rotulo="Sesiones">${f.n}</td>
            <td class="num" data-rotulo="Acierto medio">${f.acierto === null ? '—' : cifra(f.acierto) + ' %'}</td>
            <td class="num" data-rotulo="Minutos de media"><span>${f.minutos === null ? '—' : cifra(f.minutos)}${f.pasadas ? `<small> · ${f.pasadas} de ${f.conMinutos} se pasaron</small>` : ''}</span></td>
            <td class="num" data-rotulo="Dificultad sentida">${f.dificultad === null ? '—' : cifra(f.dificultad, 1) + ' / 5'}</td>
            <td class="celda-lectura">${etiqueta(f.lectura[0], f.lectura[1], f.lectura[2])}<span class="lectura">${esc(f.lectura[3])}</span></td>
          </tr>`).join('') || '<tr><td colspan="6">Todavía no hay sesiones de práctica clasificadas.</td></tr>'}</tbody>
        </table></div>
      </section>

      <section class="tarjeta">
        <h2>Minutos reales por sesión</h2>
        <p class="ayuda">Franja sombreada: duración prevista, ${p.minutos.minimo}–${p.minutos.maximo} min.</p>
        <div id="grafico-minutos" class="grafico"></div>
      </section>

      <section class="tarjeta">
        <h2>Acierto por sesión</h2>
        <p class="ayuda">Franja sombreada: banda justa, ${BANDA.baja}–${BANDA.alta} %. Por encima sale fácil; por debajo, difícil.</p>
        <div id="grafico-acierto" class="grafico"></div>
      </section>

      <section class="tarjeta">
        <h2>Todas las sesiones</h2>
        <div class="tabla-caja"><table class="tabla-sesiones">
          <thead><tr><th class="num">N.º</th><th>Fecha</th><th>Forma</th><th class="num">Min</th><th class="num">Acierto</th><th class="num">Ayuda</th><th class="num">Dificultad</th><th class="num">Concentración</th><th>Escalón</th></tr></thead>
          <tbody>${sesiones.slice().reverse().map((s) => `<tr>
            <td class="num">${esc(s.numero)}</td>
            <td>${esc(Graficos.fechaCorta(s.fecha))}</td>
            <td>${esc(nombreTipo(s.tipo))}${s.sin_calibrar ? ' <small>(no cuenta para medir)</small>' : ''}</td>
            <td class="num">${esNumero(s.min_reales) ? s.min_reales : '—'}</td>
            <td class="num">${tieneAcierto(s) ? Math.round(porcentaje(s)) + ' %' : '—'}</td>
            <td class="num">${esNumero(s.ayuda) ? s.ayuda : '—'}</td>
            <td class="num">${esNumero(s.dificultad) ? s.dificultad : '—'}</td>
            <td class="num">${esNumero(s.concentracion) ? String(s.concentracion).replace('.', ',') : '—'}</td>
            <td>${s.escalon ? esc(ESCALONES[s.escalon] || s.escalon) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>`;
  }

  function dibujarGraficos() {
    const minutos = $('#grafico-minutos');
    const acierto = $('#grafico-acierto');
    if (minutos) Graficos.minutos(minutos, estado.sesiones, proyecto().minutos, nombreTipo);
    if (acierto) Graficos.acierto(acierto, estado.sesiones, nombreTipo);
  }

  // ───────────────────────── Pintar ─────────────────────────
  function pintarCabecera() {
    document.querySelectorAll('.pestanas button').forEach((boton) => {
      const activa = boton.dataset.vista === estado.vista;
      boton.classList.toggle('activa', activa);
      if (activa) boton.setAttribute('aria-current', 'page'); else boton.removeAttribute('aria-current');
    });
    const bloqueado = Boolean(estado.enCurso);
    $('#proyectos').innerHTML = estado.proyectos.map((p) => {
      const activo = p.slug === estado.slug;
      return `<button type="button" class="ficha-proyecto${activo ? ' activa' : ''}" data-accion="proyecto" data-slug="${esc(p.slug)}" aria-pressed="${activo}"${bloqueado && !activo ? ' disabled title="Termina o descarta la sesión en curso para cambiar de proyecto"' : ''}>${esc(p.nombre)}</button>`;
    }).join('');
  }

  function restaurarBorrador() {
    const s = estado.enCurso;
    const formulario = $('#vista form');
    if (!s || !formulario || !s.borrador) return;
    for (const [nombre, valor] of Object.entries(s.borrador)) {
      const campos = formulario.querySelectorAll('[name="' + nombre + '"]');
      campos.forEach((campo) => {
        if (campo.type === 'radio') campo.checked = campo.value === valor;
        else campo.value = valor;
      });
    }
  }

  function pintar() {
    pintarCabecera();
    const vista = $('#vista');
    if (estado.error) {
      vista.innerHTML = `<section class="tarjeta"><h2>No puedo leer los datos</h2><p>${esc(estado.error)}</p><p>Abre la aplicación con el archivo <strong>Abrir aplicacion.bat</strong> y deja su ventana abierta.</p><div class="acciones"><button type="button" class="boton" data-accion="recargar">Volver a intentar</button></div></section>`;
    } else if (estado.cargando) {
      vista.innerHTML = '<p class="nota">Cargando…</p>';
    } else if (estado.vista === 'progreso') {
      vista.innerHTML = vistaProgreso();
      dibujarGraficos();
    } else {
      vista.innerHTML = vistaHoy();
      restaurarBorrador();
    }
    latido();
  }

  // ───────────────────────── Acciones ─────────────────────────
  function empezar(libre) {
    const p = proyecto();
    const plan = libre ? null : proximaPendiente();
    const tipoLibre = $('#tipo-libre');
    const numero = plan ? plan.numero : Math.max(0, ...estado.sesiones.map((s) => s.numero || 0)) + 1;
    estado.guardada = null;
    estado.mensajeFormulario = '';
    estado.enCurso = {
      id: 'app-' + Date.now(),
      slug: p.slug,
      numero,
      tipo: plan ? plan.tipo : (tipoLibre ? tipoLibre.value : 'predecir'),
      plan,
      minutos: { ...p.minutos, nucleo: (plan && plan.min_nucleo) || p.minutos.nucleo },
      fase: 'tarjetas',
      acum: { calentamiento: 0, nucleo: 0, cierre: 0 },
      faseDesde: null, pausaDesde: null, pausas: 0, msPausas: 0,
      controlMitad: null, controlPendiente: false, avisoFin: false,
      tarjetas: { hecho: null, repasadas: null, otra_vez: null },
      borrador: {},
    };
    guardarEnCurso();
    pitido(0); // prepara el sonido mientras hay un clic del usuario
    pintar();
  }

  const numeroOpcional = (texto) => {
    if (texto === null || String(texto).trim() === '') return null;
    const n = Number(String(texto).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  function enviarTarjetas(formulario) {
    const datos = new FormData(formulario);
    const hecho = datos.get('t_hecho');
    if (!hecho) { estado.mensajeFormulario = 'Marca sí o no para continuar.'; pintar(); return; }
    const s = estado.enCurso;
    s.tarjetas = {
      hecho: hecho === 'si',
      repasadas: hecho === 'si' ? numeroOpcional(datos.get('t_repasadas')) : null,
      otra_vez: hecho === 'si' ? numeroOpcional(datos.get('t_otra_vez')) : null,
    };
    s.borrador = {};
    estado.mensajeFormulario = '';
    cambiarFase('calentamiento');
    pintar();
  }

  async function enviarCierre(formulario) {
    const datos = new FormData(formulario);
    const s = estado.enCurso;
    const recuerdo = String(datos.get('recuerdo') || '').trim();
    const falta = [];
    if (!recuerdo) falta.push('la frase de recuerdo');
    if (!datos.get('escalon')) falta.push('el escalón');
    if (!datos.get('dificultad')) falta.push('la dificultad');
    if (!datos.get('concentracion')) falta.push('la concentración');
    if (falta.length) { estado.mensajeFormulario = 'Falta: ' + falta.join(', ') + '.'; pintar(); return; }

    cambiarFase('fin');
    const p = estado.proyectos.find((x) => x.slug === s.slug) || proyecto();
    const medido = Math.max(1, aMinutos(s.acum.calentamiento + s.acum.nucleo + s.acum.cierre));
    const corregido = numeroOpcional(datos.get('min_reales'));
    const aciertos = numeroOpcional(datos.get('aciertos'));
    const intentos = numeroOpcional(datos.get('intentos'));
    const registro = {
      id: s.id,
      numero: s.numero,
      fecha: fechaISO(),
      origen: 'app',
      tipo: s.tipo,
      escalon: datos.get('escalon'),
      min_reales: corregido && corregido >= 1 ? Math.round(corregido) : medido,
      min_nucleo: aMinutos(s.acum.nucleo),
      min_pausas: aMinutos(s.msPausas),
      interrupciones: numeroOpcional(datos.get('interrupciones')) ?? s.pausas,
      control_mitad: s.controlMitad,
      aciertos: aciertos !== null && intentos ? aciertos : null,
      intentos: aciertos !== null && intentos ? intentos : null,
      ayuda: numeroOpcional(datos.get('ayuda')),
      dificultad: Number(datos.get('dificultad')),
      concentracion: Number(datos.get('concentracion')),
      tarjetas: s.tarjetas,
      recuerdo,
      nota: '',
    };
    let pendiente = false;
    try {
      await anexar(s.slug, registro);
    } catch {
      pendiente = true;
      const cola = Memoria.leer('pendientes', []);
      cola.push({ slug: s.slug, registro });
      Memoria.guardar('pendientes', cola);
    }
    estado.guardada = { registro, pendiente, proyecto: p.nombre, maximo: p.minutos.maximo };
    estado.enCurso = null;
    estado.mensajeFormulario = '';
    guardarEnCurso();
    try { await cargarProyecto(); } catch { /* se verá al recargar */ }
    pintar();
    window.scrollTo(0, 0);
  }

  async function elegirProyecto(slug) {
    if (estado.enCurso || slug === estado.slug) return;
    estado.slug = slug;
    estado.guardada = null;
    Memoria.guardar('slug', slug);
    try { await cargarProyecto(); estado.error = null; } catch (e) { estado.error = e.message; }
    pintar();
  }

  async function iniciar() {
    estado.cargando = true; estado.error = null;
    try {
      if (location.protocol === 'file:') throw new Error('La aplicación se ha abierto como un archivo suelto.');
      const lista = await Almacen.leer('02-proyectos/proyectos.json');
      estado.proyectos = ((lista && lista.proyectos) || []).filter((p) => p.estado !== 'archivado' && p.minutos);
      if (!estado.proyectos.length) throw new Error('No hay proyectos en 02-proyectos/proyectos.json.');
      const recordado = estado.enCurso ? estado.enCurso.slug : Memoria.leer('slug', null);
      estado.slug = estado.proyectos.some((p) => p.slug === recordado) ? recordado : estado.proyectos[0].slug;
      if (estado.enCurso && estado.enCurso.slug !== estado.slug) { estado.enCurso = null; guardarEnCurso(); }
      await enviarPendientes();
      await cargarProyecto();
    } catch (e) {
      estado.error = e.message || 'Error desconocido';
    }
    estado.cargando = false;
    pintar();
  }

  document.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;
    const s = estado.enCurso;
    if (accion === 'vista') { estado.vista = boton.dataset.vista; pintar(); window.scrollTo(0, 0); }
    else if (accion === 'proyecto') elegirProyecto(boton.dataset.slug);
    else if (accion === 'empezar') empezar(false);
    else if (accion === 'empezar-libre') empezar(true);
    else if (accion === 'a-nucleo' && s) { cambiarFase('nucleo'); pintar(); }
    else if (accion === 'a-cierre' && s) { cambiarFase('cierre'); s.borrador = {}; guardarEnCurso(); pintar(); window.scrollTo(0, 0); }
    else if (accion === 'pausa' && s) { alternarPausa(); pintar(); }
    else if (accion === 'mitad' && s) { s.controlMitad = boton.dataset.valor; s.controlPendiente = false; guardarEnCurso(); pintar(); }
    else if (accion === 'descartar' && s) {
      if (window.confirm('¿Descartar esta sesión? No se guardará nada de ella.')) { estado.enCurso = null; estado.mensajeFormulario = ''; guardarEnCurso(); pintar(); }
    }
    else if (accion === 'listo') { estado.guardada = null; pintar(); }
    else if (accion === 'copiar') {
      const texto = $('#texto-coach').textContent;
      try { await navigator.clipboard.writeText(texto); globo('Copiado'); }
      catch { globo('No se pudo copiar: selecciona el texto a mano'); }
    }
    else if (accion === 'reintentar') {
      const quedan = await enviarPendientes().catch(() => 1);
      if (!quedan) { await cargarProyecto().catch(() => {}); globo('Guardado en la carpeta'); } else globo('Sigue sin poder guardarse');
      pintar();
    }
    else if (accion === 'recargar') iniciar();
  });

  document.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (evento.target.id === 'form-tarjetas') enviarTarjetas(evento.target);
    else if (evento.target.id === 'form-cierre') enviarCierre(evento.target);
  });

  // Lo escrito en un formulario se guarda al momento, por si se recarga la página.
  document.addEventListener('input', (evento) => {
    const formulario = evento.target.closest('#vista form');
    if (!formulario || !estado.enCurso) return;
    estado.enCurso.borrador = Object.fromEntries(new FormData(formulario).entries());
    guardarEnCurso();
  });

  let esperaRedibujo;
  window.addEventListener('resize', () => {
    clearTimeout(esperaRedibujo);
    esperaRedibujo = setTimeout(dibujarGraficos, 150);
  });

  setInterval(latido, 500);
  iniciar();
})();
