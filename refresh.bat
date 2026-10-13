@echo off
REM ---------------------------------------------------------------
REM  WebStreamETDS - full refresh
REM  Pulls new raw events from EC2, rebuilds the lake, publishes gold.
REM  Machine-specific values live in config.bat (not tracked by git).
REM ---------------------------------------------------------------
setlocal

if not exist "%~dp0config.bat" (
  echo.
  echo *** config.bat not found.
  echo *** Copy config.example.bat to config.bat and fill in your own paths.
  echo.
  goto end
)
call "%~dp0config.bat"

echo [1/4] Pulling bronze from EC2...
if not exist "%LOCAL%\data\bronze" mkdir "%LOCAL%\data\bronze"
scp -i "%KEY%" -r ec2-user@%EC2IP%:~/%EC2PROJ%/data/bronze/* "%LOCAL%\data\bronze"
if errorlevel 1 goto fail

echo [2/4] Ingesting new files into the lake...
cd /d %LOCAL%
docker compose run --rm spark jobs/bronze.py
if errorlevel 1 goto fail

echo [3/4] Running silver then gold...
docker compose run --rm spark jobs/silver.py
if errorlevel 1 goto fail
docker compose run --rm spark jobs/gold.py
if errorlevel 1 goto fail

echo [4/4] Publishing gold to %GOLD% ...
if not exist "%GOLD%" mkdir "%GOLD%"
copy /Y "%LOCAL%\data\gold\*.parquet" "%GOLD%"
if errorlevel 1 goto fail

echo.
echo DONE - hit Refresh in Power BI
goto end

:fail
echo.
echo *** FAILED at the step above. Nothing after it ran. ***

:end
endlocal
pause
