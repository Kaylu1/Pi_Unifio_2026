# Testes da API PostgreSQL no Postman

A coleção principal **projeto-integrador.postman_collection.json** contém exemplos de respostas reais da API TypeScript utilizando o adaptador PostgreSQL. A captura de **18/11/2026** foi realizada em **PGlite local**, com as migrações PostgreSQL do projeto e dados fictícios.

`postgres_test` é o nome lógico dessa fixture efêmera. Ela é criada na memória do processo e utiliza o esquema `oscar_private`; não acessa o banco Supabase remoto. Essas evidências verificam o adaptador PostgreSQL e os casos de uso da API. Uma execução local não comprova a configuração ou o funcionamento do deploy na Vercel.

## Gerar e apresentar as respostas

1. Gere a coleção com **`node scripts/postman-evidence.mjs --postgres`**. O comando inicia a fixture PostgreSQL, captura as respostas e a encerra ao terminar.
2. Para enviar requisições manualmente no Postman, deixe **`node scripts/academic-postgres-fixture.mjs`** em execução. A API de teste atende em **http://127.0.0.1:4302/api**. Não execute esse comando ao mesmo tempo que a captura automática.
3. No Postman, clique em **Import** e selecione a coleção JSON desta pasta.
4. Confira **Variables**: `baseUrl`, contas de teste, senha e IDs estão incluídos no arquivo exportado.
5. Execute as pastas em ordem. A primeira requisição prepara identificadores para o ensaio; as respostas dos cadastros atualizam os IDs das próximas requisições.
6. Abra **Examples** para examinar as respostas salvas. Para registrar uma nova resposta pelo aplicativo, envie a requisição e use **Save Response → Save as example**; exporte novamente a coleção com os valores das variáveis incluídos.

A autenticação padrão é **HTTP Basic**, com o gerente fictício. Os casos `401` e `403` alteram a autenticação apenas daquela requisição. As credenciais pertencem à fixture local; a coleção não contém senha do banco ou credencial pessoal.

Os cenários cadastram, atualizam e excluem dados demonstrativos. Use a fixture local preparada para esses testes. Cancelamentos, inativações e anonimização respeitam o histórico da oficina; auditoria, mensagens e configurações são registros técnicos.

## Evidências e reprodução

- **`evidencias.json`** identifica o adaptador PostgreSQL, o runtime PGlite, a data, os status esperados e os status recebidos.
- **`projeto-integrador.postman_collection.json`** inclui as requisições, variáveis, verificações e os exemplos capturados.
- **`newman-result.json`** registra a reprodução da coleção pelo runtime Postman/Newman em PostgreSQL local.

Em **18/11/2026**, foram capturadas **87 respostas** e a reprodução pelo Newman aprovou **87 requisições e 87 verificações**, sem falhas. O resumo também registra o hash SHA-256 da coleção verificada.

A captura interrompe em qualquer falha e só grava a coleção completa depois que todas as requisições passam. O uso manual de Save Response no aplicativo deve ser demonstrado pelo grupo; a captura automática e a execução pelo Newman não representam cliques manuais no Postman.

Com a fixture PostgreSQL aberta, a coleção pode ser reproduzida pelo Newman sem adicioná-lo às dependências do aplicativo:

~~~powershell
npm.cmd exec --yes --package=newman -- newman run postman/projeto-integrador.postman_collection.json --timeout-request 20000
~~~

## Histórico MySQL

A subpasta [mysql-2026-11-11](mysql-2026-11-11/README.md) preserva a coleção e os relatórios da validação anterior em MySQL. Eles permanecem identificados com o banco e a data de origem.

O comando de captura sem `--postgres` mantém o comportamento anterior e gera evidências em MySQL `oscar_test`. Para preparar novamente a coleção principal de PostgreSQL, utilize a opção `--postgres`.
