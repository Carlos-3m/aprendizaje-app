# AGENTS.md: aplicación de aprendizaje

> Instrucciones para cualquier asistente de IA que trabaje en **el programa**. `CLAUDE.md` solo importa este archivo. Responde siempre en español, con palabras corrientes y explicando los términos nuevos.

## Qué es esto

El programa de la aplicación de aprendizaje: guía y cronometra las sesiones, lleva el repaso de tarjetas y mide si las sesiones salen fáciles, justas o difíciles. El método de estudio, los roles y los datos **no están aquí**: están en `D:\Aprendizaje` (repositorio privado `Carlos-3m/aprendizaje`). Lee el `AGENTS.md` de esa carpeta antes de cambiar algo que afecte a cómo se registran o se leen los datos.

- **Este repositorio es público** (`Carlos-3m/aprendizaje-app`). Nunca subas aquí datos personales, sesiones, tarjetas, llaves de acceso ni correos.
- **Publicación:** la rama `gh-pages` es la página pública `https://carlos-3m.github.io/aprendizaje-app/`, que usa el teléfono. Publicar = `git push origin main:gh-pages`.

## Archivos

| Archivo | Para qué |
|---|---|
| `servidor.py` | En el ordenador: entrega la aplicación, lee y escribe los datos y los sincroniza con GitHub. Solo Python estándar, sin dependencias |
| `almacen.js` | La única parte que sabe dónde se guardan los datos: servidor local o GitHub con llave |
| `app.js` | Pantallas Hoy, Tarjetas, Progreso y Ajustes; cronómetro y repaso espaciado |
| `graficos.js` | Los dos gráficos (SVG, sin bibliotecas) |
| `index.html`, `estilos.css` | La página y su aspecto (claro y oscuro) |
| `sw.js`, `app.webmanifest`, `icono-*.png` | Instalación en el teléfono y uso sin conexión |
| `pruebas/` | Pruebas automáticas y una copia fija de datos de ejemplo. **No se sube** (está en `.gitignore`) |

## Reglas

1. **Sin bibliotecas ni pasos de compilación.** HTML, CSS y JavaScript tal cual; Python sin paquetes externos. Así funciona en cualquier equipo sin instalar nada.
2. **Los archivos de datos son un contrato con el coach.** Los campos de `sesiones.json`, `proxima.json`, `repasos.json` y `proyectos.json` están descritos en `D:\Aprendizaje\AGENTS.md` («Datos de sesión y aplicación»). Si cambias un campo, cambia también esa descripción, en el mismo trabajo.
3. **Las tarjetas se identifican por el texto de la pregunta.** No cambies la función `huella` de `app.js`: todas las tarjetas empezarían de cero.
4. **Nunca perder datos.** Antes de escribir un archivo de datos, releerlo y añadir; ante un conflicto con GitHub, no forzar (ni `--force` ni `reset --hard`) y avisar. Lo que no se pueda guardar se queda en el dispositivo y se reintenta.
5. **Al cambiar algo que el teléfono descarga**, sube el número de `COPIA` en `sw.js` (por ejemplo `aprendizaje-v2` → `aprendizaje-v3`) y el número de versión de `app.js`, `LEEME.md` y la pantalla Ajustes.
6. **Probar antes de publicar** (ver abajo). Si una prueba falla, no publiques.
7. **No inventes resultados:** si algo no se probó (por ejemplo, en un teléfono real), dilo.

## Cómo probar

Las pruebas usan una copia de los datos y un GitHub simulado: no tocan los datos reales.

```text
python -m venv %TEMP%\venv-aprendizaje
%TEMP%\venv-aprendizaje\Scripts\python -m pip install playwright
%TEMP%\venv-aprendizaje\Scripts\python pruebas\probar_sesion.py
%TEMP%\venv-aprendizaje\Scripts\python pruebas\probar_tarjetas_y_telefono.py
```

Usan el navegador Edge del ordenador. Cada una termina con `RESULTADO: todo correcto` o con la lista de fallos. Las capturas de pantalla quedan en una carpeta temporal que se indica al ejecutar.

Si añades una función, añade su comprobación a la prueba que corresponda.

## Cómo publicar

```text
git add -A
git commit -m "Qué cambia, en una línea"
git push origin main
git push origin main:gh-pages
```

La página pública tarda uno o dos minutos en actualizarse. El teléfono recibe la versión nueva la siguiente vez que abre la aplicación con conexión.
