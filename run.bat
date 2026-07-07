@echo off
rem Los Perrones - compilar y ejecutar
cd /d %~dp0
if not exist out mkdir out
javac -d out src\*.java
java -cp out Server
