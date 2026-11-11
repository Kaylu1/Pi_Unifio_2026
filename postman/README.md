# Testes da API no Postman

A coleção **projeto-integrador.postman_collection.json** é gerada depois de executar as requisições na fixture **MySQL oscar_test**. Cada exemplo salvo contém o status, cabeçalhos e corpo que a API local realmente devolveu.

1. Gere as evidências com **node scripts/postman-evidence.mjs**. O comando inicia uma fixture MySQL oscar_test, captura as respostas e a encerra. Ele não usa oscar_local.
2. Para ensaiar manualmente no Postman, deixe **node scripts/academic-fixture.mjs** em execução. A API de teste atende em **http://127.0.0.1:4302/api**.
3. No Postman, clique em **Import** e selecione a coleção JSON desta pasta.
4. Confira **Variables**: baseUrl, usuários de teste, senha e IDs têm valores incluídos no arquivo.
5. Execute as pastas em ordem. A primeira requisição prepara identificadores para o ensaio; as respostas de cadastro atualizam os IDs das próximas requisições.
6. Abra **Examples** para ver uma resposta capturada. Para renovar uma evidência manualmente, envie a requisição e use **Save Response → Save as example**.

A autenticação padrão é HTTP Basic com o gerente fictício. Os casos 401 e 403 alteram a autenticação apenas daquela requisição. A coleção não contém credencial de banco nem senha pessoal.

Os cenários criam e alteram dados de demonstração; use a fixture oscar_test. Cancelamentos e inativações preservam o histórico da oficina. Auditoria, mensagens e configurações são registros técnicos, sem exclusão livre.

O arquivo evidencias.json registra os status esperados e recebidos. A captura interrompe em qualquer falha e só produz a coleção completa quando todas as requisições passam.

Em 11/11/2026, a coleção foi reproduzida pelo Newman: 87 requisições e 87 verificações passaram. O resumo está em newman-result.json. A ferramenta foi usada na validação e não é uma dependência de execução do OScar.

Para repetir pelo runtime da coleção, mantenha a fixture aberta e execute:

~~~powershell
npm.cmd exec --yes --package=newman -- newman run postman/projeto-integrador.postman_collection.json --timeout-request 20000
~~~
