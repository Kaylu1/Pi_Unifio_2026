# Roteiro de apresentação do backend

Antes de começar, deixe o Angular aberto e importe no Postman a coleção da pasta postman. Use a fixture oscar_test para os ensaios. Ela possui apenas pessoas, senhas e peças fictícias.

1. **Problema e modelo.** “O OScar acompanha o atendimento de uma oficina, da reserva até a entrega.” Mostre o [diagrama](modelo-dados.svg): cliente tem veículos; agendamento liga cliente, veículo e mecânico; a O.S. recebe serviços/peças, orçamento e movimentos.
2. **Camadas.** Abra o controller, um serviço e o repositório. Explique: “O controller entende HTTP; o serviço aplica as regras; o repositório executa o SQL no MySQL.” Mostre uma regra da agenda ou do estoque.
3. **Segurança.** No Postman, execute os exemplos 401 sem credenciais, 401 com senha errada e 403 com o mecânico tentando cadastrar serviço. Depois execute a consulta autenticada como gerente.
4. **CRUD e erros.** Cadastre, consulte por ID, altere e inative um serviço ou fornecedor. Mostre um corpo inválido retornando 400 e um ID inexistente retornando 404.
5. **Agenda.** Execute a consulta por data/mecânico. Crie um agendamento e repita o mesmo horário: o conflito retorna 409. Mostre que a reserva original continua intacta.
6. **Funcionalidade do PI.** Abra a sequência de O.S. e orçamento. A proposta publicada fica pendente; tentar avançar para execução retorna 409. Registre a aprovação e aplique a peça. A baixa de estoque acontece junto com o apontamento. A tentativa de consumir mais que o saldo retorna 409.
7. **Consultas e persistência.** Abra as peças abaixo do mínimo e o relatório. Recarregue o Angular ou reinicie a API e consulte o mesmo registro: o MySQL preserva os dados.
8. **Evidências.** Mostre os Examples das requisições no Postman e as variáveis incluídas na coleção. Cada integrante deve conseguir explicar ao menos um endpoint, sua validação e sua regra.

Evite explicar todo o código linha por linha. Escolha um atendimento e acompanhe seus IDs do cadastro ao estoque. O objetivo é mostrar que as partes trabalham juntas.

Se perguntarem sobre exclusão, explique a regra concreta: “Uma entrada de estoque sem consumo pode ser desfeita. Uma O.S. já executada mantém histórico; cadastros usados no histórico são inativados, e dados pessoais podem ser anonimizados.”
