import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BarChart3, ChevronDown, CircleDollarSign, ClipboardList, CreditCard, FileText, LayoutDashboard, LogOut, Menu, Package, PanelLeft, Plus, Receipt, Scissors, Settings2, ShieldCheck, Trash2, UserRound, UsersRound, WalletCards, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc";

type Item = { id: string; quantity: number; unitPrice?: number };
type NavKey = "operation" | "dashboard" | "reports" | "movements" | "expenses" | "barbers" | "settings";
type CatalogItem = { id: string; name: string; price: number };
type BarberCatalog = { id: string; name: string; commissionRate: number; productCommissionEnabled: boolean; productCommissionRate: number; active: boolean };
type PaymentMethod = { id?: string; name: string };
type RecentSale = { id: string; barberName: string; soldAt: string; total: number; paymentMethod: string };
type ExpenseRow = { id: string; description: string; categoryName: string; amount: number; expenseDate: string; paymentMethod: string };
type CategoryRow = { id?: string; name: string };
type Movement = { id: string; type: string; occurredAt: string; paymentMethod: string; amount: number; description: string; barberName?: string | null };

type DashboardView = "today" | "currentMonth" | "previousMonth" | "year" | "all" | "month" | "day";

function rangeForDashboard(view: DashboardView, selectedMonth: string, selectedDay: string) {
  const now = new Date();
  if (view === "today") return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(), end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString() };
  if (view === "currentMonth") return monthPeriod();
  if (view === "previousMonth") return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), end: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  if (view === "year") return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end: new Date(now.getFullYear() + 1, 0, 1).toISOString() };
  if (view === "month" && selectedMonth) { const [year, month] = selectedMonth.split("-").map(Number); return { start: new Date(year, month - 1, 1).toISOString(), end: new Date(year, month, 1).toISOString() }; }
  if (view === "day" && selectedDay) { const date = new Date(`${selectedDay}T00:00:00`); return { start: date.toISOString(), end: new Date(date.getTime() + 86400000).toISOString() }; }
  return allTimePeriod();
}


const currency = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const dateTime = new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" });

function monthPeriod() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString() };
}

function allTimePeriod() {
  return { start: new Date("2000-01-01T00:00:00.000Z").toISOString(), end: new Date(Date.now() + 86400000).toISOString() };
}

function Logo() {
  return <div className="brand-lockup"><div className="brand-mark"><img src="/assets/clubedocorte-favicon.png" alt="Clube do Corte" /></div><div><div className="brand-name">clube do corte</div><div className="brand-caption">gestão financeira</div></div></div>;
}

