# Aplicación de aprendizaje · versión 0.1

Acompaña las sesiones de estudio: muestra la sesión preparada, la cronometra, avisa a mitad y al final del núcleo, recoge el cierre y enseña si las sesiones están saliendo fáciles, justas o difíciles.

No sustituye al coach (Claude Code o Codex). El coach prepara cada sesión y corrige; la aplicación mide.

## Cómo abrirla

1. Doble clic en **`Abrir aplicacion.bat`**.
2. Se abre el navegador en `http://127.0.0.1:8765/`.
3. Deja abierta la ventana negra mientras la usas. Para cerrar la aplicación, cierra esa ventana.

Solo necesita Python, que ya está instalado. No se conecta a internet.

## Qué hay en cada pantalla

**Hoy**

- La sesión que dejó preparada el coach: calentamiento, primera tarea y los tres escalones (mínimo, objetivo, extra).
- Al empezar: pregunta por el repaso de tarjetas, cronometra el calentamiento y el núcleo.
- **Control de mitad:** a mitad del núcleo suena un aviso y pregunta si vas por la mitad del objetivo. Si respondes que no, propone bajar al escalón mínimo.
- **Corte:** al acabar el tiempo del núcleo suenan dos avisos y el reloj se pone en rojo.
- Cierre: la frase de recuerdo, el escalón alcanzado, la dificultad sentida y la concentración.
- Las pausas se cuentan aparte: no suman como tiempo de trabajo.
- Si se recarga la página o se cierra el navegador a mitad de sesión, la sesión sigue donde estaba.

**Progreso**

- Sesiones de la semana, días desde la última y cuántas se pasaron del máximo.
- Una lectura por forma de tarea: «En su punto», «Sale fácil», «Sale difícil» o «Se alarga».
- Minutos reales y porcentaje de acierto de cada sesión.

## Dónde están los datos

En la carpeta de aprendizaje (`D:\Aprendizaje`), no aquí:

| Archivo | Quién lo escribe |
|---|---|
| `02-proyectos/proyectos.json` | El coach: lista de proyectos y minutos de cada parte de la sesión |
| `02-proyectos/{proyecto}/datos/proxima.json` | El coach, al cerrar cada sesión |
| `02-proyectos/{proyecto}/datos/sesiones.json` | La aplicación al guardar; el coach completa aciertos y ayuda |

Si la carpeta de aprendizaje está en otro sitio: `python servidor.py --datos RUTA`.

## Archivos del programa

| Archivo | Para qué sirve |
|---|---|
| `servidor.py` | Entrega la aplicación al navegador y lee o escribe los datos. Solo atiende a este ordenador y solo toca los tres archivos de arriba |
| `index.html`, `estilos.css` | La página y su aspecto |
| `app.js` | Las pantallas «Hoy» y «Progreso» y el cronómetro |
| `graficos.js` | Los dos gráficos |
| `almacen.js` | La única parte que sabe dónde se guardan los datos. Al publicar la aplicación en internet, aquí se añadirá el guardado en GitHub |

## Lo que todavía no hace

- No funciona en el teléfono: falta publicarla y guardar los datos en GitHub.
- No lleva las tarjetas dentro: de momento solo pregunta por el repaso.
- No tiene recordatorios.
