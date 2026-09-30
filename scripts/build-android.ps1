param([ValidateSet('Debug', 'Release', 'Preview')][string]$Variant = 'Debug')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
# A portable JDK was used during development. Other machines can set JAVA_HOME.
if (-not $env:JAVA_HOME) {
    $portableJdk = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools/jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($portableJdk) { $env:JAVA_HOME = $portableJdk.FullName }
}
if (-not $env:JAVA_HOME) { throw 'Configura JAVA_HOME con JDK 17 y Android SDK 36 en android/local.properties.' }
if ($Variant -ne 'Debug') {
    $privateDirectory = Join-Path $env:LOCALAPPDATA 'Picks777/signing'
    $credentialsFile = Join-Path $privateDirectory 'upload-credentials.json'
    if (-not (Test-Path -LiteralPath $credentialsFile)) { throw 'No hay una clave de subida preparada. Consulta ANDROID-RELEASE.md.' }
    $signing = Get-Content -Raw -LiteralPath $credentialsFile | ConvertFrom-Json
    $env:PICKS_KEYSTORE = $signing.keystore
    $env:PICKS_STORE_PASSWORD = $signing.storePassword
    $env:PICKS_KEY_ALIAS = $signing.alias
    $env:PICKS_KEY_PASSWORD = $signing.keyPassword
}
try {
    & node scripts/mobile-config.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Configuración móvil inválida.' }
    $task = if ($Variant -eq 'Release') { 'bundleRelease' } elseif ($Variant -eq 'Preview') { 'assembleRelease' } else { 'assembleDebug' }
    & ./android/gradlew.bat -p android $task --max-workers=2 --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación Android.' }
    if ($Variant -eq 'Release') {
        New-Item -ItemType Directory -Path 'artifacts/android' -Force | Out-Null
        Copy-Item -LiteralPath 'android/app/build/outputs/bundle/release/app-release.aab' -Destination 'artifacts/android/picks777-release.aab' -Force
    }
    if ($Variant -eq 'Preview') {
        & node scripts/package-android-preview.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Falló el empaquetado del APK.' }
    }
} finally {
    if ($Variant -ne 'Debug') {
        Remove-Item Env:PICKS_KEYSTORE,Env:PICKS_STORE_PASSWORD,Env:PICKS_KEY_ALIAS,Env:PICKS_KEY_PASSWORD -ErrorAction SilentlyContinue
    }
}
