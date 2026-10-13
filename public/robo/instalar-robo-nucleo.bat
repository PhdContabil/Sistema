@echo off
setlocal
title Instalador do Robo do Sistema MEI - Nucleo Contabil
echo.
echo  Instalando o Robo do Sistema MEI (Nucleo Contabil)...
echo  Nao precisa de administrador. Pode levar alguns minutos na primeira vez.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $ErrorActionPreference='Stop'; try { iex ((New-Object Net.WebClient).DownloadString('https://system-contabilidade.vercel.app/robo/instalar.ps1')) } catch { Write-Host ('ERRO: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 } }"
if errorlevel 1 (
  echo.
  echo  A instalacao falhou. Tire um print desta janela e mande para a T.I.
) else (
  echo.
  echo  Pronto! Volte ao Sistema MEI e clique de novo no botao do robo.
)
echo.
pause
