---
name: OScar — Oficina contemporânea
description: Grafite, branco e laranja para acompanhar o trabalho da oficina.
colors:
  accent: "#bf4b18"
  accent-strong: "#9f3a10"
  accent-soft: "#fff0e6"
  on-accent: "#ffffff"
  accent-glow: "#ffad7c"
  app-bg: "#f5f5f7"
  surface: "#ffffff"
  surface-alt: "#f7f7f9"
  surface-raised: "#ffffff"
  text: "#24242c"
  text-muted: "#60606d"
  text-faint: "#696976"
  border: "#e6e6ec"
  border-strong: "#8b8b98"
  hero-bg: "#25252d"
  hero-text: "#f7f7fa"
  hero-muted: "#c2c2ce"
  nav-bg: "#202026"
  nav-text: "#d3d3dc"
  nav-muted: "#a8a8b5"
  nav-hover: "#303039"
  nav-active: "#ffad7c"
  nav-active-text: "#3b1b0e"
  warning: "#8b5a15"
  warning-soft: "#fff2dc"
  danger: "#af3c3a"
  danger-soft: "#fff0ef"
  success: "#286c49"
  success-soft: "#e6f4eb"
  info: "#3b628e"
  info-soft: "#e9f0fa"
  dark-accent: "#ffab7c"
  dark-accent-strong: "#ffc6a6"
  dark-accent-soft: "#45291d"
  dark-on-accent: "#381c0d"
  dark-app-bg: "#111115"
  dark-surface: "#1c1c23"
  dark-surface-alt: "#23232b"
  dark-surface-raised: "#2b2b34"
  dark-text: "#f5f5f7"
  dark-text-muted: "#bcbcc9"
  dark-text-faint: "#ababba"
  dark-border: "#3a3a46"
  dark-border-strong: "#797989"
  dark-hero-bg: "#25252e"
  dark-nav-bg: "#18181e"
  dark-nav-text: "#d3d3df"
  dark-nav-muted: "#a9a9b8"
  dark-nav-hover: "#2b2b35"
  dark-nav-active: "#ffab7c"
  dark-nav-active-text: "#381c0d"
  dark-warning: "#efc879"
  dark-warning-soft: "#3a3020"
  dark-danger: "#ffb4ad"
  dark-danger-soft: "#452b2d"
  dark-success: "#91dab3"
  dark-success-soft: "#173b31"
  dark-info: "#adcfff"
  dark-info-soft: "#24384c"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(44px, 5.4vw, 84px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-.04em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(28px, 2.4vw, 36px)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-.04em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-.025em"
  body:
    fontFamily: "'DM Sans', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'DM Sans', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.55
rounded:
  status: "7px"
  control: "11px"
  icon: "13px"
  surface: "16px"
  navigation: "22px"
  navigation-mobile: "19px"
spacing:
  tight: "8px"
  compact: "12px"
  control: "16px"
  section-mobile: "20px"
  section: "24px"
  panel: "26px"
  spacious: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
  button-secondary:
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
  field-operational:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  status-progress:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.status}"
    padding: "5px 9px"
  nav-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.nav-active-text}"
    rounded: "{rounded.control}"
    padding: "10px 13px"
---

# Design System: OScar — Oficina contemporânea

## Overview

**Creative North Star: "Oficina contemporânea"**

Esta identidade substitui o sistema anterior por escolha explícita do usuário: grafite, branco e laranja, temas claro/escuro, filmagem real de oficina e mais movimento em toda a aplicação. O sistema visual é definido pelos estilos e componentes do projeto e documentado aqui.

A navegação grafite flutua ao lado de superfícies de trabalho claras ou carvão. Títulos fortes e módulos com profundidade suave organizam dados, agenda e etapas da O.S. O laranja conduz ações, seleção e progresso; as cores semânticas continuam distinguindo atenção, erro, conclusão e informação. A filmagem genérica de um reparo de motor dá presença ao acesso sem representar instalações ou funcionários do OScar.

Este registro vem dos estilos e componentes implementados em Angular 20, Material 20, SCSS e NgModules. Preserva fontes locais, superfícies sólidas de leitura e estados semânticos já confirmados. Valores de dados de teste não definem identidade ou métricas do produto.

**Key Characteristics:**

- Navegação grafite, superfícies brancas ou carvão e ação laranja.
- Manrope em títulos; DM Sans na leitura e nos controles.
- Painéis suaves, tabelas legíveis e trilhos de etapas da oficina.
- Filmagem real local com formulário sólido e controle de reprodução.
- Entradas finitas e feedback de interação que respeitam movimento reduzido.

