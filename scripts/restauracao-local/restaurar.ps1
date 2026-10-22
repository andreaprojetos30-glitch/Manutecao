# Restaura o backup do ELEVA Manutenção somente no PostgreSQL local.
# Não aplica migrations e não guarda senha.
# Uso: .\scripts\restauracao-local\restaurar.ps1 -Etapa preparar

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('preparar', 'estrutura', 'dados', 'completar', 'conferir')]
  [string]$Etapa
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$PgHost = '127.0.0.1'
$PgPort = '5432'
$PgDatabase = 'eleva_manutencao_teste'
$PgUser = 'postgres'
$Dump = 'C:\Users\Andrea\Backups\ELEVA-Manutencao\backup_antes_atualizacoes.dump'
$PgBin = 'C:\Program Files\PostgreSQL\17\bin'
$Psql = Join-Path $PgBin 'psql.exe'
$PgRestore = Join-Path $PgBin 'pg_restore.exe'

if ($PgHost -ne '127.0.0.1' -or $PgPort -ne '5432' -or $PgDatabase -ne 'eleva_manutencao_teste') {
  throw 'Destino recusado. O único banco permitido é 127.0.0.1:5432/eleva_manutencao_teste.'
}

foreach ($programa in @($Psql, $PgRestore)) {
  if (-not (Test-Path -LiteralPath $programa)) {
    throw "Programa não encontrado: $programa"
  }
}

if (-not (Test-Path -LiteralPath $Dump)) {
  throw "Backup não encontrado: $Dump"
}

$env:PGHOST = $PgHost
$env:PGPORT = $PgPort
$env:PGDATABASE = $PgDatabase
$env:PGUSER = $PgUser
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGPASSFILE -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue

$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$conexao = @(
  '-h', $PgHost,
  '-p', $PgPort,
  '-U', $PgUser,
  '-d', $PgDatabase
)

function Invoke-PsqlFile {
  param([string]$Arquivo)
  & $Psql @conexao -v ON_ERROR_STOP=1 -f $Arquivo
  if ($LASTEXITCODE -ne 0) {
    throw "psql falhou ao executar $Arquivo"
  }
}

function Invoke-PsqlEscalar {
  param([string]$Sql)
  $saida = & $Psql @conexao -v ON_ERROR_STOP=1 -At -c $Sql
  if ($LASTEXITCODE -ne 0) {
    throw 'psql não conseguiu consultar o banco local.'
  }
  return ($saida | Select-Object -Last 1).Trim()
}

switch ($Etapa) {
  'preparar' {
    Invoke-PsqlFile (Join-Path $aqui 'preparar.sql')
  }
  'estrutura' {
    $tabelas = Invoke-PsqlEscalar "select count(*) from pg_tables where schemaname = 'public'"
    if ($tabelas -ne '0') {
      throw 'O esquema public já tem tabelas. Estrutura não restaurada.'
    }

    $lista = Join-Path $env:TEMP 'eleva-manutencao-teste-restore.list'
    $bruto = & $PgRestore -l $Dump
    if ($LASTEXITCODE -ne 0) {
      throw 'Não foi possível ler o índice do backup.'
    }

    $linhas = foreach ($linha in $bruto) {
      if ($linha -match '^\d+; \d+ \d+ SCHEMA - public ') {
        ';' + $linha
      } else {
        $linha
      }
    }

    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($lista, $linhas, $utf8)

    & $PgRestore @conexao --schema-only --no-owner --single-transaction --exit-on-error -L $lista $Dump
    if ($LASTEXITCODE -ne 0) {
      throw 'A restauração da estrutura falhou. Nenhum dado foi carregado.'
    }
  }
  'dados' {
    $usuarios = Invoke-PsqlEscalar "select case when to_regclass('public.usuarios') is null then 'ausente' else (select count(*)::text from public.usuarios) end"
    if ($usuarios -eq 'ausente') {
      throw 'A estrutura ainda não foi restaurada.'
    }
    if ($usuarios -ne '0') {
      throw 'public.usuarios já tem linhas. A carga dos dados foi cancelada.'
    }

    & $PgRestore @conexao --data-only --disable-triggers --single-transaction --exit-on-error $Dump
    if ($LASTEXITCODE -ne 0) {
      throw 'A carga dos dados falhou.'
    }
  }
  'completar' {
    Invoke-PsqlFile (Join-Path $aqui 'completar-auth.sql')
  }
  'conferir' {
    Invoke-PsqlFile (Join-Path $aqui 'conferir.sql')
  }
}
