@echo off
setlocal

set "FFMPEG_WINDOW_TITLE=Camera HLS - FFmpeg"
set "HTTP_WINDOW_TITLE=Camera HLS - HTTP"

echo Stopping FFmpeg HLS process...
taskkill /FI "WINDOWTITLE eq %FFMPEG_WINDOW_TITLE%" /T /F >nul 2>&1
if errorlevel 1 (
  echo FFmpeg window not found, or it is already closed.
) else (
  echo FFmpeg process stopped.
)

echo Stopping static HLS server...
taskkill /FI "WINDOWTITLE eq %HTTP_WINDOW_TITLE%" /T /F >nul 2>&1
if errorlevel 1 (
  echo HTTP server window not found, or it is already closed.
) else (
  echo HTTP server stopped.
)

echo.
echo Done.
pause

