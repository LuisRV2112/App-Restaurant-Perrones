#!/bin/bash
# Los Perrones - compilar y ejecutar
cd "$(dirname "$0")"
mkdir -p out
javac -d out src/*.java && java -cp out Server
