'use strict';
/* Aplicación de aprendizaje · versión 0.2
   Pantallas: «Hoy» (guía y cronometra la sesión), «Tarjetas» (repaso espaciado),
   «Progreso» (si las sesiones salen fáciles, justas o difíciles) y «Ajustes». */
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
    tarjetas: [],          // las tarjetas del proyecto, leídas de tarjetas.tsv
    repasos: null,         // el estado de repaso guardado (datos/repasos.json)
    repaso: Memoria.leer('repaso', null),   // la ronda de repaso en curso
    repasoHecho: null,
    repasoError: '',
    sinc: null,            // resultado de la última sincronización con GitHub
    carpeta: '',
    mensajeAjustes: '',
  };
  const proyecto = () => estado.proyectos.find((p) => p.slug === estado.slug);
  const rutaSesiones = (slug) => '02-proyectos/' + slug + '/datos/sesiones.json';
  const rutaProxima = (slug) => '02-proyectos/' + slug + '/datos/proxima.json';
  const rutaRepasos = (slug) => '02-proyectos/' + slug + '/datos/repasos.json';
  const rutaTarjetas = (slug) => '02-proyectos/' + slug + '/tarjetas.tsv';

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
    const [archivo, proxima, repasos, tsv] = await Promise.all([
      Almacen.leer(rutaSesiones(estado.slug)),
      Almacen.leer(rutaProxima(estado.slug)),
      Almacen.leer(rutaRepasos(estado.slug)),
      Almacen.leerTexto(rutaTarjetas(estado.slug)),
    ]);
    estado.repasos = repasos;
    estado.tarjetas = leerTSV(tsv);
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

  function vistaFaseTarjetas(s) {
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
        <p class="ayuda">${diaDeHoy() ? 'Relleno con tu repaso de hoy en la pestaña Tarjetas.' : 'El repaso se hace fuera de la sesión, en la pestaña Tarjetas. Si no sabes las cifras, déjalas en blanco.'}</p>
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
      if (s.fase === 'tarjetas') return vistaFaseTarjetas(s);
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


  // ───────────────────────── Sincronización ─────────────────────────
  async function sincronizar(silencioso) {
    try { estado.sinc = await Almacen.sincronizar(); }
    catch (e) { estado.sinc = { ok: false, estado: 'error', detalle: e.message }; }
    if (!estado.sinc.ok && !silencioso) globo('No se pudo sincronizar con GitHub');
    if (estado.vista === 'ajustes') pintar();
    return estado.sinc;
  }

  // ───────────────────────── Tarjetas ─────────────────────────
  const NUEVAS_AL_DIA = 5;

  /** Identificador estable de una tarjeta, calculado a partir de su pregunta. */
  function huella(texto) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  /** Lee tarjetas.tsv: pregunta, respuesta y etiquetas separadas por tabuladores. */
  function leerTSV(texto) {
    if (!texto) return [];
    const vistas = new Set();
    return texto.replace(/^\uFEFF/, '').split(/\r?\n/).map((linea) => linea.split('\t'))
      .filter((c) => c.length >= 2 && c[0].trim() && c[1].trim())
      .map((c) => ({ id: huella(c[0].trim()), frente: c[0].trim(), dorso: c[1].trim() }))
      .filter((tarjeta) => !vistas.has(tarjeta.id) && vistas.add(tarjeta.id));
  }
  function sumarDias(iso, dias) { const f = aFecha(iso); f.setDate(f.getDate() + dias); return fechaISO(f); }
  const guardadoTarjetas = () => (estado.repasos && estado.repasos.tarjetas) || {};
  function diaDeHoy() { return (estado.repasos && estado.repasos.dias && estado.repasos.dias[fechaISO()]) || null; }

  /** Qué toca hoy: las que vencen y, hasta el límite diario, las nuevas. */
  function colaDeHoy() {
    const hoy = fechaISO();
    const guardado = guardadoTarjetas();
    const vencidas = estado.tarjetas.filter((x) => guardado[x.id] && guardado[x.id].vence <= hoy)
      .sort((a, b) => guardado[a.id].vence.localeCompare(guardado[b.id].vence));
    const yaNuevas = (diaDeHoy() || {}).nuevas || 0;
    const limite = Math.max(0, (proyecto().tarjetas_nuevas_dia ?? NUEVAS_AL_DIA) - yaNuevas);
    const nuevas = estado.tarjetas.filter((x) => !guardado[x.id]).slice(0, limite);
    return { vencidas, nuevas };
  }
  function pendientesDeHoy() {
    if (!estado.repasos || !estado.tarjetas.length) return 0;
    const r = estado.repaso;
    if (r && r.slug === estado.slug && r.cola.length) return r.cola.length;
    const { vencidas, nuevas } = colaDeHoy();
    return vencidas.length + nuevas.length;
  }

  /** Repaso espaciado: cada acierto aleja la tarjeta; cada fallo la trae a mañana. */
  function calificar(previo, nota, hoy, vistaHoy, falladaHoy) {
    const e = previo ? { ...previo } : { intervalo: 0, facilidad: 2.5, repasos: 0, fallos: 0 };
    if (!vistaHoy) e.repasos += 1;
    if (nota === 'otra') {
      if (!falladaHoy) { e.fallos += 1; e.facilidad = Math.max(1.3, Number((e.facilidad - 0.2).toFixed(2))); }
      e.intervalo = 0;                       // sigue en la ronda de hoy
    } else if (falladaHoy || !previo || !previo.intervalo) {
      e.intervalo = (nota === 'facil' && !falladaHoy) ? 4 : 1;
    } else if (nota === 'bien') {
      e.intervalo = Math.max(e.intervalo + 1, Math.round(e.intervalo * e.facilidad));
    } else {
      e.intervalo = Math.max(e.intervalo + 2, Math.round(e.intervalo * e.facilidad * 1.3));
      e.facilidad = Number((e.facilidad + 0.15).toFixed(2));
    }
    e.vence = sumarDias(hoy, e.intervalo);
    e.ultimo = hoy;
    return e;
  }

  function guardarRonda() { if (estado.repaso) Memoria.guardar('repaso', estado.repaso); else Memoria.borrar('repaso'); }

  function empezarRepaso() {
    const { vencidas, nuevas } = colaDeHoy();
    const cola = [...vencidas, ...nuevas].map((x) => x.id);
    if (!cola.length) return;
    estado.repasoHecho = null; estado.repasoError = '';
    estado.repaso = { id: 'r-' + Date.now(), slug: estado.slug, fecha: fechaISO(), cola, mostrada: false,
      cambios: {}, vistas: [], falladas: [], frentesFallados: [], nuevas: [], porGuardar: false };
    guardarRonda(); pintar();
  }

  function responderTarjeta(nota) {
    const r = estado.repaso;
    if (!r || !r.cola.length || !r.mostrada) return;
    const id = r.cola.shift();
    const tarjeta = estado.tarjetas.find((x) => x.id === id);
    const guardado = guardadoTarjetas();
    const vista = r.vistas.includes(id);
    const fallada = r.falladas.includes(id);
    const nuevo = calificar(r.cambios[id] || guardado[id] || null, nota, r.fecha, vista, fallada);
    if (tarjeta) nuevo.frente = tarjeta.frente.slice(0, 90);
    r.cambios[id] = nuevo;
    if (!vista) { r.vistas.push(id); if (!guardado[id]) r.nuevas.push(id); }
    if (nota === 'otra') {
      if (!fallada) { r.falladas.push(id); if (tarjeta) r.frentesFallados.push(tarjeta.frente); }
      r.cola.push(id);
    }
    r.mostrada = false;
    guardarRonda();
    if (r.cola.length) pintar(); else guardarRepaso();
  }

  /** Escribe la ronda en datos/repasos.json, releyendo antes el archivo. */
  async function guardarRepaso() {
    const r = estado.repaso;
    if (!r) return;
    if (!r.vistas.length) { estado.repaso = null; guardarRonda(); pintar(); return; }
    r.porGuardar = true; guardarRonda();
    try {
      const ruta = rutaRepasos(r.slug);
      const archivo = (await Almacen.leer(ruta)) || {};
      archivo.aviso = archivo.aviso || 'Estado de repaso de las tarjetas. Lo escribe la aplicación. «tarjetas» guarda cuándo vuelve a tocar cada una; «dias» resume cada día de repaso y qué tarjetas se fallaron.';
      archivo.tarjetas = archivo.tarjetas || {};
      archivo.dias = archivo.dias || {};
      Object.assign(archivo.tarjetas, r.cambios);
      const dia = archivo.dias[r.fecha] || { repasadas: 0, otra_vez: 0, nuevas: 0, falladas: [], rondas: [] };
      dia.rondas = dia.rondas || [];
      if (!dia.rondas.includes(r.id)) {
        dia.rondas.push(r.id);
        dia.repasadas += r.vistas.length;
        dia.otra_vez += r.falladas.length;
        dia.nuevas += r.nuevas.length;
        dia.falladas = [...new Set([...(dia.falladas || []), ...r.frentesFallados])];
      }
      archivo.dias[r.fecha] = dia;
      await Almacen.escribir(ruta, archivo);
      estado.repasoHecho = { repasadas: r.vistas.length, otra_vez: r.falladas.length, falladas: r.frentesFallados.slice(), quedaban: r.cola.length };
      if (r.slug === estado.slug) estado.repasos = archivo;
      estado.repaso = null; estado.repasoError = '';
      guardarRonda();
      sincronizar();
    } catch (e) {
      estado.repasoError = 'No se pudo guardar el repaso: ' + e.message + ' Está a salvo en este dispositivo.';
    }
    pintar();
  }

  /** Primera vez: crea datos/repasos.json. */
  async function iniciarTarjetas(conocidas) {
    const hoy = fechaISO();
    const archivo = { aviso: 'Estado de repaso de las tarjetas. Lo escribe la aplicación. «tarjetas» guarda cuándo vuelve a tocar cada una; «dias» resume cada día de repaso y qué tarjetas se fallaron.', tarjetas: {}, dias: {} };
    if (conocidas) {
      const porDia = Math.max(10, Math.ceil(estado.tarjetas.length / 10));
      estado.tarjetas.forEach((x, i) => {
        archivo.tarjetas[x.id] = { intervalo: 3, facilidad: 2.5, repasos: 0, fallos: 0, vence: sumarDias(hoy, Math.floor(i / porDia)), ultimo: null, frente: x.frente.slice(0, 90) };
      });
    }
    try {
      await Almacen.escribir(rutaRepasos(estado.slug), archivo);
      estado.repasos = archivo; estado.repasoError = '';
      sincronizar();
    } catch (e) { estado.repasoError = 'No se pudo preparar el repaso: ' + e.message; }
    pintar();
  }

  function vistaRepaso(r) {
    const tarjeta = estado.tarjetas.find((x) => x.id === r.cola[0]);
    const total = new Set([...r.vistas, ...r.cola]).size;
    const hechas = total - new Set(r.cola).size;
    if (!tarjeta) return `<section class="tarjeta"><h2>Esta tarjeta ya no existe</h2><p>Puede que el coach la haya cambiado.</p><div class="acciones"><button type="button" class="boton" data-accion="repaso-saltar">Seguir</button></div></section>`;
    return `<section class="tarjeta naipe">
      <p class="sobretitulo">${total - hechas === 1 ? 'Queda 1' : 'Quedan ' + (total - hechas)} de ${total}${r.falladas.includes(tarjeta.id) ? ' · repetida porque la fallaste' : ''}</p>
      <div class="barra"><div class="barra-relleno" style="width:${(hechas / total) * 100}%"></div></div>
      <p class="naipe-frente">${esc(tarjeta.frente)}</p>
      ${r.mostrada
        ? `<div class="naipe-dorso">${esc(tarjeta.dorso)}</div>
           <div class="acciones notas"><button type="button" class="boton" data-accion="nota" data-valor="otra">Otra vez</button><button type="button" class="boton principal" data-accion="nota" data-valor="bien">Bien</button><button type="button" class="boton" data-accion="nota" data-valor="facil">Fácil</button></div>`
        : `<p class="ayuda">Responde de memoria, en voz alta o por escrito, antes de mirar.</p>
           <div class="acciones"><button type="button" class="boton principal" data-accion="mostrar">Mostrar respuesta</button></div>`}
      <p class="pie-sesion"><button type="button" class="enlace" data-accion="repaso-terminar">Terminar por hoy y guardar</button></p>
    </section>`;
  }

  function vistaTarjetas() {
    const error = estado.repasoError ? `<div class="aviso aviso-atencion">${esc(estado.repasoError)} <button type="button" class="enlace" data-accion="repaso-reintentar">Reintentar</button></div>` : '';
    if (!estado.tarjetas.length) return `<section class="tarjeta"><h2>Este proyecto todavía no tiene tarjetas</h2><p>El coach las escribe en el archivo tarjetas.tsv del proyecto, a partir de tus errores.</p></section>`;
    const r = estado.repaso;
    if (r && r.slug === estado.slug && r.cola.length && !r.porGuardar) return error + vistaRepaso(r);
    if (!estado.repasos) {
      const n = estado.tarjetas.length;
      const porDia = Math.max(10, Math.ceil(n / 10));
      return error + `<section class="tarjeta">
        <p class="sobretitulo">Primera vez</p>
        <h2>${n === 1 ? 'Hay 1 tarjeta' : 'Hay ' + n + ' tarjetas'} en este proyecto</h2>
        <p>El calendario de repaso empieza de cero. Elige cómo:</p>
        <ul class="lista">
          <li><strong>Ya las conozco</strong> (venían de Anki): ${n <= porDia ? 'tocan todas hoy' : 'se reparten en los próximos ' + Math.ceil(n / porDia) + ' días, ' + porDia + ' al día'}, y después cada una se aleja según aciertes.</li>
          <li><strong>Son nuevas para mí</strong>: entran ${NUEVAS_AL_DIA} al día.</li>
        </ul>
        <div class="acciones"><button type="button" class="boton principal" data-accion="tarjetas-iniciar" data-valor="conocidas">Ya las conozco</button><button type="button" class="boton" data-accion="tarjetas-iniciar" data-valor="nuevas">Son nuevas para mí</button></div>
      </section>`;
    }
    const { vencidas, nuevas } = colaDeHoy();
    const pendientes = vencidas.length + nuevas.length;
    const hoy = diaDeHoy();
    const manana = sumarDias(fechaISO(), 1);
    const guardado = guardadoTarjetas();
    const paraManana = estado.tarjetas.filter((x) => guardado[x.id] && guardado[x.id].vence === manana).length;
    let html = error;
    const hecho = estado.repasoHecho;
    if (hecho) {
      html += `<section class="tarjeta">
        <p class="sobretitulo">Repaso guardado</p>
        <h2>${hecho.repasadas} ${hecho.repasadas === 1 ? 'tarjeta repasada' : 'tarjetas repasadas'}, ${hecho.otra_vez} «Otra vez»</h2>
        ${hecho.falladas.length ? `<h3>Las que fallaste</h3><ul class="lista">${hecho.falladas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p class="ayuda">El coach las verá y las usará en el calentamiento.</p>` : '<p>Ninguna fallada.</p>'}
      </section>`;
    }
    html += `<section class="tarjeta">
      <p class="sobretitulo">${estado.tarjetas.length} tarjetas en el proyecto</p>
      <h2>${pendientes ? (pendientes === 1 ? 'Hoy toca 1 tarjeta' : 'Hoy tocan ' + pendientes + ' tarjetas') : 'Nada pendiente por hoy'}</h2>
      <p class="tiempos">${pendientes ? vencidas.length + ' de repaso' + (nuevas.length ? ' · ' + nuevas.length + ' nuevas' : '') + ' · ' : ''}${hoy ? 'hoy llevas ' + hoy.repasadas + ' repasadas (' + hoy.otra_vez + ' «Otra vez») · ' : ''}mañana: ${paraManana}</p>
      ${pendientes ? '<div class="acciones"><button type="button" class="boton principal" data-accion="repaso-empezar">Empezar repaso</button></div>' : ''}
    </section>`;
    return html;
  }

  // ───────────────────────── Pantalla «Ajustes» ─────────────────────────
  function vistaAjustes() {
    const mensaje = estado.mensajeAjustes ? `<p class="error" role="alert">${esc(estado.mensajeAjustes)}</p>` : '';
    if (Almacen.modo === 'local') {
      const s = estado.sinc;
      const linea = !s ? etiqueta('et-neutra', '·', 'Sin comprobar')
        : s.estado === 'sin-git' ? etiqueta('et-neutra', '·', 'Sin copia en GitHub')
        : s.ok ? etiqueta('et-bien', '✓', 'Al día con GitHub')
        : etiqueta('et-atencion', '▲', 'Sin sincronizar');
      return `<section class="tarjeta">
        <h2>Dónde están tus datos</h2>
        <p>En este ordenador, en la carpeta <strong>${esc(estado.carpeta || 'de aprendizaje')}</strong>.</p>
        <p>${linea} <span class="junto">${esc(s ? s.detalle || '' : '')}</span></p>
        <p class="ayuda">La aplicación guarda y sube a GitHub solo sus archivos de datos (sesiones y repasos). Lo demás lo sube el coach al cerrar cada sesión.</p>
        <div class="acciones"><button type="button" class="boton" data-accion="sincronizar">Sincronizar ahora</button></div>
      </section>
      <section class="tarjeta"><h2>Versión</h2><p>Aplicación de aprendizaje 0.2 · en este ordenador.</p></section>`;
    }
    const c = Almacen.configuracion();
    if (c && c.token) {
      return `<section class="tarjeta">
        <h2>Este dispositivo está conectado</h2>
        <p>${etiqueta('et-bien', '✓', 'Conectado')} <span class="junto">${esc(c.usuario)}/${esc(c.repositorio)}</span></p>
        <p class="ayuda">Lo que hagas aquí se guarda directamente en tu repositorio privado. La llave de acceso está guardada solo en este navegador.</p>
        ${mensaje}
        <div class="acciones"><button type="button" class="boton" data-accion="desconectar">Desconectar este dispositivo</button></div>
      </section>
      <section class="tarjeta"><h2>Versión</h2><p>Aplicación de aprendizaje 0.2 · conectada a GitHub.</p></section>`;
    }
    const d = Almacen.configuracionPorDefecto();
    return `<section class="tarjeta">
      <p class="sobretitulo">Primera vez en este dispositivo</p>
      <h2>Conecta la aplicación con tus datos</h2>
      <p>Tus datos están en tu repositorio privado de GitHub. Para leerlos y guardar desde aquí hace falta una <strong>llave de acceso</strong> (GitHub la llama <em>token</em>). Se guarda solo en este navegador.</p>
      <form id="form-conexion" novalidate>
        <div class="dos-columnas">
          <label class="campo">Usuario de GitHub <input name="usuario" value="${esc(d.usuario)}" autocapitalize="none" autocomplete="off" spellcheck="false"></label>
          <label class="campo">Repositorio <input name="repositorio" value="${esc(d.repositorio)}" autocapitalize="none" autocomplete="off" spellcheck="false"></label>
        </div>
        <label class="campo">Llave de acceso <input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
        ${mensaje}
        <div class="acciones"><button type="submit" class="boton principal">Conectar</button></div>
      </form>
      <details><summary>Cómo crear la llave</summary>
        <ol class="lista">
          <li>En un ordenador, entra en GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
          <li>En «Repository access» elige «Only select repositories» y marca solo tu repositorio de datos.</li>
          <li>En «Permissions» → «Repository permissions», pon «Contents» en «Read and write». Nada más.</li>
          <li>Genera la llave, cópiala y pégala aquí.</li>
        </ol>
      </details>
    </section>`;
  }

  async function conectar(formulario) {
    const datos = new FormData(formulario);
    const c = { usuario: String(datos.get('usuario') || '').trim(), repositorio: String(datos.get('repositorio') || '').trim(), rama: 'main', token: String(datos.get('token') || '').trim() };
    if (!c.usuario || !c.repositorio || !c.token) { estado.mensajeAjustes = 'Rellena los tres campos.'; pintar(); return; }
    estado.mensajeAjustes = 'Comprobando…'; pintar();
    const resultado = await Almacen.probar(c);
    if (!resultado.ok) { estado.mensajeAjustes = resultado.detalle; pintar(); return; }
    Almacen.guardarConfiguracion(c);
    estado.mensajeAjustes = '';
    estado.vista = 'hoy';
    await iniciar();
  }

  // ───────────────────────── Pintar ─────────────────────────
  function pintarCabecera() {
    document.querySelectorAll('.pestanas button').forEach((boton) => {
      const activa = boton.dataset.vista === estado.vista;
      boton.classList.toggle('activa', activa);
      if (activa) boton.setAttribute('aria-current', 'page'); else boton.removeAttribute('aria-current');
      if (boton.dataset.vista === 'tarjetas') {
        const n = estado.error || estado.cargando || !proyecto() ? 0 : pendientesDeHoy();
        boton.innerHTML = 'Tarjetas' + (n ? `<span class="cuenta" aria-label="${n} pendientes">${n}</span>` : '');
      }
    });
    const bloqueado = Boolean(estado.enCurso);
    $('#proyectos').innerHTML = estado.proyectos.map((p) => {
      const activo = p.slug === estado.slug;
      return `<button type="button" class="ficha-proyecto${activo ? ' activa' : ''}" data-accion="proyecto" data-slug="${esc(p.slug)}" aria-pressed="${activo}"${bloqueado && !activo ? ' disabled title="Termina o descarta la sesión en curso para cambiar de proyecto"' : ''}>${esc(p.nombre)}</button>`;
    }).join('');
  }

  function restaurarBorrador() {
    const s = estado.enCurso;
    const formulario = $('#form-tarjetas, #form-cierre');
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
    if (!Almacen.conectado()) estado.vista = 'ajustes';
    pintarCabecera();
    const vista = $('#vista');
    if (estado.vista === 'ajustes') {
      vista.innerHTML = vistaAjustes();
    } else if (estado.error) {
      vista.innerHTML = `<section class="tarjeta"><h2>No puedo leer los datos</h2><p>${esc(estado.error)}</p>${Almacen.modo === 'local' ? '<p>Abre la aplicación con el archivo <strong>Abrir aplicacion.bat</strong> y deja su ventana abierta.</p>' : '<p>Comprueba la conexión a internet o revisa la llave de acceso en Ajustes.</p>'}<div class="acciones"><button type="button" class="boton" data-accion="recargar">Volver a intentar</button></div></section>`;
    } else if (estado.cargando) {
      vista.innerHTML = '<p class="nota">Cargando…</p>';
    } else if (estado.vista === 'tarjetas') {
      vista.innerHTML = vistaTarjetas();
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
      borrador: diaDeHoy() ? { t_hecho: 'si', t_repasadas: String(diaDeHoy().repasadas), t_otra_vez: String(diaDeHoy().otra_vez) } : {},
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
    if (!pendiente) sincronizar();
  }

  async function elegirProyecto(slug) {
    if (estado.enCurso || slug === estado.slug) return;
    if (estado.repaso) await guardarRepaso();   // un repaso a medias se guarda antes de cambiar
    estado.slug = slug;
    estado.guardada = null;
    estado.repasoHecho = null;
    Memoria.guardar('slug', slug);
    try { await cargarProyecto(); estado.error = null; } catch (e) { estado.error = e.message; }
    pintar();
  }

  async function iniciar() {
    estado.cargando = true; estado.error = null;
    if (!Almacen.conectado()) { estado.cargando = false; estado.vista = 'ajustes'; pintar(); return; }
    pintar();
    try {
      if (location.protocol === 'file:') throw new Error('La aplicación se ha abierto como un archivo suelto.');
      if (Almacen.modo === 'local') {
        // Antes de leer, traer lo que el teléfono haya escrito (con un máximo de espera).
        await Promise.race([sincronizar(true), new Promise((listo) => setTimeout(listo, 15000))]);
        Almacen.descripcionLocal().then((d) => { estado.carpeta = d.datos; }).catch(() => {});
      }
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
    // Una ronda de repaso que quedó sin guardar (o de otro día) se guarda ahora.
    const r = estado.repaso;
    if (r && !estado.error && (r.porGuardar || r.fecha !== fechaISO())) guardarRepaso();
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
    else if (accion === 'repaso-empezar') empezarRepaso();
    else if (accion === 'mostrar' && estado.repaso) { estado.repaso.mostrada = true; guardarRonda(); pintar(); }
    else if (accion === 'nota') responderTarjeta(boton.dataset.valor);
    else if (accion === 'repaso-saltar' && estado.repaso) { estado.repaso.cola.shift(); guardarRonda(); if (estado.repaso.cola.length) pintar(); else guardarRepaso(); }
    else if (accion === 'repaso-terminar' || accion === 'repaso-reintentar') guardarRepaso();
    else if (accion === 'tarjetas-iniciar') iniciarTarjetas(boton.dataset.valor === 'conocidas');
    else if (accion === 'sincronizar') { globo('Sincronizando…'); const s = await sincronizar(true); if (s.ok) { await cargarProyecto().catch(() => {}); } pintar(); }
    else if (accion === 'desconectar') {
      if (window.confirm('¿Desconectar este dispositivo? Tus datos siguen en GitHub; solo se borra la llave de este navegador.')) { Almacen.desconectar(); estado.proyectos = []; estado.vista = 'ajustes'; pintar(); }
    }
  });

  // Atajos de teclado para repasar en el ordenador: espacio muestra; 1, 2 y 3 califican.
  document.addEventListener('keydown', (evento) => {
    const r = estado.repaso;
    if (estado.vista !== 'tarjetas' || !r || !r.cola.length || r.porGuardar) return;
    if (evento.target.closest('input, textarea, select, button')) return;
    if (!r.mostrada && (evento.key === ' ' || evento.key === 'Enter')) { evento.preventDefault(); r.mostrada = true; guardarRonda(); pintar(); }
    else if (r.mostrada && ['1', '2', '3'].includes(evento.key)) responderTarjeta({ 1: 'otra', 2: 'bien', 3: 'facil' }[evento.key]);
  });

  document.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (evento.target.id === 'form-tarjetas') enviarTarjetas(evento.target);
    else if (evento.target.id === 'form-cierre') enviarCierre(evento.target);
    else if (evento.target.id === 'form-conexion') conectar(evento.target);
  });

  // Lo escrito en un formulario se guarda al momento, por si se recarga la página.
  document.addEventListener('input', (evento) => {
    const formulario = evento.target.closest('#form-tarjetas, #form-cierre');
    if (!formulario || !estado.enCurso) return;
    estado.enCurso.borrador = Object.fromEntries(new FormData(formulario).entries());
    guardarEnCurso();
  });

  let esperaRedibujo;
  window.addEventListener('resize', () => {
    clearTimeout(esperaRedibujo);
    esperaRedibujo = setTimeout(dibujarGraficos, 150);
  });

  if ('serviceWorker' in navigator && Almacen.modo === 'github') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  setInterval(latido, 500);
  iniciar();
})();
