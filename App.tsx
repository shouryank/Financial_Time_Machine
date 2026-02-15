
import React, { useEffect, useState } from 'react';
import { TimelineBranch, ChatMessage, FinancialEvent } from './types';
import { MOCK_ORIGINAL_BRANCH, CURRENT_MONTH, START_MONTH, formatMonthLabel, BRANCH_COLORS } from './constants';
import TimelineGraph from './components/TimelineGraph';
import ScenarioChat from './components/ScenarioChat';
import StatCards from './components/StatCards';
import ProfilePage from './components/ProfilePage';
import TransactionsPage from './components/TransactionsPage';
import LokiLogo from './components/LokiLogo';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { usePlaidLink } from 'react-plaid-link';
import { generateScenario } from './services/geminiService';
import { formatCurrency, buildCumulativeBalance, applyWhatIfDelta } from './services/financeUtils';

// ── Helpers ──

const hasKeyword = (value: string | undefined, keyword: string): boolean => {
  return (value || '').toLowerCase().includes(keyword);
};

type AtlasTransaction = {
  id?: string;
  date?: string;
  amount?: number;
  merchant?: string;
  category?: string;
  accountId?: string;
  type?: string;
  intent?: string;
};

type SessionUser = {
  id: string;
  email: string;
};

const mapTransactionType = (tx: AtlasTransaction): FinancialEvent['type'] => {
  if (hasKeyword(tx.category, 'income') || hasKeyword(tx.category, 'salary')) return 'income';
  if (hasKeyword(tx.intent, 'investment')) return 'investment';
  if (hasKeyword(tx.intent, 'liability')) return 'expense';

  const normalized = (tx.type || '').toLowerCase();
  if (normalized === 'credit') return 'income';
  if (normalized === 'debit') return 'expense';
  return Number(tx.amount ?? 0) < 0 ? 'expense' : 'income';
};

/** Convert a transaction date "YYYY-MM-DD" → "YYYY-MM" */
const toMonth = (dateStr: string | undefined): string => {
  if (!dateStr) return CURRENT_MONTH;
  const parts = dateStr.split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return CURRENT_MONTH;
};

const mapTransactionToFinancialEvent = (tx: AtlasTransaction, index: number): FinancialEvent => {
  const parsedAmount = Number(tx.amount);
  const safeAmount = Number.isFinite(parsedAmount) ? Math.abs(parsedAmount) : 0;
  const month = toMonth(tx.date);
  const label = (tx.merchant || '').trim() || (tx.category || '').trim() || `Transaction ${index + 1}`;
  const descriptionParts = [tx.category, tx.intent, tx.accountId].filter(Boolean);

  return {
    month,
    label,
    amount: safeAmount,
    type: mapTransactionType(tx),
    description: descriptionParts.length > 0 ? descriptionParts.join(' | ') : 'Imported from Atlas'
  };
};

const buildOriginalBranchFromTransactions = (transactions: AtlasTransaction[]): TimelineBranch => {
  const events = transactions
    .map(mapTransactionToFinancialEvent)
    .filter(event => event.amount > 0)
    .sort((a, b) => a.month.localeCompare(b.month));

  if (events.length === 0) return MOCK_ORIGINAL_BRANCH;

  const firstMonth = events[0].month;
  const cumulativeBalance = buildCumulativeBalance(events, firstMonth);
  const calculatedNetWorth = cumulativeBalance.length > 0
    ? cumulativeBalance[cumulativeBalance.length - 1].balance
    : 0;

  return {
    ...MOCK_ORIGINAL_BRANCH,
    events,
    cumulativeBalance,
    calculatedNetWorth,
    divergenceMonth: firstMonth,
    scenarioAssets: []
  };
};

/** Build a spending summary string for the AI prompt from user's transactions */
const buildSpendingSummary = (events: FinancialEvent[]): string => {
  const categoryTotals = new Map<string, { total: number; count: number }>();
  for (const e of events) {
    if (e.type !== 'expense') continue;
    const cat = e.description.split(' | ')[0] || e.label;
    const existing = categoryTotals.get(cat) || { total: 0, count: 0 };
    existing.total += e.amount;
    existing.count += 1;
    categoryTotals.set(cat, existing);
  }

  const lines: string[] = [];
  for (const [cat, data] of categoryTotals) {
    const avgMonthly = Math.round(data.total / Math.max(1, data.count));
    lines.push(`${cat}: ${data.count} transactions, total $${Math.round(data.total)}, avg $${avgMonthly}/occurrence`);
  }
  return lines.join('\n');
};

// ── Plaid Link Button ──
type PlaidLinkButtonProps = {
  linkToken: string | null;
  connected: boolean;
  loading: boolean;
  isDark: boolean;
  onRequestToken: () => void;
  onSuccess: (publicToken: string) => void;
  onDisconnect: () => void;
};

