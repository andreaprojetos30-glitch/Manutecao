# Sobe o laboratório local da confirmação do síndico.
# Não lê .env.local. Não abre o navegador.
# -Verificar apenas confere o destino e não inicia os servidores.

param(
  [switch]$Verificar
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$HostLocal = '127.0.0.1'
$PortaHttp = 54321
$PortaNext = 3010
$Banco = 'eleva_manutencao_teste'
$UrlLaboratorio = "http://${HostLocal}:$PortaHttp"
$Psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$Node = (Get-Command node -ErrorAction Stop).Source
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not (Test-Path -LiteralPath $Psql)) {
  throw "Programa não encontrado: $Psql"
}

foreach ($nome in @(
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'PGHOST',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGPASSWORD',
  'PGPASSFILE'
)) {
  Remove-Item "Env:$nome" -ErrorAction SilentlyContinue
}

$env:NEXT_PUBLIC_SUPABASE_URL = $UrlLaboratorio
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'lab-eleva-anon-somente-127'
$env:SUPABASE_SERVICE_ROLE_KEY = 'lab-eleva-local-somente-127'
$env:PGHOST = $HostLocal
$env:PGPORT = '5432'
$env:PGDATABASE = $Banco
$env:PGUSER = 'postgres'
$env:PGCLIENTENCODING = 'UTF8'

if ($env:NEXT_PUBLIC_SUPABASE_URL -cne $UrlLaboratorio) {
  throw 'Endereço externo recusado.'
}
if ($env:NEXT_PUBLIC_SUPABASE_URL -notmatch '^http://127\.0\.0\.1:54321$') {
  throw 'Endereço externo recusado.'
}
if ($env:DATABASE_URL) {
  throw 'DATABASE_URL recusada.'
}

$uri = [Uri]$env:NEXT_PUBLIC_SUPABASE_URL
if ($uri.Host -cne $HostLocal -or $uri.Port -ne $PortaHttp -or $uri.Scheme -cne 'http') {
  throw 'Endereço externo recusado.'
}

& $Psql -X -q -v ON_ERROR_STOP=1 -h $HostLocal -p 5432 -U postgres -d $Banco -c "do `$`$ begin if current_database() is distinct from 'eleva_manutencao_teste' or inet_server_addr() is distinct from '127.0.0.1'::inet or inet_server_port() is distinct from 5432 then raise exception 'Destino recusado'; end if; end `$`$;"
if ($LASTEXITCODE -ne 0) {
  throw 'O PostgreSQL local de testes não confirmou o destino.'
}

Write-Output "Destino confirmado: ${HostLocal}:5432/${Banco}"

if ($Verificar) {
  Write-Output 'Verificação concluída. Nenhum servidor foi iniciado.'
  exit 0
}

$preparado = & $Psql -X -q -t -A -v ON_ERROR_STOP=1 -h $HostLocal -p 5432 -U postgres -d $Banco -c "select count(*) from public.condominios where id = '1ab00000-0000-4000-8000-000000000010';"
if ($LASTEXITCODE -ne 0) {
  throw 'Não foi possível conferir o laboratório.'
}
if ($preparado.Trim() -eq '0') {
  & $Psql -X -q -v ON_ERROR_STOP=1 -h $HostLocal -p 5432 -U postgres -d $Banco -f (Join-Path $PSScriptRoot 'preparar.sql')
  if ($LASTEXITCODE -ne 0) {
    throw 'A preparação do laboratório falhou e foi revertida.'
  }
}

$tsx = Join-Path $raiz 'node_modules\tsx\dist\cli.mjs'
& $Node $tsx (Join-Path $PSScriptRoot 'gravar-comprovante.ts')
if ($LASTEXITCODE -ne 0) {
  throw 'O comprovante fictício do laboratório não foi gravado.'
}

$servidor = Start-Process -FilePath $Node -ArgumentList 'scripts\laboratorio-link\servidor.mjs' -WorkingDirectory $raiz -PassThru -WindowStyle Hidden
$next = $null

try {
  $limite = (Get-Date).AddSeconds(15)
  $pronto = $false
  do {
    Start-Sleep -Milliseconds 300
    if ($servidor.HasExited) {
      throw 'O servidor local encerrou antes de escutar.'
    }
    try {
      $cliente = New-Object System.Net.Sockets.TcpClient
      $cliente.Connect($HostLocal, $PortaHttp)
      $cliente.Close()
      $pronto = $true
    } catch {
      $pronto = $false
    }
  } while (-not $pronto -and (Get-Date) -lt $limite)

  if (-not $pronto) {
    throw 'O servidor local não escutou em 127.0.0.1:54321.'
  }

  Write-Output "Laboratório pronto em http://${HostLocal}:$PortaNext"
  Write-Output 'Os tokens ficam em tmp/laboratorio-link.json e não são exibidos aqui.'
  Write-Output 'Encerre com Ctrl+C. Depois, se quiser apagar os dados fictícios, execute desfazer.sql e apague esse arquivo.'

  $next = Start-Process -FilePath $Node -ArgumentList @('node_modules\next\dist\bin\next', 'dev', '-H', $HostLocal, '-p', "$PortaNext") -WorkingDirectory $raiz -NoNewWindow -PassThru
  Wait-Process -Id $next.Id
} finally {
  foreach ($processo in @($next, $servidor)) {
    if ($processo -and -not $processo.HasExited) {
      Stop-Process -Id $processo.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
