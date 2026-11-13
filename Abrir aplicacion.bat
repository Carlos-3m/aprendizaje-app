@echo off
rem Abre la aplicacion de aprendizaje en el navegador.
rem Deja esta ventana abierta mientras la usas.
title Aplicacion de aprendizaje
cd /d "%~dp0"
python servidor.py %*
if errorlevel 1 pause
