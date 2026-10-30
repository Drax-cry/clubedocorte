# BarbFin — Documentação técnica, operação e segurança

**Estado do documento:** auditoria realizada em 30/10/2026  
**Projeto:** BarbFin — Gestão Financeira  
**Objetivo:** documentar a aplicação antes da instalação numa VPS e registar os controlos de segurança, riscos e procedimentos operacionais.

## 1. Resumo da aplicação

O BarbFin é uma aplicação web responsiva para uma barbearia. O modo barbeiro funciona como um quiosque: o barbeiro seleciona o próprio nome, escolhe serviços/produtos e regista o atendimento sem entrar na área administrativa. O proprietário entra pelo botão **Admin**, com sessão protegida por palavra-passe.

A aplicação calcula faturação, despesas, comissões, lucro líquido, atendimentos, serviços, produtos, desempenho por barbeiro e histórico de movimentos. O Dashboard permite consultar hoje, mês atual, mês anterior, ano atual, todo o histórico, um mês escolhido ou um dia escolhido.

## 2. Arquitetura atual

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, componentes visuais próprios e Recharts.
- **Backend:** Node.js 22, Express e tRPC.
- **Base de dados:** PostgreSQL na Supabase através de `POSTGRES_URL`.
- **Autenticação:** utilizador Admin local, sessões persistidas na tabela `app_sessions`, cookies HttpOnly para sessão e cookie separado para CSRF.
- **Password hashing:** bcrypt com custo 12. A palavra-passe inicial só é lida no servidor através de `ADMIN_INITIAL_PASSWORD` e exige alteração no primeiro acesso.
- **Deploy previsto:** Docker numa VPS, com HTTPS terminado por Nginx ou Caddy. A base de dados pode continuar na Supabase.

### Estrutura principal

```text
client/src/pages/Home.tsx       Interface do quiosque e área Admin
client/src/index.css             Sistema visual responsivo
server/_core/context.ts          Leitura da sessão e cookies
server/_core/trpc.ts             Proteção de utilizador, CSRF e Admin
server/dbPg.ts                   Pool PostgreSQL, migração e sessões
server/routers.ts                API tRPC, validação e regras financeiras
database/migrations/001_initial.sql  Tabelas e índices iniciais
Dockerfile                       Imagem de produção
client/public/manus-routes.json  Manifesto de rotas do Preview/publicação
```

## 3. Modelo de dados

As tabelas principais são:

- `app_users`: contas Admin/barbeiro, hash da palavra-passe e estado.
- `app_sessions`: tokens de sessão guardados como hash SHA-256, CSRF e expiração.
- `barbers`: barbeiros, comissão de serviços, comissão de produtos e estado.
- `services` e `products`: catálogo atual. Alterar o preço não modifica snapshots antigos.
- `sales`: cada atendimento, com totais e percentagens de comissão aplicadas naquele momento.
- `sale_items`: serviços/produtos do atendimento, nome e preço históricos.
- `expenses`: despesas da operação.
- `commission_payments`: pagamentos efetivos de comissão.
- `audit_logs`: alterações administrativas e criação de vendas/despesas.
- `expense_categories` e `payment_methods`: configuração do negócio.

Valores monetários usam `NUMERIC/DECIMAL` na base de dados. O backend converte para números apenas na resposta da API. Os preços e percentagens são copiados para `sales`/`sale_items` no momento do atendimento, impedindo que uma alteração futura reescreva o passado.

## 4. Regras financeiras

A faturação é a soma dos totais dos atendimentos no intervalo escolhido.

As despesas são a soma de `expenses.amount` no mesmo intervalo.

As comissões são calculadas no atendimento com a percentagem do barbeiro naquele momento. O lucro líquido é calculado como:

```text
lucro líquido = faturação − despesas − custo de comissão
```

O custo de comissão usa a comissão acumulada dos atendimentos e considera pagamentos registados sem duplicar o mesmo custo. Quando não existem despesas nem comissões, faturação e lucro líquido podem naturalmente ser iguais.

## 5. Segurança já implementada

### Autenticação e autorização

