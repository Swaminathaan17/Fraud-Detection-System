import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { AlertCircle, ArrowLeft, ArrowUpRight, ChartNoAxesCombined, Check, ChevronRight, CircleDollarSign, CreditCard, FileSearch, Fingerprint, LayoutDashboard, ListFilter, Plus, Search, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, AreaChart, BarChart, Bar } from 'recharts';
import { getGetFraudTransactionsQueryKey, getGetStatisticsQueryKey, getGetTransactionsQueryKey, useCreateTransaction, useGetFraudTransactions, useGetStatistics, useGetTransaction, useGetTransactions } from '@workspace/api-client-react';
import type { Transaction, TransactionInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchInterval: 15000 } } });
const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: CreditCard },
  { href: '/alerts', label: 'Fraud alerts', icon: ShieldAlert },
  { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
];
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const axisMoney = (value: number) => `₹${Number(value).toLocaleString('en-IN')}`;
type RiskLevel = 'low' | 'medium' | 'high' | 'unclassified';
function riskLevel(transaction: Pick<Transaction, 'fraud' | 'fraudReason'>): RiskLevel {
  if (!transaction.fraud) return 'low';
  const reason = transaction.fraudReason ?? '';
  if (reason.includes('Amount exceeds Rs.1,00,000') || reason.includes('Duplicate Transaction ID')) return 'high';
  if (reason.includes('Amount exceeds Rs.50,000') || reason.includes('Rapid Activity')) return 'medium';
  return 'unclassified';
}
const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
};
const shortDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
};
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';

function Status({ fraud }: { fraud: boolean }) {
  return <span className={`status ${fraud ? 'fraud' : 'safe'}`}>{fraud ? 'Flagged' : 'Clear'}</span>;
}

function RiskPill({ transaction }: { transaction: Pick<Transaction, 'fraud' | 'fraudReason'> }) {
  const level = riskLevel(transaction);
  const label = level === 'unclassified' ? 'Review' : `${level[0].toUpperCase()}${level.slice(1)} risk`;
  return <span className={`risk-pill risk-${level}`}>{label}</span>;
}

