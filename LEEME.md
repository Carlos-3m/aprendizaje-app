# Aplicación de aprendizaje · versión 0.2

Acompaña las sesiones de estudio: muestra la sesión preparada, la cronometra, avisa a mitad y al final del núcleo, recoge el cierre, lleva el repaso de tarjetas y enseña si las sesiones están saliendo fáciles, justas o difíciles.

No sustituye al coach (Claude Code o Codex). El coach prepara cada sesión y corrige; la aplicación mide.

## Dos formas de usarla

| | En el ordenador | En el teléfono, la tableta u otro equipo |
|---|---|---|
| Cómo se abre | Doble clic en `Abrir aplicacion.bat` | La dirección pública de la aplicación, en el navegador |
| Dónde guarda | En la carpeta de aprendizaje, y la sube a GitHub | Directamente en el repositorio privado de GitHub |
| Qué necesita | Python (ya instalado) | Una llave de acceso de GitHub, que se pega una vez en «Ajustes» |

En el ordenador: deja abierta la ventana negra mientras la usas; al cerrarla, la aplicación se cierra.

En el teléfono: desde el menú del navegador, «Instalar aplicación» o «Añadir a pantalla de inicio» la deja con su icono.

## Pantallas

**Hoy**

- La sesión que dejó preparada el coach: calentamiento, primera tarea y los tres escalones (mínimo, objetivo, extra).
- Cronómetro por fases. Las pausas se cuentan aparte.
- **Control de mitad:** a mitad del núcleo suena un aviso y pregunta si vas por la mitad. Si respondes que no, propone bajar al mínimo.
- **Corte:** al acabar el tiempo del núcleo suenan dos avisos y el reloj se pone en rojo.
- Cierre: la frase de recuerdo, el escalón alcanzado, la dificultad sentida y la concentración.
- Si se recarga la página o se cierra el navegador, la sesión sigue donde estaba. Si no hay conexión al guardar, se guarda en el dispositivo y se envía sola más tarde.

**Tarjetas**

- Repaso espaciado: cada acierto aleja la tarjeta; cada fallo la trae de vuelta.
- Tres respuestas: «Otra vez», «Bien» y «Fácil». En el ordenador: espacio para ver la respuesta; 1, 2 y 3 para calificar.
- Al terminar guarda cuántas repasaste y cuáles fallaste, para que el coach las use en el calentamiento.

**Progreso**

- Sesiones de la semana, días desde la última y cuántas se pasaron del máximo.
- Una lectura por forma de tarea: «En su punto», «Sale fácil», «Sale difícil» o «Se alarga».
- Minutos reales y porcentaje de acierto de cada sesión.

**Ajustes**

- En el ordenador: dónde están los datos y si están al día con GitHub.
- En el teléfono: conectar o desconectar el dispositivo.

## Dónde están los datos

En la carpeta de aprendizaje y en su copia privada de GitHub, nunca en este repositorio:

| Archivo | Quién lo escribe |
|---|---|
| `02-proyectos/proyectos.json` | El coach: lista de proyectos y minutos de cada parte de la sesión |
| `02-proyectos/{proyecto}/datos/proxima.json` | El coach, al cerrar cada sesión |
| `02-proyectos/{proyecto}/datos/sesiones.json` | La aplicación al guardar; el coach completa aciertos y ayuda |
| `02-proyectos/{proyecto}/datos/repasos.json` | Solo la aplicación |
| `02-proyectos/{proyecto}/tarjetas.tsv` | El coach. La aplicación solo lo lee |

Si la carpeta de aprendizaje está en otro sitio: `python servidor.py --datos RUTA`.

## La llave de acceso del teléfono

- Es una llave «fine-grained» de GitHub, limitada a **un solo repositorio** (el de datos) y a **un solo permiso** («Contents: Read and write»).
- Se guarda únicamente en el navegador del dispositivo donde se pega. No viaja a ningún sitio que no sea GitHub.
- Si se pierde el teléfono: en GitHub, Settings → Developer settings → Personal access tokens, se borra la llave y deja de servir.

## Archivos del programa

| Archivo | Para qué sirve |
|---|---|
| `servidor.py` | En el ordenador: entrega la aplicación al navegador, lee y escribe los datos y los sincroniza con GitHub. Solo atiende a este ordenador y solo toca los archivos de datos |
| `index.html`, `estilos.css` | La página y su aspecto |
| `app.js` | Las pantallas, el cronómetro y el repaso de tarjetas |
| `graficos.js` | Los dos gráficos |
| `almacen.js` | La única parte que sabe dónde se guardan los datos (ordenador o GitHub) |
| `sw.js`, `app.webmanifest`, `icono-*.png` | Lo necesario para instalarla en el teléfono y abrirla sin conexión |

## Límites conocidos

- Si el ordenador y el teléfono cambian el mismo archivo sin sincronizar entre medias, la sincronización se detiene y avisa en «Ajustes»; no borra nada. Lo resuelve el coach.
- No tiene recordatorios.
