# Plano de implementação — BarbFin

## Objetivo

Construir uma aplicação web operacional para registo diário de atendimentos e acompanhamento financeiro de uma barbearia. A experiência será rápida para barbeiros e detalhada para a administração, assegurando valores monetários precisos, rastreabilidade e proteção dos dados financeiros.

## Decisão de infraestrutura e limites conhecidos

O requisito de produto define **PostgreSQL**. O serviço de base de dados ativado no projeto fornece MySQL compatível, pelo que não será usado para os dados de negócio. A aplicação irá ligar-se a uma instância PostgreSQL externa através de `POSTGRES_URL`, configurado exclusivamente como segredo de servidor. Pode ser uma instância PostgreSQL já existente ou um fornecedor como Supabase/Neon. Esta escolha preserva o requisito PostgreSQL e permite, caso se opte por Supabase, adicionar RLS no fornecedor.

A aplicação terá um servidor Express/TypeScript, React/Vite no frontend, tRPC para a API tipada e PostgreSQL no backend. Todos os valores financeiros serão persistidos em `NUMERIC(12,2)`; as datas serão `timestamptz`; os identificadores serão UUID.

## Autorização, segurança e acesso

A especificação pede autenticação própria com palavra-passe inicial definida e não uma conta partilhada. Por isso, será implementada autenticação local de utilizador com papéis `admin` e `barber`:

- O administrador inicial terá um identificador de acesso configurável, palavra-passe inicial entregue ao servidor como segredo e alteração obrigatória no primeiro acesso.
- As palavras-passe usarão bcrypt com custo adequado; o valor original nunca entra em ficheiros, bundles ou respostas da API.
- As sessões serão tokens assinados em cookie `HttpOnly`, `Secure` e `SameSite=None` em Preview HTTPS; em HTTP local, o comportamento será adaptado apenas para desenvolvimento local.
- Todas as mutações terão proteção CSRF baseada em token e validação de origem, validação Zod no backend, autorização por papel e limitação de tentativas de autenticação por identificador/IP com bloqueio temporário.
- A área administrativa, exportações, configurações, relatórios, auditoria e arquivo terão procedimentos apenas para `admin`. O papel `barber` terá apenas acesso ao registo dos próprios atendimentos e respetivo histórico, sem dados financeiros globais nem dados de outros barbeiros.
- Criação, atualização e eliminação de movimentos, catálogo, despesas, pagamentos de comissão e operações de arquivo produzirão um evento de auditoria com ator, data/hora, entidade, ação, valores antes/depois e origem.

## Modelo de dados PostgreSQL

As tabelas e relações principais serão:

- `users`: utilizadores com UUID, identificador único, papel, hash bcrypt, estado, alteração obrigatória e timestamps.
- `barbers`: perfil de barbeiro associado opcionalmente a utilizador, estado, percentagens de comissão e configuração de comissão de produto.
- `services` e `products`: catálogos com preço atual, estado e datas; os itens históricos guardam sempre um snapshot de nome e preço.
- `sales`: um atendimento independente por venda, com barbeiro, momento, pagamento, observações, totais e snapshots das percentagens de comissão aplicáveis.
- `sale_items`: itens de cada atendimento, separados por tipo (`service`/`product`), quantidade, preço unitário, total e valores de comissão.
- `transactions`: livro financeiro imutável para receitas, despesas e pagamentos de comissão, ligado à origem quando aplicável, impedindo dupla dedução de comissão no cálculo de lucro.
- `expenses` e `expense_categories`: despesas manuais e categorias editáveis.
- `payment_methods`: métodos ativos e ordenáveis, iniciados com Dinheiro, Cartão, MB WAY e Outro.
- `commissions` e `commission_payments`: montantes calculados por atendimento, estado pendente/pago e liquidações sem alteração do valor histórico.
- `annual_archives` e `monthly_archives`: resumos históricos por período, método, barbeiro, serviço e produto, associados a um ficheiro de backup antes de qualquer eliminação autorizada.
- `audit_logs`: trilho de auditoria das alterações administrativas.

Haverá índices para data de venda, data de transação, barbeiro, tipo/estado e categorias. O registo de atendimento será uma transação atómica: cria a venda, itens, receita, comissões e totais ou não persiste nada.

## Funcionalidades e fluxos

### 1. Área de operação diária

A rota de trabalho mostrará cartões dos barbeiros ativos. Após a seleção, o barbeiro poderá adicionar vários serviços e vários produtos, alterar quantidades, visualizar subtotais e total, escolher método de pagamento e escrever observações. Um painel de resumo exigirá confirmação antes de gravar. O registo incluirá automaticamente data e hora e criará sempre uma venda independente.

### 2. Área administrativa

O menu lateral terá dashboard, movimentos, despesas, barbeiros, comissões, catálogo, relatórios, arquivo e definições.

O dashboard terá filtros Hoje, Ontem, Últimos 7 dias, Este mês, Mês anterior, Este ano e intervalo personalizado. Os cartões mostrarão faturação, despesas, lucro líquido, atendimentos, cortes, serviços, produtos e comissões. Os dados serão calculados a partir das vendas, despesas e transações persistidas, com a mesma base de cálculo usada nos relatórios.

A gestão de barbeiros permitirá criar, editar, ativar/desativar, consultar desempenho individual, configurar comissão de serviços e produtos, acompanhar montantes pendentes e registar pagamentos.

