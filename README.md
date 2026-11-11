# OScar — gestão de oficinas

O OScar reúne cadastro de clientes e veículos, agenda, ordens de serviço, inspeção, orçamento, peças e pós-venda. O atendimento começa com uma solicitação ou chegada à oficina e segue até a entrega do veículo.

Esta versão é a adaptação local para a atividade de backend do Projeto Integrador. Conforme autorização do professor informada pelo grupo, Node.js e TypeScript substituem Spring Boot e JPA. Permanecem os requisitos de banco MySQL, modelagem, camadas, segurança, regras de negócio, testes e documentação.

## Integrantes

| Nome completo | RA |
|---|---|
| Caio Eduardo Sapata Bruno | 270667 |
| Gabriel Claudino Martins Silva | 272425 |
| João Lucas Terçariol | 270959 |
| Luis Felipi Ferreira | 273194 |
| Lucas Henrique Benitez de Moraes | 272807 |

## Executar nesta máquina

Requer Node.js 24. O MySQL Community 8.4 é executado localmente em 127.0.0.1:3307, com dados próprios deste projeto.

~~~powershell
cd C:\Users\Kaylu\Desktop\p.i\oscar
npm.cmd install
node scripts/mysql-local.mjs setup
npm.cmd start
~~~

O preparo do MySQL é necessário apenas na primeira execução. O comando npm start inicia o MySQL local, a API e o Angular. Abra **https://localhost:4201**; a API atende em **https://127.0.0.1:4301/api**. O certificado de desenvolvimento é local e pode exigir confirmação no primeiro acesso.

Para conferir o banco:

~~~powershell
node scripts/mysql-local.mjs status
~~~

Os dados da oficina ficam no schema **oscar_local**. Testes e evidências usam **oscar_test**. A configuração e os arquivos do servidor MySQL ficam em data/mysql-local; as senhas do banco permanecem nessa pasta local e não entram na coleção Postman.

A execução é limitada ao computador. As instruções antigas de Supabase e Vercel em docs são histórico de outra etapa e não são necessárias para esta entrega.

## Contas fictícias

As contas de demonstração inicial usam a senha **Oscar@2026!**. São contas de teste.

| Perfil | E-mail |
|---|---|
| Gerente | gerente@oscar.local |
| Atendente | atendente@oscar.local |
| Mecânico | mecanico@oscar.local |
| Consultor técnico | consultor@oscar.local |
| Cliente | cliente@oscar.local |

A interface usa sessão em cookie HttpOnly e proteção CSRF. A mesma API também aceita **HTTP Basic**, usado pela coleção Postman. O gerente administra cadastros e relatórios; o mecânico consulta seus atendimentos e aponta inspeção e execução. Um usuário sem autenticação recebe 401; um usuário autenticado sem a permissão necessária recebe 403.

## Organização do código

O Angular continua responsável pela interface. O backend em TypeScript separa as responsabilidades:

~~~text
server/
  controllers/api-controller.ts       entrada HTTP e respostas
  services/application-service.ts     encaminhamento dos casos de uso
  services/crud-service.ts            gerenciamento e integridade dos registros
  services/auth-service.ts            credenciais, HTTP Basic e permissões
  repositories/mysql-repository.ts    comandos e transações no MySQL
  repositories/mysql-schema.sql       tabelas, índices, checks e chaves estrangeiras
  contracts.ts                       contratos usados pelas camadas
  models.ts                          interfaces das entidades da oficina
  domain.ts                          regras de domínio e erros
  entities.ts                        validação dos cadastros
~~~

O controller chama os serviços; a autenticação é tratada pelo AuthService, e os serviços usam o contrato do repositório. Validação de entrada, conflitos e recursos inexistentes passam pelo tratamento central de erros. Os módulos mantidos para SQLite atendem à regressão local; a persistência da entrega acadêmica é MySQL.

## Modelagem e regras da oficina

O banco tem doze entidades de domínio: clientes, veículos, usuários, serviços, fornecedores, peças, solicitações, agendamentos, ordens, orçamentos, movimentações e chamados. Duas tabelas associativas registram os serviços de cada agendamento e os itens das ordens.

[Diagrama de dados](docs/modelo-dados.svg) · [Imagem PNG](docs/modelo-dados.png) · [Fonte Mermaid](docs/modelo-dados.mmd) · [Estrutura SQL](server/repositories/mysql-schema.sql)

As colunas usadas em relacionamentos e consultas são relacionais. Campos JSON preservam detalhes e retratos históricos, como itens aprovados, inspeções e evolução do atendimento. Alterar o preço no catálogo não reescreve o valor já aprovado em uma O.S.

Regras demonstráveis:

- Um mecânico não pode ter dois agendamentos que se sobreponham.
- Uma peça só sai do estoque durante a execução de um item aprovado, e o saldo não pode ficar negativo.
- A O.S. não pode ser concluída com itens aprovados ainda sem execução.
- Um orçamento publicado depende da decisão do cliente para liberar os itens pendentes.
- Cadastros e atendimentos com histórico são inativados ou cancelados; rascunhos sem efeito operacional podem ser removidos. A exclusão de dados pessoais do cliente usa anonimização.

As consultas personalizadas consultam a agenda por data e mecânico e as peças abaixo do estoque mínimo. O relatório cruza clientes, veículos e ordens e totaliza o consumo de peças.

## API e demonstração

[Documentação dos endpoints](docs/ACADEMICO-API.md) · [Requisitos da atividade](docs/ACADEMICO-REQUISITOS.md) · [Roteiro para apresentar](docs/ACADEMICO-APRESENTACAO.md)

A coleção fica em **postman/projeto-integrador.postman_collection.json**. Ela inclui autenticação, CRUD das entidades, consultas, regras, validação, erros 400/404/409/401/403 e o fluxo de aprovação e execução da oficina. As variáveis têm seus valores incluídos no JSON; as credenciais são somente de teste.

As respostas salvas são capturadas de uma fixture MySQL local, sem usar o banco principal. A forma de gerar e importar as evidências está em [postman/README.md](postman/README.md). Após importar no Postman, use **Examples** para examinar as respostas e **Save Response → Save as example** para renovar uma evidência manualmente.

~~~powershell
node scripts/postman-evidence.mjs
node scripts/academic-fixture.mjs
~~~

O primeiro comando captura as respostas e encerra a fixture. O segundo a reabre em **http://127.0.0.1:4302/api** para enviar as requisições pelo Postman. Eles usam apenas oscar_test e não devem rodar ao mesmo tempo.

## Verificar a entrega

~~~powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:mysql
npm.cmd run build
npm.cmd run test:browser
~~~

Os testes usam dados isolados. O resultado das evidências da coleção fica em postman/evidencias.json. Os testes de navegador preservam os caminhos de catálogo, confirmação, agenda, inspeção, orçamento público, estoque, encerramento e permissões.

A captura de 11/11/2026 gravou **87 respostas reais**. A mesma coleção foi executada pelo Newman, com **87 requisições e 87 verificações aprovadas**, sem falha. Veja [o registro dessa execução](docs/ACADEMICO-VALIDACAO.md).

O uso de e-mail é capturado na caixa local do gerente. A demonstração não depende de entrega SMTP, banco remoto ou publicação de site. A entrega do link de repositório ao professor fica para a etapa autorizada pelo grupo; esta rodada de trabalho é local.