const PlaidLinkButton: React.FC<PlaidLinkButtonProps> = ({ linkToken, connected, loading, isDark, onRequestToken, onSuccess, onDisconnect }) => {
  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: (publicToken: string) => onSuccess(publicToken),
    onExit: () => {},
  });

  // Auto-fetch link token on mount so "Link Now" is the default view
  useEffect(() => {
    if (!connected && !linkToken && !loading) onRequestToken();
  }, [connected, linkToken, loading]);

  // When connected → show green "Connected" with disconnect option
  if (connected) {
    return (
      <button
        onClick={onDisconnect}
        disabled={loading}
        title="Bank connected via Plaid Sandbox — click to disconnect"
        className={`px-3 py-2 rounded-2xl transition-all group ${isDark ? 'glass border-emerald-500/40 hover:bg-white/10' : 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 shadow-sm'}`}
      >
        <i className={`fa-solid fa-link text-emerald-400 text-sm`}></i>
        <span className={`text-[9px] font-bold uppercase tracking-widest ml-1.5 hidden md:inline text-emerald-400`}>Connected</span>
      </button>
    );
  }

  // When link token is ready → open Plaid Link
  if (linkToken && ready) {
    return (
      <button
        onClick={() => open()}
        disabled={loading}
        title="Open Plaid Link to connect a sandbox bank account"
        className={`px-3 py-2 rounded-2xl transition-all group ${isDark ? 'glass border-green-500/50 hover:bg-white/10' : 'bg-green-50 border border-green-300 hover:bg-green-100 shadow-sm'}`}
      >
        <i className={`fa-solid fa-building-columns text-green-400 text-sm`}></i>
        <span className={`text-[9px] font-bold uppercase tracking-widest ml-1.5 hidden md:inline text-green-400`}>Link Now</span>
      </button>
    );
  }

  // Loading state while fetching link token
  return (
    <button
      disabled
      title="Loading Plaid Link..."
      className={`px-3 py-2 rounded-2xl transition-all group opacity-50 ${isDark ? 'glass border-slate-700/50' : 'bg-white border border-slate-200 shadow-sm'}`}
    >
      <i className={`fa-solid fa-building-columns text-sm animate-spin ${isDark ? 'text-slate-400' : 'text-slate-500'}`}></i>
      <span className={`text-[9px] font-bold uppercase tracking-widest ml-1.5 hidden md:inline ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Loading...</span>
    </button>
  );
};

const AppInner: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions'>('dashboard');
  const [assetCategory, setAssetCategory] = useState<'stocks' | 'crypto'>('stocks');
  const [branches, setBranches] = useState<TimelineBranch[]>([MOCK_ORIGINAL_BRANCH]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(MOCK_ORIGINAL_BRANCH.id);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isLoadingAtlas, setIsLoadingAtlas] = useState(true);
  const [atlasLoadError, setAtlasLoadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidConnected, setPlaidConnected] = useState(false);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const makeWelcomeMessage = (): ChatMessage[] => [{
    id: '1',
    role: 'assistant',
    content: "Welcome, Traveler. I am your Temporal Architect. I've mapped your Prime Timeline from your real bank transactions. You can now go back to any month and ask: \"What if I had stopped spending on coffee?\" or \"What if I had invested in NVIDIA?\" I'll show you how it would have changed your balance today.",
    timestamp: new Date()
  }];

  const [messages, setMessages] = useState<ChatMessage[]>(makeWelcomeMessage());

  useEffect(() => {
    let alive = true;

    const bootstrapSession = async () => {
      setIsAuthLoading(true);
      try {
        const response = await fetch('/api/auth/me');
        if (!alive) return;
        if (!response.ok) {
          setSessionUser(null);
          return;
        }
        const payload: { user?: SessionUser | null } = await response.json();
        setSessionUser(payload?.user ?? null);
      } catch {
        if (!alive) return;
        setSessionUser(null);
      } finally {
        if (!alive) return;
        setIsAuthLoading(false);
      }
    };

    bootstrapSession();
    return () => { alive = false; };
  }, []);

  // Check Plaid connection status when user session is available
  useEffect(() => {
    if (!sessionUser) return;
    (async () => {
      try {
        const resp = await fetch('/api/plaid/status');
        const data = await resp.json();
        setPlaidConnected(Boolean(data?.connected));
      } catch { /* ignore */ }
    })();
  }, [sessionUser]);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setIsAuthSubmitting(true);

    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(payload?.error || 'Authentication failed');
        return;
      }

      const meResponse = await fetch('/api/auth/me');
      const mePayload = await meResponse.json().catch(() => ({}));
      setSessionUser(mePayload?.user ?? null);
      setAuthPassword('');
    } catch {
      setAuthError('Unable to connect to auth service');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setSessionUser(null);
      setBranches([MOCK_ORIGINAL_BRANCH]);
      setSelectedBranchId(MOCK_ORIGINAL_BRANCH.id);
      setMessages(makeWelcomeMessage());
    }
  };

  useEffect(() => {
    let alive = true;

    const loadAtlasTransactions = async () => {
      if (!sessionUser) {
        setIsLoadingAtlas(false);
        setAtlasLoadError(null);
        setBranches([MOCK_ORIGINAL_BRANCH]);
        setSelectedBranchId(MOCK_ORIGINAL_BRANCH.id);
        setMessages(makeWelcomeMessage());
        return;
      }

      setIsLoadingAtlas(true);
      setAtlasLoadError(null);

      try {
        const response = await fetch('/api/transactions');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload: { transactions?: AtlasTransaction[] } = await response.json();
        const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];

        if (transactions.length === 0) {
          if (!alive) return;
          setAtlasLoadError('No transactions found in Atlas. Showing default timeline values.');
          return;
        }

        const branchFromAtlas = buildOriginalBranchFromTransactions(transactions);
        if (!alive) return;
        setBranches([branchFromAtlas]);
        setSelectedBranchId(branchFromAtlas.id);
      } catch {
        if (!alive) return;
        setAtlasLoadError('Atlas sync failed. Showing default timeline values.');
      } finally {
        if (!alive) return;
        setIsLoadingAtlas(false);
      }
    };

    loadAtlasTransactions();
    return () => {
      alive = false;
    };
  }, [sessionUser]);

  const selectedBranch = branches.find(b => b.id === selectedBranchId) || branches[0];
  const originalBranch = branches.find(b => b.id === 'original') || MOCK_ORIGINAL_BRANCH;
  const getNextHierarchyCode = (parentBranch: TimelineBranch): string => {
    const siblingCount = branches.filter(b => b.parentId === parentBranch.id).length;
    return `${parentBranch.hierarchyCode}.${siblingCount + 1}`;
  };

  const createBranch = async (content: string, parentBranchId?: string) => {
    const parentBranch = (parentBranchId && branches.find(b => b.id === parentBranchId)) || originalBranch;
    setIsProcessing(true);

    // Build context for AI with real spending data
    const spendingSummary = buildSpendingSummary(parentBranch.events);
    const contextStr = `User's real transaction data summary (from ${parentBranch.events.length} transactions, ${parentBranch.divergenceMonth} to ${CURRENT_MONTH}):
Spending by category:
${spendingSummary}

Current cumulative balance: ${formatCurrency(parentBranch.calculatedNetWorth)}
Current month: ${CURRENT_MONTH}

User Request: ${content}`;

    try {
      const scenario = await generateScenario(contextStr);
      const newBranchId = `alt-${Date.now()}`;
      const hierarchyCode = getNextHierarchyCode(parentBranch);

      // ── Build scenario assets from what-if results ──
      // Inherit parent's scenario assets and add any new ones from this scenario
      const inheritedAssets = [...(parentBranch.scenarioAssets || [])];
      const newScenarioAssets: typeof inheritedAssets = [];

      // Classify asset category from name
      const classifyAsset = (name: string): 'real_estate' | 'vehicle' | 'investment' | 'other' => {
        const lower = name.toLowerCase();
        if (/home|house|condo|apartment|property|real estate|land|duplex|townhouse/i.test(lower)) return 'real_estate';
        if (/car|truck|boat|motorcycle|rv|suv|vehicle|tesla|bmw|toyota|honda/i.test(lower)) return 'vehicle';
        if (/stock|share|nvidia|bitcoin|btc|eth|crypto|fund|etf|bond|reit|index/i.test(lower)) return 'investment';
        return 'other';
      };

      if (scenario.assetPurchase) {
        const ap = scenario.assetPurchase;
        newScenarioAssets.push({
          asset: ap.asset,
          purchasePrice: ap.purchasePrice,
          currentValue: ap.currentValue,
          annualGrowthRate: ap.annualDepreciation, // negative = depreciating, positive = appreciating
          monthlyExpenses: ap.monthlyExpenses,
          purchaseMonth: scenario.divergenceMonth,
          category: classifyAsset(ap.asset)
        });
      }

      if (scenario.addedInvestment) {
        const inv = scenario.addedInvestment;
        const currentValue = Math.round((inv.priceNow / inv.priceAtEntry) * inv.amountInvested);
        newScenarioAssets.push({
          asset: inv.asset,
          purchasePrice: inv.amountInvested,
          currentValue,
          annualGrowthRate: inv.priceNow > inv.priceAtEntry ? 0.10 : -0.05, // rough estimate
          monthlyExpenses: 0,
          purchaseMonth: scenario.divergenceMonth,
          category: classifyAsset(inv.asset)
        });
      }

      const allScenarioAssets = [...inheritedAssets, ...newScenarioAssets];

      // Build the alternate timeline cash balance
      // For asset purchases: cash outflow = purchase price, monthly costs reduce cash
      // For investments: cash outflow = amount invested, monthly costs = 0
      // The asset/investment VALUE is tracked separately in scenarioAssets
      // Pattern D (one-time expenses): no assetPurchase or addedInvestment, use totalImpact directly
      const lumpSumDelta = scenario.assetPurchase
        ? -scenario.assetPurchase.purchasePrice   // cash outflow for purchase
        : scenario.addedInvestment
          ? -scenario.addedInvestment.amountInvested  // cash outflow for investment
          : scenario.removedSpending
            ? 0  // recurring savings handled via monthlyImpact
            : scenario.totalImpact;  // one-time expense (Pattern D) — totalImpact is negative

      const altBalance = applyWhatIfDelta(
        parentBranch.cumulativeBalance,
        scenario.divergenceMonth,
        scenario.monthlyImpact,
        lumpSumDelta
      );

      const altCashBalance = altBalance.length > 0
        ? altBalance[altBalance.length - 1].balance
        : parentBranch.calculatedNetWorth + scenario.totalImpact;

      const newBranch: TimelineBranch = {
        id: newBranchId,
        parentId: parentBranch.id,
        hierarchyCode,
        name: scenario.branchName,
        color: BRANCH_COLORS[(branches.length - 1) % BRANCH_COLORS.length],
        isOriginal: false,
        events: parentBranch.events, // same events as parent
        marketTrends: [],
        cumulativeBalance: altBalance,
        calculatedNetWorth: altCashBalance,
        divergenceMonth: scenario.divergenceMonth,
        scenarioAssets: allScenarioAssets
      };

      setBranches(prev => [...prev, newBranch]);
      setSelectedBranchId(newBranchId);

      // Compute full net worth: cash + scenario asset values + investment portfolio
      const scenarioAssetValue = allScenarioAssets.reduce((sum, a) => sum + a.currentValue, 0);
      const fullNetWorth = altCashBalance + scenarioAssetValue;
      const parentScenarioAssetValue = (parentBranch.scenarioAssets || []).reduce((sum, a) => sum + a.currentValue, 0);
      const parentFullNetWorth = parentBranch.calculatedNetWorth + parentScenarioAssetValue;
      const difference = fullNetWorth - parentFullNetWorth;
      const diffStr = difference >= 0 ? `+${formatCurrency(difference)}` : formatCurrency(difference);

      let detailStr = '';
      if (scenario.removedSpending) {
        detailStr = `By eliminating ${scenario.removedSpending.category} spending (~${formatCurrency(scenario.removedSpending.monthlyAmount)}/mo), you'd save ${formatCurrency(scenario.totalImpact)} total.`;
      } else if (scenario.addedInvestment) {
        const inv = scenario.addedInvestment;
        const investmentCurrentValue = Math.round((inv.priceNow / inv.priceAtEntry) * inv.amountInvested);
        detailStr = `A ${formatCurrency(inv.amountInvested)} investment in ${inv.asset} at $${inv.priceAtEntry.toLocaleString()}/share would be worth ${formatCurrency(investmentCurrentValue)} today at $${inv.priceNow.toLocaleString()}/share. This adds ${formatCurrency(investmentCurrentValue)} to your portfolio.`;
      } else if (scenario.assetPurchase) {
        const ap = scenario.assetPurchase;
        const isAppreciating = ap.annualDepreciation >= 0;
        const rateStr = `${Math.abs(ap.annualDepreciation * 100).toFixed(0)}%/yr ${isAppreciating ? 'appreciation' : 'depreciation'}`;
        detailStr = `Buying a ${ap.asset} for ${formatCurrency(ap.purchasePrice)} — it would be worth ~${formatCurrency(ap.currentValue)} today (${rateStr}). This asset adds ${formatCurrency(ap.currentValue)} to your portfolio. Ongoing costs: ~${formatCurrency(ap.monthlyExpenses)}/mo.`;
      }

      const aiMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Timeline branch ${hierarchyCode} created from ${formatMonthLabel(scenario.divergenceMonth)}! ${scenario.explanation} ${detailStr} Cash impact: ${formatCurrency(altCashBalance - parentBranch.calculatedNetWorth)}. Net worth impact: ${diffStr}. New net worth: ${formatCurrency(fullNetWorth)} (Cash: ${formatCurrency(altCashBalance)} + Assets: ${formatCurrency(scenarioAssetValue)}).`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message : 'Unknown model error.';
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Timeline destabilization occurred. ${detail}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    }]);

    // Branch from the currently selected branch
    createBranch(content, selectedBranchId);
  };

  const handleQuickBranch = (month: string, prompt: string, branchId: string) => {
    const sourceBranch = branches.find(b => b.id === branchId);
    const branchLabel = sourceBranch ? `Branch ${sourceBranch.hierarchyCode}` : 'Prime';

    // Ensure the user's prompt is anchored to the clicked month and source branch
    const anchored = `Starting from ${formatMonthLabel(month)} on ${branchLabel}: ${prompt}`;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: anchored,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    createBranch(anchored, branchId);
  };

  /** Reset all branches — keep only the original prime timeline */
  const resetBranches = () => {
    setBranches(prev => {
      const orig = prev.find(b => b.isOriginal);
      return orig ? [orig] : [MOCK_ORIGINAL_BRANCH];
    });
    setSelectedBranchId('original');
    setMessages(makeWelcomeMessage());
  };

  /** Prune: delete the selected branch and all of its descendants */
  const pruneBranch = () => {
    if (selectedBranch.isOriginal) return; // can't prune prime
    const toRemove = new Set<string>();
    // Collect the selected branch and all descendants (BFS)
    const queue = [selectedBranch.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      toRemove.add(id);
      for (const b of branches) {
        if (b.parentId === id && !toRemove.has(b.id)) {
          queue.push(b.id);
        }
      }
    }
    setBranches(prev => prev.filter(b => !toRemove.has(b.id)));
    setSelectedBranchId('original');
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Pruned branch ${selectedBranch.hierarchyCode} (${selectedBranch.name}) and ${toRemove.size - 1} descendant${toRemove.size - 1 !== 1 ? 's' : ''}.`,
      timestamp: new Date()
    }]);
  };

  if (isAuthLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? '' : 'bg-slate-50'}`}>
        <div className={`px-4 py-2 rounded-xl border text-sm font-semibold ${isDark ? 'glass border-blue-500/30 text-blue-300' : 'bg-white border-blue-200 text-blue-600 shadow-sm'}`}>
          Initializing secure session...
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div className={`min-h-screen p-6 flex items-center justify-center ${isDark ? '' : 'bg-slate-50'}`}>
        <div className={`w-full max-w-md p-6 rounded-2xl border space-y-4 ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-xl'}`}>
          <div className="flex items-center gap-3 mb-2">
            <LokiLogo size={36} />
            <h1 className={`text-lg font-bold font-heading tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Financial Time Machine</h1>
          </div>
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{authMode === 'signup' ? 'Create account' : 'Login'}</h2>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Use your account to access transactions linked to your profile.</p>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              className={`w-full rounded-xl px-3 py-2 text-sm ${isDark ? 'bg-slate-900/60 border border-slate-700 text-white' : 'bg-slate-50 border border-slate-200 text-slate-900'}`}
              required
            />
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              className={`w-full rounded-xl px-3 py-2 text-sm ${isDark ? 'bg-slate-900/60 border border-slate-700 text-white' : 'bg-slate-50 border border-slate-200 text-slate-900'}`}
              required
              minLength={8}
            />

            {authError && (
              <div className="text-rose-300 text-xs border border-rose-500/30 rounded-lg px-2 py-1">{authError}</div>
            )}

            <button
              type="submit"
              disabled={isAuthSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl px-3 py-2"
            >
              {isAuthSubmitting ? 'Please wait...' : authMode === 'signup' ? 'Sign up' : 'Login'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setAuthMode(prev => prev === 'login' ? 'signup' : 'login');
              setAuthError(null);
            }}
            className={`text-xs ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {authMode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Login'}
          </button>

          {/* Theme toggle on login page */}
          <div className="flex justify-center pt-2">
            <button onClick={toggleTheme} className={`text-xs flex items-center gap-1.5 ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}>
              <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showProfile) {
    return (
      <ProfilePage
        user={sessionUser}
        onBack={() => setShowProfile(false)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className={`min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6 transition-colors duration-300 ${isDark ? '' : 'bg-slate-50'}`}>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="relative flex items-center gap-4 cursor-pointer" onClick={() => { setActiveTab('dashboard'); setShowProfile(false); }}>
          <LokiLogo size={48} />
          <div>
            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-transparent rounded-full hidden md:block"></div>
            <h1 className={`text-4xl font-bold tracking-tighter flex items-center gap-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">FINANCIAL</span>
              <span className={`font-light italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>TIME MACHINE</span>
            </h1>
            <p className={`text-sm mt-1 font-medium tracking-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Go back in time. Change a decision. See the ripple effect.
              <span className={`font-mono text-[10px] ml-2 px-2 py-0.5 border rounded ${isDark ? 'text-slate-600 border-slate-800' : 'text-slate-400 border-slate-300'}`}>v3.0</span>
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 items-center">
          {/* Refresh — clear all branches */}
          <button
            onClick={resetBranches}
            disabled={branches.length <= 1}
            title="Reset all branches"
            className={`px-3 py-2 rounded-2xl transition-all group disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'glass border-slate-700/50 hover:bg-white/10' : 'bg-white border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
          >
            <i className={`fa-solid fa-arrows-rotate group-hover:text-blue-400 transition-colors text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}></i>
            <span className={`text-[9px] font-bold group-hover:text-blue-300 uppercase tracking-widest ml-1.5 hidden md:inline ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Refresh</span>
          </button>

          {/* Prune — delete selected branch + children */}
          <button
            onClick={pruneBranch}
            disabled={selectedBranch.isOriginal}
            title={selectedBranch.isOriginal ? 'Cannot prune the Prime timeline' : `Prune branch ${selectedBranch.hierarchyCode}`}
            className={`px-3 py-2 rounded-2xl transition-all group disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'glass border-slate-700/50 hover:bg-white/10' : 'bg-white border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
          >
            <i className={`fa-solid fa-scissors group-hover:text-amber-400 transition-colors text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}></i>
            <span className={`text-[9px] font-bold group-hover:text-amber-300 uppercase tracking-widest ml-1.5 hidden md:inline ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Prune</span>
          </button>

          {/* Plaid Sandbox — Connect Bank */}
          <PlaidLinkButton
            linkToken={plaidLinkToken}
            connected={plaidConnected}
            loading={plaidLoading}
            isDark={isDark}
            onRequestToken={async () => {
              setPlaidLoading(true);
              try {
                const resp = await fetch('/api/plaid/create_link_token', { method: 'POST' });
                const data = await resp.json();
                if (data.link_token) setPlaidLinkToken(data.link_token);
              } catch (e) { console.error('Failed to get link token', e); }
              finally { setPlaidLoading(false); }
            }}
            onSuccess={async (publicToken: string) => {
              setPlaidLoading(true);
              try {
                await fetch('/api/plaid/exchange_public_token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ public_token: publicToken })
                });
                setPlaidConnected(true);
                setPlaidLinkToken(null);
              } catch (e) { console.error('Token exchange failed', e); }
              finally { setPlaidLoading(false); }
            }}
            onDisconnect={async () => {
              setPlaidLoading(true);
              try {
                await fetch('/api/plaid/disconnect', { method: 'POST' });
                setPlaidConnected(false);
              } catch (e) { console.error('Disconnect failed', e); }
              finally { setPlaidLoading(false); }
            }}
          />

          {/* Profile + Email — combined button */}
          <button
            onClick={() => setShowProfile(true)}
            title="Edit Profile"
            className={`px-3 py-2 rounded-2xl flex items-center gap-3 transition-all group ${isDark ? 'glass border-slate-700/50 hover:bg-white/10 shadow-xl shadow-blue-500/5' : 'bg-white border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">{sessionUser.email.charAt(0).toUpperCase()}</span>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className={`text-[10px] font-bold tracking-wide ${isDark ? 'text-slate-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-800'}`}>{sessionUser.email}</span>
          </button>

          <button
            onClick={handleLogout}
            title="Logout"
            className={`px-4 py-2 rounded-2xl transition-all group ${isDark ? 'glass border-slate-700/50 hover:bg-white/10' : 'bg-white border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
          >
            <i className={`fa-solid fa-right-from-bracket group-hover:text-rose-400 transition-colors ${isDark ? 'text-slate-400' : 'text-slate-500'}`}></i>
          </button>
        </div>
      </header>

      {isLoadingAtlas && (
        <div className={`px-4 py-2 rounded-xl border text-xs font-semibold ${isDark ? 'glass border-blue-500/30 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-600'}`}>
          Syncing transactions from Atlas...
        </div>
      )}

      {atlasLoadError && (
        <div className={`px-4 py-2 rounded-xl border text-xs font-semibold ${isDark ? 'glass border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
          {atlasLoadError}
        </div>
      )}

      {/* Tab Navigation */}
      <nav className={`flex gap-1 p-1 rounded-2xl border w-fit ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-sm'}`}>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'dashboard'
              ? isDark
                ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/20 text-white border border-blue-500/40 shadow-lg shadow-blue-500/10'
                : 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 border border-blue-300 shadow-sm'
              : isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <i className="fa-solid fa-gauge-high text-xs"></i>
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'transactions'
              ? isDark
                ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/20 text-white border border-blue-500/40 shadow-lg shadow-blue-500/10'
                : 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 border border-blue-300 shadow-sm'
              : isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <i className="fa-solid fa-receipt text-xs"></i>
          Transactions
        </button>
      </nav>

      {/* Main Content Grid */}
      {activeTab === 'transactions' ? (
        <TransactionsPage events={originalBranch.events} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visuals and Stats */}
        <div className="lg:col-span-8 space-y-6">
          <TimelineGraph 
            branches={branches} 
            selectedBranchId={selectedBranchId}
            onSelectBranch={setSelectedBranchId}
            onQuickBranch={handleQuickBranch}
            isProcessing={isProcessing}
          />
          
          <StatCards 
            branch={selectedBranch} 
            originalBranch={originalBranch} 
          />

          {/* Timeline Ledger — show monthly events for selected branch */}
          <div className={`p-6 rounded-2xl relative overflow-hidden group border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
            <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: selectedBranch.color }}></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <i className="fa-solid fa-list-check text-slate-400"></i>
                Timeline Ledger: <span style={{ color: selectedBranch.color }}>Branch {selectedBranch.hierarchyCode} - {selectedBranch.name}</span>
              </h3>
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {selectedBranch.events.length} Transactions
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {selectedBranch.events.slice(-40).map((event, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-start gap-4 p-4 rounded-2xl transition-all border shadow-lg ${isDark ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border mb-1 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                        <span className={`text-[9px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatMonthLabel(event.month)}</span>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className={`text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{event.label}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          event.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 
                          event.type === 'expense' ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {event.type}
                        </span>
                      </div>
                      <p className={`text-[10px] mt-1 line-clamp-2 leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{event.description}</p>
                      <div className="mt-2">
                        <span className={`text-xs font-mono font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{formatCurrency(event.amount)}</span>
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: AI Chat */}
        <div className="lg:col-span-4 h-full">
          <ScenarioChat 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isProcessing={isProcessing}
          />
          
          {/* Quick Context Panel */}
          <div className={`mt-4 p-5 rounded-2xl border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
            <h4 className={`text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <i className="fa-solid fa-microchip"></i>
              What-If Suggestions
            </h4>
            <div className="space-y-2">
              {[
                "What if I stopped buying coffee in 2020?",
                "What if I invested $5000 in NVIDIA in Jan 2020?",
                "What if I cut dining expenses in half 3 years ago?",
                "What if I invested $1000 in Bitcoin in 2017?"
              ].map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => handleSendMessage(s)}
                  disabled={isProcessing}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all text-[11px] flex items-center justify-between group ${
                    isDark
                      ? 'bg-slate-900/40 border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 text-slate-400'
                      : 'bg-slate-50 border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-500'
                  }`}
                >
                  {s}
                  <i className="fa-solid fa-chevron-right text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
                </button>
              ))}
            </div>
          </div>

          {/* Supported Assets Panel */}
          <div className={`mt-4 p-5 rounded-2xl border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
            {/* Header + dropdown toggle */}
            <div className="flex items-center justify-between mb-3">
              <h4 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <i className="fa-solid fa-chart-line"></i>
                Supported Assets
              </h4>
              <div className={`flex gap-0.5 p-0.5 rounded-lg border ${isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-slate-100 border-slate-200'}`}>
                <button
                  onClick={() => setAssetCategory('stocks')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                    assetCategory === 'stocks'
                      ? isDark
                        ? 'bg-blue-600/20 text-blue-300 shadow-sm shadow-blue-500/10'
                        : 'bg-white text-blue-700 shadow-sm'
                      : isDark
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <i className="fa-solid fa-building-columns text-[8px]"></i>
                  Stocks <span className={`text-[8px] ${assetCategory === 'stocks' ? '' : 'opacity-50'}`}>20</span>
                </button>
                <button
                  onClick={() => setAssetCategory('crypto')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                    assetCategory === 'crypto'
                      ? isDark
                        ? 'bg-amber-600/20 text-amber-300 shadow-sm shadow-amber-500/10'
                        : 'bg-white text-amber-700 shadow-sm'
                      : isDark
                        ? 'text-slate-500 hover:text-slate-300'
                        : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <i className="fa-brands fa-bitcoin text-[8px]"></i>
                  Crypto <span className={`text-[8px] ${assetCategory === 'crypto' ? '' : 'opacity-50'}`}>10</span>
                </button>
              </div>
            </div>

            {/* Asset list */}
            <div className="max-h-[220px] overflow-y-auto pr-1 custom-scrollbar space-y-1">
              {assetCategory === 'stocks' ? [
                { ticker: 'NVDA', name: 'NVIDIA', price: '$135', trend: '+2,600% (5y)' },
                { ticker: 'AAPL', name: 'Apple', price: '$235', trend: '+280% (5y)' },
                { ticker: 'MSFT', name: 'Microsoft', price: '$410', trend: '+230% (5y)' },
                { ticker: 'AMZN', name: 'Amazon', price: '$225', trend: '+120% (5y)' },
                { ticker: 'GOOGL', name: 'Alphabet', price: '$185', trend: '+180% (5y)' },
                { ticker: 'META', name: 'Meta', price: '$690', trend: '+220% (5y)' },
                { ticker: 'TSLA', name: 'Tesla', price: '$355', trend: '+1,100% (5y)' },
                { ticker: 'TSM', name: 'Taiwan Semi', price: '$205', trend: '+240% (5y)' },
                { ticker: 'AVGO', name: 'Broadcom', price: '$225', trend: '+460% (5y)' },
                { ticker: 'JPM', name: 'JPMorgan', price: '$270', trend: '+130% (5y)' },
                { ticker: 'V', name: 'Visa', price: '$340', trend: '+80% (5y)' },
                { ticker: 'WMT', name: 'Walmart', price: '$105', trend: '+120% (5y)' },
                { ticker: 'MA', name: 'Mastercard', price: '$535', trend: '+90% (5y)' },
                { ticker: 'NFLX', name: 'Netflix', price: '$1,010', trend: '+340% (5y)' },
                { ticker: 'COST', name: 'Costco', price: '$1,050', trend: '+220% (5y)' },
                { ticker: 'AMD', name: 'AMD', price: '$115', trend: '+400% (5y)' },
                { ticker: 'DIS', name: 'Disney', price: '$110', trend: '-20% (5y)' },
                { ticker: 'SPY', name: 'S&P 500 ETF', price: '$605', trend: '+85% (5y)' },
                { ticker: 'QQQ', name: 'Nasdaq 100 ETF', price: '$530', trend: '+130% (5y)' },
                { ticker: 'VOO', name: 'Vanguard S&P 500', price: '$555', trend: '+85% (5y)' },
              ].map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(`What if I invested $5000 in ${s.ticker} in Jan 2020?`)}
                  disabled={isProcessing}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-[10px] group ${
                    isDark
                      ? 'bg-slate-900/30 border-slate-800/50 hover:border-blue-500/40 hover:bg-slate-800/50 text-slate-400'
                      : 'bg-slate-50/50 border-slate-100 hover:border-blue-300 hover:bg-blue-50/50 text-slate-500'
                  }`}
                >
                  <span className={`font-mono font-bold min-w-[40px] text-left ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{s.ticker}</span>
                  <span className="flex-1 text-left truncate">{s.name}</span>
                  <span className={`font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{s.price}</span>
                  <span className={`font-mono text-[9px] min-w-[80px] text-right ${s.trend.startsWith('-') ? 'text-rose-400' : 'text-emerald-400'}`}>{s.trend}</span>
                </button>
              )) : [
                { ticker: 'BTC', name: 'Bitcoin', price: '$97,000', trend: '+870% (5y)' },
                { ticker: 'ETH', name: 'Ethereum', price: '$2,700', trend: '+1,500% (5y)' },
                { ticker: 'SOL', name: 'Solana', price: '$200', trend: '+12,000% (5y)' },
                { ticker: 'BNB', name: 'BNB', price: '$660', trend: '+2,800% (5y)' },
                { ticker: 'XRP', name: 'Ripple', price: '$2.65', trend: '+730% (5y)' },
                { ticker: 'ADA', name: 'Cardano', price: '$0.75', trend: '+700% (5y)' },
                { ticker: 'DOGE', name: 'Dogecoin', price: '$0.26', trend: '+8,500% (5y)' },
                { ticker: 'DOT', name: 'Polkadot', price: '$5.10', trend: '+20% (3y)' },
                { ticker: 'AVAX', name: 'Avalanche', price: '$26', trend: '+340% (4y)' },
                { ticker: 'MATIC', name: 'Polygon', price: '$0.30', trend: '-60% (3y)' },
              ].map((s, i) => (
                <button
                  key={`crypto-${i}`}
                  onClick={() => handleSendMessage(`What if I invested $5000 in ${s.name} in Jan 2020?`)}
                  disabled={isProcessing}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-[10px] group ${
                    isDark
                      ? 'bg-slate-900/30 border-slate-800/50 hover:border-amber-500/40 hover:bg-slate-800/50 text-slate-400'
                      : 'bg-slate-50/50 border-slate-100 hover:border-amber-300 hover:bg-amber-50/50 text-slate-500'
                  }`}
                >
                  <span className={`font-mono font-bold min-w-[40px] text-left ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{s.ticker}</span>
                  <span className="flex-1 text-left truncate">{s.name}</span>
                  <span className={`font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{s.price}</span>
                  <span className={`font-mono text-[9px] min-w-[80px] text-right ${s.trend.startsWith('-') ? 'text-rose-400' : 'text-emerald-400'}`}>{s.trend}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Sticky floating theme toggle — bottom right */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-2xl transition-all group ${
            isDark
              ? 'bg-slate-800 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 shadow-black/40'
              : 'bg-white border border-slate-200 hover:bg-slate-50 shadow-slate-300/60'
          }`}
        >
          <i className={`fa-solid ${isDark ? 'fa-sun text-amber-400 group-hover:text-amber-300' : 'fa-moon text-blue-500 group-hover:text-blue-600'} transition-colors text-lg`}></i>
        </button>
      </div>

      {/* Footer */}
      <footer className={`pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-bold tracking-widest uppercase ${isDark ? 'border-slate-800/50 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
        <div className="flex gap-6">
          <span className="flex items-center gap-2"><i className="fa-solid fa-microchip text-blue-500"></i> Engine: Gemini 2.5 Flash</span>
          <span className="flex items-center gap-2"><i className="fa-solid fa-shield-halved text-emerald-500"></i> Data: MongoDB Atlas</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>Analyzing alternate timelines...</span>
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full bg-blue-500"></div>
            <div className="w-1 h-1 rounded-full bg-blue-500/50"></div>
            <div className="w-1 h-1 rounded-full bg-blue-500/20"></div>
          </div>
          <span className="ml-4">© 2026 Financial Time Machine</span>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => (
  <ThemeProvider>
    <AppInner />
  </ThemeProvider>
);

export default App;
