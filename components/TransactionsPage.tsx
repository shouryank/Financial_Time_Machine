
import React, { useMemo, useState } from 'react';
import { FinancialEvent } from '../types';
import { formatCurrency } from '../services/financeUtils';
import { formatMonthLabel } from '../constants';
import { useTheme } from '../contexts/ThemeContext';

type CategoryFilter = 'all' | 'expense' | 'income' | 'investment';
type SortField = 'date' | 'amount' | 'name';
type SortDir = 'asc' | 'desc';

interface TransactionsPageProps {
  events: FinancialEvent[];
}

const CATEGORY_META: Record<CategoryFilter, { label: string; icon: string; color: string; lightColor: string }> = {
  all:        { label: 'All Transactions', icon: 'fa-list',           color: 'text-blue-400',    lightColor: 'text-blue-600' },
  expense:    { label: 'Expenses',         icon: 'fa-arrow-trend-down', color: 'text-rose-400',   lightColor: 'text-rose-600' },
  income:     { label: 'Income',           icon: 'fa-arrow-trend-up',   color: 'text-emerald-400', lightColor: 'text-emerald-600' },
  investment: { label: 'Investments',      icon: 'fa-chart-pie',        color: 'text-violet-400',  lightColor: 'text-violet-600' },
};

const TYPE_BADGE: Record<FinancialEvent['type'], { bg: string; text: string; lightBg: string; lightText: string }> = {
  expense:    { bg: 'bg-rose-500/15',    text: 'text-rose-400',    lightBg: 'bg-rose-100',    lightText: 'text-rose-700' },
  income:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400', lightBg: 'bg-emerald-100', lightText: 'text-emerald-700' },
  investment: { bg: 'bg-violet-500/15',  text: 'text-violet-400',  lightBg: 'bg-violet-100',  lightText: 'text-violet-700' },
};

