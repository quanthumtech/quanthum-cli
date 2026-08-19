#!/usr/bin/env pwsh
# Instalador nativo do quanthum-cli para PowerShell (Windows) — mesmo resultado do
# install.sh (clona, builda, linka `quanthum`/`quanthum-aquiles`), mas sem depender
# de bash/WSL. Uso:
#
#   irm https://raw.githubusercontent.com/quanthumtech/quanthum-cli/master/install.ps1 | iex
#
# Por que não só "bash -c '... | bash'" no PowerShell: esse comando só funciona se
# o "bash" que resolve no PATH for o do Git for Windows. Em muitas instalações
# Windows existe também um "bash.exe" legado em C:\Windows\System32 (do recurso
# opcional "Windows Subsystem for Linux") que é só um relay pra dentro de uma
# distro WSL — se esse "bash" vier primeiro no PATH (comum) e não houver
# nenhuma distro WSL instalada/registrada, o relay falha com um erro tipo
# "WSL ... ERROR: CreateProcessCommon:735: execvpe(/bin/bash) failed: No such
# file or directory", que não tem nada a ver com o quanthum-cli em si. Este
# script evita esse problema inteiro rodando tudo nativamente em PowerShell.

$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/quanthumtech/quanthum-cli.git'
$Dest = Join-Path $HOME '.quanthum-cli'

function Test-CommandAvailable {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)] [string]$Exe,
        [Parameter(Mandatory)] [string[]]$Arguments
    )
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "`"$Exe $($Arguments -join ' ')`" falhou (exit code $LASTEXITCODE)"
    }
}

if (-not (Test-CommandAvailable 'git')) {
    Write-Error "git não encontrado no PATH. Instale o Git for Windows: https://git-scm.com/download/win"
    exit 1
}
if (-not (Test-CommandAvailable 'node')) {
    Write-Error "node não encontrado no PATH. Instale o Node 20+: https://nodejs.org"
    exit 1
}
if (-not (Test-CommandAvailable 'npm')) {
    Write-Error "npm não encontrado no PATH (vem junto com o Node) — reinstale o Node 20+."
    exit 1
}

if (Test-Path (Join-Path $Dest '.git')) {
    Write-Host "-> atualizando $Dest..."
    Invoke-Native git @('-C', $Dest, 'pull', '--ff-only')
} else {
    Write-Host "-> clonando em $Dest..."
    Invoke-Native git @('clone', $Repo, $Dest)
}

Push-Location $Dest
try {
    Write-Host "-> instalando dependências..."
    Invoke-Native npm @('install')

    Write-Host "-> buildando..."
    Invoke-Native npm @('run', 'build')

    Write-Host "-> linkando os comandos quanthum e quanthum-aquiles..."
    Push-Location (Join-Path $Dest 'packages/cli')
    try { Invoke-Native npm @('link') } finally { Pop-Location }

    Push-Location (Join-Path $Dest 'packages/create-aquiles')
    try { Invoke-Native npm @('link') } finally { Pop-Location }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host 'OK pronto - roda "quanthum-aquiles minha-app --frontend=react --registry" pra comecar.' -ForegroundColor Green
Write-Host ""
Write-Host "Se 'quanthum' ou 'quanthum-aquiles' nao forem reconhecidos depois disso: " -ForegroundColor Yellow
Write-Host "1. o 'npm link' pode ter falhado por falta de permissao pra criar symlink -" -ForegroundColor Yellow
Write-Host "   ative o Modo de Desenvolvedor do Windows (Configuracoes > Sistema >" -ForegroundColor Yellow
Write-Host "   Para desenvolvedores) ou rode este script uma vez como Administrador; ou" -ForegroundColor Yellow
Write-Host "2. o diretorio global do npm nao esta no PATH - rode 'npm config get prefix'" -ForegroundColor Yellow
Write-Host "   e garanta que esse caminho esta no PATH do usuario." -ForegroundColor Yellow
