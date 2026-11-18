# Evidências históricas — MySQL, 11/11/2026

Esta pasta preserva a coleção e os registros da conferência anterior em MySQL local. São 87 respostas capturadas da API e uma reprodução pelo Newman, datadas de 11/11/2026.

A coleção principal, no diretório `postman/`, utiliza o adaptador PostgreSQL da aplicação em uma fixture local PGlite. Esses conjuntos de evidências representam bancos e execuções distintos.

Para reproduzir o conjunto MySQL, utilize `node scripts/academic-fixture.mjs` e importe a coleção desta subpasta. Os registros são fictícios e o banco de teste é `oscar_test`; não use o banco principal da oficina.
