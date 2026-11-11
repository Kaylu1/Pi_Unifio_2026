# Validação local da atividade

Execução local em **11/11/2026**, usando MySQL Community 8.4 na fixture **oscar_test**. A API de teste respondeu em **http://127.0.0.1:4302/api**. O banco oscar_local não foi usado na captura.

| Conferência | Resultado |
|---|---|
| Requisições capturadas da API | 87 |
| Exemplos salvos na coleção | 87 |
| Variáveis incluídas com valor | 28, nenhuma vazia |
| Reprodução pelo Newman | 87 requisições, nenhuma falha |
| Verificações da coleção | 87 aprovadas |
| Códigos de erro demonstrados | 400, 401, 403, 404 e 409 |

A captura exercitou o CRUD das doze entidades, duas consultas personalizadas, conflito de agenda, aprovação de orçamento, impedimento de estoque negativo, execução de serviços e peças, encerramento da O.S. e chamado de pós-venda. Cancelamentos e inativações preservaram o histórico, conforme as regras da oficina.

Os arquivos verificáveis estão em:

- [Coleção com exemplos reais](../postman/projeto-integrador.postman_collection.json)
- [Status esperado e recebido de cada requisição](../postman/evidencias.json)
- [Resumo da execução Newman](../postman/newman-result.json)
- [Executor de captura](../scripts/postman-evidence.mjs)

O comando usado foi:

~~~powershell
node scripts/postman-evidence.mjs --verify-postman
~~~

A execução registrada usa o Newman, que interpreta a coleção Postman. Não representa cliques manuais no aplicativo. Para demonstrar ao professor, importe a coleção no Postman, abra os Examples e envie as requisições desejadas na fixture local. O aplicativo também permite salvar novas respostas por **Save Response → Save as example**.

O Newman foi instalado temporariamente para essa conferência e retirado das dependências do aplicativo depois. Para gerar apenas a coleção, use o comando sem a opção --verify-postman. Para repetir pelo Newman sem adicionar dependência ao OScar, siga o comando npm exec em [postman/README.md](../postman/README.md).

## Aplicação e banco

| Comando ou fluxo | Resultado em 11/11/2026 |
|---|---|
| npm.cmd run typecheck | TypeScript em modo strict, sem erros |
| npm.cmd test | 148 testes aprovados, nenhuma falha |
| npm.cmd run test:mysql | 10 testes aprovados em MySQL Community 8.4.13 real |
| Navegador com MySQL — flow, request, access, features e model | Cinco suítes aprovadas |
| npm.cmd run build | Angular compilado e verificação de CSP aprovada |
| npm.cmd audit --omit=dev | Nenhuma vulnerabilidade reportada nas dependências de execução |
| npm.cmd start e npm.cmd run api | Health HTTP 200 com database: mysql |

Os testes de MySQL verificam FKs, rollback, duas reservas concorrentes do mesmo mecânico, CRUD, entrada/saída/estorno de peças, consultas e relatórios, pedido do catálogo com cadastro provisório, anonimização e snapshots. Também cobrem o nome de fornecedor com 160 caracteres e a borda exata da janela de consumo, para o painel e a consulta SQL calcularem o mesmo mínimo de estoque.

No navegador, o caminho foi Angular → API TypeScript → MySQL oscar_test. Foram verificados cadastro e edição, disponibilidade/remarcação, estoque e estorno, catálogo e confirmação do pedido, orçamento, aprovação pública, conclusão, garantia, permissões, logout e navegação em telas pequenas. O banco principal oscar_local não foi usado por essas suítes.

O build ainda emite um aviso de tamanho: pacote inicial de aproximadamente 1,47 MB frente ao limite de aviso de 1,30 MB. A compilação passa. O audit completo mantém 16 avisos moderados em dependências de desenvolvimento da CLI do Angular; a correção automática oferecida exige troca de versão principal da CLI. As dependências de execução não apresentaram avisos na consulta registrada.