function TransactionTable({ rows, compact = false }: { rows: Transaction[]; compact?: boolean }) {
  return <div className="table-wrap"><table className="data-table">
    <thead><tr><th>Transaction</th><th>Customer</th><th>Amount</th><th>Time</th><th>Assessment</th><th>Risk</th>{!compact && <th aria-label="Open" />}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.transactionId}-${row.timestamp}-${index}`} data-testid={`row-transaction-${row.transactionId}`}>
      <td><Link className="id-link" href={`/investigation/${row.transactionId}`}>TX-{row.transactionId}</Link></td>
      <td><div className="person"><span className="person-initial">{initials(row.userName)}</span><span className="person-name" data-testid={`text-username-${row.transactionId}`}>{row.userName}</span></div></td>
      <td className="mono">{money(row.amount)}</td><td>{dateTime(row.timestamp)}</td><td><Status fraud={row.fraud} /></td><td><RiskPill transaction={row} /></td>
      {!compact && <td><Link className="row-action" href={`/investigation/${row.transactionId}`} aria-label={`Inspect transaction ${row.transactionId}`}><ChevronRight size={16} /></Link></td>}
    </tr>)}</tbody>
  </table></div>;
}

function LoadingCards() {
  return <div className="stats-grid" aria-label="Loading transaction statistics">{[0, 1, 2, 3].map(i => <div className="skeleton skeleton-card" key={i} />)}</div>;
}

function QueryError({ onRetry, message = 'We could not retrieve this data from the service.' }: { onRetry: () => void; message?: string }) {
  return <div className="panel error-state" role="alert"><div className="state-mark"><AlertCircle /></div><div className="state-title">Connection interrupted</div><p className="state-copy">{message} Your records are not replaced with sample data.</p><button className="button-secondary" onClick={onRetry} data-testid="button-retry"><ArrowUpRight size={14} /> Retry request</button></div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><div className="state-mark"><FileSearch /></div><div className="state-title">{title}</div><p className="state-copy">{copy}</p></div>;
}

function NavLinks({ current }: { current: string }) {
  return <>{navItems.map(({ href, label, icon: Icon }) => {
    const active = href === '/' ? current === '/' : current.startsWith(href);
    return <Link key={href} href={href} className={`nav-link ${active ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replace(/\s/g, '-')}`} aria-current={active ? 'page' : undefined}><Icon /><span>{label}</span></Link>;
  })}</>;
}

function Sidebar({ current, apiState }: { current: string; apiState: 'loading' | 'ready' | 'error' }) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark"><Fingerprint size={20} /></span>FraudGuard</div>
    <div className="workspace-label">Monitor</div><nav className="nav-list" aria-label="Main navigation"><NavLinks current={current} /></nav>
    <div className="sidebar-bottom">
      <div className="live-chip"><div className="live-line"><span className="live-dot" style={apiState === 'error' ? { background: '#db8278' } : undefined} />{apiState === 'loading' ? 'Checking service' : apiState === 'error' ? 'Service unavailable' : 'Service connected'}</div><div className="live-caption">Transaction API status</div></div>
      <div className="sidebar-user"><span className="avatar">FG</span><div><div className="user-name">Fraud operations</div><div className="user-role">Investigator workspace</div></div></div>
    </div>
  </aside>;
}

function Header({ current, onCreate, apiState }: { current: string; onCreate: () => void; apiState: 'loading' | 'ready' | 'error' }) {
  const page = current.startsWith('/investigation') ? 'Investigation' : navItems.find(item => item.href === current)?.label ?? (current.startsWith('/transactions') ? 'Transactions' : 'Overview');
  return <header className="topbar"><div className="topbar-left"><div className="crumb">FraudGuard <ChevronRight size={13} /> <strong>{page}</strong></div></div>
    <div className="mobile-head"><span className="brand-mark"><Fingerprint /></span>FraudGuard</div>
    <div className="topbar-right"><div className="system-tag"><span className="live-dot" style={apiState === 'error' ? { background: '#cb625b' } : undefined} />{apiState === 'ready' ? 'API operational' : apiState === 'loading' ? 'Checking API' : 'API unavailable'}</div><button className="icon-button" aria-label="Record a transaction" title="Record transaction" onClick={onCreate} data-testid="button-new-transaction-icon"><Plus size={16} /></button></div>
  </header>;
}

function StatCard({ label, value, detail, icon: Icon, variant }: { label: string; value: string; detail: string; icon: typeof CreditCard; variant?: 'fraud' }) {
  return <article className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-icon" style={variant ? { background: '#fae9e6', color: '#b4443b' } : undefined}><Icon /></span></div><div className="stat-value" data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>{value}</div><div className="stat-foot">{variant ? <ArrowUpRight className="positive" size={13} /> : <Check className="positive" size={13} />}{detail}</div></article>;
}

function Dashboard() {
  const transactions = useGetTransactions();
  const stats = useGetStatistics();
  const rows = transactions.data ?? [];
  const sorted = [...rows].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  if (transactions.isLoading || stats.isLoading) return <><PageHeading eyebrow="Operations / overview" title="Good morning" subtitle="A clear view of payment activity and service assessments." /><LoadingCards /><div className="skeleton skeleton-card" /></>;
  if (transactions.isError || stats.isError) return <><PageHeading eyebrow="Operations / overview" title="Good morning" subtitle="A clear view of payment activity and service assessments." /><QueryError onRetry={() => { transactions.refetch(); stats.refetch(); }} /></>;
  const s = stats.data;
  if (!s) return <><PageHeading eyebrow="Operations / overview" title="Good morning" subtitle="A clear view of payment activity and service assessments." /><QueryError onRetry={() => { transactions.refetch(); stats.refetch(); }} /></>;
  const highRiskCount = rows.filter(row => riskLevel(row) === 'high').length;
  return <>
    <PageHeading eyebrow="Operations / overview" title="Good morning" subtitle="A clear view of payment activity and service assessments." />
    <div className="stats-grid">
      <StatCard label="Total transactions" value={s.total.toLocaleString()} detail="All recorded payments" icon={CreditCard} />
      <StatCard label="Fraud detected" value={s.fraud.toLocaleString()} detail="Flagged by service rules" icon={ShieldAlert} variant="fraud" />
      <StatCard label="Fraud rate" value={`${s.fraudRatePercent.toFixed(1)}%`} detail="Of recorded transactions" icon={ArrowUpRight} variant="fraud" />
      <StatCard label="Amount at risk" value={money(s.fraudAmount)} detail="Total value of flagged activity" icon={CircleDollarSign} variant="fraud" />
      <StatCard label="High risk transactions" value={highRiskCount.toLocaleString()} detail="Rule-derived; no model score" icon={ShieldAlert} variant="fraud" />
    </div>
    <div className="overview-grid">
      <section className="panel"><div className="panel-head"><div><div className="panel-title">Payment activity</div><div className="panel-caption">Transaction amounts over the latest recorded activity</div></div><Link href="/analytics" className="panel-action">View analytics</Link></div>
        {rows.length ? <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartTransactions(sorted)} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#397c62" stopOpacity={.2} /><stop offset="100%" stopColor="#397c62" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#eeeae2" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} tickFormatter={axisMoney} /><Tooltip formatter={(v: number) => money(v)} contentStyle={{ border: '1px solid #e8e3da', borderRadius: 9, fontSize: 11 }} /><Area type="monotone" dataKey="amount" name="Payment volume" stroke="#397c62" strokeWidth={2} fill="url(#volumeFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyState title="No payment activity yet" copy="Once the service records transactions, payment activity will appear here." />}
      </section>
      <section className="panel"><div className="panel-head"><div><div className="panel-title">Assessment split</div><div className="panel-caption">Service-returned fraud status</div></div><ListFilter size={16} color="#82908c" /></div>
        {s.total > 0 ? <><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: 'Clear', value: s.safe }, { name: 'Flagged', value: s.fraud }]} dataKey="value" innerRadius={51} outerRadius={68} paddingAngle={3} stroke="none"><Cell fill="#4e9274" /><Cell fill="#d07163" /></Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><div className="donut-number">{s.fraudRatePercent.toFixed(1)}%</div><div className="donut-label">flagged rate</div></div></div><div className="legend"><div className="legend-row"><span className="legend-name"><i className="legend-dot" style={{ background: '#4e9274' }} />Clear assessments</span><span className="legend-value">{s.safe}</span></div><div className="legend-row"><span className="legend-name"><i className="legend-dot" style={{ background: '#d07163' }} />Flagged assessments</span><span className="legend-value">{s.fraud}</span></div></div></> : <EmptyState title="Nothing to summarize" copy="The assessment split appears when transactions are returned by the service." />}
      </section>
    </div>
    <section className="panel"><div className="panel-head"><div><div className="panel-title">Latest transactions</div><div className="panel-caption">Most recently recorded service assessments</div></div><Link href="/transactions" className="panel-action">All transactions</Link></div>
      {sorted.length ? <TransactionTable rows={sorted.slice(0, 5)} compact /> : <EmptyState title="No transactions recorded" copy="Record a payment to receive its assessment from the fraud service." />}
    </section>
  </>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}

function TransactionsPage() {
  const query = useGetTransactions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);
  const data = query.data ?? [];
  const filtered = useMemo(() => data.filter(row => {
    const needle = search.trim().toLowerCase();
    return (!needle || `${row.userName} ${row.transactionId} ${row.fraudReason}`.toLowerCase().includes(needle)) && (status === 'all' || (status === 'flagged' ? row.fraud : !row.fraud));
  }).sort((a, b) => sort === 'newest' ? new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() : sort === 'oldest' ? new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() : sort === 'highest' ? b.amount - a.amount : a.amount - b.amount), [data, search, status, sort]);
  useEffect(() => setPage(0), [data, search, status, sort]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  return <>
    <PageHeading eyebrow="Operations / ledger" title="Transactions" subtitle="Search and inspect the exact assessment returned for each payment." action={<button className="button-primary" onClick={() => window.dispatchEvent(new Event('fraudguard:create'))} data-testid="button-record-transaction"><Plus /> Record transaction</button>} />
    <div className="filters">
      <label className="searchbox"><Search /><input className="field" type="search" aria-label="Search transactions" placeholder="Search name, ID, or reason" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-transactions" /></label>
      <select className="select-field" aria-label="Filter assessment status" value={status} onChange={e => setStatus(e.target.value)} data-testid="select-transaction-status"><option value="all">All assessments</option><option value="flagged">Flagged only</option><option value="safe">Clear only</option></select>
      <select className="select-field" aria-label="Sort transactions" value={sort} onChange={e => setSort(e.target.value)} data-testid="select-transaction-sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest amount</option><option value="lowest">Lowest amount</option></select>
      <div className="table-count">{filtered.length} {filtered.length === 1 ? 'record' : 'records'}</div>
    </div>
    {query.isLoading ? <div className="panel skeleton" style={{ height: 280 }} aria-label="Loading transactions" /> : query.isError ? <QueryError onRetry={() => query.refetch()} /> :
      <section className="panel table-card">{filtered.length ? <TransactionTable rows={pageRows} /> : <EmptyState title={data.length ? 'No matching transactions' : 'No transactions recorded'} copy={data.length ? 'Try a different search or assessment filter.' : 'When payments are recorded by the service, they will appear in this ledger.'} />}</section>}
    {filtered.length > pageSize && <div className="pagination"><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span><div><button className="button-secondary" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}>Previous</button><span>Page {page + 1} of {pageCount}</span><button className="button-secondary" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</button></div></div>}
  </>;
}

function AlertsPage() {
  const query = useGetFraudTransactions();
  const [search, setSearch] = useState('');
  const rows = query.data ?? [];
  const shown = rows.filter(r => `${r.transactionId} ${r.userName} ${r.fraudReason}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeading eyebrow="Operations / review queue" title="Fraud alerts" subtitle="Transactions the existing service rules returned as flagged." />
    <div className="filters"><label className="searchbox"><Search /><input className="field" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search flagged activity" aria-label="Search fraud alerts" data-testid="input-search-alerts" /></label><div className="table-count">{shown.length} flagged {shown.length === 1 ? 'transaction' : 'transactions'}</div></div>
    {query.isLoading ? <div className="panel skeleton" style={{ height: 260 }} aria-label="Loading fraud alerts" /> : query.isError ? <QueryError onRetry={() => query.refetch()} /> : !shown.length ? <section className="panel">{rows.length ? <EmptyState title="No matching alerts" copy="Try a different name, transaction ID, or assessment reason." /> : <EmptyState title="No flagged transactions" copy="The service has not returned any flagged transactions." />}</section> :
      <div className="alert-list">{shown.map(row => <article key={row.transactionId} className="alert-row" data-testid={`alert-transaction-${row.transactionId}`}><div className="alert-icon"><ShieldAlert /></div><div><Link className="id-link" href={`/investigation/${row.transactionId}`}>TX-{row.transactionId} <span style={{ color: 'var(--muted-foreground)' }}>· {row.userName}</span></Link><div className="alert-reason">{row.fraudReason}</div></div><div className="alert-amount">{money(row.amount)}</div><Link className="row-action" href={`/investigation/${row.transactionId}`} aria-label={`Inspect flagged transaction ${row.transactionId}`}><ChevronRight size={17} /></Link></article>)}</div>}
  </>;
}

