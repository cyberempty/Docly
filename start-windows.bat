@echo off
setlocal
title Docly
cd /d "%~dp0"

rem ---- Engine (Electron) used by Docly. To change it: delete runtime\win and edit these two lines. ----
set "EV=45.2.3"
set "ESHA=489cd061908e697394b004298bf5ffd345c935d10e8ca197ba819f019ab2dec0"
set "RT=%~dp0runtime\win"

if exist "%RT%\Docly.exe" goto run

echo.
echo  Docly - first start: downloading the app engine (Electron %EV%).
echo  This happens only once; afterwards Docly starts in a second and works offline.
echo.
set "SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$l = Get-Content -LiteralPath $env:SELF | Where-Object { $_ -like '::PS *' } | ForEach-Object { $_.Substring(5) }; Invoke-Expression ($l -join [Environment]::NewLine)"
if errorlevel 1 (
  echo.
  echo  Could not prepare the engine. Check your Internet connection and try again.
  echo  Offline? Copy a ready-made runtime\win folder from another Docly folder into runtime\.
  echo.
  pause
  exit /b 1
)

:run
start "" "%RT%\Docly.exe" "%~dp0."
exit /b 0

::PS $ErrorActionPreference = 'Stop'
::PS [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
::PS $ver = $env:EV; $sha = $env:ESHA.ToLower(); $dest = $env:RT
::PS $url = "https://github.com/electron/electron/releases/download/v$ver/electron-v$ver-win32-x64.zip"
::PS $tmp = Join-Path $env:TEMP "docly-electron-$ver.zip"
::PS try {
::PS   $resp = [Net.HttpWebRequest]::Create($url).GetResponse()
::PS   $total = $resp.ContentLength
::PS   $in = $resp.GetResponseStream(); $out = [IO.File]::Create($tmp)
::PS   $buf = New-Object byte[] 262144; $got = 0; $last = -1
::PS   while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
::PS     $out.Write($buf, 0, $n); $got += $n
::PS     if ($total -gt 0) { $p = [int](100 * $got / $total); if ($p -ne $last) { $last = $p; Write-Host -NoNewline ("`r  Downloading... $p%   ") } }
::PS   }
::PS   $out.Close(); $in.Close(); $resp.Close(); Write-Host ''
::PS   Write-Host -NoNewline '  Verifying... '
::PS   $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmp).Hash.ToLower()
::PS   if ($h -ne $sha) { throw "SHA-256 does not match (got $h)" }
::PS   Write-Host 'OK'
::PS   Add-Type -AssemblyName System.IO.Compression.FileSystem
::PS   if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
::PS   New-Item -ItemType Directory -Force -Path $dest | Out-Null
::PS   $root = [IO.Path]::GetFullPath($dest).TrimEnd('\') + '\'
::PS   $zip = [IO.Compression.ZipFile]::OpenRead($tmp)
::PS   $count = $zip.Entries.Count; $i = 0; $last = -1
::PS   foreach ($e in $zip.Entries) {
::PS     $i++
::PS     $target = [IO.Path]::GetFullPath((Join-Path $dest $e.FullName))
::PS     if ($target.StartsWith($root)) {
::PS       if ($e.FullName.EndsWith('/')) { New-Item -ItemType Directory -Force -Path $target | Out-Null }
::PS       else { New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null; [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $target, $true) }
::PS     }
::PS     $p = [int](100 * $i / $count); if ($p -ne $last) { $last = $p; Write-Host -NoNewline ("`r  Extracting... $p%   ") }
::PS   }
::PS   $zip.Dispose(); Write-Host ''
::PS   Rename-Item -LiteralPath (Join-Path $dest 'electron.exe') -NewName 'Docly.exe'
::PS   Write-Host '  Done.'
::PS } catch {
::PS   Write-Host ''; Write-Host ("  Error: " + $_.Exception.Message)
::PS   if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
::PS   exit 1
::PS } finally {
::PS   Remove-Item $tmp -Force -ErrorAction SilentlyContinue
::PS }
