# install.ps1 -- put dsh-wenyan into a DeepSeek Harness desktop profile.
#
# Same three steps as the other hand-written plugins:
#   1. copy the source to <profile>\plugins\dsh-wenyan
#   2. overwrite-copy to <profile>\node_modules\dsh-wenyan (Node caches modules by
#      realpath, so the whole directory is replaced on every run)
#   3. append an `insert` block to cordis.patch.yml when it is not there yet
#
# ASCII only on purpose: Windows PowerShell 5.1 reads a .ps1 without a BOM as ANSI.
# Chinese notes belong in README.md.
#
# After installing, reload the page (Ctrl+R) -- a new Client package changes the boot
# graph. Changing index.js (the host half) additionally needs a DSH restart.

[CmdletBinding()]
param(
  [string]$Profile = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
)

$ErrorActionPreference = 'Stop'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$src = $PSScriptRoot
$pluginName = 'dsh-wenyan'
$destPlugins = Join-Path $Profile "plugins\$pluginName"
$destModules = Join-Path $Profile "node_modules\$pluginName"
$patchFile = Join-Path $Profile 'cordis.patch.yml'

if (-not (Test-Path $patchFile)) { throw "cannot find $patchFile -- wrong profile path?" }

function Sync-Dir([string]$from, [string]$to) {
  if (Test-Path $to) { Remove-Item -Recurse -Force $to }
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  Copy-Item (Join-Path $from 'index.js') $to -Force
  Copy-Item (Join-Path $from 'package.json') $to -Force
  foreach ($extra in @('README.md', 'LICENSE', 'test.mjs')) {
    $p = Join-Path $from $extra
    if (Test-Path $p) { Copy-Item $p $to -Force }
  }
  Copy-Item (Join-Path $from 'lib') (Join-Path $to 'lib') -Recurse -Force
}

Sync-Dir $src $destPlugins
Sync-Dir $src $destModules
Write-Host "copied  $destPlugins"
Write-Host "copied  $destModules"

$existing = [System.IO.File]::ReadAllText($patchFile, $Utf8NoBom)
if ($existing -match 'dsh-wenyan') {
  Write-Host "patch   already present, skipped"
} else {
  $block = @"

# --- wenyan (Classical Chinese mode) ------------------------------------------
# A switch, off by default. Turned on, replies and reasoning are written in
# Classical Chinese (three registers); code, paths, commands and
# error text are never translated. A small glyph sits at the top-right corner and
# a wenyan page appears in the right sidebar so it can be turned off at any moment.
# Source and notes: plugins/dsh-wenyan/README.md
# Uninstall: delete this insert block and reload the client.
- insert:
    - id: wenyan
      name: 'dsh-wenyan'
      config:
        order: 88
"@
  $bytes = [System.IO.File]::ReadAllBytes($patchFile)
  if ($bytes.Length -gt 0 -and $bytes[$bytes.Length - 1] -ne 10) {
    $block = "`n" + $block
  }
  $append = $Utf8NoBom.GetBytes($block)
  $out = New-Object byte[] ($bytes.Length + $append.Length)
  [Array]::Copy($bytes, 0, $out, 0, $bytes.Length)
  [Array]::Copy($append, 0, $out, $bytes.Length, $append.Length)
  [System.IO.File]::WriteAllBytes($patchFile, $out)
  Write-Host "patch   appended to $patchFile"
}

Write-Host ''
Write-Host 'Reload the page now (Ctrl+R). The wenyan glyph appears at the top-right corner.' -ForegroundColor Green
