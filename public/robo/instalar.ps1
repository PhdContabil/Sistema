# Instalador do Robô do Sistema MEI (chamado pelo instalar-robo-nucleo.bat).
# Instala tudo na pasta do usuário (%LOCALAPPDATA%\RoboNucleo), sem administrador:
#   Node.js portátil, os arquivos do robô, o playwright-core e o início automático com o Windows.
# Rodar de novo atualiza o robô.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$Site    = 'https://system-contabilidade.vercel.app/robo'
$NodeVer = 'v22.12.0'
$Dir     = Join-Path $env:LOCALAPPDATA 'RoboNucleo'
$NodeDir = Join-Path $Dir 'node'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# 1) Google Chrome (o robô usa o Chrome instalado)
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Google Chrome nao encontrado. Instale o Chrome e rode o instalador de novo.' }
Write-Host '  [1/5] Google Chrome encontrado.'

# 2) Node.js portátil
$node = Join-Path $NodeDir 'node.exe'
if (-not (Test-Path $node)) {
  Write-Host "  [2/5] Baixando Node.js $NodeVer (portatil)..."
  $zip = Join-Path $env:TEMP "node-$NodeVer.zip"
  Invoke-WebRequest "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-x64.zip" -OutFile $zip -UseBasicParsing
  $tmp = Join-Path $env:TEMP "node-$NodeVer-x"
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip -DestinationPath $tmp -Force
  if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
  Move-Item (Join-Path $tmp "node-$NodeVer-win-x64") $NodeDir
  Remove-Item $zip -Force
} else { Write-Host '  [2/5] Node.js ja instalado.' }

# 3) Para o robô antigo (se estiver rodando) e baixa os arquivos novos
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -match 'robo-nucleo\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
Write-Host '  [3/5] Baixando o robo...'
foreach ($f in 'robo-nucleo.js','emissor.js','das.js','package.json','versao.txt') {
  Invoke-WebRequest "$Site/$f" -OutFile (Join-Path $Dir $f) -UseBasicParsing
}

# 4) Dependência (playwright-core)
Write-Host '  [4/5] Instalando dependencias...'
Push-Location $Dir
& (Join-Path $NodeDir 'npm.cmd') install --omit=dev --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm install falhou.' }
Pop-Location

# 5) Início automático (oculto) com o Windows e inicia agora
$startup = [Environment]::GetFolderPath('Startup')
# Instalação antiga (manual) do robô: desativa para não brigar pela mesma porta.
$antigo = Join-Path $startup 'Robo NFS-e Nucleo.vbs'
if (Test-Path $antigo) { Rename-Item $antigo 'Robo NFS-e Nucleo.vbs.antigo' -Force }
$vbs = Join-Path $startup 'Robo Sistema MEI.vbs'
$conteudo = @"
Set s = CreateObject("WScript.Shell")
s.CurrentDirectory = "$Dir"
s.Run """$node"" robo-nucleo.js", 0, False
"@
Set-Content -Path $vbs -Value $conteudo -Encoding ASCII
Start-Process wscript.exe -ArgumentList "`"$vbs`""
Start-Sleep -Seconds 4
try { $null = Invoke-WebRequest 'http://127.0.0.1:3199/status' -UseBasicParsing -TimeoutSec 5; Write-Host '  [5/5] Robo rodando e configurado para iniciar com o Windows.' -ForegroundColor Green }
catch { throw 'O robo foi instalado mas nao respondeu. Reinicie o computador e teste de novo.' }