function chartTransactions(rows: Transaction[]) {
  return rows.slice(0, 12).reverse().map(row => ({ date: shortDate(row.timestamp), amount: row.amount, flagged: row.fraud ? row.amount : 0, safe: row.fraud ? 0 : row.amount }));
}

function AnalyticsPage() {
  const query = useGetTransactions();
  const rows = query.data ?? [];
  const byDay = useMemo(() => {
    const map = new Map<string, { date: string; flagged: number; clear: number; count: number }>();
    rows.forEach(row => {
      const day = shortDate(row.timestamp);
      const item = map.get(day) ?? { date: day, flagged: 0, clear: 0, count: 0 };
      item[row.fraud ? 'flagged' : 'clear'] += 1; item.count += 1; map.set(day, item);
    });
    return [...map.values()].slice(-14);
  }, [rows]);
  const amounts = useMemo(() => {
    const bins = new Map<string, number>([['≤ ₹50k', 0], ['₹50k–₹1L', 0], ['> ₹1L', 0]]);
    rows.forEach(row => { const key = row.amount <= 50000 ? '≤ ₹50k' : row.amount <= 100000 ? '₹50k–₹1L' : '> ₹1L'; bins.set(key, (bins.get(key) ?? 0) + 1); });
    return [...bins].map(([range, count]) => ({ range, count }));
  }, [rows]);
  const riskDistribution = useMemo(() => {
    const labels: { level: RiskLevel; name: string; fill: string }[] = [
      { level: 'low', name: 'Low', fill: '#4e9274' },
      { level: 'medium', name: 'Medium', fill: '#d39a46' },
      { level: 'high', name: 'High', fill: '#d07163' },
      { level: 'unclassified', name: 'Unclassified flagged', fill: '#77828a' },
    ];
    return labels.map(item => ({ ...item, count: rows.filter(row => riskLevel(row) === item.level).length })).filter(item => item.level !== 'unclassified' || item.count > 0);
  }, [rows]);
  const suspiciousUsers = useMemo(() => {
    const grouped = new Map<string, { userName: string; count: number; amount: number }>();
    rows.filter(row => row.fraud).forEach(row => {
      const item = grouped.get(row.userName) ?? { userName: row.userName, count: 0, amount: 0 };
      item.count += 1;
      item.amount += row.amount;
      grouped.set(row.userName, item);
    });
    return [...grouped.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 5);
  }, [rows]);
  if (query.isLoading) return <><PageHeading eyebrow="Operations / insights" title="Analytics" subtitle="A data view derived only from the transactions returned by the service." /><div className="skeleton skeleton-card" /></>;
  if (query.isError) return <><PageHeading eyebrow="Operations / insights" title="Analytics" subtitle="A data view derived only from the transactions returned by the service." /><QueryError onRetry={() => query.refetch()} /></>;
  return <>
    <PageHeading eyebrow="Operations / insights" title="Analytics" subtitle="A data view derived only from the transactions returned by the service." />
    {!rows.length ? <section className="panel"><EmptyState title="Not enough activity to chart" copy="Charts will populate from actual transaction records as the service receives them." /></section> :
      <div className="analytics-grid">
        <section className="panel"><div className="panel-head"><div><div className="panel-title">Assessment volume by date</div><div className="panel-caption">Flagged and clear records grouped by transaction date</div></div></div><div className="chart-large"><ResponsiveContainer width="100%" height="100%"><BarChart data={byDay} margin={{ top: 8, right: 5, left: -20, bottom: 0 }}><CartesianGrid stroke="#eeeae2" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} /><Tooltip contentStyle={{ border: '1px solid #e8e3da', borderRadius: 9, fontSize: 11 }} /><Bar dataKey="clear" name="Clear" stackId="a" fill="#4e9274" radius={[0, 0, 0, 0]} /><Bar dataKey="flagged" name="Flagged" stackId="a" fill="#d07163" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
        <section className="panel"><div className="panel-head"><div><div className="panel-title">Recorded payment amounts</div><div className="panel-caption">Transaction counts by amount range</div></div></div>{amounts.map(item => <div className="bar-row" key={item.range}><span>{item.range}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${rows.length ? Math.max(2, item.count / rows.length * 100) : 0}%` }} /></div><span className="bar-val">{item.count}</span></div>)}</section>
        <section className="panel"><div className="panel-head"><div><div className="panel-title">Risk distribution</div><div className="panel-caption">Grouped from existing rule reasons; no model score</div></div></div><div className="chart-large"><ResponsiveContainer width="100%" height="100%"><BarChart data={riskDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="#eeeae2" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} /><Tooltip contentStyle={{ border: '1px solid #e8e3da', borderRadius: 9, fontSize: 11 }} /><Bar dataKey="count" name="Transactions" radius={[4, 4, 0, 0]}>{riskDistribution.map(item => <Cell key={item.level} fill={item.fill} />)}</Bar></BarChart></ResponsiveContainer></div></section>
        <section className="panel"><div className="panel-head"><div><div className="panel-title">Top suspicious users</div><div className="panel-caption">Customers with the most service-flagged transactions</div></div></div>{suspiciousUsers.length ? <div className="chart-large"><ResponsiveContainer width="100%" height="100%"><BarChart data={suspiciousUsers} layout="vertical" margin={{ top: 6, right: 8, left: 8, bottom: 0 }}><CartesianGrid stroke="#eeeae2" horizontal={false} /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} /><YAxis type="category" dataKey="userName" width={110} axisLine={false} tickLine={false} tick={{ fill: '#69747a', fontSize: 10 }} /><Tooltip formatter={(value: number) => [value, 'Flagged transactions']} contentStyle={{ border: '1px solid #e8e3da', borderRadius: 9, fontSize: 11 }} /><Bar dataKey="count" name="Flagged transactions" fill="#d07163" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState title="No suspicious users" copy="No customers have flagged transactions in the returned data." />}</section>
        <section className="panel wide"><div className="panel-head"><div><div className="panel-title">Transaction amount trend</div><div className="panel-caption">Amounts across the latest 12 service-returned transactions</div></div></div><div className="chart-large"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartTransactions([...rows].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid stroke="#eeeae2" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858d8e', fontSize: 10 }} tickFormatter={axisMoney} /><Tooltip formatter={(v: number) => money(v)} contentStyle={{ border: '1px solid #e8e3da', borderRadius: 9, fontSize: 11 }} /><Area dataKey="amount" name="Amount" type="monotone" stroke="#397c62" fill="#e7f1eb" /></AreaChart></ResponsiveContainer></div></section>
      </div>}
  </>;
}

function InvestigationPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const query = useGetTransaction(Number.isFinite(id) ? id : 0);
  const row = query.data;
  if (query.isLoading) return <><PageHeading eyebrow="Operations / investigation" title="Loading assessment" subtitle="Retrieving the recorded transaction from the service." /><div className="skeleton skeleton-card" /></>;
  if (query.isError || !row) return <><PageHeading eyebrow="Operations / investigation" title="Assessment unavailable" subtitle="The requested transaction could not be retrieved." /><QueryError onRetry={() => query.refetch()} message="We could not load this transaction. Confirm the ID and retry." /><Link href="/transactions" className="button-secondary" style={{ marginTop: 12 }}>Return to transactions</Link></>;
  return <>
    <div className="detail-top"><Link href="/transactions" className="back-link" aria-label="Back to transactions"><ArrowLeft size={16} /></Link><div><div className="eyebrow" style={{ marginBottom: 4 }}>Operations / investigation</div><div className="detail-id">TX-{row.transactionId}</div></div><Status fraud={row.fraud} /></div>
    <PageHeading eyebrow="Transaction review" title={row.userName} subtitle="Transaction details and the exact assessment returned by FraudGuard." />
    <div className="detail-grid">
       <section className="panel"><div className="panel-head"><div><div className="panel-title">Payment details</div><div className="panel-caption">Recorded transaction fields</div></div><CreditCard size={17} color="#74847e" /></div><div className="detail-amount">{money(row.amount)}</div><div className="detail-fields"><div><div className="detail-label">Transaction ID</div><div className="detail-value mono">TX-{row.transactionId}</div></div><div><div className="detail-label">Customer</div><div className="detail-value">{row.userName}</div></div><div><div className="detail-label">Timestamp</div><div className="detail-value">{dateTime(row.timestamp)}</div></div><div><div className="detail-label">Assessment</div><div className="detail-value"><Status fraud={row.fraud} /></div></div><div><div className="detail-label">Rule-derived risk</div><div className="detail-value"><RiskPill transaction={row} /></div></div></div></section>
      <section className="panel"><div className="panel-head"><div><div className="panel-title">Service assessment</div><div className="panel-caption">Assessment fields returned by the service</div></div><ShieldCheck size={17} color="#74847e" /></div>
        <div className="reason-block" style={!row.fraud ? { background: '#eaf3ed', borderColor: '#d6e8dc' } : undefined}><div className="reason-title" style={!row.fraud ? { color: '#41815e' } : undefined}>{row.fraud ? <ShieldAlert /> : <ShieldCheck />}{row.fraud ? 'Flagged by existing rules' : 'No fraud flag returned'}</div><div className="reason-copy" style={!row.fraud ? { color: '#4c725d' } : undefined}>{row.fraudReason || 'No assessment reason was provided by the service.'}</div></div>
        <p className="assessment-note">This view reflects the exact status and reason returned by the Spring Boot service. FraudGuard does not generate a separate risk score.</p>
      </section>
    </div>
  </>;
}

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const create = useCreateTransaction();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Transaction | null>(null);
  if (!open) return null;
  const resetAndClose = () => { onClose(); setName(''); setAmount(''); setId(''); setError(''); setResult(null); create.reset(); };
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    const numericAmount = Number(amount);
    if (!name.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || (id && (!Number.isInteger(Number(id)) || Number(id) < 0))) { setError('Enter a customer name, a positive amount, and an optional valid transaction ID.'); return; }
    const payload: TransactionInput = { userName: name.trim(), amount: numericAmount, ...(id ? { transactionId: Number(id) } : {}) };
    create.mutate({ data: payload }, {
      onSuccess: (transaction) => {
        setResult(transaction);
        client.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
        client.invalidateQueries({ queryKey: getGetStatisticsQueryKey() });
        client.invalidateQueries({ queryKey: getGetFraudTransactionsQueryKey() });
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'The service could not record this transaction. Please retry.'),
    });
  };
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) resetAndClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-transaction-title">
    <div className="modal-header"><div><div className="modal-title" id="new-transaction-title">{result ? 'Assessment received' : 'Record a transaction'}</div><div className="modal-subtitle">{result ? `Transaction TX-${result.transactionId} was assessed by the service.` : 'Submit payment details for a service assessment.'}</div></div><button className="close-button" onClick={resetAndClose} aria-label="Close" data-testid="button-close-modal"><X /></button></div>
    {result ? <><div className="assessment-result"><div className="result-status" style={{ color: result.fraud ? '#b4443b' : '#41815e' }}>{result.fraud ? <ShieldAlert size={19} /> : <ShieldCheck size={19} />}{result.fraud ? 'Flagged by service' : 'Clear assessment'}</div><div className="result-reason">{result.fraudReason || 'No assessment reason was provided by the service.'}</div><div className="detail-fields" style={{ marginTop: 16 }}><div><div className="detail-label">Customer</div><div className="detail-value">{result.userName}</div></div><div><div className="detail-label">Amount</div><div className="detail-value mono">{money(result.amount)}</div></div></div></div><div className="modal-actions"><Link className="button-secondary" href={`/investigation/${result.transactionId}`} onClick={resetAndClose}>Inspect assessment</Link><button className="button-primary" onClick={resetAndClose}>Done</button></div></> :
      <form onSubmit={submit}><div className="form-grid"><div><label className="form-label" htmlFor="customer-name">Customer name</label><input className="form-control" id="customer-name" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Name on payment" data-testid="input-customer-name" /></div><div><label className="form-label" htmlFor="amount">Payment amount</label><input className="form-control mono" id="amount" type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" data-testid="input-transaction-amount" /></div><div><label className="form-label" htmlFor="transaction-id">Transaction ID <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>· optional</span></label><input className="form-control mono" id="transaction-id" type="number" min="0" step="1" value={id} onChange={e => setId(e.target.value)} placeholder="Assigned by service if blank" data-testid="input-transaction-id" /><div className="form-hint">Leave blank to let the service assign an ID.</div></div>{error && <div className="form-error" role="alert">{error}</div>}</div><div className="modal-actions"><button type="button" className="button-secondary" onClick={resetAndClose}>Cancel</button><button type="submit" className="button-primary" disabled={create.isPending} data-testid="button-submit-transaction">{create.isPending ? 'Submitting…' : 'Submit for assessment'}<ArrowUpRight size={14} /></button></div></form>}
  </section></div>;
}

function Shell() {
  const [location] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const api = useGetTransactions();
  const apiState = api.isLoading ? 'loading' : api.isError ? 'error' : 'ready';
  const title = location.startsWith('/transactions') ? 'Transactions' : location.startsWith('/alerts') ? 'Fraud alerts' : location.startsWith('/analytics') ? 'Analytics' : 'Overview';
  useEffect(() => {
    const open = () => setModalOpen(true);
    window.addEventListener('fraudguard:create', open);
    return () => window.removeEventListener('fraudguard:create', open);
  }, []);
  return <div className="app-shell"><Sidebar current={location} apiState={apiState} /><div className="main-area"><Header current={location} apiState={apiState} onCreate={() => setModalOpen(true)} /><main className="content" aria-label={title}>
    <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Dashboard} /><Route path="/transactions" component={TransactionsPage} /><Route path="/alerts" component={AlertsPage} /><Route path="/analytics" component={AnalyticsPage} /><Route path="/investigation/:id" component={InvestigationPage} /><Route component={NotFound} /></Switch></ErrorBoundary>
  </main></div><nav className="mobile-nav" aria-label="Mobile navigation"><NavLinks current={location} /></nav><CreateModal open={modalOpen} onClose={() => setModalOpen(false)} /></div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Shell /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
