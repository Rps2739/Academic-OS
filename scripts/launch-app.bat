@echo off
REM Desktop-shortcut launcher for Academic OS (dev mode). Not part of the
REM build — just a convenience so starting the app doesn't require opening
REM a terminal and remembering the pnpm command. Sets up PATH exactly like
REM every manual launch this session needed (cargo isn't on PATH by
REM default in a plain shell on this machine).
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cd /d "C:\Users\rpran\Apps\Event Planner"
pnpm --filter desktop tauri dev
