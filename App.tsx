
import React, { useEffect, useState } from 'react';
import { TimelineBranch, ChatMessage, FinancialEvent } from './types';
import { MOCK_ORIGINAL_BRANCH, CURRENT_MONTH, START_MONTH, formatMonthLabel, BRANCH_COLORS } from './constants';
import TimelineGraph from './components/TimelineGraph';
import ScenarioChat from './components/ScenarioChat';
import StatCards from './components/StatCards';
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
    divergenceMonth: firstMonth
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

const App: React.FC = () => {
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

      // Build the alternate timeline balance
      // For asset purchases: lumpSumDelta is the negative purchase price (cash leaves),
      // monthlyImpact carries the ongoing costs.
      // For investments: lumpSumDelta is the total gain.
      const lumpSumDelta = scenario.assetPurchase
        ? -scenario.assetPurchase.purchasePrice   // cash outflow for purchase
        : scenario.addedInvestment
          ? scenario.totalImpact                  // investment gain
          : 0;

      const altBalance = applyWhatIfDelta(
        parentBranch.cumulativeBalance,
        scenario.divergenceMonth,
        scenario.monthlyImpact,
        lumpSumDelta
      );

      const altNetWorth = altBalance.length > 0
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
        calculatedNetWorth: altNetWorth,
        divergenceMonth: scenario.divergenceMonth
      };

      setBranches(prev => [...prev, newBranch]);
      setSelectedBranchId(newBranchId);

      const difference = altNetWorth - parentBranch.calculatedNetWorth;
      const diffStr = difference >= 0 ? `+${formatCurrency(difference)}` : formatCurrency(difference);

      let detailStr = '';
      if (scenario.removedSpending) {
        detailStr = `By eliminating ${scenario.removedSpending.category} spending (~${formatCurrency(scenario.removedSpending.monthlyAmount)}/mo), you'd save ${formatCurrency(scenario.totalImpact)} total.`;
      } else if (scenario.addedInvestment) {
        const inv = scenario.addedInvestment;
        detailStr = `A ${formatCurrency(inv.amountInvested)} investment in ${inv.asset} at $${inv.priceAtEntry.toLocaleString()}/share would be worth ${formatCurrency(Math.round((inv.priceNow / inv.priceAtEntry) * inv.amountInvested))} today at $${inv.priceNow.toLocaleString()}/share.`;
      } else if (scenario.assetPurchase) {
        const ap = scenario.assetPurchase;
        const depRate = Math.abs(ap.annualDepreciation * 100).toFixed(0);
        detailStr = `Buying a ${ap.asset} for ${formatCurrency(ap.purchasePrice)} — it would be worth ~${formatCurrency(ap.currentValue)} today (${depRate}%/yr depreciation). Ongoing costs: ~${formatCurrency(ap.monthlyExpenses)}/mo. Total cash impact: ${formatCurrency(scenario.totalImpact)}.`;
      }

      const aiMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Timeline branch ${hierarchyCode} created from ${formatMonthLabel(scenario.divergenceMonth)}! ${scenario.explanation} ${detailStr} Impact on today's balance: ${diffStr}. New projected balance: ${formatCurrency(altNetWorth)}.`,
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass px-4 py-2 rounded-xl border border-blue-500/30 text-blue-300 text-sm font-semibold">
          Initializing secure session...
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="glass w-full max-w-md p-6 rounded-2xl border border-slate-700/50 space-y-4">
          <h2 className="text-xl font-bold text-white">{authMode === 'signup' ? 'Create account' : 'Login'}</h2>
          <p className="text-slate-400 text-sm">Use your account to access transactions linked to your profile.</p>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              required
            />
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
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
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {authMode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="relative">
          <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-transparent rounded-full hidden md:block"></div>
          <h1 className="text-4xl font-bold text-white tracking-tighter flex items-center gap-3">
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">FINANCIAL</span>
            <span className="font-light italic text-slate-500">TIME MACHINE</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1 font-medium tracking-tight">
            Go back in time. Change a decision. See the ripple effect.
            <span className="text-slate-600 font-mono text-[10px] ml-2 px-2 py-0.5 border border-slate-800 rounded">v3.0</span>
          </p>
        </div>
        
        <div className="flex gap-2">
          {/* Refresh — clear all branches */}
          <button
            onClick={resetBranches}
            disabled={branches.length <= 1}
            title="Reset all branches"
            className="glass px-3 py-2 rounded-2xl hover:bg-white/10 transition-all border-slate-700/50 group disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-arrows-rotate text-slate-400 group-hover:text-blue-400 transition-colors text-sm"></i>
          </button>

          {/* Prune — delete selected branch + children */}
          <button
            onClick={pruneBranch}
            disabled={selectedBranch.isOriginal}
            title={selectedBranch.isOriginal ? 'Cannot prune the Prime timeline' : `Prune branch ${selectedBranch.hierarchyCode}`}
            className="glass px-3 py-2 rounded-2xl hover:bg-white/10 transition-all border-slate-700/50 group disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-scissors text-slate-400 group-hover:text-amber-400 transition-colors text-sm"></i>
            <span className="text-[9px] font-bold text-slate-500 group-hover:text-amber-300 uppercase tracking-widest ml-1.5 hidden md:inline">Prune</span>
          </button>

          <div className="glass px-4 py-2 rounded-2xl flex items-center gap-3 border-slate-700/50 shadow-xl shadow-blue-500/5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{sessionUser.email}</span>
          </div>
          <button
            onClick={handleLogout}
            className="glass px-4 py-2 rounded-2xl hover:bg-white/10 transition-all border-slate-700/50 group"
          >
            <i className="fa-solid fa-right-from-bracket text-slate-400 group-hover:text-rose-400 transition-colors"></i>
          </button>
        </div>
      </header>

      {isLoadingAtlas && (
        <div className="glass px-4 py-2 rounded-xl border border-blue-500/30 text-blue-300 text-xs font-semibold">
          Syncing transactions from Atlas...
        </div>
      )}

      {atlasLoadError && (
        <div className="glass px-4 py-2 rounded-xl border border-amber-500/30 text-amber-300 text-xs font-semibold">
          {atlasLoadError}
        </div>
      )}

      {/* Main Content Grid */}
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
          <div className="glass p-6 rounded-2xl relative overflow-hidden group border border-slate-700/50">
            <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: selectedBranch.color }}></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <i className="fa-solid fa-list-check text-slate-400"></i>
                Timeline Ledger: <span style={{ color: selectedBranch.color }}>Branch {selectedBranch.hierarchyCode} - {selectedBranch.name}</span>
              </h3>
              <span className="text-[10px] font-black bg-slate-800 px-3 py-1 rounded-full text-slate-400 uppercase tracking-widest border border-slate-700">
                {selectedBranch.events.length} Transactions
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {selectedBranch.events.slice(-40).map((event, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-start gap-4 p-4 rounded-2xl transition-all border bg-slate-800/40 border-slate-700/50 shadow-lg"
                  >
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center border border-slate-800 mb-1">
                        <span className="text-[9px] font-black text-white">{formatMonthLabel(event.month)}</span>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-100">{event.label}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          event.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 
                          event.type === 'expense' ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {event.type}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">{event.description}</p>
                      <div className="mt-2">
                        <span className="text-xs font-mono font-bold text-slate-300">{formatCurrency(event.amount)}</span>
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
          <div className="mt-4 glass p-5 rounded-2xl border border-slate-700/50">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
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
                  className="w-full text-left p-2.5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/60 transition-all text-[11px] text-slate-400 flex items-center justify-between group"
                >
                  {s}
                  <i className="fa-solid fa-chevron-right text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="pt-8 border-t border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-slate-500 font-bold tracking-widest uppercase">
        <div className="flex gap-6">
          <span className="flex items-center gap-2"><i className="fa-solid fa-microchip text-blue-500"></i> Engine: Gemini 2.5 Flash</span>
          <span className="flex items-center gap-2"><i className="fa-solid fa-shield-halved text-emerald-500"></i> Data: MongoDB Atlas</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-600">Analyzing alternate timelines...</span>
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

export default App;
