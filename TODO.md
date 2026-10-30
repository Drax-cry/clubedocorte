# TODO — BarbFin

## Autenticação, permissões e segurança

- [ ] Criar autenticação individual para o administrador e, se necessário, para os barbeiros; a senha inicial deve ser configurada no servidor, armazenada exclusivamente como hash bcrypt e exigir alteração no primeiro acesso.
- [ ] Validar autenticação e autorização no backend, usar sessão em cookie HttpOnly/Secure/SameSite adequado ao Preview HTTPS, proteger rotas administrativas, aplicar rate limiting, validar entradas e não expor segredos no frontend.
- [ ] Impedir que barbeiros consultem dados financeiros globais ou de outros barbeiros e registar alterações administrativas no histórico de auditoria.

## Registo diário de serviços e vendas

- [ ] A página inicial deve ser o modo barbeiro sem palavra-passe: antes de registar, o barbeiro identifica-se selecionando o próprio nome; a palavra-passe fica reservada à área Admin do proprietário, acessível pelo botão Admin no topo.
- [ ] Apresentar barbeiros ativos em cartões, com nomes configuráveis pelo administrador e sem nomes fixos no código.
- [ ] Permitir selecionar vários serviços e produtos no mesmo atendimento, mostrar preço, alterar quantidade, calcular subtotais/totais automaticamente e adicionar observações.
- [ ] Guardar data/hora automaticamente, permitir Dinheiro, Cartão, MB WAY e Outro e apresentar resumo antes de confirmar.
- [ ] Guardar cada atendimento como uma operação independente com os seus serviços, produtos, quantidades, preços e percentagens de comissão históricas.

## Dashboard e gestão administrativa

- [ ] Mostrar faturação, despesas, lucro líquido, atendimentos, cortes, serviços, produtos e comissões acumuladas, com filtros Hoje, Ontem, Últimos 7 dias, Este mês, Mês anterior, Este ano e período personalizado.
- [ ] Permitir adicionar/editar/ativar/desativar barbeiros, consultar faturação, serviços, produtos, comissões pendentes/pagas e valor a receber.
- [ ] Permitir definir comissão individual, comissão de produtos opcional e percentagem específica de produtos, sem modificar operações antigas.
- [ ] Permitir registar pagamentos de comissão como saídas financeiras distintas, sem descontar a comissão duas vezes no lucro.

## Despesas, movimentos e catálogo

- [ ] Registar despesas com descrição, categoria, valor, data, método de pagamento e observações; incluir categorias predefinidas e permitir categorias novas.
- [ ] Listar entradas, saídas e despesas com pesquisa, filtros, consulta, edição e eliminação administrativa auditada.
- [ ] Gerir serviços, produtos, preços, métodos de pagamento, categorias e configurações gerais sem reescrever snapshots históricos.

## Relatórios, exportação e arquivo

- [ ] Criar relatórios de faturação diária/semanal/mensal/anual, despesas, lucro, cortes, serviços/produtos mais vendidos, desempenho individual, comissões e comparação entre barbeiros.
- [ ] Usar gráficos claros e permitir exportação para PDF e Excel/CSV.
- [ ] Permitir arquivar anos anteriores apenas por ação explícita do administrador; calcular faturação, despesas, lucro, cortes, barbeiros, comissões, serviços, produtos, meses e métodos de pagamento.
- [ ] Gerar backup completo detalhado para download antes de qualquer eliminação e nunca eliminar automaticamente sem autorização.

## Dados e implementação

- [ ] Usar PostgreSQL/Supabase, UUID, NUMERIC/DECIMAL para valores, timestamps com timezone, índices por data/barbeiro/tipo, integridade referencial e transações atómicas.
- [ ] Manter a interface React/Vite/Tailwind/shadcn/ui/Recharts responsiva, com menu lateral administrativo, formulários simples, tabelas organizadas e sem marcações online/CRM complexo.