## Colors

Os tokens sem prefixo descrevem o tema claro; dark- registra a substituição do mesmo papel no escuro. As variáveis CSS sem prefixo continuam sendo a API usada pelos componentes.

### Primary

- **Laranja de ação — accent / accent-strong / accent-soft / on-accent:** ações principais, links, seleção e ênfases. O tema escuro usa laranja claro com texto escuro próprio.
- **Laranja do trilho — accent-glow:** cor sólida dos indicadores, barras e etapas no painel grafite. Apesar do nome legado, é uma cor de primeiro plano, não uma sombra translúcida.
- **Seleção da navegação — nav-active / nav-active-text:** par próprio para destacar o destino atual sobre o grafite.

### Neutral

- **Branco de trabalho e carvão — app-bg / surface / surface-alt / surface-raised:** fundo, cartões, tabelas, formulários, menus e diálogos. As camadas ficam mais claras à medida que se elevam no tema escuro.
- **Tinta e leitura auxiliar — text / text-muted / text-faint:** conteúdo, instruções e informação secundária.
- **Contornos — border / border-strong:** separação de linhas e limites de controles.
- **Grafite de orientação — nav-bg e família nav:** navegação escura nos dois modos, com texto, hover e seleção próprios.
- **Grafite do fluxo — hero-bg / hero-text / hero-muted:** painel de etapas com tipografia clara nos dois modos.

### Named Rules

**The Semantic Pair Rule.** Estado usa o par de texto e fundo correspondente: warning para atenção, danger para erro ou recusa, success para conclusão e info para informação. Mude o par inteiro ao trocar de tema.

**The Solid Reading Surface Rule.** Formulários e dados ficam em superfícies sólidas do tema. A filmagem e seus degradês sustentam a narrativa do acesso.

A preferência inicial acompanha o sistema operacional. A escolha explícita persiste em oscar.theme, sincroniza abas e prevalece sobre mudanças do sistema. O script local de inicialização aplica o tema antes do Angular; as variáveis Material acompanham os papéis da aplicação.

## Typography

**Display Font:** Manrope, com sans-serif de fallback.

**Body Font:** DM Sans, com Arial e sans-serif de fallback.

**Character:** títulos geométricos, firmes e próximos; corpo aberto para leitura operacional. Fontes e símbolos Material são servidos pelo próprio projeto.

### Hierarchy

- **Display:** título do acesso, conforme o token display; abaixo de 860px usa clamp(36px, 7vw, 58px). A continuação em laranja mantém o mesmo peso.
- **Headline:** título da tarefa, conforme headline; abaixo de 600px usa 26px. O catálogo público usa hero Manrope de 44–78px (42–62px no móvel) e títulos de seção de 24–34px; o orçamento público mantém sua escala própria. Tracking do conteúdo novo para em -.04em; a marca mantém seu tratamento estabelecido.
- **Title:** seções recorrentes entre 17px e 18px. O token title representa os cabeçalhos do painel.
- **Body:** base de 14px; tabelas e instruções usam principalmente 12–14px. Descrições longas abrem a entrelinha e limitam largura quando necessário.
- **Label:** controles e rótulos auxiliares usam 12px; estados e cabeçalhos de tabela usam 11px.
- **Números:** Manrope destaca métricas e totais. Valores, quantidades, horários e identificadores usam números tabulares.

**The Information Before Ornament Rule.** Abra a tarefa pelo título e pela instrução útil; preserve rótulos que identificam dados. Não promova texto decorativo acima do título a um padrão para novas telas.

## Layout

A área autenticada usa sidebar fixa de 246px, afastada 16px das bordas; a área de trabalho começa em 278px. O cabeçalho tem 94px e o conteúdo, limite de 1800px com padding de 36px 40px 42px. Até 1280px, a navegação passa a 222px e o respiro horizontal a 26px. Até 800px, vira painel recolhido de 256px com backdrop, cabeçalho de 76px e conteúdo com padding de 26px 16px 32px.

O painel combina quatro métricas, fluxo e agenda em duas colunas e uma tabela de ordens. Fluxo e agenda se empilham até 1100px; métricas viram duas colunas até 760px; o trilho de etapas vira uma lista vertical até 520px. Clientes usam fichas de contato e painel contextual; veículos mostram uma frota; serviços têm seletor e painel de configuração; fornecedores enfatizam logística, equipe enfatiza pessoas e pós-venda usa um quadro de situações. O estoque mantém tabela e resumos adequados a códigos e quantidades. A O.S. agrupa identificação, total, progresso e abas. Tabelas rolam dentro do contêiner; formulários passam de duas colunas para uma.

