# Aplica somente a adequação de visitas anteriores no PostgreSQL local de teste.
# Não guarda senha, não cria visitas e não acessa produção.

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$PgHost = '127.0.0.1'
$PgPort = '5432'
$PgDatabase = 'eleva_manutencao_teste'
$PgUser = 'postgres'
$Psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$Migration = 'supabase\migrations\20261017120000_visitas_anteriores.sql'

if ($PgHost -ne '127.0.0.1' -or $PgPort -ne '5432' -or $PgDatabase -ne 'eleva_manutencao_teste') {
  throw 'Destino recusado. O único banco permitido é 127.0.0.1:5432/eleva_manutencao_teste.'
}

if (-not (Test-Path -LiteralPath $Psql)) {
  throw "Programa não encontrado: $Psql"
}

$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$arquivoMigration = Join-Path $raiz $Migration
if (-not (Test-Path -LiteralPath $arquivoMigration)) {
  throw "Migration não encontrada: $arquivoMigration"
}

$env:PGHOST = $PgHost
$env:PGPORT = $PgPort
$env:PGDATABASE = $PgDatabase
$env:PGUSER = $PgUser
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGPASSFILE -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue

$aplicar = Join-Path $PSScriptRoot 'aplicar-visitas-anteriores.sql'
& $Psql -X -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase -v ON_ERROR_STOP=1 -f $aplicar
if ($LASTEXITCODE -ne 0) {
  throw 'A adequação de visitas anteriores falhou. A transação foi revertida e o banco local permanece como estava.'
}
