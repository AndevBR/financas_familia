import {
  BarChart3,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  Menu,
  Moon,
  Plus,
  Receipt,
  Repeat,
  Settings as SettingsIcon,
  Sun,
  Tags,
  Target,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { isOverdue } from '../domain/transactions';
import { today } from '../domain/dates';
import { AppProvider, useApp } from './AppContext';
import { PaymentModal } from './components/PaymentModal';
import { TxFormModal } from './components/TxFormModal';
import { useFinance, useLookups, type FinanceData } from './hooks/useFinance';
import { setThemePref, useApplyTheme } from './hooks/useTheme';
import { Cartoes } from './pages/Cartoes';
import { Categorias } from './pages/Categorias';
import { Configuracoes } from './pages/Configuracoes';
import { ContasPage } from './pages/Contas';
import { ContasFinanceiras } from './pages/ContasFinanceiras';
import { Dashboard } from './pages/Dashboard';
import { Economia } from './pages/Economia';
import { Lancamentos } from './pages/Lancamentos';
import { Orcamento } from './pages/Orcamento';
import { Recorrentes } from './pages/Recorrentes';
import { Relatorios } from './pages/Relatorios';

const NAV = [
  { section: 'Visão geral' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/lancamentos', label: 'Lançamentos', icon: ListOrdered },
  { section: 'Contas' },
  { to: '/pagar', label: 'Contas a pagar', icon: Receipt, badge: 'pagar' },
  { to: '/receber', label: 'Contas a receber', icon: HandCoins, badge: 'receber' },
  { to: '/cartoes', label: 'Cartões de crédito', icon: CreditCard },
  { to: '/recorrentes', label: 'Recorrentes', icon: Repeat },
  { to: '/contas', label: 'Contas e saldos', icon: Wallet },
  { section: 'Análise' },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/orcamento', label: 'Orçamento', icon: Target },
  { to: '/economia', label: 'Oportunidades de economia', icon: Lightbulb },
  { section: 'Cadastros' },
  { to: '/categorias', label: 'Categorias', icon: Tags },
  { to: '/configuracoes', label: 'Configurações e backup', icon: SettingsIcon },
] as const;

const TITLES: Record<string, string> = Object.fromEntries(NAV.filter((n) => 'to' in n).map((n) => ['to' in n ? n.to : '', 'label' in n ? n.label : '']));

function Shell({ data, dark }: { data: FinanceData; dark: boolean }) {
  const lookups = useLookups(data);
  const { openEntry } = useApp();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const ref = today();
  const overduePay = data.transactions.filter((t) => t.type === 'despesa' && isOverdue(t, ref)).length;
  const overdueRec = data.transactions.filter((t) => t.type === 'receita' && isOverdue(t, ref)).length;

  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    document.title = `${TITLES[loc.pathname] ?? 'Finanças'} · Finanças da Família`;
  }, [loc.pathname]);
  // atalho: tecla N abre um novo lançamento
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-backdrop')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openEntry();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openEntry]);

  return (
    <div className="app">
      <aside className={`sidebar ${menu ? 'open' : ''}`} aria-label="Menu principal">
        <div className="brand">
          <div className="brand-logo">
            <Wallet size={19} />
          </div>
          Finanças da Família
        </div>
        <nav className="nav">
          {NAV.map((n, i) =>
            'section' in n ? (
              <div className="nav-section" key={i}>
                {n.section}
              </div>
            ) : (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                <n.icon size={17} />
                {n.label}
                {'badge' in n && n.badge === 'pagar' && overduePay > 0 && <span className="count" title="Vencidas">{overduePay}</span>}
                {'badge' in n && n.badge === 'receber' && overdueRec > 0 && <span className="count" title="Atrasadas">{overdueRec}</span>}
              </NavLink>
            ),
          )}
        </nav>
        <div className="sidebar-footer">
          <button className="btn ghost sm" onClick={() => setThemePref(dark ? 'claro' : 'escuro')} aria-label="Alternar tema">
            {dark ? <Sun size={15} /> : <Moon size={15} />} {dark ? 'Tema claro' : 'Tema escuro'}
          </button>
        </div>
      </aside>
      <div className={`backdrop ${menu ? 'open' : ''}`} onClick={() => setMenu(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setMenu(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <h1>{TITLES[loc.pathname] ?? 'Finanças'}</h1>
          <button className="btn primary hide-mobile" onClick={() => openEntry()} title="Atalho: tecla N">
            <Plus size={16} /> Lançar <kbd>N</kbd>
          </button>
        </header>
        <main className="content" key={loc.pathname}>
          {!data.loaded ? (
            <div className="empty">Carregando…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard data={data} lookups={lookups} />} />
              <Route path="/lancamentos" element={<Lancamentos data={data} lookups={lookups} />} />
              <Route path="/pagar" element={<ContasPage type="despesa" data={data} lookups={lookups} />} />
              <Route path="/receber" element={<ContasPage type="receita" data={data} lookups={lookups} />} />
              <Route path="/cartoes" element={<Cartoes data={data} lookups={lookups} />} />
              <Route path="/recorrentes" element={<Recorrentes data={data} lookups={lookups} />} />
              <Route path="/contas" element={<ContasFinanceiras data={data} />} />
              <Route path="/relatorios" element={<Relatorios data={data} lookups={lookups} />} />
              <Route path="/orcamento" element={<Orcamento data={data} />} />
              <Route path="/economia" element={<Economia data={data} />} />
              <Route path="/categorias" element={<Categorias data={data} />} />
              <Route path="/configuracoes" element={<Configuracoes data={data} />} />
              <Route path="*" element={<Dashboard data={data} lookups={lookups} />} />
            </Routes>
          )}
        </main>
      </div>
      <button className="btn primary fab" onClick={() => openEntry()} aria-label="Novo lançamento">
        <Plus size={20} /> <span>Lançar</span>
      </button>
    </div>
  );
}

export function App() {
  const data = useFinance();
  const resolved = useApplyTheme(data.settings?.theme);
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider
        renderModals={(m, close) => (
          <>
            {m.entry && <TxFormModal data={data} onClose={close} prefill={m.entry === true ? undefined : m.entry} />}
            {m.edit && <TxFormModal data={data} onClose={close} editing={m.edit} />}
            {m.payment && <PaymentModal data={data} tx={m.payment} onClose={close} />}
          </>
        )}
      >
        <Shell data={data} dark={resolved === 'escuro'} />
      </AppProvider>
    </HashRouter>
  );
}