function Login({ onLogin }: { onLogin: (username: string, password: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const login = trpc.auth.login.useMutation({
    onSuccess: result => { localStorage.setItem("barbfin_csrf", result.csrfToken); onLogin(username, password); toast.success("Sessão iniciada"); setPending(false); },
    onError: error => { toast.error(error.message); setPending(false); },
  });
  return <main className="auth-page"><div className="auth-panel"><Logo /><div className="auth-copy"><span className="eyebrow">Área protegida</span><h1>Controlo claro.<br /><em>Todos os dias.</em></h1><p>Registe atendimentos em segundos e acompanhe o resultado real da sua barbearia.</p></div><form onSubmit={event => { event.preventDefault(); setPending(true); login.mutate({ username, password }); }} className="auth-form"><label>Utilizador<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" /></label><label>Palavra-passe<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" autoFocus /></label><button className="primary-button wide" disabled={pending}>{pending ? "A validar…" : "Entrar no Clube do Corte"}<ChevronDown size={17} className="rotate-[-90deg]" /></button></form><div className="security-note"><ShieldCheck size={16} /> Sessão protegida e dados financeiros privados</div></div><div className="auth-aside"><div className="aside-number">01</div><div className="aside-line" /><p>Uma visão simples do que entra, do que sai e do que fica.</p></div></main>;
}

function AdminLoginModal({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const login = trpc.auth.login.useMutation({
    onSuccess: result => { localStorage.setItem("barbfin_csrf", result.csrfToken); toast.success("Sessão de proprietário iniciada"); onDone(); },
    onError: error => toast.error(error.message),
  });
  return <div className="admin-modal-backdrop"><div className="admin-modal"><button className="icon-button admin-modal-close" onClick={onDone}><X size={18} /></button><span className="eyebrow">Área do proprietário</span><h2>Entrar como Admin</h2><p>A gestão financeira e as definições ficam protegidas por palavra-passe.</p><form className="auth-form" onSubmit={event => { event.preventDefault(); login.mutate({ username: "admin", password }); }}><label>Palavra-passe<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoFocus autoComplete="current-password" /></label><button className="primary-button wide" disabled={login.isPending}>{login.isPending ? "A validar…" : "Entrar na área Admin"}<ChevronDown size={17} className="rotate-[-90deg]" /></button></form></div></div>;
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = trpc.auth.changePassword.useMutation({ onSuccess: () => { toast.success("Palavra-passe atualizada"); onDone(); }, onError: error => toast.error(error.message) });
  return <main className="auth-page"><div className="auth-panel compact"><Logo /><span className="eyebrow">Primeiro acesso</span><h1>Defina uma nova<br /><em>palavra-passe.</em></h1><p>A palavra-passe inicial deve ser alterada antes de aceder ao sistema.</p><form className="auth-form" onSubmit={event => { event.preventDefault(); if (password.length < 10) return toast.error("Use pelo menos 10 caracteres"); if (password !== confirm) return toast.error("As palavras-passe não coincidem"); change.mutate({ password }); }}><label>Nova palavra-passe<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoFocus /></label><label>Confirmar palavra-passe<input value={confirm} onChange={event => setConfirm(event.target.value)} type="password" /></label><button className="primary-button wide" disabled={change.isPending}>Guardar e continuar</button></form></div></main>;
}

function StatCard({ label, value, detail, tone = "emerald", icon }: { label: string; value: string; detail?: string; tone?: string; icon: React.ReactNode }) {
  return <article className={`stat-card ${tone}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

function Shell({ active, setActive, user, onLogout, onAdminLogin, children }: { active: NavKey; setActive: (key: NavKey) => void; user: { username: string; role: string } | null; onLogout: () => void; onAdminLogin?: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const nav: { key: NavKey; label: string; icon: React.ReactNode; admin?: boolean }[] = [
    { key: "operation", label: "Registar atendimento", icon: <Plus size={17} /> },
    { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} />, admin: true },
    { key: "reports", label: "Relatórios", icon: <BarChart3 size={17} />, admin: true },
    { key: "movements", label: "Movimentos", icon: <ClipboardList size={17} />, admin: true },
    { key: "expenses", label: "Despesas", icon: <Receipt size={17} />, admin: true },
    { key: "barbers", label: "Barbeiros", icon: <UsersRound size={17} />, admin: true },
    { key: "settings", label: "Definições", icon: <Settings2 size={17} />, admin: true },
  ];
  return <div className="app-shell"><aside className={`sidebar ${open ? "open" : ""}`}><div className="sidebar-head"><Logo /><button className="icon-button mobile-only" onClick={() => setOpen(false)}><X size={19} /></button></div><div className="workspace-tag"><span className="live-dot" /> Barbearia principal</div><nav>{nav.filter(item => !item.admin || user?.role === "admin").map(item => <button key={item.key} className={active === item.key ? "active" : ""} onClick={() => { setActive(item.key); setOpen(false); }}>{item.icon}<span>{item.label}</span>{item.key === "operation" && <span className="nav-shortcut">⌘K</span>}</button>)}</nav><div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{user ? user.username.slice(0, 1).toUpperCase() : "B"}</div><div><strong>{user?.username ?? "Modo barbeiro"}</strong><small>{user ? (user.role === "admin" ? "Administrador" : "Barbeiro") : "Sem palavra-passe"}</small></div>{user ? <button className="icon-button" onClick={onLogout} title="Terminar sessão"><LogOut size={16} /></button> : <button className="icon-button" onClick={onAdminLogin} title="Entrar como Admin"><ShieldCheck size={16} /></button>}</div><div className="version">CLUBE DO CORTE <span>v1.0</span></div></div></aside><div className="main-area"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>Clube do Corte</span><span>/</span><strong>{user ? nav.find(item => item.key === active)?.label : "Modo barbeiro"}</strong></div><div className="topbar-actions"><span className="today-label">{new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(new Date())}</span>{user ? <div className="top-avatar">{user.username.slice(0, 1).toUpperCase()}</div> : <button className="secondary-button admin-entry" onClick={onAdminLogin}><ShieldCheck size={15} /> Admin</button>}</div></header><main className="content">{children}</main></div></div>;
}

function OperationPage({ user }: { user: { role: string; barberId: string | null } | null }) {
  const utils = trpc.useUtils();
  const catalog = trpc.catalog.list.useQuery(undefined, { retry: 1 });
  const [barberId, setBarberId] = useState(user?.barberId ?? "");
  const [services, setServices] = useState<Item[]>([]);
  const [products, setProducts] = useState<Item[]>([]);
  const [payment, setPayment] = useState("Dinheiro");
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"services" | "products">("services");
  const create = trpc.sales.create.useMutation({ onSuccess: () => { toast.success("Atendimento guardado"); setServices([]); setProducts([]); setNotes(""); utils.dashboard.summary.invalidate(); utils.dashboard.trend.invalidate(); utils.dashboard.comparison.invalidate(); utils.sales.recent.invalidate(); utils.movements.list.invalidate(); }, onError: error => toast.error(error.message) });
  const activeBarbers = (catalog.data?.barbers ?? []) as BarberCatalog[];
  const serviceCatalog = (catalog.data?.services ?? []) as CatalogItem[];
  const productCatalog = (catalog.data?.products ?? []) as CatalogItem[];
  const selectedBarber = activeBarbers.find(item => item.id === barberId);
  const totalOf = (items: Item[], list: CatalogItem[], customPrice = false) => items.reduce((sum, item) => { const catalogPrice = list.find(entry => entry.id === item.id)?.price ?? 0; const unitPrice = customPrice ? (item.unitPrice ?? catalogPrice) : catalogPrice; return sum + unitPrice * item.quantity; }, 0);
  const servicesTotal = totalOf(services, serviceCatalog, true);
  const productsTotal = totalOf(products, productCatalog, true);
  const total = servicesTotal + productsTotal;
  const toggleItem = (type: "service" | "product", id: string) => {
    const setter = type === "service" ? setServices : setProducts;
    setter(items => items.some(item => item.id === id) ? items.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item) : [...items, { id, quantity: 1 }]);
  };
  const updateQty = (type: "service" | "product", id: string, delta: number) => { const setter = type === "service" ? setServices : setProducts; setter(items => items.map(item => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0)); };
  const updateItemPrice = (type: "service" | "product", id: string, value: number) => { const setter = type === "service" ? setServices : setProducts; setter(items => items.map(item => item.id === id ? { ...item, unitPrice: Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0 } : item)); };
  const selectedRows = [...services.map(item => ({ ...item, type: "service" as const, data: serviceCatalog.find(entry => entry.id === item.id) })), ...products.map(item => ({ ...item, type: "product" as const, data: productCatalog.find(entry => entry.id === item.id) }))];
  return <section className="operation-page"><div className="page-heading"><div><span className="eyebrow">Operação diária</span><h1>Registar atendimento</h1><p>Uma operação independente por atendimento, sem perder nenhum detalhe.</p></div><div className="date-pill"><span className="live-dot" /> Registo em tempo real</div></div><div className="operation-grid"><div className="operation-main"><div className="section-card barber-picker"><div className="card-heading"><div><span className="step-number">01</span><div><h2>Quem fez o atendimento?</h2><p>Selecione o barbeiro responsável</p></div></div><UserRound size={19} /></div><div className="barber-grid">{activeBarbers.map(barber => <button key={barber.id} className={`barber-card ${barberId === barber.id ? "selected" : ""}`} onClick={() => setBarberId(barber.id)}><span className="barber-avatar">{barber.name.split(" ").map((part: string) => part[0]).join("").slice(0, 2)}</span><span>{barber.name}</span>{barberId === barber.id && <span className="selected-mark">✓</span>}</button>)}</div></div><div className="section-card catalog-card"><div className="card-heading"><div><span className="step-number">02</span><div><h2>Serviços e produtos</h2><p>Adicione tudo o que entrou neste atendimento</p></div></div><Package size={19} /></div><div className="segmented"><button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}>Serviços <span>{serviceCatalog.length}</span></button><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Produtos <span>{productCatalog.length}</span></button></div><div className="catalog-grid">{(tab === "services" ? serviceCatalog : productCatalog).map(item => <button className="catalog-item" key={item.id} onClick={() => toggleItem(tab === "services" ? "service" : "product", item.id)}><span className="catalog-icon">{tab === "services" ? <Scissors size={18} /> : <Package size={18} />}</span><span className="catalog-item-text"><strong>{item.name}</strong><small>{currency.format(item.price)}</small></span><Plus size={17} /></button>)}</div></div><div className="section-card notes-card"><div className="card-heading compact-heading"><div><h2>Nota interna <span>opcional</span></h2><p>Informação útil sobre este atendimento</p></div><FileText size={18} /></div><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: cliente pediu acabamento mais curto…" /></div></div><aside className="checkout-card"><div className="checkout-top"><span className="eyebrow">Resumo</span><span className="operation-id">#{new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span></div><h2>Fechar atendimento</h2><div className="summary-bar"><span className="summary-avatar">{selectedBarber ? selectedBarber.name.slice(0, 1) : "?"}</span><div><small>Barbeiro</small><strong>{selectedBarber?.name ?? "Selecione acima"}</strong></div></div><div className="checkout-items">{selectedRows.length === 0 ? <div className="empty-checkout"><Plus size={18} /><span>Adicione serviços<br />ou produtos</span></div> : selectedRows.map(row => <div className="checkout-row" key={`${row.type}-${row.id}`}><div><strong>{row.data?.name}</strong><small>{row.quantity} × {currency.format(row.unitPrice ?? row.data?.price ?? 0)}</small>{<label className="unit-price-editor">Preço unitário<input type="number" min="0" max="100000" step="0.01" value={row.unitPrice ?? row.data?.price ?? 0} onChange={event => updateItemPrice(row.type, row.id, Number(event.target.value))} /></label>}</div><div className="qty-control"><button onClick={() => updateQty(row.type, row.id, -1)}>-</button><span>{row.quantity}</span><button onClick={() => updateQty(row.type, row.id, 1)}>+</button></div><strong>{currency.format((row.unitPrice ?? row.data?.price ?? 0) * row.quantity)}</strong></div>)}</div><div className="total-breakdown"><div><span>Serviços</span><strong>{currency.format(servicesTotal)}</strong></div><div><span>Produtos</span><strong>{currency.format(productsTotal)}</strong></div><div className="grand-total"><span>Total</span><strong>{currency.format(total)}</strong></div></div><label className="select-label">Método de pagamento<select value={payment} onChange={event => setPayment(event.target.value)}>{(catalog.data?.paymentMethods as PaymentMethod[] ?? [{ name: "Dinheiro" }, { name: "Cartão" }, { name: "MB WAY" }, { name: "Outro" }]).map(method => <option key={method.name}>{method.name}</option>)}</select></label><button className="primary-button wide checkout-button" disabled={!barberId || total <= 0 || create.isPending} onClick={() => create.mutate({ barberId, services, products, paymentMethod: payment, notes: notes || undefined })}>{create.isPending ? "A guardar…" : "Confirmar atendimento"}<ChevronDown size={17} className="rotate-[-90deg]" /></button><p className="secure-footnote"><ShieldCheck size={14} /> Guardado com data e hora atual</p></aside></div></section>;
}

function DashboardPage() {
  const today = new Date();
  const [view, setView] = useState<DashboardView>("all");
  const [selectedMonth, setSelectedMonth] = useState(today.toISOString().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today.toISOString().slice(0, 10));
  const range = useMemo(() => rangeForDashboard(view, selectedMonth, selectedDay), [view, selectedMonth, selectedDay]);
  const trendRange = useMemo(() => view === "all" ? monthPeriod() : range, [view, range]);
  const summary = trpc.dashboard.summary.useQuery(range);
  const trend = trpc.dashboard.trend.useQuery(trendRange);
  const recent = trpc.sales.recent.useQuery({ limit: 6 });
  const recentSales = (recent.data ?? []) as RecentSale[];
  if (summary.isLoading) return <Loading />;
  const data = summary.data ?? { revenue: 0, expenses: 0, profit: 0, averageRevenue: 0, averageProfit: 0, periodDays: 1, appointments: 0, services: 0, products: 0, commissions: 0, commissionPayments: 0, bestSellers: [] };
  return <section><PageHeader eyebrow="Visão geral" title="Dashboard financeiro" description="O pulso financeiro da sua barbearia, num só lugar." action={<div className="dashboard-filter"><select value={view} onChange={event => setView(event.target.value as DashboardView)}><option value="today">Hoje</option><option value="currentMonth">Este mês</option><option value="previousMonth">Mês anterior</option><option value="year">Este ano</option><option value="all">Todo o histórico</option><option value="month">Escolher mês</option><option value="day">Escolher dia</option></select>{view === "month" && <input type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} />}{view === "day" && <input type="date" value={selectedDay} onChange={event => setSelectedDay(event.target.value)} />}</div>} /><div className="stats-grid"><StatCard label="Faturação" value={currency.format(data.revenue)} detail="No período selecionado" icon={<CircleDollarSign size={18} />} /><StatCard label="Despesas" value={currency.format(data.expenses)} detail="Custos registados" tone="amber" icon={<WalletCards size={18} />} /><StatCard label="Lucro líquido" value={currency.format(data.profit)} detail="Antes de distribuição" tone="navy" icon={<BarChart3 size={18} />} /><StatCard label="Comissões" value={currency.format(data.commissions)} detail="Acumuladas" tone="rose" icon={<UsersRound size={18} />} /><StatCard label="Média faturação" value={currency.format(data.averageRevenue)} detail={`Média diária · ${data.periodDays} ${data.periodDays === 1 ? "dia" : "dias"}`} tone="amber" icon={<CircleDollarSign size={18} />} /><StatCard label="Média lucro líquido" value={currency.format(data.averageProfit)} detail="Média diária do período" tone="navy" icon={<BarChart3 size={18} />} /></div><div className="secondary-stats"><div><small>Atendimentos</small><strong>{data.appointments}</strong><span>no histórico</span></div><div><small>Serviços realizados</small><strong>{data.services}</strong><span>unidades no histórico</span></div><div><small>Produtos vendidos</small><strong>{data.products}</strong><span>unidades</span></div><div><small>Ticket médio</small><strong>{currency.format(data.appointments ? data.revenue / data.appointments : 0)}</strong><span>por atendimento</span></div></div><div className="dashboard-grid"><div className="chart-card"><div className="card-heading"><div><span className="eyebrow">Performance</span><h2>Entradas vs. saídas</h2></div><span className="legend"><i className="legend-income" /> Entradas <i className="legend-expense" /> Despesas</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend.data ?? []}><defs><linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0e8a72" stopOpacity={0.24} /><stop offset="100%" stopColor="#0e8a72" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e4e8e5" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#80908b", fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#80908b", fontSize: 11 }} tickFormatter={value => `${value}€`} /><Tooltip formatter={(value: number) => currency.format(value)} /><Area type="monotone" dataKey="revenue" name="Entradas" stroke="#0e8a72" strokeWidth={2.5} fill="url(#income)" /><Area type="monotone" dataKey="expenses" name="Despesas" stroke="#d8a450" strokeWidth={2} fill="none" /></AreaChart></ResponsiveContainer></div></div><div className="list-card"><div className="card-heading"><div><span className="eyebrow">Atividade</span><h2>Últimos atendimentos</h2></div><span className="soft-label">Mais recente</span></div><div className="recent-list">{recentSales.length === 0 ? <EmptyState text="Ainda não existem atendimentos neste período." /> : recentSales.map(sale => <div className="recent-row" key={sale.id}><span className="recent-avatar">{sale.barberName.slice(0, 1)}</span><div><strong>{sale.barberName}</strong><small>{dateTime.format(new Date(sale.soldAt))} · {sale.paymentMethod}</small></div><b>{currency.format(sale.total)}</b></div>)}</div></div></div><div className="best-sellers-card"><div className="card-heading"><div><span className="eyebrow">Mix de vendas</span><h2>O que mais sai</h2></div><span className="soft-label">Top 6 por valor</span></div><div className="seller-grid">{(data.bestSellers ?? []).length === 0 ? <EmptyState text="Registe o primeiro atendimento para ver esta análise." /> : data.bestSellers.map((item: { name: string; total: number }, index: number) => <div className="seller-row" key={item.name}><span className="seller-rank">0{index + 1}</span><span className="seller-name">{item.name}</span><span className="seller-line" /><strong>{currency.format(item.total)}</strong></div>)}</div></div></section>;
}

type ComparisonPeriod = { revenue: number; appointments: number; expenses: number };
type BarberComparison = { id: string; name: string; currentMonthRevenue: number; currentMonthAppointments: number; previousMonthRevenue: number; previousMonthAppointments: number; currentYearRevenue: number; currentYearAppointments: number };
function comparisonDelta(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const percent = ((current - previous) / previous) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}%`;
}
function ComparisonCard({ title, currentLabel, previousLabel, current, previous }: { title: string; currentLabel: string; previousLabel: string; current: ComparisonPeriod; previous: ComparisonPeriod }) {
  return <article className="comparison-card"><div className="card-heading"><div><span className="eyebrow">Comparação</span><h2>{title}</h2></div><span className={`comparison-delta ${current.revenue >= previous.revenue ? "positive" : "negative"}`}>{comparisonDelta(current.revenue, previous.revenue)}</span></div><div className="comparison-values"><div><small>{currentLabel}</small><strong>{currency.format(current.revenue)}</strong><span>{current.appointments} atendimentos · {currency.format(current.expenses)} despesas</span></div><div><small>{previousLabel}</small><strong>{currency.format(previous.revenue)}</strong><span>{previous.appointments} atendimentos · {currency.format(previous.expenses)} despesas</span></div></div></article>;
}
function ReportsPage() {
  const { data, isLoading } = trpc.dashboard.comparison.useQuery();
  if (isLoading) return <Loading />;
  const report = data as { currentMonth: ComparisonPeriod; previousMonth: ComparisonPeriod; currentYear: ComparisonPeriod; previousYear: ComparisonPeriod; barbers: BarberComparison[] } | undefined;
  if (!report) return <EmptyState text="Não foi possível carregar a comparação." />;
  return <section><PageHeader eyebrow="Análise financeira" title="Relatórios" description="Compare períodos e acompanhe a evolução de cada barbeiro." action={<span className="soft-label"><BarChart3 size={14} /> Dados reais</span>} /><div className="comparison-grid"><ComparisonCard title="Este mês vs. mês anterior" currentLabel="Este mês" previousLabel="Mês anterior" current={report.currentMonth} previous={report.previousMonth} /><ComparisonCard title="Este ano vs. ano anterior" currentLabel="Este ano" previousLabel="Ano anterior" current={report.currentYear} previous={report.previousYear} /></div><div className="list-card comparison-table-card"><div className="card-heading"><div><span className="eyebrow">Evolução da equipa</span><h2>Desempenho por barbeiro</h2><p>Faturação e atendimentos deste mês, mês anterior e ano atual.</p></div></div><div className="comparison-table"><div className="comparison-table-head"><span>Barbeiro</span><span>Este mês</span><span>Mês anterior</span><span>Variação</span><span>Ano atual</span></div>{report.barbers.length === 0 ? <EmptyState text="Ainda não existem dados para comparar." /> : report.barbers.map(barber => <div className="comparison-table-row" key={barber.id}><div className="table-person"><span className="barber-avatar">{barber.name.slice(0, 2).toUpperCase()}</span><div><strong>{barber.name}</strong><small>{barber.currentMonthAppointments} atendimentos este mês</small></div></div><strong>{currency.format(barber.currentMonthRevenue)}<small>{barber.currentMonthAppointments} atend.</small></strong><strong>{currency.format(barber.previousMonthRevenue)}<small>{barber.previousMonthAppointments} atend.</small></strong><span className={barber.currentMonthRevenue >= barber.previousMonthRevenue ? "positive" : "negative"}>{comparisonDelta(barber.currentMonthRevenue, barber.previousMonthRevenue)}</span><strong>{currency.format(barber.currentYearRevenue)}<small>{barber.currentYearAppointments} atend.</small></strong></div>)}</div></div></section>;
}

function ExpensesPage() {
  const range = useMemo(monthPeriod, []);
  const utils = trpc.useUtils();
  const list = trpc.expenses.list.useQuery({ ...range, category: undefined });
  const categories = trpc.admin.categories.useQuery();
  const create = trpc.expenses.create.useMutation({ onSuccess: () => { toast.success("Despesa registada"); utils.expenses.list.invalidate(); utils.dashboard.summary.invalidate(); utils.dashboard.trend.invalidate(); utils.movements.list.invalidate(); setForm({ description: "", category: categories.data?.[0]?.name ?? "Renda", amount: "", date: new Date().toISOString().slice(0, 10), paymentMethod: "Dinheiro", notes: "" }); }, onError: error => toast.error(error.message) });
  const [form, setForm] = useState({ description: "", category: "Renda", amount: "", date: new Date().toISOString().slice(0, 10), paymentMethod: "Dinheiro", notes: "" });
  const categoryRows = (categories.data ?? []) as CategoryRow[];
  const expenseRows = (list.data ?? []) as ExpenseRow[];
  return <section><PageHeader eyebrow="Saídas financeiras" title="Despesas" description="Registe e acompanhe os custos da operação." action={<span className="soft-label"><Receipt size={14} /> {expenseRows.length} neste mês</span>} /><div className="two-column"><div className="section-card"><div className="card-heading"><div><span className="eyebrow">Novo movimento</span><h2>Registar despesa</h2></div><Plus size={18} /></div><form className="stack-form" onSubmit={event => { event.preventDefault(); create.mutate({ description: form.description, category: form.category, amount: Number(form.amount), date: new Date(`${form.date}T12:00:00`).toISOString(), paymentMethod: form.paymentMethod, notes: form.notes || undefined }); }}><label>Descrição<input required value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Ex.: renda do espaço" /></label><label>Data<input required type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><div className="form-row"><label>Categoria<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{(categoryRows.length ? categoryRows : [{ name: "Renda" }]).map(category => <option key={category.name}>{category.name}</option>)}</select></label><label>Valor (€)<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label></div><label>Método de pagamento<select value={form.paymentMethod} onChange={event => setForm({ ...form, paymentMethod: event.target.value })}><option>Dinheiro</option><option>Cartão</option><option>MB WAY</option><option>Transferência</option></select></label><label>Observações<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button" disabled={create.isPending}>Guardar despesa <Plus size={16} /></button></form></div><div className="list-card"><div className="card-heading"><div><span className="eyebrow">Histórico</span><h2>Despesas recentes</h2></div><span className="soft-label">Este mês</span></div><div className="table-list">{expenseRows.length === 0 ? <EmptyState text="Nenhuma despesa registada neste mês." /> : expenseRows.map(expense => <div className="expense-row" key={expense.id}><div className="expense-icon"><WalletCards size={16} /></div><div><strong>{expense.description}</strong><small>{expense.categoryName} · {new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(new Date(expense.expenseDate))}</small></div><b className="negative">−{currency.format(expense.amount)}</b></div>)}</div></div></div></section>;
}

function BarbersPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.barbers.useQuery();
  const [addOpen, setAddOpen] = useState(false);
  const [newBarber, setNewBarber] = useState({ name: "", commissionRate: "50", productCommissionEnabled: false, productCommissionRate: "0" });
  const create = trpc.admin.createBarber.useMutation({ onSuccess: () => { toast.success("Barbeiro adicionado"); setAddOpen(false); setNewBarber({ name: "", commissionRate: "50", productCommissionEnabled: false, productCommissionRate: "0" }); utils.admin.barbers.invalidate(); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const update = trpc.admin.updateBarber.useMutation({ onSuccess: () => { toast.success("Barbeiro atualizado"); utils.admin.barbers.invalidate(); }, onError: error => toast.error(error.message) });
  const barberRows = (data ?? []) as Array<{ id: string; name: string; appointments: number; revenue: number; commissionRate: number; productCommissionEnabled: boolean; productCommissionRate: number; active: boolean }>;
  const toggleActive = (barber: typeof barberRows[number]) => {
    update.mutate({ id: barber.id, name: barber.name, commissionRate: barber.commissionRate, productCommissionEnabled: barber.productCommissionEnabled, productCommissionRate: barber.productCommissionRate, active: !barber.active });
  };
  const editBarber = (barber: typeof barberRows[number]) => {
    const name = window.prompt("Nome do barbeiro", barber.name)?.trim();
    if (!name) return;
    const serviceInput = window.prompt("Comissão de serviços (%) — pode ser 0", String(barber.commissionRate).replace(".", ","));
    if (serviceInput === null) return;
    const productEnabled = window.confirm("Este barbeiro recebe comissão sobre produtos?");
    const productInput = window.prompt("Comissão de produtos (%) — pode ser 0", String(barber.productCommissionRate).replace(".", ","));
    if (productInput === null) return;
    const commissionRate = Number(serviceInput.replace(",", "."));
    const productCommissionRate = Number(productInput.replace(",", "."));
    if (![commissionRate, productCommissionRate].every(rate => Number.isFinite(rate) && rate >= 0 && rate <= 100)) return toast.error("As comissões devem estar entre 0% e 100%");
    update.mutate({ id: barber.id, name, commissionRate, productCommissionEnabled: productEnabled, productCommissionRate, active: barber.active });
  };
  return <section><PageHeader eyebrow="Equipa" title="Barbeiros" description="Comissões e desempenho, sem perder o lado humano." action={<button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={16} /> Adicionar barbeiro</button>} /><div className="barber-dashboard"><div className="card-heading"><div><span className="eyebrow">Faturação individual</span><h2>Quanto cada barbeiro fez</h2></div><span className="soft-label">Todo o histórico</span></div><div className="barber-performance-grid">{barberRows.map(barber => <div className="barber-performance" key={barber.id}><span className="barber-avatar">{barber.name.slice(0, 2).toUpperCase()}</span><div><strong>{barber.name}</strong><small>{barber.appointments} atendimentos · Comissão {barber.commissionRate}%</small></div><b>{currency.format(barber.revenue)}</b></div>)}</div></div><div className="barbers-table-card"><div className="table-head"><span>Barbeiro</span><span>Atendimentos</span><span>Faturação</span><span>Comissão serviços</span><span>Estado</span><span /></div>{isLoading ? <Loading /> : barberRows.map(barber => <div className="table-line" key={barber.id}><div className="table-person"><span className="barber-avatar">{barber.name.slice(0, 2).toUpperCase()}</span><div><strong>{barber.name}</strong><small>{barber.productCommissionEnabled ? `Produtos: ${barber.productCommissionRate}%` : "Produtos sem comissão"}</small></div></div><span>{barber.appointments}</span><strong>{currency.format(barber.revenue)}</strong><span className="commission-badge">{barber.commissionRate}%</span><span className={barber.active ? "status-active" : "status-off"}>{barber.active ? "Ativo" : "Inativo"}</span><button className="text-button" onClick={() => editBarber(barber)}>Editar</button><button className="text-button" onClick={() => toggleActive(barber)}>{barber.active ? "Desativar" : "Ativar"}</button></div>)}</div>{addOpen && <div className="admin-modal-backdrop"><div className="admin-modal add-barber-modal"><button className="icon-button admin-modal-close" onClick={() => setAddOpen(false)}><X size={18} /></button><span className="eyebrow">Nova pessoa</span><h2>Adicionar barbeiro</h2><p>Defina o nome e as comissões aplicadas aos próximos atendimentos.</p><form className="stack-form" onSubmit={event => { event.preventDefault(); const commissionRate = Number(newBarber.commissionRate.replace(",", ".")); const productCommissionRate = Number(newBarber.productCommissionRate.replace(",", ".")); if (!Number.isFinite(commissionRate) || !Number.isFinite(productCommissionRate) || commissionRate < 0 || commissionRate > 100 || productCommissionRate < 0 || productCommissionRate > 100) return toast.error("As comissões devem estar entre 0% e 100%"); create.mutate({ name: newBarber.name.trim(), commissionRate, productCommissionEnabled: newBarber.productCommissionEnabled, productCommissionRate }); }}><label>Nome do barbeiro<input required minLength={2} maxLength={100} autoFocus value={newBarber.name} onChange={event => setNewBarber({ ...newBarber, name: event.target.value })} placeholder="Ex.: João Silva" /></label><div className="form-row"><label>Comissão de serviços (%)<input required min="0" max="100" step="0.01" type="number" value={newBarber.commissionRate} onChange={event => setNewBarber({ ...newBarber, commissionRate: event.target.value })} /></label><label>Comissão de produtos (%)<input required min="0" max="100" step="0.01" type="number" value={newBarber.productCommissionRate} onChange={event => setNewBarber({ ...newBarber, productCommissionRate: event.target.value })} /></label></div><label className="checkbox-row"><input type="checkbox" checked={newBarber.productCommissionEnabled} onChange={event => setNewBarber({ ...newBarber, productCommissionEnabled: event.target.checked })} /> Recebe comissão sobre produtos</label><button className="primary-button wide" disabled={create.isPending}>{create.isPending ? "A guardar…" : "Guardar barbeiro"}<Plus size={16} /></button></form></div></div>}</section>;
}

function MovementsPage() {
  const range = useMemo(monthPeriod, []);
  const { data, isLoading } = trpc.movements.list.useQuery(range);
  const rows = (data ?? []) as Movement[];
  return <section><PageHeader eyebrow="Histórico financeiro" title="Movimentos" description="Cada entrada e saída registada, com data, método e responsável." action={<span className="soft-label"><ClipboardList size={14} /> {rows.length} movimentos</span>} /><div className="list-card"><div className="card-heading"><div><span className="eyebrow">Este mês</span><h2>Linha do tempo financeira</h2></div><span className="soft-label">Dados reais</span></div><div className="table-list">{isLoading ? <Loading /> : rows.length === 0 ? <EmptyState text="Ainda não existem movimentos neste período." /> : rows.map(row => <div className="expense-row" key={`${row.type}-${row.id}`}><div className={`expense-icon ${row.type === "entrada" ? "income-icon" : ""}`}>{row.type === "entrada" ? <CircleDollarSign size={16} /> : <WalletCards size={16} />}</div><div><strong>{row.description}</strong><small>{row.barberName ? `${row.barberName} · ` : ""}{dateTime.format(new Date(row.occurredAt))} · {row.paymentMethod}</small></div><b className={row.type === "entrada" ? "positive" : "negative"}>{row.type === "entrada" ? "+" : "−"}{currency.format(row.amount)}</b></div>)}</div></div></section>;
}

function SettingsPage() {
  const utils = trpc.useUtils();
  const catalog = trpc.catalog.list.useQuery();
  const services = (catalog.data?.services ?? []) as CatalogItem[];
  const products = (catalog.data?.products ?? []) as CatalogItem[];
  const [tab, setTab] = useState<"services" | "products">("products");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const updateService = trpc.admin.updateService.useMutation({ onSuccess: () => { toast.success("Serviço atualizado"); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const updateProduct = trpc.admin.updateProduct.useMutation({ onSuccess: () => { toast.success("Produto atualizado"); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createService = trpc.admin.createService.useMutation({ onSuccess: () => { toast.success("Serviço adicionado"); setName(""); setPrice(""); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createProduct = trpc.admin.createProduct.useMutation({ onSuccess: () => { toast.success("Produto adicionado"); setName(""); setPrice(""); utils.catalog.list.invalidate(); }, onError: error => toast.error(error.message) });
  const editItem = (item: CatalogItem, type: "service" | "product") => {
    const nextName = window.prompt(type === "service" ? "Nome do serviço" : "Nome do produto", item.name)?.trim();
    if (!nextName) return;
    const priceInput = window.prompt("Preço (€)", String(item.price).replace(".", ","));
    if (priceInput === null) return;
    const nextPrice = Number(priceInput.replace(",", "."));
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return toast.error("Indique um preço válido");
    if (type === "service") updateService.mutate({ id: item.id, name: nextName, price: nextPrice });
    else updateProduct.mutate({ id: item.id, name: nextName, price: nextPrice });
  };
  const submit = (event: React.FormEvent) => { event.preventDefault(); const parsedPrice = Number(price.replace(",", ".")); if (name.trim().length < 2 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) return toast.error("Preencha nome e preço válido"); if (tab === "services") createService.mutate({ name: name.trim(), price: parsedPrice }); else createProduct.mutate({ name: name.trim(), price: parsedPrice }); };
  const items = tab === "services" ? services : products;
  return <section><PageHeader eyebrow="Configuração" title="Definições" description="Adicione e edite o catálogo usado pelos barbeiros no registo de atendimento." /><div className="section-card catalog-settings"><div className="segmented catalog-tabs"><button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}><Scissors size={14} /> Serviços <span>{services.length}</span></button><button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}><Package size={14} /> Produtos <span>{products.length}</span></button></div><form className="catalog-add-form" onSubmit={submit}><div><span className="eyebrow">Novo {tab === "services" ? "serviço" : "produto"}</span><strong>Adicionar ao catálogo</strong></div><input required value={name} onChange={event => setName(event.target.value)} placeholder={tab === "services" ? "Ex.: Corte infantil" : "Ex.: Spray fixador"} /><input required min="0.01" step="0.01" type="number" value={price} onChange={event => setPrice(event.target.value)} placeholder="Preço (€)" /><button className="primary-button" disabled={createService.isPending || createProduct.isPending}><Plus size={16} /> Adicionar</button></form><div className="catalog-list-heading"><div><span className="eyebrow">Catálogo ativo</span><h2>{tab === "services" ? "Serviços" : "Produtos"}</h2></div><span className="soft-label">Os valores antigos ficam preservados nos atendimentos</span></div><div className="table-list">{items.length === 0 ? <EmptyState text={`Ainda não existem ${tab === "services" ? "serviços" : "produtos"}.`} /> : items.map(item => <div className="expense-row" key={item.id}><div className="catalog-icon">{tab === "services" ? <Scissors size={16} /> : <Package size={16} />}</div><div><strong>{item.name}</strong><small>Preço atual no quiosque</small></div><b>{currency.format(item.price)}</b><button className="text-button" onClick={() => editItem(item, tab === "services" ? "service" : "product")}>Editar</button></div>)}</div></div></section>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function Loading() { return <div className="loading-state"><span className="loader" /> A carregar dados reais…</div>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><ClipboardList size={18} /><span>{text}</span></div>; }

export default function Home() {
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const [active, setActive] = useState<NavKey>("operation");
  const [user, setUser] = useState(auth.data?.user ?? null);
  const [adminOpen, setAdminOpen] = useState(false);
  useEffect(() => { if (auth.data?.user) setUser(auth.data.user); if (auth.data?.csrfToken) localStorage.setItem("barbfin_csrf", auth.data.csrfToken); }, [auth.data]);
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { localStorage.removeItem("barbfin_csrf"); setUser(null); setActive("operation"); auth.refetch(); } });
  if (auth.isLoading) return <Loading />;
  if (user?.mustChangePassword) return <ChangePassword onDone={() => auth.refetch()} />;
  return <><Shell active={user ? active : "operation"} setActive={setActive} user={user} onLogout={() => logout.mutate()} onAdminLogin={() => setAdminOpen(true)}>{(!user || active === "operation") && <OperationPage user={user} />}{user && active === "dashboard" && <DashboardPage />}{user && active === "reports" && <ReportsPage />}{user && active === "expenses" && <ExpensesPage />}{user && active === "barbers" && <BarbersPage />}{user && active === "movements" && <MovementsPage />}{user && active === "settings" && <SettingsPage />}</Shell>{adminOpen && <AdminLoginModal onDone={() => { setAdminOpen(false); auth.refetch(); }} />}</>;
}
