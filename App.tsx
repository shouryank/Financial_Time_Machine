
import React, { useEffect, useState } from 'react';
import { TimelineBranch, ChatMessage, FinancialEvent } from './types';
import { MOCK_ORIGINAL_BRANCH, START_YEAR, CURRENT_YEAR } from './constants';
import TimelineGraph from './components/TimelineGraph';
import ScenarioChat from './components/ScenarioChat';
import StatCards from './components/StatCards';
import { generateScenario } from './services/geminiService';
import { formatCurrency } from './services/financeUtils';
import { usePlaidLink } from 'react-plaid-link';

const parseAmountFromPrompt = (text: string): number | null => {
  const matches = [...text.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*([kKmM])?/g)];
  if (matches.length === 0) return null;
  const amounts = matches
    .map(match => {
      const base = parseFloat(match[1]);
      if (!Number.isFinite(base)) return null;
      const suffix = (match[2] || '').toLowerCase();
      const raw = Math.round(base);
      const value = suffix === 'k'
        ? Math.round(base * 1_000)
        : suffix === 'm'
          ? Math.round(base * 1_000_000)
          : raw;
      const start = Math.max(0, (match.index || 0) - 18);
      const end = Math.min(text.length, (match.index || 0) + match[0].length + 18);
      const context = text.slice(start, end).toLowerCase();
      const hasCurrencyToken = match[0].includes('$') || suffix === 'k' || suffix === 'm';
      const hasMoneyWord = /\b(worth|for|invest|investing|amount|cost|price|priced|value|spend|spent)\b/.test(context);
      const hasMoneySignal = hasCurrencyToken || hasMoneyWord;
      const looksLikeYear = value >= 1900 && value <= CURRENT_YEAR + 1 && suffix === '' && !hasMoneySignal;
      if (looksLikeYear) return null;
      if (value <= 0) return null;
      return value;
    })
    .filter((value): value is number => value !== null);
  if (amounts.length === 0) return null;
  return Math.max(...amounts);
};

const parseAbsoluteYearFromPrompt = (text: string): number | null => {
  const matches = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  if (matches.length === 0) return null;
  const years = matches
    .map(m => Number(m[1]))
    .filter(y => Number.isFinite(y) && y >= START_YEAR && y <= CURRENT_YEAR);
  if (years.length === 0) return null;
  return Math.max(...years);
};

const parseYearsAgoFromPrompt = (text: string): number | null => {
  const lower = text.toLowerCase();

  const numericMatch = lower.match(/(\d+)\s*(?:years?|yrs?)\s+ago/);
  if (numericMatch) {
    const years = Number(numericMatch[1]);
    if (Number.isFinite(years) && years >= 0) return years;
  }

  if (/\b(a|one)\s+year\s+ago\b/.test(lower) || /\blast year\b/.test(lower)) return 1;
  if (/\bthis year\b/.test(lower)) return 0;

  const wordToNumber: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };
  const wordMatch = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\s+ago\b/);
  if (wordMatch) return wordToNumber[wordMatch[1]] ?? null;

  return null;
};

const inferFallbackEventFromPrompt = (text: string, year: number): FinancialEvent | null => {
  const lower = text.toLowerCase();
  const amount = parseAmountFromPrompt(text);
  if (!amount || amount <= 0) return null;

  const buyIntent = /buy|bought|purchase|purchased|get/i.test(lower);
  const isCar = /car|vehicle|auto|suv|sedan|truck/i.test(lower);
  if (buyIntent && isCar) {
    return {
      year,
      label: 'Car Purchase',
      amount,
      type: 'expense',
      description: 'User-requested vehicle purchase.'
    };
  }
  return null;
};

