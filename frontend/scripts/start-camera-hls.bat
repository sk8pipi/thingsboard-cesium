@echo off
setlocal

REM Config: edit these values before first use.
set "CAMERA_USER=admin"
set "CAMERA_PASSWORD=NYAEPS"
set "CAMERA_IP=192.168.31.100"
set "CAMERA_PORT=554"
set "CAMERA_RTSP_PATH=/ch1/main"
set "CAMERA_ID=camera-001"

REM If ffmpeg is not in PATH, replace this with the full exe path.
set "FFMPEG_EXE=ffmpeg"

REM Output folder for HLS files.
set "STREAM_ROOT=%USERPROFILE%\camera-streams"
set "HLS_OUTPUT_DIR=%STREAM_ROOT%\live\%CAMERA_ID%"

REM Local static server port. Keep this aligned with vite.config.ts proxy target.
set "HLS_HTTP_PORT=8081"

REM http-server is started through npx. Make sure Node.js is installed.
set "NPX_EXE="

cd /d "%~dp0"

for /f "delims=" %%I in ('where npx.cmd 2^>nul') do if not defined NPX_EXE set "NPX_EXE=%%I"

if not defined NPX_EXE (
  echo.
  echo Error: npx.cmd was not found in PATH.
  echo Please install Node.js, or set NPX_EXE to the full path manually.
  echo.
  pause
  exit /b 1
)

if not exist "%STREAM_ROOT%" mkdir "%STREAM_ROOT%"
if not exist "%STREAM_ROOT%\live" mkdir "%STREAM_ROOT%\live"
if not exist "%HLS_OUTPUT_DIR%" mkdir "%HLS_OUTPUT_DIR%"

echo.
echo Starting FFmpeg RTSP to HLS...
start "Camera HLS - FFmpeg" /D "%STREAM_ROOT%" cmd /k ""%FFMPEG_EXE%" -rtsp_transport tcp -i "rtsp://%CAMERA_USER%:%CAMERA_PASSWORD%@%CAMERA_IP%:%CAMERA_PORT%%CAMERA_RTSP_PATH%" -an -c:v copy -fflags nobuffer -flags low_delay -hls_time 1 -hls_list_size 3 -hls_flags delete_segments+append_list+omit_endlist+program_date_time -hls_segment_filename "%HLS_OUTPUT_DIR%\seg_%%03d.ts" "%HLS_OUTPUT_DIR%\index.m3u8""

echo Starting static HLS server...
start "Camera HLS - HTTP" /D "%STREAM_ROOT%" cmd /k ""%NPX_EXE%" http-server "%STREAM_ROOT%" -p %HLS_HTTP_PORT% -c-1 --cors"

echo.
echo RTSP source:
echo rtsp://%CAMERA_USER%:******@%CAMERA_IP%:%CAMERA_PORT%%CAMERA_RTSP_PATH%
echo.
echo HLS output:
echo %HLS_OUTPUT_DIR%
echo.
echo Browser test URL:
echo http://127.0.0.1:%HLS_HTTP_PORT%/live/%CAMERA_ID%/index.m3u8
echo.
echo Frontend URL:
echo /live/%CAMERA_ID%/index.m3u8
echo.
echo If playback fails, check:
echo 1. VLC can play the RTSP source.
echo 2. ffmpeg is installed.
echo 3. npx can install and run http-server.
echo 4. If FFmpeg shows 401 Unauthorized, check CAMERA_USER, CAMERA_PASSWORD and CAMERA_RTSP_PATH.
echo.
pause
