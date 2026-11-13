'use strict';
/* Almacén: la única parte de la aplicación que sabe dónde viven los datos.

   Hay dos formas de guardar, con las mismas funciones:
   · «local»:  en el ordenador, a través de servidor.py, que lee y escribe en
               la carpeta de aprendizaje y la sincroniza con GitHub.
   · «github»: en el teléfono o en cualquier otro equipo, directamente en el
               repositorio privado, con una llave de acceso que se guarda
               solo en ese dispositivo. */
const Almacen = (() => {
  const enLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const CLAVE = 'apr.github';

  // ───────────── Forma «local» ─────────────
  const urlLocal = (ruta) => '/api/archivo?ruta=' + encodeURIComponent(ruta);

  async function leerTextoLocal(ruta) {
    const respuesta = await fetch(urlLocal(ruta), { cache: 'no-store' });
    if (respuesta.status === 404) return null;
    if (!respuesta.ok) throw new Error('No se pudo leer ' + ruta + ' (' + respuesta.status + ')');
    return respuesta.text();
  }
  async function escribirLocal(ruta, objeto) {
    const respuesta = await fetch(urlLocal(ruta), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Aprendizaje': '1' },
      body: JSON.stringify(objeto),
    });
    if (!respuesta.ok) throw new Error('No se pudo guardar ' + ruta + ' (' + respuesta.status + ')');
  }
  async function sincronizarLocal() {
    const respuesta = await fetch('/api/sincronizar', { method: 'POST', headers: { 'X-Aprendizaje': '1' } });
    if (!respuesta.ok) throw new Error('El servidor no pudo sincronizar (' + respuesta.status + ')');
    return respuesta.json();
  }
  async function descripcionLocal() {
    const respuesta = await fetch('/api/estado', { cache: 'no-store' });
    if (!respuesta.ok) throw new Error('El servidor no responde');
    return respuesta.json();
  }

  // ───────────── Forma «github» ─────────────
  function configuracion() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch { return null; }
  }
  function configuracionPorDefecto() {
    const esPagina = location.hostname.endsWith('.github.io');
    return { usuario: esPagina ? location.hostname.split('.')[0] : '', repositorio: 'aprendizaje', rama: 'main', token: '' };
  }
  function guardarConfiguracion(c) { localStorage.setItem(CLAVE, JSON.stringify(c)); huellas.clear(); }
  function desconectar() { localStorage.removeItem(CLAVE); huellas.clear(); }

  // GitHub exige, para modificar un archivo, la «huella» (sha) de la versión que se leyó.
  const huellas = new Map();

  function aTexto(base64) {
    const binario = atob(base64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
  }
  function aBase64(texto) {
    let binario = '';
    new TextEncoder().encode(texto).forEach((octeto) => { binario += String.fromCharCode(octeto); });
    return btoa(binario);
  }
  function errorDeGitHub(respuesta, ruta) {
    if (respuesta.status === 401) return new Error('GitHub no acepta la llave de acceso: puede haber caducado. Revísala en Ajustes.');
    if (respuesta.status === 403) return new Error('La llave de acceso no tiene permiso para esto. Revísala en Ajustes.');
    return new Error('GitHub respondió ' + respuesta.status + ' con ' + ruta);
  }
  async function pedirGitHub(c, ruta, opciones = {}) {
    const camino = ruta.split('/').map(encodeURIComponent).join('/');
    const consulta = opciones.method ? '' : '?ref=' + encodeURIComponent(c.rama);
    return fetch('https://api.github.com/repos/' + encodeURIComponent(c.usuario) + '/' + encodeURIComponent(c.repositorio) + '/contents/' + camino + consulta, {
      cache: 'no-store',
      ...opciones,
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token, ...(opciones.headers || {}) },
    });
  }
  function exigirConexion() {
    const c = configuracion();
    if (!c || !c.token) throw new Error('Este dispositivo todavía no está conectado con tus datos. Ve a Ajustes.');
    return c;
  }

  async function leerTextoGitHub(ruta) {
    const c = exigirConexion();
    const respuesta = await pedirGitHub(c, ruta);
    if (respuesta.status === 404) { huellas.delete(ruta); return null; }
    if (!respuesta.ok) throw errorDeGitHub(respuesta, ruta);
    const dato = await respuesta.json();
    huellas.set(ruta, dato.sha);
    return aTexto(dato.content || '');
  }
  async function escribirGitHub(ruta, objeto) {
    const c = exigirConexion();
    const contenido = aBase64(JSON.stringify(objeto, null, 2) + '\n');
    for (let intento = 0; intento < 2; intento++) {
      if (!huellas.has(ruta) || intento > 0) await leerTextoGitHub(ruta);
      const cuerpo = { message: 'Datos de la aplicación', content: contenido, branch: c.rama };
      if (huellas.has(ruta)) cuerpo.sha = huellas.get(ruta);
      const respuesta = await pedirGitHub(c, ruta, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      if (respuesta.ok) {
        const dato = await respuesta.json();
        if (dato.content && dato.content.sha) huellas.set(ruta, dato.content.sha);
        return;
      }
      // 409 o 422: alguien cambió el archivo entre la lectura y la escritura; se reintenta una vez.
      if (!(respuesta.status === 409 || respuesta.status === 422) || intento === 1) throw errorDeGitHub(respuesta, ruta);
    }
  }
  /** Comprueba que la llave abre el repositorio y permite escribir en él. */
  async function probar(c) {
    let respuesta;
    try {
      respuesta = await fetch('https://api.github.com/repos/' + encodeURIComponent(c.usuario) + '/' + encodeURIComponent(c.repositorio), {
        cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token },
      });
    } catch { return { ok: false, detalle: 'No hay conexión con GitHub.' }; }
    if (respuesta.status === 401) return { ok: false, detalle: 'GitHub no reconoce esa llave. Cópiala entera y sin espacios.' };
    if (respuesta.status === 404) return { ok: false, detalle: 'Con esa llave no se ve el repositorio «' + c.usuario + '/' + c.repositorio + '». Revisa el nombre y que la llave tenga acceso a él.' };
    if (!respuesta.ok) return { ok: false, detalle: 'GitHub respondió ' + respuesta.status + '.' };
    const dato = await respuesta.json();
    if (dato.permissions && dato.permissions.push === false) return { ok: false, detalle: 'La llave puede leer pero no escribir. Dale permiso de «Contents: Read and write».' };
    return { ok: true, detalle: 'Conectado con ' + c.usuario + '/' + c.repositorio + '.' };
  }

  // ───────────── Funciones comunes ─────────────
  const leerTexto = enLocal ? leerTextoLocal : leerTextoGitHub;
  async function leer(ruta) {
    const texto = await leerTexto(ruta);
    if (texto === null) return null;
    try { return JSON.parse(texto); }
    catch { throw new Error('El archivo ' + ruta + ' está dañado: no se puede leer como datos.'); }
  }

  return {
    modo: enLocal ? 'local' : 'github',
    /** ¿Puede este dispositivo leer los datos? */
    conectado: () => enLocal || Boolean((configuracion() || {}).token),
    leer,
    leerTexto,
    escribir: enLocal ? escribirLocal : escribirGitHub,
    /** En local, guarda y sube los datos a GitHub. En el teléfono no hace falta: ya escribe allí. */
    sincronizar: enLocal ? sincronizarLocal : async () => ({ ok: true, estado: 'directo', detalle: 'Este dispositivo escribe directamente en GitHub.' }),
    descripcionLocal,
    configuracion, configuracionPorDefecto, guardarConfiguracion, desconectar, probar,
  };
})();