O catálogo público atual usa hero fotográfico assimétrico e lista editorial expansível; busca, ordenação, duração e orientação para agendar com a equipe compõem a área inferior. A lista se reorganiza no celular. O orçamento público conserva sua apresentação própria.

## Elevation & Depth

Contornos e camadas tonais organizam as superfícies de dados. Cadastros, identificação e abas da O.S. permanecem planos; métricas, resumos de estoque e cartões do catálogo usam sombra suave, ampliada no hover. A sidebar flutuante e o painel de fluxo mantêm profundidade própria. O acesso usa uma sombra ampla para separar o formulário da filmagem.

### Shadow Vocabulary

- **Cartão:** var(--shadow-card), leve em métricas, resumos de estoque e fichas de frota e detalhe de serviço.
- **Ambiente:** var(--shadow-soft), para painéis e recuperação.
- **Interação:** var(--shadow-hover), em métricas e cartões com hover.

Os valores exatos das sombras por tema estão nos estilos SCSS. O acento sólido do trilho não é um token de elevação.

## Shapes

Cantos arredondados dão continuidade à navegação e aos módulos; linhas de tabela e separadores continuam retos. Superfícies, painéis de conteúdo, acesso e recuperação compartilham o raio de 16px. A sidebar usa 22px e passa a 19px no móvel. Estados compactos usam 7px; botões preenchidos e de contorno usam 11px pelos tokens --mat-button-filled-container-shape e --mat-button-outlined-container-shape do Material 20.

Os campos outline operacionais usam cantos de 11px; o acesso preserva o campo Material. Não derive a forma do campo a partir do cartão que o contém. Círculos pequenos marcam continuidade e estado; as estações do progresso usam caixas suaves.

## Components

### Buttons

Ações diretas com rótulo legível e ícone de apoio quando necessário. A ação preenchida usa accent / on-accent; a secundária usa contorno e acento. O acesso ocupa toda a largura e tem altura mínima de 52px. Atalhos de métricas, ação do painel de fluxo e alternadores de tema têm alvo mínimo de 44px, inclusive no móvel. Hover eleva discretamente a ação; active desloca 1px. O foco global tem contorno de 3px com afastamento de 4px; ações sobre o filme têm foco laranja com afastamento de 5px.

### Chips

Estados combinam texto, ponto e par semântico. O padding é 5px 9px. Pendência e espera usam atenção; execução e aprovação usam acento; conclusão usa sucesso; recusa, cancelamento e expiração usam perigo. O texto identifica o estado independentemente da cor.

### Cards / Containers

Superfícies usam os papéis do tema, raio de 16px e contorno discreto quando presente. Tabelas, cadastros e abas não recebem sombra por padrão; métricas, resumos de estoque e fichas de frota/serviços usam a elevação documentada. O catálogo público atual usa composição fotográfica e linhas expansíveis, substituindo os cartões iguais anteriores. Respiros recorrentes ficam entre 20px e 28px. A métrica de atendimentos ativos usa accent-soft; as demais mantêm superfície neutra. Cada módulo preserva sua composição.

### Inputs / Fields

Angular Material outline com rótulo visível, validação e largura do contêiner. Mensagens apontam o campo e o problema, como código obrigatório ou valor mínimo. E-mail e senha mantêm autocomplete; senha tem controle de visibilidade. Erros e confirmações usam os respectivos pares semânticos. Conteúdo de diálogo tem rolagem limitada pela janela e acompanha o tema.

### Navigation

Sidebar grafite agrupada por função; links com altura mínima de 44px e seleção laranja. Hover muda fundo e desloca 2px. O destino atual recebe peso forte e seta. No móvel, o painel abre em 280ms, com botão e backdrop para fechar. Tema e conta ficam no cabeçalho; o alternador também permanece acessível nas páginas públicas.

### Caminho do atendimento

No painel, ícones, rótulos, contagens e barras mostram a distribuição real das ordens. A cor sólida accent-glow mantém leitura sobre o grafite. Na O.S., número e texto distinguem etapas anteriores, atual e próximas; sucesso marca o que passou e acento marca o estado atual. A agenda usa eixo de horários e blocos proporcionais; o histórico mantém seus marcadores ligados.

### Acesso com filmagem real