const extractAssetNameFromPrompt = (text: string): string | null => {
  const lower = text.toLowerCase();
  const assetRegexes = [
    /\b(car|vehicle|auto|suv|sedan|truck)\b/,
    /\b(bitcoin|btc|crypto|ethereum|eth)\b/,
    /\b(stock|stocks|etf|index fund|mutual fund|bond|bonds)\b/,
    /\b(gold|silver|real estate|property|house|apartment)\b/,
    /\b(laptop|phone)\b/
  ];
  for (const re of assetRegexes) {
    const match = lower.match(re);
    if (match) return match[1];
  }
  return null;
};

const parseBranchCodeFromPrompt = (text: string): string | null => {
  const branchMatch = text.match(/\b(?:from|on|using)?\s*branch\s*#?\s*([0-9]+(?:\.[0-9]+)*)\b/i);
  if (branchMatch) return branchMatch[1];
  return null;
};

const hasKeyword = (value: string | undefined, keyword: string): boolean => {
  return (value || '').toLowerCase().includes(keyword);
};

const getTransactionValidationError = (text: string, branches: TimelineBranch[]): string | null => {
  const lower = text.toLowerCase();
  const isTransactionIntent = /\b(buy|bought|purchase|purchased|invest|invested|put|allocate|acquire|get)\b/.test(lower);
  if (!isTransactionIntent) return null;

  const hasYear = parseYearsAgoFromPrompt(text) !== null || parseAbsoluteYearFromPrompt(text) !== null;
  const hasAmount = parseAmountFromPrompt(text) !== null;
  const hasAsset = extractAssetNameFromPrompt(text) !== null;
  const branchCode = parseBranchCodeFromPrompt(text);
  const hasBranchReference = branchCode !== null;
  const hasValidBranch = branchCode ? branches.some(b => b.hierarchyCode === branchCode) : false;
  const availableCodes = branches.map(b => b.hierarchyCode).join(', ');

  const missing: string[] = [];
  if (!hasYear) missing.push('year');
  if (!hasAsset) missing.push('asset name');
  if (!hasAmount) missing.push('amount');
  if (!hasBranchReference) missing.push('branch to branch from (e.g. "branch 1" or "branch 1.2")');
  if (missing.length > 0) {
    return `I need ${missing.join(', ')} to run this simulation. Please include all required details. Example: "From branch 1, buy a car for $20k 3 years ago." Available branches: ${availableCodes}.`;
  }
  if (!hasValidBranch) {
    return `I couldn't find branch "${branchCode}" in your timeline. Please reference an existing branch code. Available branches: ${availableCodes}.`;
  }

  return null;
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
  if (hasKeyword(tx.category, 'income')) return 'income';
  if (hasKeyword(tx.intent, 'investment')) return 'investment';
  if (hasKeyword(tx.intent, 'liability')) return 'expense';

  const normalized = (tx.type || '').toLowerCase();
  if (normalized === 'credit') return 'income';
  if (normalized === 'debit') return 'expense';
  return Number(tx.amount ?? 0) < 0 ? 'expense' : 'income';
};

const mapTransactionToFinancialEvent = (tx: AtlasTransaction, index: number): FinancialEvent => {
  const parsedAmount = Number(tx.amount);
  const safeAmount = Number.isFinite(parsedAmount) ? Math.abs(parsedAmount) : 0;

  const parsedDate = tx.date ? new Date(tx.date) : null;
  const year = parsedDate && Number.isFinite(parsedDate.getTime())
    ? parsedDate.getUTCFullYear()
    : CURRENT_YEAR;

  const label = (tx.merchant || '').trim() || (tx.category || '').trim() || `Transaction ${index + 1}`;
  const descriptionParts = [tx.category, tx.intent, tx.accountId].filter(Boolean);

  return {
    year: Math.min(CURRENT_YEAR, Math.max(START_YEAR, year)),
    label,
    amount: safeAmount,
    type: mapTransactionType(tx),
    description: descriptionParts.length > 0 ? descriptionParts.join(' | ') : 'Imported from Atlas'
  };
};

const getCashImpact = (event: FinancialEvent): number => {
  if (event.type === 'income') return event.amount;
  // expense and investment reduce liquid cash
  return -event.amount;
};

const buildOriginalBranchFromTransactions = (transactions: AtlasTransaction[]): TimelineBranch => {
  const events = transactions
    .map(mapTransactionToFinancialEvent)
    .filter(event => event.amount > 0)
    .sort((a, b) => a.year - b.year);

  if (events.length === 0) return MOCK_ORIGINAL_BRANCH;

  const divergenceYear = Math.min(...events.map(e => e.year));
  const calculatedNetWorth = Math.round(events.reduce((sum, event) => sum + getCashImpact(event), 0));

  return {
    ...MOCK_ORIGINAL_BRANCH,
    events,
    divergenceYear,
    calculatedNetWorth
  };
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

  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [isPlaidConnected, setIsPlaidConnected] = useState(false);
  const [isPlaidLoading, setIsPlaidLoading] = useState(false);
  const [plaidError, setPlaidError] = useState<string | null>(null);

  const [isLoadingAtlas, setIsLoadingAtlas] = useState(true);
  const [atlasLoadError, setAtlasLoadError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Welcome, Traveler. I am your Temporal Architect. I've mapped your Prime Timeline. You can now branch from ANY point in your history. Try clicking an event on the timeline or telling me what you'd change. I will use historical market data to simulate the outcome.",
      timestamp: new Date()
    }
  ]);

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
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const initializePlaid = async () => {
      if (!sessionUser) {
        setPlaidLinkToken(null);
        setIsPlaidConnected(false);
        setPlaidError(null);
        return;
      }

      setIsPlaidLoading(true);
      setPlaidError(null);

      try {
        const [statusResponse, tokenResponse] = await Promise.all([
          fetch('/api/plaid/status'),
          fetch('/api/plaid/create_link_token', { method: 'POST' })
        ]);

        if (!statusResponse.ok) {
          const statusPayload = await statusResponse.json().catch(() => ({}));
          throw new Error(statusPayload?.error || `Plaid status failed (${statusResponse.status})`);
        }

        if (!tokenResponse.ok) {
          const tokenPayload = await tokenResponse.json().catch(() => ({}));
          throw new Error(tokenPayload?.error || `Plaid link token failed (${tokenResponse.status})`);
        }

        const statusPayload: { connected?: boolean } = await statusResponse.json();
        const tokenPayload: { link_token?: string } = await tokenResponse.json();

        if (!alive) return;
        setIsPlaidConnected(Boolean(statusPayload.connected));
        setPlaidLinkToken(tokenPayload.link_token || null);
      } catch (error: any) {
        if (!alive) return;
        setPlaidError(error?.message || 'Unable to initialize Plaid');
      } finally {
        if (!alive) return;
        setIsPlaidLoading(false);
      }
    };

    initializePlaid();
    return () => {
      alive = false;
    };
  }, [sessionUser]);

  const { open: openPlaidLink, ready: isPlaidReady } = usePlaidLink({
    token: plaidLinkToken,
    onSuccess: async (publicToken) => {
      setPlaidError(null);
      setIsPlaidLoading(true);
      try {
        const response = await fetch('/api/plaid/exchange_public_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken })
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || 'Plaid token exchange failed');
        }

        setIsPlaidConnected(true);
      } catch (error: any) {
        setPlaidError(error?.message || 'Failed to complete Plaid connection');
      } finally {
        setIsPlaidLoading(false);
      }
    },
    onExit: (error) => {
      if (error?.display_message || error?.error_message) {
        setPlaidError(error.display_message || error.error_message || 'Plaid Link exited with an error');
      }
    }
  });

  const handlePlaidConnect = () => {
    if (!isPlaidReady || !plaidLinkToken) {
      setPlaidError('Plaid Link is not ready yet');
      return;
    }
    openPlaidLink();
  };

  const handlePlaidDisconnect = async () => {
    setPlaidError(null);
    setIsPlaidLoading(true);
    try {
      const response = await fetch('/api/plaid/disconnect', { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Unable to disconnect Plaid');
      }

      setIsPlaidConnected(false);

      // Prepare a fresh link token for reconnect.
      const tokenResponse = await fetch('/api/plaid/create_link_token', { method: 'POST' });
      if (tokenResponse.ok) {
        const tokenPayload: { link_token?: string } = await tokenResponse.json();
        setPlaidLinkToken(tokenPayload.link_token || null);
      }
    } catch (error: any) {
      setPlaidError(error?.message || 'Unable to disconnect Plaid');
    } finally {
      setIsPlaidLoading(false);
    }
  };

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
      setPlaidLinkToken(null);
      setIsPlaidConnected(false);
      setPlaidError(null);
      setBranches([MOCK_ORIGINAL_BRANCH]);
      setSelectedBranchId(MOCK_ORIGINAL_BRANCH.id);
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

  const createBranch = async (content: string, overrideYear?: number, fromBranchId?: string) => {
    const parentId = fromBranchId || selectedBranchId;
    const parentBranch = branches.find(b => b.id === parentId) || MOCK_ORIGINAL_BRANCH;
    const yearsAgo = parseYearsAgoFromPrompt(content);
    const inferredYear = yearsAgo !== null ? CURRENT_YEAR - yearsAgo : null;
    const interpretedDivergenceYear = overrideYear || inferredYear || undefined;
    
    setIsProcessing(true);

    // Build context for AI
    const contextStr = `Current Timeline context (Branch ${parentBranch.hierarchyCode}: ${parentBranch.name}):
    Current Year: ${CURRENT_YEAR}
    Events: ${parentBranch.events.map(e => `${e.year}: ${e.label} ($${e.amount})`).join(', ')}
    ${interpretedDivergenceYear !== undefined ? `Interpreted divergence year from user language: ${interpretedDivergenceYear}` : ''}
    ${overrideYear ? `Target Year to change: ${overrideYear}` : ''}
    User Request: ${content}`;

    try {
      const scenario = await generateScenario(contextStr);
      const newBranchId = `alt-${Date.now()}`;
      const hierarchyCode = getNextHierarchyCode(parentBranch);
      
      const divergenceYear = overrideYear || inferredYear || scenario.divergenceYear;
      const validTypes: FinancialEvent['type'][] = ['income', 'expense', 'investment'];
      const aiDivergenceEvents = scenario.newEvents
        .filter(e => validTypes.includes(e.type as FinancialEvent['type']))
        .filter(e => e.year >= START_YEAR && e.year <= CURRENT_YEAR)
        .filter(e => e.year === divergenceYear)
        .map(e => ({
          ...e,
          type: e.type as FinancialEvent['type'],
          amount: Math.abs(Number.isFinite(e.amount) ? e.amount : 0)
        }));
      const fallbackEvent = inferFallbackEventFromPrompt(content, divergenceYear);
      const hasEquivalentExpense = fallbackEvent
        ? aiDivergenceEvents.some(e => e.type === 'expense' && e.amount === fallbackEvent.amount)
        : false;
      const sanitizedNewEvents = fallbackEvent && !hasEquivalentExpense
        ? [...aiDivergenceEvents, fallbackEvent]
        : aiDivergenceEvents;

      // Preserve parent timeline and only replace what AI explicitly changes (same year+type).
      const historicalEvents = parentBranch.events.filter(e => e.year < divergenceYear);
      const newEventKeys = new Set(sanitizedNewEvents.map(e => `${e.year}-${e.type}`));
      const parentDivergenceEvents = parentBranch.events.filter(e => e.year === divergenceYear);
      const preservedDivergenceEvents = parentDivergenceEvents.filter(e => !newEventKeys.has(`${e.year}-${e.type}`));
      const parentFutureEvents = parentBranch.events.filter(e => e.year > divergenceYear);
      const preservedFutureEvents = parentFutureEvents.filter(e => !newEventKeys.has(`${e.year}-${e.type}`));

      const combinedEvents = [
        ...historicalEvents,
        ...preservedDivergenceEvents,
        ...sanitizedNewEvents,
        ...preservedFutureEvents
      ].sort((a, b) => a.year - b.year);

      // Cash delta rules:
      // income adds cash; expense/investment/liability reduce cash.
      const getSignedEffect = (event: FinancialEvent): number => {
        return getCashImpact(event);
      };

      const aggregateEffectsByYearType = (events: FinancialEvent[]): Map<string, number> => {
        const totals = new Map<string, number>();
        for (const event of events) {
          if (event.year < divergenceYear) continue;
          const key = `${event.year}-${event.type}`;
          const prev = totals.get(key) || 0;
          totals.set(key, prev + getSignedEffect(event));
        }
        return totals;
      };

      const parentEffects = aggregateEffectsByYearType(parentBranch.events);
      const branchEffects = aggregateEffectsByYearType(combinedEvents);
      const effectKeys = new Set([...parentEffects.keys(), ...branchEffects.keys()]);
      let deltaFromParent = 0;
      for (const key of effectKeys) {
        deltaFromParent += (branchEffects.get(key) || 0) - (parentEffects.get(key) || 0);
      }

      const newWorth = Math.round(parentBranch.calculatedNetWorth + deltaFromParent);

      const newBranch: TimelineBranch = {
        id: newBranchId,
        parentId: parentId,
        hierarchyCode,
        name: scenario.branchName,
        color: `hsl(${Math.random() * 360}, 75%, 65%)`,
        isOriginal: false,
        events: combinedEvents,
        marketTrends: scenario.marketTrends,
        calculatedNetWorth: newWorth,
        divergenceYear: divergenceYear
      };

      setBranches(prev => [...prev, newBranch]);
      setSelectedBranchId(newBranchId);

      const aiMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Temporal shift confirmed! Created branch ${hierarchyCode} from branch ${parentBranch.hierarchyCode} at year ${divergenceYear}. ${scenario.explanation} Your new projected worth: ${formatCurrency(newWorth)}.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Timeline destabilization occurred. The paradox was too great to compute.",
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

    const validationError = getTransactionValidationError(content, branches);
    if (validationError) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: validationError,
        timestamp: new Date()
      }]);
      return;
    }

    const targetBranchCode = parseBranchCodeFromPrompt(content);
    const targetBranchId = targetBranchCode
      ? branches.find(b => b.hierarchyCode === targetBranchCode)?.id
      : selectedBranchId;
    createBranch(content, undefined, targetBranchId);
  };

  const handleQuickBranch = (year: number, branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    const event = branch?.events.find(e => e.year === year);
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `What if I changed my decision in ${year} regarding "${event?.label}"?`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    createBranch(userMsg.content, year, branchId);
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
            Advanced Multiverse Simulator <span className="text-slate-600 font-mono text-[10px] ml-2 px-2 py-0.5 border border-slate-800 rounded">v2.4.0-BETA</span>
          </p>
        </div>
        
        <div className="flex gap-2">
          <div className="glass px-4 py-2 rounded-2xl flex items-center gap-3 border-slate-700/50 shadow-xl shadow-blue-500/5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{sessionUser.email}</span>
          </div>
          <button
            onClick={handlePlaidConnect}
            disabled={isPlaidLoading || !isPlaidReady || isPlaidConnected}
            className="glass px-4 py-2 rounded-2xl flex items-center gap-3 border-slate-700/50 shadow-xl shadow-blue-500/5 disabled:opacity-60"
            title={isPlaidConnected ? 'Plaid is connected' : 'Connect Plaid sandbox'}
          >
            <div className={`w-2 h-2 rounded-full ${isPlaidConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              {isPlaidConnected ? 'Plaid Connected' : isPlaidLoading ? 'Connecting Plaid...' : 'Connect Plaid'}
            </span>
          </button>
          {isPlaidConnected && (
            <button
              onClick={handlePlaidDisconnect}
              disabled={isPlaidLoading}
              className="glass px-4 py-2 rounded-2xl hover:bg-white/10 transition-all border-slate-700/50 group disabled:opacity-60"
              title="Disconnect Plaid sandbox"
            >
              <i className="fa-solid fa-link-slash text-slate-400 group-hover:text-amber-400 transition-colors"></i>
            </button>
          )}
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

      {plaidError && (
        <div className="glass px-4 py-2 rounded-xl border border-rose-500/30 text-rose-300 text-xs font-semibold">
          {plaidError}
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
          />
          
          <StatCards 
            branch={selectedBranch} 
            originalBranch={originalBranch} 
          />

          <div className="glass p-6 rounded-2xl relative overflow-hidden group border border-slate-700/50">
            <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: selectedBranch.color }}></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <i className="fa-solid fa-list-check text-slate-400"></i>
                Timeline Ledger: <span style={{ color: selectedBranch.color }}>Branch {selectedBranch.hierarchyCode} - {selectedBranch.name}</span>
              </h3>
              <span className="text-[10px] font-black bg-slate-800 px-3 py-1 rounded-full text-slate-400 uppercase tracking-widest border border-slate-700">
                {selectedBranch.events.length} Data Points
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {selectedBranch.events.map((event, idx) => {
                const isAfterDivergence = event.year >= selectedBranch.divergenceYear;
                // Find market data for this year if it exists
                const marketData = selectedBranch.marketTrends?.find(m => m.year === event.year);

                return (
                  <div 
                    key={idx} 
                    className={`flex items-start gap-4 p-4 rounded-2xl transition-all border ${
                      isAfterDivergence 
                        ? 'bg-slate-800/40 border-slate-700/50 shadow-lg' 
                        : 'bg-slate-900/20 border-transparent opacity-60 grayscale-[0.5]'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center border border-slate-800 mb-1">
                        <span className="text-xs font-black text-white">{event.year.toString().slice(-2)}</span>
                      </div>
                      <div className={`w-0.5 flex-1 ${idx === selectedBranch.events.length - 1 ? 'hidden' : 'bg-slate-800'}`}></div>
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
                      
                      {marketData && isAfterDivergence && (
                         <div className="mt-1 flex items-center gap-2">
                           <span className={`text-[9px] font-mono px-1 rounded ${marketData.growthRate >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                             {marketData.growthRate >= 0 ? '▲' : '▼'} {(marketData.growthRate * 100).toFixed(1)}% Market
                           </span>
                           <span className="text-[9px] text-slate-600 truncate max-w-[120px]">{marketData.narrative}</span>
                         </div>
                      )}

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-300">{formatCurrency(event.amount)}</span>
                        {isAfterDivergence && (
                          <div className="flex items-center gap-1">
                            <i className="fa-solid fa-code-branch text-[8px] text-purple-400"></i>
                            <span className="text-[8px] text-purple-400 font-bold uppercase tracking-tighter">Modified</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
              Simulation Suggestions
            </h4>
            <div className="space-y-2">
              {[
                "Skip the MBA degree in 2018",
                "Start investing in Crypto in 2013",
                "Avoid the house deposit in 2021",
                "Switch careers in 2015"
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

      {/* Footer / Status */}
      <footer className="pt-8 border-t border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-slate-500 font-bold tracking-widest uppercase">
        <div className="flex gap-6">
          <span className="flex items-center gap-2"><i className="fa-solid fa-microchip text-blue-500"></i> Engine: Gemini 3.0 Pro</span>
          <span className="flex items-center gap-2"><i className="fa-solid fa-shield-halved text-emerald-500"></i> Safety: Grade A</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-600">Syncing Multiverse state...</span>
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full bg-blue-500"></div>
            <div className="w-1 h-1 rounded-full bg-blue-500/50"></div>
            <div className="w-1 h-1 rounded-full bg-blue-500/20"></div>
          </div>
          <span className="ml-4">© 2025 Temporal Financial Labs</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