const TransactionsPage: React.FC<TransactionsPageProps> = ({ events }) => {
  const { isDark } = useTheme();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Derived data ──
  const filtered = useMemo(() => {
    let list = category === 'all' ? events : events.filter(e => e.type === category);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(e =>
        e.label.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.month.includes(q)
      );
    }
    return list;
  }, [events, category, searchQuery]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.month.localeCompare(b.month);
      else if (sortField === 'amount') cmp = a.amount - b.amount;
      else cmp = a.label.localeCompare(b.label);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  // ── Summary stats ──
  const stats = useMemo(() => {
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    const count = filtered.length;
    const avgPerTransaction = count > 0 ? total / count : 0;
    return { total, count, avgPerTransaction };
  }, [filtered]);

  const categoryCounts = useMemo(() => {
    const counts = { expense: 0, income: 0, investment: 0 };
    for (const e of events) counts[e.type]++;
    return counts;
  }, [events]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return 'fa-sort';
    return sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  };

  const meta = CATEGORY_META[category];

  return (
    <div className="space-y-6">
      {/* ── Category Pill Selector ── */}
      <div className={`flex flex-wrap gap-3 p-4 rounded-2xl border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
        {(Object.keys(CATEGORY_META) as CategoryFilter[]).map(cat => {
          const m = CATEGORY_META[cat];
          const isActive = category === cat;
          const count = cat === 'all' ? events.length : categoryCounts[cat];
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-sm font-semibold ${
                isActive
                  ? isDark
                    ? 'bg-white/10 border-white/30 text-white shadow-lg shadow-black/20'
                    : 'bg-blue-50 border-blue-300 text-blue-900 shadow-sm'
                  : isDark
                    ? 'bg-slate-900/50 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <i className={`fa-solid ${m.icon} ${isActive ? (isDark ? m.color : m.lightColor) : ''}`}></i>
              {m.label}
              <span className={`ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                isActive
                  ? isDark ? 'bg-white/10 text-white' : 'bg-blue-100 text-blue-700'
                  : isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-5 rounded-2xl border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
          <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <i className={`fa-solid ${meta.icon} mr-1.5 ${isDark ? meta.color : meta.lightColor}`}></i>
            {meta.label} Total
          </div>
          <div className={`text-2xl font-bold font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(stats.total)}</div>
        </div>
        <div className={`p-5 rounded-2xl border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
          <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <i className="fa-solid fa-hashtag mr-1.5 text-blue-400"></i>
            Transaction Count
          </div>
          <div className={`text-2xl font-bold font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{stats.count.toLocaleString()}</div>
        </div>
        <div className={`p-5 rounded-2xl border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
          <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <i className="fa-solid fa-calculator mr-1.5 text-amber-400"></i>
            Avg per Transaction
          </div>
          <div className={`text-2xl font-bold font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(stats.avgPerTransaction)}</div>
        </div>
      </div>

      {/* ── Search + Sort Controls ── */}
      <div className={`flex flex-col md:flex-row gap-3 items-start md:items-center justify-between p-4 rounded-2xl border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
        {/* Search */}
        <div className="relative flex-1 max-w-md w-full">
          <i className={`fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, category, or date..."
            className={`w-full pl-8 pr-3 py-2 rounded-xl text-sm ${
              isDark
                ? 'bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30'
                : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-200'
            } focus:outline-none`}
          />
        </div>

        {/* Sort buttons */}
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black uppercase tracking-widest mr-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Sort by</span>
          {(['date', 'amount', 'name'] as SortField[]).map(field => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                sortField === field
                  ? isDark
                    ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                    : 'bg-blue-50 border-blue-300 text-blue-700'
                  : isDark
                    ? 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              <i className={`fa-solid ${sortIcon(field)} text-[9px]`}></i>
            </button>
          ))}
        </div>
      </div>

      {/* ── Transaction Table ── */}
      <div className={`rounded-2xl border overflow-hidden ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
        {/* Table header */}
        <div className={`grid grid-cols-12 gap-2 px-5 py-3 text-[10px] font-black uppercase tracking-widest border-b ${
          isDark ? 'bg-slate-800/50 border-slate-700/50 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'
        }`}>
          <div className="col-span-2 flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors" onClick={() => toggleSort('date')}>
            Date <i className={`fa-solid ${sortIcon('date')} text-[8px]`}></i>
          </div>
          <div className="col-span-4 flex items-center gap-1 cursor-pointer hover:text-blue-400 transition-colors" onClick={() => toggleSort('name')}>
            Name <i className={`fa-solid ${sortIcon('name')} text-[8px]`}></i>
          </div>
          <div className="col-span-2">Category</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2 text-right flex items-center gap-1 justify-end cursor-pointer hover:text-blue-400 transition-colors" onClick={() => toggleSort('amount')}>
            Amount <i className={`fa-solid ${sortIcon('amount')} text-[8px]`}></i>
          </div>
        </div>

        {/* Table body */}
        <div className="max-h-[560px] overflow-y-auto custom-scrollbar">
          {sorted.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-16 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <i className="fa-solid fa-filter-circle-xmark text-3xl mb-3 opacity-40"></i>
              <p className="text-sm font-semibold">No transactions found</p>
              <p className="text-xs mt-1 opacity-60">Try adjusting your filter or search query</p>
            </div>
          ) : (
            sorted.map((event, idx) => {
              const badge = TYPE_BADGE[event.type];
              const categoryLabel = event.description.split(' | ')[0] || '—';
              return (
                <div
                  key={`${event.month}-${event.label}-${idx}`}
                  className={`grid grid-cols-12 gap-2 px-5 py-3.5 items-center border-b transition-colors ${
                    isDark
                      ? 'border-slate-800/50 hover:bg-slate-800/30'
                      : 'border-slate-100 hover:bg-slate-50'
                  } ${idx % 2 === 0 ? (isDark ? 'bg-slate-900/20' : 'bg-white') : (isDark ? 'bg-transparent' : 'bg-slate-50/50')}`}
                >
                  {/* Date */}
                  <div className="col-span-2">
                    <span className={`text-xs font-mono font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {formatMonthLabel(event.month)}
                    </span>
                  </div>

                  {/* Name */}
                  <div className="col-span-4">
                    <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>{event.label}</p>
                  </div>

                  {/* Category */}
                  <div className="col-span-2">
                    <span className={`text-[10px] font-semibold truncate block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {categoryLabel}
                    </span>
                  </div>

                  {/* Type badge */}
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${
                      isDark ? `${badge.bg} ${badge.text}` : `${badge.lightBg} ${badge.lightText}`
                    }`}>
                      <i className={`fa-solid ${
                        event.type === 'income' ? 'fa-arrow-up' : event.type === 'expense' ? 'fa-arrow-down' : 'fa-chart-line'
                      } text-[8px]`}></i>
                      {event.type}
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="col-span-2 text-right">
                    <span className={`text-sm font-mono font-bold ${
                      event.type === 'income'
                        ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                        : event.type === 'expense'
                          ? isDark ? 'text-rose-400' : 'text-rose-600'
                          : isDark ? 'text-violet-400' : 'text-violet-600'
                    }`}>
                      {event.type === 'expense' ? '-' : '+'}{formatCurrency(event.amount)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table footer */}
        <div className={`px-5 py-3 flex items-center justify-between text-xs border-t ${
          isDark ? 'bg-slate-800/30 border-slate-700/50 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'
        }`}>
          <span>Showing {sorted.length} of {events.length} transactions</span>
          <span className="font-mono font-bold">Total: {formatCurrency(stats.total)}</span>
        </div>
      </div>
    </div>
  );
};

export default TransactionsPage;
