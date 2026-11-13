"""Servidor local de la aplicación de aprendizaje.

Hace dos cosas, y solo para este ordenador (127.0.0.1):
  1. Entrega los archivos de la aplicación (index.html, estilos, código).
  2. Lee y escribe los archivos de datos de la carpeta de aprendizaje
     (proyectos.json y los .json de la carpeta datos/ de cada proyecto).
  3. Si la carpeta de aprendizaje está enlazada con GitHub, sincroniza esos
     archivos de datos (y solo esos) cuando la aplicación se lo pide.

No necesita instalar nada: usa solo lo que trae Python.

Uso:  python servidor.py [--datos RUTA] [--puerto 8765] [--no-abrir]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

CARPETA_APP = Path(__file__).resolve().parent

# Únicos archivos de datos que la aplicación puede leer o escribir.
RUTA_PERMITIDA = re.compile(
    r"^02-proyectos/(proyectos\.json|[a-z0-9][a-z0-9-]*/datos/[a-z0-9][a-z0-9-]*\.json)$"
)

# Archivos que solo se leen: las tarjetas de cada proyecto.
RUTA_SOLO_LECTURA = re.compile(r"^02-proyectos/[a-z0-9][a-z0-9-]*/tarjetas\.tsv$")

# Lo único que la aplicación guarda y sube a GitHub por su cuenta.
RUTAS_GIT = ["02-proyectos/proyectos.json", "02-proyectos/*/datos/*.json"]
CERROJO_GIT = threading.Lock()


def git(carpeta, *argumentos, espera=40):
    """Ejecuta una orden de git en la carpeta de datos. Devuelve (código, texto)."""
    entorno = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    opciones = {}
    if os.name == "nt":
        opciones["creationflags"] = subprocess.CREATE_NO_WINDOW
    resultado = subprocess.run(
        ["git", "-C", str(carpeta), *argumentos], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=espera, env=entorno, **opciones)
    return resultado.returncode, (resultado.stdout + resultado.stderr).strip()


def sincronizar(carpeta):
    """Guarda los archivos de datos, trae lo nuevo de GitHub y sube lo local.

    Nunca fuerza nada: si hay un conflicto, deshace el intento y lo cuenta.
    """
    if not (carpeta / ".git").exists():
        return {"ok": True, "estado": "sin-git", "detalle": "La carpeta no tiene historial de cambios."}
    with CERROJO_GIT:
        try:
            if not git(carpeta, "remote")[1]:
                return {"ok": True, "estado": "sin-git", "detalle": "La carpeta no está enlazada con GitHub."}
            # 1. Guardar los datos locales (solo los archivos de datos).
            git(carpeta, "add", "--", *RUTAS_GIT)
            if git(carpeta, "diff", "--cached", "--quiet", "--", *RUTAS_GIT)[0] == 1:
                codigo, salida = git(carpeta, "commit", "-m", "Datos de la aplicación", "--", *RUTAS_GIT)
                if codigo != 0:
                    return {"ok": False, "estado": "error-guardar", "detalle": salida[-400:]}
            # 2. Traer lo que haya escrito el teléfono.
            codigo, salida = git(carpeta, "pull", "--rebase", "--autostash", espera=90)
            if codigo != 0:
                git(carpeta, "rebase", "--abort")
                return {"ok": False, "estado": "error-traer", "detalle": salida[-400:]}
            # 3. Subir.
            codigo, salida = git(carpeta, "push", espera=90)
            if codigo != 0:
                return {"ok": False, "estado": "error-subir", "detalle": salida[-400:]}
            return {"ok": True, "estado": "al-dia", "detalle": "Datos sincronizados con GitHub."}
        except subprocess.TimeoutExpired:
            return {"ok": False, "estado": "sin-respuesta", "detalle": "GitHub no respondió a tiempo."}
        except FileNotFoundError:
            return {"ok": False, "estado": "sin-git", "detalle": "No encuentro el programa git."}


# Únicos archivos de la aplicación que se entregan al navegador.
TIPOS_ESTATICOS = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
}

TAMANO_MAXIMO = 2 * 1024 * 1024  # 2 MB por archivo de datos


class Manejador(BaseHTTPRequestHandler):
    server_version = "Aprendizaje/0.1"
    carpeta_datos: Path
    puerto: int

    # ---------- utilidades ----------
    def log_message(self, formato, *args):  # registro breve en la ventana
        sys.stderr.write("  %s\n" % (formato % args))

    def _responder(self, estado, cuerpo=b"", tipo="application/json; charset=utf-8"):
        self.send_response(estado)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(cuerpo)

    def _json(self, estado, objeto):
        self._responder(estado, json.dumps(objeto, ensure_ascii=False).encode("utf-8"))

    def _host_valido(self):
        """Rechaza peticiones que no vayan dirigidas a este ordenador."""
        host = (self.headers.get("Host") or "").lower()
        return host in {f"127.0.0.1:{self.puerto}", f"localhost:{self.puerto}"}

    def _ruta_de_datos(self, consulta, solo_lectura=False):
        ruta = (parse_qs(consulta).get("ruta") or [""])[0]
        if not (RUTA_PERMITIDA.fullmatch(ruta) or (solo_lectura and RUTA_SOLO_LECTURA.fullmatch(ruta))):
            return None
        destino = (self.carpeta_datos / ruta).resolve()
        if self.carpeta_datos not in destino.parents:
            return None
        return destino

    # ---------- GET ----------
    def do_GET(self):
        if not self._host_valido():
            return self._json(HTTPStatus.FORBIDDEN, {"error": "host no permitido"})
        partes = urlsplit(self.path)

        if partes.path == "/api/estado":
            return self._json(HTTPStatus.OK, {
                "ok": True,
                "datos": str(self.carpeta_datos),
                "existe": (self.carpeta_datos / "02-proyectos").is_dir(),
                "git": (self.carpeta_datos / ".git").exists(),
            })

        if partes.path == "/api/archivo":
            destino = self._ruta_de_datos(partes.query, solo_lectura=True)
            if destino is None:
                return self._json(HTTPStatus.BAD_REQUEST, {"error": "ruta no permitida"})
            if not destino.is_file():
                return self._json(HTTPStatus.NOT_FOUND, {"error": "no existe"})
            tipo = "application/json; charset=utf-8" if destino.suffix == ".json" else "text/plain; charset=utf-8"
            return self._responder(HTTPStatus.OK, destino.read_bytes(), tipo)

        if partes.path.startswith("/api/"):
            return self._json(HTTPStatus.NOT_FOUND, {"error": "no existe"})

        # Archivos de la aplicación
        nombre = "index.html" if partes.path in ("", "/") else partes.path.lstrip("/")
        archivo = (CARPETA_APP / nombre).resolve()
        tipo = TIPOS_ESTATICOS.get(archivo.suffix.lower())
        if tipo is None or CARPETA_APP not in archivo.parents or not archivo.is_file():
            return self._responder(HTTPStatus.NOT_FOUND, b"No existe", "text/plain; charset=utf-8")
        return self._responder(HTTPStatus.OK, archivo.read_bytes(), tipo)

    do_HEAD = do_GET

    # ---------- POST ----------
    def do_POST(self):
        if not self._host_valido():
            return self._json(HTTPStatus.FORBIDDEN, {"error": "host no permitido"})
        if self.headers.get("X-Aprendizaje") != "1":
            return self._json(HTTPStatus.FORBIDDEN, {"error": "falta la cabecera de la aplicación"})
        if urlsplit(self.path).path != "/api/sincronizar":
            return self._json(HTTPStatus.NOT_FOUND, {"error": "no existe"})
        return self._json(HTTPStatus.OK, sincronizar(self.carpeta_datos))

    # ---------- PUT ----------
    def do_PUT(self):
        if not self._host_valido():
            return self._json(HTTPStatus.FORBIDDEN, {"error": "host no permitido"})
        # Esta cabecera solo puede ponerla la propia aplicación: otra página web
        # abierta en el navegador no puede enviarla a este servidor.
        if self.headers.get("X-Aprendizaje") != "1":
            return self._json(HTTPStatus.FORBIDDEN, {"error": "falta la cabecera de la aplicación"})
        partes = urlsplit(self.path)
        if partes.path != "/api/archivo":
            return self._json(HTTPStatus.NOT_FOUND, {"error": "no existe"})
        destino = self._ruta_de_datos(partes.query)
        if destino is None:
            return self._json(HTTPStatus.BAD_REQUEST, {"error": "ruta no permitida"})
        if not destino.parent.parent.is_dir() and destino.name != "proyectos.json":
            return self._json(HTTPStatus.BAD_REQUEST, {"error": "el proyecto no existe"})

        try:
            largo = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            largo = 0
        if largo <= 0 or largo > TAMANO_MAXIMO:
            return self._json(HTTPStatus.BAD_REQUEST, {"error": "tamaño no válido"})
        try:
            objeto = json.loads(self.rfile.read(largo).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self._json(HTTPStatus.BAD_REQUEST, {"error": "el contenido no es JSON válido"})

        # Escritura segura: primero a un archivo temporal y luego se sustituye,
        # para que un corte a medias no deje el archivo roto.
        destino.parent.mkdir(parents=True, exist_ok=True)
        texto = json.dumps(objeto, ensure_ascii=False, indent=2) + "\n"
        descriptor, temporal = tempfile.mkstemp(dir=destino.parent, suffix=".tmp")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as salida:
                salida.write(texto)
            os.replace(temporal, destino)
        except OSError as error:
            try:
                os.unlink(temporal)
            except OSError:
                pass
            return self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
        return self._json(HTTPStatus.OK, {"ok": True})


def main():
    analizador = argparse.ArgumentParser(description="Servidor local de la aplicación de aprendizaje")
    analizador.add_argument("--datos", default=str(CARPETA_APP.parent / "Aprendizaje"),
                            help="carpeta de aprendizaje (la que contiene 02-proyectos)")
    analizador.add_argument("--puerto", type=int, default=8765)
    analizador.add_argument("--no-abrir", action="store_true", help="no abrir el navegador")
    opciones = analizador.parse_args()

    carpeta_datos = Path(opciones.datos).resolve()
    if not (carpeta_datos / "02-proyectos").is_dir():
        print(f"No encuentro la carpeta de aprendizaje en: {carpeta_datos}")
        print("Indica dónde está con:  python servidor.py --datos RUTA")
        return 1

    Manejador.carpeta_datos = carpeta_datos
    Manejador.puerto = opciones.puerto
    direccion = f"http://127.0.0.1:{opciones.puerto}/"
    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", opciones.puerto), Manejador)
    except OSError:
        print(f"La aplicación ya está abierta en {direccion}")
        if not opciones.no_abrir:
            webbrowser.open(direccion)
        return 0

    print("Aplicación de aprendizaje")
    print(f"  Datos:     {carpeta_datos}")
    print(f"  Dirección: {direccion}")
    print("  Deja esta ventana abierta mientras la usas. Para cerrar: Ctrl + C.")
    if not opciones.no_abrir:
        webbrowser.open(direccion)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