O fundo mostra um mecânico reparando um motor: Mixkit, item 4716. O MP4 H.264 local tem 11 segundos, 1280 × 720, 24fps, sem áudio e 1.742.115 bytes; o poster é WebP. Origem, licença, preparação e evidências estão em [docs/VIDEO-LOCAL.md](docs/VIDEO-LOCAL.md), fonte autoritativa da mídia.

O vídeo inicia automaticamente, mudo e em loop quando as preferências permitem. Movimento reduzido ou saveData mantém o poster sem download automático; o usuário pode iniciar manualmente. Há pausa/reprodução, aviso de bloqueio, nova tentativa em falha e pausa em aba oculta. O estado visual de reprodução só é confirmado quando o tempo avança.

### Movimento

A entrada do acesso dura 950ms, com deslocamento de 24px e desfoque inicial de 3px. Na área de trabalho, MotionService revela elementos novos ao entrarem na janela: 480ms, deslocamento de 18px, atraso escalonado de 65ms até 260ms; barras usam 700ms. A curva operacional é cubic-bezier(.22,1,.36,1). Feedbacks de hover e pressão ficam principalmente entre 160ms e 220ms. As animações são finitas; conteúdo e ações continuam disponíveis sem elas. Movimento reduzido cancela animações e transições.


### Composições por tarefa — entrega vigente

As telas de cadastro preservam a identidade visual e seguem a tarefa de cada módulo. Clientes combinam contatos com veículos e ordens vinculados; veículos priorizam placa, modelo, proprietário e histórico; serviços separam escolha, valor, finalidade e roteiro de inspeção. Fornecedores, equipe e pós-venda têm composições próprias. O estoque preserva a tabela de códigos e quantidades. Um componente configurável atende seis rotas; o estoque permanece separado.

No móvel, “Ver ficha” e a escolha de serviço levam o painel atualizado à vista e focam seu título. A rolagem é suave normalmente e imediata com movimento reduzido. Essa transferência não altera a seleção/foco desktop.

### Agenda por mecânico

A grade diária tem colunas de mecânicos ativos e eixo das 8h às 18h, em células de 30 minutos. Blocos representam a duração real; cancelados não ocupam espaço. Filtros não liberam horários ocupados. Busca, data, navegação diária e painel de detalhes preservam remarcar, cancelar com motivo e abrir O.S. A orientação horizontal/vertical aparece antes da grade em todos os tamanhos; a rolagem permanece no contêiner. Atendimentos curtos e registros fora da grade continuam acessíveis por controles de pelo menos 44px. Clicar em um horário preenche a data e somente seleciona uma combinação retornada pela API após a escolha dos serviços.

### Avaliação e catálogo editorial

O cadastro de serviços distingue Avaliação / diagnóstico inicial e Serviço de execução. A abertura de O.S. oferece Avaliação inicial, cobra o valor cadastrado e aceita relato opcional; os itens guardam finalidade e preço daquele momento. O contexto da avaliação orienta inspeção, necessidades, orçamento e aprovação, preservando as regras de execução/estoque.

O catálogo público substitui seis cartões iguais por hero assimétrico, fotografia local de manutenção e linhas de serviço expansíveis. Busca, ordenação e filtros de duração operam sobre os serviços reais da API. O contato com a equipe continua sendo o caminho para agendar. A fotografia ilustrativa é o poster local já documentado em [VIDEO-LOCAL.md](docs/VIDEO-LOCAL.md); não houve nova aquisição de mídia.

## Do's and Don'ts

### Do:

- **Do** usar os papéis atuais de grafite, branco e laranja e seus pares noturnos.
- **Do** manter dados e formulários em superfícies sólidas e legíveis.
- **Do** preservar rótulo, texto de estado e números tabulares.
- **Do** compor cada módulo conforme sua tarefa, repetindo os mesmos controles e materiais.
- **Do** manter tabelas com rolagem interna e formulários empilhados quando necessário.
- **Do** servir fontes, ícones e mídia localmente e preservar pausa, poster e reprodução manual.
- **Do** respeitar movimento reduzido e economia de dados.

### Don't:

- **Don't** recuperar a paleta navy/verde petróleo ou a cena procedural substituídas.
- **Don't** usar accent-glow como descrição de sombra alpha: é a cor sólida do trilho.
- **Don't** aplicar forma de pílula aos botões operacionais.
- **Don't** colocar campos ou dados operacionais diretamente sobre vídeo.
- **Don't** esconder conteúdo até uma animação completar.
- **Don't** inventar métricas, avaliações ou atividade da oficina para preencher a interface.
- **Don't** transformar rótulos decorativos acima de títulos em regra para novas telas.
