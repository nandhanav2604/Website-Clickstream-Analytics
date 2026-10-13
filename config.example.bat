@echo off
REM ---------------------------------------------------------------
REM  Copy this file to config.bat and fill in your own values.
REM  config.bat is gitignored - it never leaves your machine.
REM ---------------------------------------------------------------

REM Public IP of the EC2 instance. Changes every stop/start
REM unless an Elastic IP is attached.
set EC2IP=0.0.0.0

REM Project folder name in the EC2 user's home directory.
set EC2PROJ=webstream

REM Full path to your SSH private key. No quotes, no trailing backslash.
set KEY=C:\Users\YourName\Downloads\webstream-key.pem

REM Where this project is checked out on your machine.
set LOCAL=C:\WebStreamETDS

REM Folder Power BI reads the published gold tables from.
set GOLD=C:\gold