- A área Admin exige sessão válida e `role = admin` no backend.
- Mutations administrativas exigem cookie de sessão e token CSRF no cabeçalho `x-csrf-token`.
- Sessões expiram após 14 dias e o token guardado na base é um hash, não o token original.
- A palavra-passe é hashada com bcrypt e não é enviada para o frontend.
- A primeira palavra-passe é alterada no primeiro acesso.
- O login possui limitação básica de tentativas por IP e nome de utilizador.

### Base de dados e API

- Queries PostgreSQL usam parâmetros; não há concatenação direta de dados do utilizador em SQL nas rotas auditadas.
- Criação de atendimentos usa transação atómica.
- O backend recalcula preços e comissões a partir da base de dados; não confia nos totais enviados pelo navegador.
- Serviços/produtos inativos são rejeitados no backend.
- As percentagens de comissão são validadas entre 0 e 100.
- A resposta pública do catálogo não expõe mais as percentagens de comissão dos barbeiros.
- Alterações administrativas relevantes geram entradas em `audit_logs`.

### Cookies e transporte

- A sessão é `HttpOnly`, `Secure` e `SameSite=None`, compatível com o Preview HTTPS embutido.
- Em produção a aplicação deve ser publicada exclusivamente através de HTTPS.
- O servidor deve ficar atrás de um proxy TLS, sem expor diretamente a porta Node à Internet.

## 6. Riscos encontrados e estado

### Risco alto — modo quiosque público pode ser chamado diretamente

A rota de criação de atendimentos é pública por desenho, para permitir que o barbeiro use o quiosque sem palavra-passe. Isso significa que qualquer pessoa que descubra o endereço da aplicação pode tentar enviar pedidos HTTP diretamente.

O backend valida barbeiro, catálogo, quantidades, preços atuais e estrutura do pedido, mas ainda não existe um segundo segredo de quiosque ou autorização por dispositivo. Antes de uso público numa VPS, recomenda-se uma destas proteções:

1. PIN curto do estabelecimento exigido no início do modo barbeiro;
2. token de quiosque configurado no servidor e entregue apenas aos dispositivos da barbearia;
3. sessão de barbeiro individual, mantendo a seleção visual do barbeiro;
4. limite de pedidos e alertas para criação anormal de atendimentos.

Esta proteção deve ser adicionada antes de considerar o sistema pronto para Internet aberta.

### Risco médio — rate limit em memória

O limite de login está dentro do processo Node. Reiniciar a aplicação limpa o contador e, com várias instâncias, cada instância teria o próprio limite. Em VPS com uma instância é aceitável como primeira barreira, mas para produção recomenda-se Redis ou rate limiting no Nginx/Caddy/firewall.

### Risco médio — TLS PostgreSQL permissivo

O pool usa `ssl: { rejectUnauthorized: false }` para compatibilidade com o Session Pooler. Isto cifra a ligação, mas não valida totalmente a cadeia do certificado. Para produção, configurar o certificado CA oficial da Supabase e usar `rejectUnauthorized: true`, guardando o CA como segredo/ficheiro protegido.

### Risco médio — confiança no cabeçalho de IP

O login usa `x-forwarded-for` para identificar o IP. Numa VPS, o Express deve confiar nesse cabeçalho apenas quando o pedido vem do proxy reverso configurado. A aplicação deve definir `trust proxy` de forma explícita; nunca deve aceitar livremente cabeçalhos de IP enviados por clientes diretos.

### Risco médio — backups ainda não automatizados

Os dados ficam na Supabase e a VPS não deve ser tratada como backup. Antes do uso real, configurar backup automático da base de dados, retenção e teste de restauração. Um backup que nunca foi restaurado não deve ser considerado validado.

### Ponto operacional — cookies em HTTP local

Os cookies de sessão são seguros para HTTPS. Se a aplicação for aberta diretamente em `http://IP:3000`, o browser pode não enviar o cookie Secure. Na VPS, usar domínio ou IP através de HTTPS. Para desenvolvimento local, manter uma configuração separada e nunca desativar Secure em produção.

## 7. Segredos e variáveis

Nunca guardar estes valores no Git, no frontend, no README ou em screenshots:

```text
POSTGRES_URL=postgresql://...
ADMIN_INITIAL_PASSWORD=...
```