O catálogo permitirá gerir serviços, produtos, preços, métodos de pagamento e categorias de despesas. Alterações nunca reescreverão os snapshots de atendimentos anteriores.

Movimentos e despesas terão filtros, pesquisa e edição controlada. Uma alteração gera auditoria; uma eliminação será uma operação administrativa rastreável, sem apagar o respetivo rasto de auditoria.

### 3. Relatórios, exportação e arquivo

A secção de relatórios incluirá faturação diária/semanal/mensal/anual, despesas, lucro, cortes, ranking de serviços/produtos, desempenho e comparação de barbeiros e comissões. Os gráficos usarão Recharts e as exportações serão produzidas pelo servidor em CSV compatível com Excel e PDF imprimível.

O arquivo anual será uma ação explícita do administrador: primeiro calcula resumos, gera e guarda backup detalhado para download, depois pede confirmação de eliminação. Sem confirmação não há eliminação automática. Os relatórios históricos combinarão os arquivos com os dados de períodos ainda ativos.

## Estrutura do projeto

```text
barbfin/
├── client/src/
│   ├── pages/                 # ecrãs de login, operação, dashboard e administração
│   ├── components/            # shell, tabelas, formulários, gráficos e diálogos reutilizáveis
│   ├── hooks/                 # sessão e filtros de período
│   └── lib/                   # cliente tRPC, formatos monetários e utilitários
├── server/
│   ├── _core/                 # servidor Express, cookies e contexto tRPC
│   ├── auth/                  # palavra-passe, sessão, CSRF e limitação de login
│   ├── db/                    # cliente PostgreSQL, SQL e transações
│   ├── services/              # regras de vendas, comissões, métricas, arquivo e exportação
│   └── routers/               # procedimentos tRPC por domínio
├── database/
│   ├── migrations/            # migrações PostgreSQL versionadas
│   └── seed/                  # inicialização idempotente de catálogo e administrador
├── plan.md                    # este plano
└── TODO.md                    # critérios de entrega, criado após aprovação deste plano
```

## Design

### Direções consideradas

1. **Ledger editorial sóbrio** (escolhida, 0,08): inspiração em livros-caixa contemporâneos, com hierarquia forte e foco nos números.
2. **Neo-brutalismo de oficina** (0,05): módulos de contraste rígido e botões expressivos, demasiado agressivo para análise financeira diária.
3. **Clássico de salão premium** (0,07): superfícies escuras e metalizadas, menos adequado à leitura prolongada de tabelas.

### Direção escolhida: Ledger editorial sóbrio

- **Movimento de design:** software financeiro contemporâneo com a objetividade visual de um livro-caixa bem organizado.
- **Princípios:** clareza antes de decoração; operações com um caminho de confirmação inequívoco; contrastes que privilegiam valores e estados; densidade de informação ajustável para computador e telemóvel.
- **Filosofia de cor:** base carvão quase preta, superfícies ardósia claras e branco suave para reduzir fadiga; verde-esmeralda como sinal proprietário de entrada/resultado positivo; âmbar discreto para pendências; vermelho reservado apenas a saídas e erros.
- **Paradigma de layout:** barra lateral como espinha dorsal no desktop; no telemóvel, barra superior compacta e navegação de contexto, com o registo diário a ocupar a prioridade visual.
- **Elementos de assinatura:** faixa vertical esmeralda nos cartões de KPI; linhas subtis de livro-caixa em tabelas; indicador circular de período selecionado no dashboard.
- **Interações:** seleção e alteração de quantidades com resposta imediata; confirmação de ações financeiras em diálogos com resumo; toasts apenas para confirmação ou erro relevante.
- **Animação:** transições curtas de opacidade e deslocamento (150–200 ms), sem movimento contínuo; gráficos atualizam suavemente quando se altera o filtro.
- **Tipografia:** `Manrope` para títulos e leitura de números; `Inter` para tabelas, formulários e microcopy; valores financeiros com `tabular-nums`.
- **Essência da marca:** controlo financeiro simples e rigoroso para barbearias que trabalham todos os dias. Personalidade: preciso, calmo, profissional.
- **Voz:** direta e concreta. Exemplos: “Fechar atendimento” e “A comissão está pronta para liquidar.”
- **Wordmark e cor de assinatura:** um monograma `BF` com dois cortes verticais que evocam a precisão da tesoura; esmeralda `#0E8A72` como cor distintiva.

## Sequência de implementação

1. Ligar PostgreSQL externo como segredo de servidor, criar migrações e seed idempotente; não inserir credenciais em código.
2. Implementar autenticação, papéis, sessão, limite de tentativas, alteração obrigatória de palavra-passe e auditoria base.
3. Implementar o catálogo e o fluxo transacional de registo de atendimento com cálculos e snapshots históricos.
4. Construir a área administrativa: dashboard, movimentos, despesas, barbeiros, comissões e definições.
5. Construir relatórios, gráficos, exportação e fluxo de arquivo/backup com confirmação explícita.
6. Aplicar design responsivo, validar tipos, build, migrações e a ligação entre rotas/API/base de dados antes de checkpoint.

## Decisões a confirmar antes do desenvolvimento

1. Indicar se será usado um PostgreSQL existente, Supabase ou Neon e fornecer o respetivo `POSTGRES_URL` através do formulário seguro.
2. Confirmar o identificador do primeiro administrador. Proposta: `admin` (poderá ser alterado posteriormente na gestão de utilizadores).
3. Aprovar este plano para que seja criada a lista de critérios em `TODO.md` e iniciada a implementação.
