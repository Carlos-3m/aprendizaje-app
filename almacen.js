'use strict';
/* Almacén: la única parte de la aplicación que sabe dónde viven los datos.
   Hoy habla con el servidor local (servidor.py), que lee y escribe en la
   carpeta de aprendizaje. Cuando se publique la aplicación, aquí se añadirá
   otra forma de guardar (GitHub) con las mismas dos funciones. */
const Almacen = (() => {
  const url = (ruta) => '/api/archivo?ruta=' + encodeURIComponent(ruta);

  /** Devuelve el contenido del archivo, o null si todavía no existe. */
  async function leer(ruta) {
    const respuesta = await fetch(url(ruta), { cache: 'no-store' });
    if (respuesta.status === 404) return null;
    if (!respuesta.ok) throw new Error('No se pudo leer ' + ruta + ' (' + respuesta.status + ')');
    return respuesta.json();
  }

  async function escribir(ruta, objeto) {
    const respuesta = await fetch(url(ruta), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Aprendizaje': '1' },
      body: JSON.stringify(objeto),
    });
    if (!respuesta.ok) throw new Error('No se pudo guardar ' + ruta + ' (' + respuesta.status + ')');
  }

  async function estado() {
    const respuesta = await fetch('/api/estado', { cache: 'no-store' });
    if (!respuesta.ok) throw new Error('El servidor no responde');
    return respuesta.json();
  }

  return { leer, escribir, estado };
})();
