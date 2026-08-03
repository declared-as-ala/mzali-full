@echo off
setlocal
title Installation MZALI POS Bridge

echo.
echo Installation du service local MZALI POS...
echo.

if not exist "%~dp0install-windows.ps1" goto :not_extracted
if not exist "%~dp0server.mjs" goto :not_extracted
if not exist "%~dp0drawer.mjs" goto :not_extracted
if not exist "%~dp0display.mjs" goto :not_extracted
if not exist "%~dp0dedupe.mjs" goto :not_extracted

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js est necessaire. Installation automatique en cours...
  where winget.exe >nul 2>nul
  if errorlevel 1 (
    echo.
    echo ERREUR: Windows App Installer ^(winget^) est absent.
    echo Installez Node.js LTS, puis relancez ce fichier.
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
  )

  winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo.
    echo ERREUR: Node.js n'a pas pu etre installe.
    echo Installez Node.js LTS depuis https://nodejs.org/ puis relancez ce fichier.
    echo.
    pause
    exit /b 1
  )

  set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
if errorlevel 1 (
  echo.
  echo L'installation a echoue. Gardez cette fenetre ouverte et contactez l'administrateur.
  echo.
  pause
  exit /b 1
)

echo.
echo Vous pouvez maintenant ouvrir le POS et tester le tiroir.
echo.
pause
exit /b 0

:not_extracted
echo ERREUR: Le programme est encore ouvert directement depuis le fichier ZIP.
echo.
echo 1. Fermez cette fenetre.
echo 2. Clic droit sur mzali-full-master.zip.
echo 3. Choisissez "Extraire tout".
echo 4. Ouvrez le dossier extrait: mzali-full-master\pos\bridge.
echo 5. Double-cliquez de nouveau sur INSTALL-ON-POS-PC.cmd.
echo.
pause
exit /b 1
