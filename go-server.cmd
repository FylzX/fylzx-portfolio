@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.18 或更新版本。
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo 正在安装项目依赖...
  call npm.cmd ci
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络。
    pause
    exit /b 1
  )
)
echo 正在准备照片并启动服务器，请稍候...
echo 地址请看下方 Local 一行，默认 http://127.0.0.1:5173/
echo 保持此窗口开启；按 Ctrl+C 停止服务。
call npm.cmd run dev
if errorlevel 1 pause
endlocal
