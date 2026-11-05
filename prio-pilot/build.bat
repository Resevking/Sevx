@echo off
rem PrioPilot bauen - nutzt den C#-Compiler, der in Windows schon eingebaut ist.
rem Kein Download, keine Installation noetig.
setlocal
cd /d "%~dp0"
set "RC=0"

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
    echo Der C#-Compiler von Windows wurde nicht gefunden.
    echo Er gehoert zu .NET Framework 4.8, das ab Windows 10 vorinstalliert ist.
    set "RC=1"
    goto :ende
)

echo PrioPilot wird gebaut ...
"%CSC%" /nologo /target:winexe /optimize+ /unsafe /platform:anycpu /codepage:65001 /warn:4 ^
  /out:PrioPilot.exe /win32icon:src\PrioPilot.ico /win32manifest:src\app.manifest ^
  /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll ^
  src\*.cs
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo Bauen fehlgeschlagen.
    goto :ende
)
echo.
echo Fertig: %CD%\PrioPilot.exe
echo Doppelklick auf PrioPilot.exe startet das Programm.

:ende
if /i not "%~1"=="/nopause" pause
exit /b %RC%
