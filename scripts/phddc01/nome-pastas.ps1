# nome-pastas.ps1 — roda no phddc01 como tarefa agendada (a cada 1 minuto).
#
# Substitui a automação do Access (botão Salvar da OS, formostroca): quando
# uma OS de Abertura/Troca com CNPJ e código Questor é salva no Núcleo, este
# script acrescenta a linha (índice, nome da pasta, "Empresa") em
# nome_pastas.xlsx — a mesma planilha que o processo do servidor já lê para
# criar a pasta do cliente. O Núcleo roda na nuvem e não enxerga o T:, por isso
# o caminho é este: o script busca a fila no Núcleo e escreve aqui na rede.
#
# Arquivos ao lado do script:
#   nome-pastas.token      -> token (PARALEGAL_PASTAS_TOKEN da Vercel). NÃO versionar.
#   nome-pastas.ultimo.txt -> último Nº OS já enviado (criado na 1ª execução)
#   nome-pastas.log        -> histórico
# Compatível com Windows PowerShell 5.1. Não precisa de Excel instalado.

$ErrorActionPreference = 'Stop'
$Base  = 'https://system-contabilidade.vercel.app'
$Xlsx  = '\\phddc01\PastaMonitorada\Nome pastas\nome_pastas.xlsx'
$Dir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateFile = Join-Path $Dir 'nome-pastas.ultimo.txt'
$LogFile   = Join-Path $Dir 'nome-pastas.log'

function Log($msg) { Add-Content -Path $LogFile -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg) -Encoding UTF8 }

function Add-LinhasXlsx([string]$caminho, $itens) {
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  for ($t = 1; $t -le 10; $t++) {
    try { $zip = [IO.Compression.ZipFile]::Open($caminho, 'Update'); break }
    catch { if ($t -eq 10) { throw }; Start-Sleep -Seconds 3 }   # planilha em uso pelo processo do servidor
  }
  try {
    $entry = $zip.GetEntry('xl/worksheets/sheet1.xml')
    $sr = New-Object IO.StreamReader($entry.Open()); $xmlText = $sr.ReadToEnd(); $sr.Close()
    [xml]$doc = $xmlText
    $nsm = New-Object Xml.XmlNamespaceManager($doc.NameTable); $nsm.AddNamespace('m', $ns)
    $sheetData = $doc.SelectSingleNode('//m:sheetData', $nsm)
    $rows = @($sheetData.SelectNodes('m:row', $nsm))
    $ultimaLinha = 0; $ultimoIndice = 0
    if ($rows.Count -gt 0) {
      $ult = $rows[$rows.Count - 1]
      $ultimaLinha = [int]$ult.GetAttribute('r')
      $a = $ult.SelectSingleNode("m:c[starts-with(@r,'A')]", $nsm)
      if ($a -and $a.GetAttribute('t') -ne 's' -and $a.GetAttribute('t') -ne 'inlineStr') {
        $v = $a.SelectSingleNode('m:v', $nsm); if ($v) { [int]::TryParse($v.InnerText, [ref]$ultimoIndice) | Out-Null }
      }
    }
    foreach ($it in $itens) {
      $ultimaLinha++; $ultimoIndice++
      $row = $doc.CreateElement('row', $ns); $row.SetAttribute('r', "$ultimaLinha")
      $cA = $doc.CreateElement('c', $ns); $cA.SetAttribute('r', "A$ultimaLinha")
      $vA = $doc.CreateElement('v', $ns); $vA.InnerText = "$ultimoIndice"; [void]$cA.AppendChild($vA); [void]$row.AppendChild($cA)
      foreach ($par in @(@('B', $it.nome), @('C', $it.tipo))) {
        $c = $doc.CreateElement('c', $ns); $c.SetAttribute('r', "$($par[0])$ultimaLinha"); $c.SetAttribute('t', 'inlineStr')
        $is = $doc.CreateElement('is', $ns); $tt = $doc.CreateElement('t', $ns); $tt.InnerText = $par[1]
        [void]$is.AppendChild($tt); [void]$c.AppendChild($is); [void]$row.AppendChild($c)
      }
      [void]$sheetData.AppendChild($row)
    }
    $dim = $doc.SelectSingleNode('//m:dimension', $nsm); if ($dim) { $dim.SetAttribute('ref', "A1:C$ultimaLinha") }
    $entry.Delete()
    $novo = $zip.CreateEntry('xl/worksheets/sheet1.xml')
    $sw = New-Object IO.StreamWriter($novo.Open(), (New-Object Text.UTF8Encoding($false))); $sw.Write($doc.OuterXml); $sw.Close()
  } finally { $zip.Dispose() }
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $token = (Get-Content (Join-Path $Dir 'nome-pastas.token') -Raw).Trim()
  $h = @{ Authorization = "Bearer $token" }

  if (-not (Test-Path $StateFile)) {
    # 1ª execução: começa do Nº OS atual (não reprocessa o histórico).
    $r = Invoke-RestMethod -Uri "$Base/api/paralegal/pastas-fila" -Headers $h -UseBasicParsing
    Set-Content -Path $StateFile -Value $r.maxNos
    Log "Inicializado a partir do Nº OS $($r.maxNos)"
    return
  }

  $desde = [int](Get-Content $StateFile -Raw).Trim()
  $r = Invoke-RestMethod -Uri "$Base/api/paralegal/pastas-fila?desde=$desde" -Headers $h -UseBasicParsing
  $itens = @($r.itens)
  if ($itens.Count -eq 0) { return }

  Add-LinhasXlsx -caminho $Xlsx -itens $itens
  $maior = ($itens | Measure-Object -Property nos -Maximum).Maximum
  Set-Content -Path $StateFile -Value $maior
  foreach ($it in $itens) { Log "OS $($it.nos): $($it.nome) ($($it.tipo))" }
} catch {
  Log "ERRO: $($_.Exception.Message)"
  exit 1
}
