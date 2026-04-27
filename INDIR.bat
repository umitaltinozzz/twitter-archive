@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM --- Hangi liste dosyasi kullanilacak? ---
REM   1) Suruklene bir dosya varsa onu kullan (drag&drop)
REM   2) Yoksa liste.txt varsa onu kullan
REM   3) Yoksa liste2.txt varsa onu kullan
REM   4) Hicbiri yoksa hata ver
if not "%~1"=="" (
    set "LIST=%~nx1"
) else if exist "liste.txt" (
    set "LIST=liste.txt"
) else if exist "liste2.txt" (
    set "LIST=liste2.txt"
) else (
    set "LIST="
)

set "LIST_BASE=%~n1"
if "%LIST_BASE%"=="" for %%F in ("!LIST!") do set "LIST_BASE=%%~nF"
set "KALAN=kalan_%LIST_BASE%.txt"
set "LOG=aria2_%LIST_BASE%.log"

echo ============================================================
echo  Twitter Medya Toplu Indirici
echo  Klasor: %cd%
echo  Liste:  %LIST%
echo ============================================================
echo.

if "%LIST%"=="" (
    echo [HATA] Liste dosyasi bulunamadi.
    echo   - Bu klasore liste.txt veya liste2.txt koy
    echo   - VEYA listeyi bu .bat'in uzerine suruklerken birak
    echo.
    pause
    exit /b 1
)

if not exist "%LIST%" (
    echo [HATA] %LIST% bulunamadi.
    echo.
    pause
    exit /b 1
)

REM --- aria2c.exe yoksa otomatik indir ve kur ---
if not exist "aria2c.exe" (
    echo [1/3] aria2c.exe bulunamadi, GitHub'dan indiriliyor...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "$ProgressPreference = 'SilentlyContinue';" ^
        "$root = (Get-Location).Path;" ^
        "$url = 'https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip';" ^
        "$zip = Join-Path $root 'aria2.zip';" ^
        "$tmp = Join-Path $root '_aria2_tmp';" ^
        "Write-Host '  - ZIP indiriliyor...';" ^
        "Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing;" ^
        "Write-Host '  - ZIP aciliyor...';" ^
        "if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }" ^
        "Expand-Archive -Path $zip -DestinationPath $tmp -Force;" ^
        "$exe = Get-ChildItem -Path $tmp -Recurse -Filter 'aria2c.exe' | Select-Object -First 1;" ^
        "if ($null -eq $exe) { Write-Host '[HATA] aria2c.exe ZIP icinde bulunamadi.'; exit 1 }" ^
        "Copy-Item -Path $exe.FullName -Destination (Join-Path $root 'aria2c.exe') -Force;" ^
        "Remove-Item $tmp -Recurse -Force;" ^
        "Remove-Item $zip -Force;" ^
        "Write-Host '  - Tamam: aria2c.exe hazir.'"

    if errorlevel 1 (
        echo.
        echo [HATA] aria2 indirilemedi. Internet baglantini kontrol et veya
        echo aria2c.exe dosyasini manuel olarak bu klasore koyup tekrar calistir.
        echo.
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/3] aria2c.exe zaten mevcut, atlandi.
    echo.
)

REM --- Liste satir sayisini al ---
set "COUNT=0"
for /f "usebackq tokens=*" %%A in ("%LIST%") do (
    set /a COUNT+=1
)
set /a URL_COUNT=COUNT/2

echo [2/3] Indirme basliyor.
echo   - Liste: %LIST% ^(yaklasik %URL_COUNT% dosya^)
echo   - Paralel dosya sayisi: 16
echo   - Her dosya icin 4 baglanti
echo   - Mevcut dosyalar atlanir ^(tekrar calistirmak guvenli^)
echo.

REM --- Indirmeyi calistir ---
aria2c.exe ^
    -i "%LIST%" ^
    --dir="%cd%" ^
    -j 16 ^
    -x 4 ^
    -s 4 ^
    -k 1M ^
    --continue=true ^
    --auto-file-renaming=false ^
    --allow-overwrite=false ^
    --conditional-get=true ^
    --max-tries=5 ^
    --retry-wait=3 ^
    --timeout=30 ^
    --connect-timeout=20 ^
    --console-log-level=warn ^
    --summary-interval=20 ^
    --download-result=full ^
    --save-session="%KALAN%" ^
    --save-session-interval=30 ^
    --log-level=error ^
    --log="%LOG%" ^
    --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

set "ARIA_EXIT=%errorlevel%"
echo.
echo ============================================================
echo [3/3] Ozet
echo ============================================================

REM --- Indirilmis dosya sayisini say (jpg/png/mp4/gif) ---
set "DL_COUNT=0"
for %%E in (jpg jpeg png mp4 gif webp) do (
    for %%F in (*.%%E) do set /a DL_COUNT+=1
)
echo  Klasorde toplam medya dosyasi: !DL_COUNT!
echo  aria2 cikis kodu: %ARIA_EXIT%  ^(0 = hepsi basarili^)

if exist "%KALAN%" (
    for /f %%A in ('find /c /v "" ^< "%KALAN%"') do set "REMAIN=%%A"
    if !REMAIN! GTR 0 (
        echo.
        echo  UYARI: !REMAIN! satir indirilemedi, %KALAN% dosyasina yazildi.
        echo  Tekrar denemek icin bu .bat'i tekrar calistir ^(veya:
        echo     aria2c.exe -i "%KALAN%" -c -j 16^)
    ) else (
        del "%KALAN%" 2>nul
        echo  Tum dosyalar basariyla indirildi.
    )
)

echo.
echo  Detayli log: %LOG%
echo ============================================================
echo.
pause
endlocal