A `POSTGRES_URL` deve usar um utilizador de base de dados com o menor privilégio possível. A palavra-passe inicial deve ser temporária e alterada imediatamente no primeiro login. Depois da alteração, a variável inicial pode continuar configurada para recuperação controlada, mas nunca deve ser mostrada ao utilizador.

Na VPS, usar um ficheiro de ambiente com permissões restritas ou Docker secrets:

```bash
sudo install -m 600 /dev/null /etc/barbfin.env
sudo chown root:root /etc/barbfin.env
```

O ficheiro não deve ser servido pelo Nginx e não deve ser copiado para a imagem Docker.

## 8. Instalação recomendada na VPS

A VPS deve usar Ubuntu LTS/versão suportada pelo fornecedor, Docker atualizado, firewall e HTTPS. O processo recomendado é:

1. Criar utilizador administrativo sem login SSH direto de root.
2. Instalar atualizações de segurança.
3. Configurar chave SSH e desativar autenticação SSH por palavra-passe depois de testar a chave.
4. Ativar firewall permitindo apenas SSH, HTTP e HTTPS.
5. Instalar Docker e Docker Compose.
6. Copiar o projeto a partir do repositório canónico.
7. Criar `/etc/barbfin.env` com `POSTGRES_URL` e `ADMIN_INITIAL_PASSWORD`.
8. Construir a imagem sem incluir o ficheiro de ambiente.
9. Executar o container com restart automático e sem privilégios.
10. Configurar Caddy/Nginx para HTTPS e proxy para `127.0.0.1:3000`.
11. Testar `/api/health`, login Admin, modo barbeiro, criação de atendimento e Dashboard.
12. Configurar backups e monitorização.

O container deve ouvir internamente na porta 3000. A porta 3000 não deve ficar aberta publicamente se houver proxy reverso.

## 9. Checklist de produção

Antes de entregar o endereço aos utilizadores:

- [ ] Domínio ou endereço HTTPS ativo.
- [ ] Certificado TLS válido e renovação automática.
- [ ] SSH apenas com chave, sem password/root direto.
- [ ] Firewall ativa.
- [ ] `POSTGRES_URL` fora do Git e fora do frontend.
- [ ] Palavra-passe inicial alterada.
- [ ] Proteção adicional do modo quiosque implementada.
- [ ] Rate limit no proxy ou Redis.
- [ ] `trust proxy` configurado corretamente.
- [ ] TLS da ligação PostgreSQL valida o certificado CA.
- [ ] Backup automático configurado.
- [ ] Restauração de backup testada.
- [ ] Logs sem palavras-passe, tokens ou URLs de ligação completas.
- [ ] Container sem privilégios e com restart automático.
- [ ] Teste de permissões: barbeiro não consulta Dashboard/Admin.
- [ ] Teste de snapshots: alterar preço não altera atendimento antigo.
- [ ] Teste de reset/eliminação apenas com autorização explícita.

## 10. Procedimento de incidente

Se houver suspeita de acesso indevido:

1. Suspender temporariamente o acesso público no proxy.
2. Revogar sessões apagando ou expirando `app_sessions`.
3. Alterar a palavra-passe Admin.
4. Rodar as credenciais da Supabase e atualizar o segredo na VPS.
5. Guardar cópia dos logs e identificar operações em `audit_logs`.
6. Verificar vendas, despesas, alterações de catálogo e utilizadores.
7. Restaurar a base a partir de backup apenas depois de preservar evidências.
8. Reabrir o acesso somente após corrigir a causa.

## 11. Estado da auditoria

O código passou por verificação TypeScript e build de produção durante esta revisão. Foi corrigida a exposição pública das percentagens de comissão no catálogo. A aplicação está pronta para uma VPS de baixo custo em termos de recursos, mas o risco do quiosque público e a configuração de backups devem ser tratados antes do uso comercial aberto na Internet.

**Conclusão:** a base de autenticação Admin, sessões, CSRF, bcrypt, validação Zod, SQL parametrizado, snapshots financeiros e auditoria é uma boa base. O próximo passo de segurança mais importante é proteger o endpoint público de criação de atendimentos com um mecanismo de quiosque e fechar a configuração operacional da VPS.
