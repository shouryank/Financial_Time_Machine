
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { TimelineBranch } from '../types';
import { CURRENT_MONTH, START_MONTH, monthRange, formatMonthLabel } from '../constants';
import { formatCurrency } from '../services/financeUtils';

interface TimelineGraphProps {
  branches: TimelineBranch[];
  selectedBranchId: string;
  onSelectBranch: (id: string) => void;
  onQuickBranch: (month: string, prompt: string, branchId: string) => void;
  isProcessing?: boolean;
}

const ZOOM_LEVELS = [
  { label: '1×', months: Infinity, dotEvery: 12, labelEvery: 12 },   // full range
  { label: '2×', months: Infinity, dotEvery: 6, labelEvery: 6 },
  { label: '3×', months: 60, dotEvery: 3, labelEvery: 6 },           // ~5 years
  { label: '5×', months: 36, dotEvery: 2, labelEvery: 3 },           // 3 years
  { label: '8×', months: 18, dotEvery: 1, labelEvery: 2 },           // 1.5 years
  { label: '12×', months: 12, dotEvery: 1, labelEvery: 1 },          // 1 year — every month
];

const TimelineGraph: React.FC<TimelineGraphProps> = ({ branches, selectedBranchId, onSelectBranch, onQuickBranch, isProcessing }) => {
  const [activeNode, setActiveNode] = useState<{ month: string; x: number; y: number; branchId: string; branchCode: string; branchColor: string } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ month: string; balance: number; x: number; y: number; branchColor: string } | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [zoomIdx, setZoomIdx] = useState(0);
  const [panOffset, setPanOffset] = useState(0); // how many months to shift the visible window right
  const promptInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoom = ZOOM_LEVELS[zoomIdx];

  // Focus input when popup opens
  useEffect(() => {
    if (activeNode && promptInputRef.current) {
      promptInputRef.current.focus();
    }
  }, [activeNode]);

  // Close popup on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setActiveNode(null); setPromptValue(''); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Reset pan when zoom changes
  useEffect(() => { setPanOffset(0); }, [zoomIdx]);

  const padding = { top: 50, right: 60, bottom: 50, left: 80 };
  const width = 1000;
  const height = 400;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // All months in the full timeline
  const fullMonths = useMemo(() => {
    let earliest = CURRENT_MONTH;
    for (const b of branches) {
      if (b.cumulativeBalance.length > 0 && b.cumulativeBalance[0].month < earliest) {
        earliest = b.cumulativeBalance[0].month;
      }
    }
    if (earliest > START_MONTH) earliest = START_MONTH;
    return monthRange(earliest, CURRENT_MONTH);
  }, [branches]);

  // Visible window of months based on zoom + pan
  const allMonths = useMemo(() => {
    if (zoom.months === Infinity || zoom.months >= fullMonths.length) return fullMonths;
    const maxPan = fullMonths.length - zoom.months;
    // Default: right-aligned (show most recent), pan shifts left
    const startIdx = Math.max(0, Math.min(maxPan, maxPan - panOffset));
    return fullMonths.slice(startIdx, startIdx + zoom.months);
  }, [fullMonths, zoom, panOffset]);

  const canPanLeft = zoom.months < fullMonths.length && (() => {
    const maxPan = fullMonths.length - zoom.months;
    return panOffset < maxPan;
  })();
  const canPanRight = panOffset > 0;

  // Global min/max balance across all branches for Y axis
  const { minBal, maxBal } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const b of branches) {
      for (const entry of b.cumulativeBalance) {
        if (entry.balance < min) min = entry.balance;
        if (entry.balance > max) max = entry.balance;
      }
    }
    // Add 10% padding
    const range = max - min || 1;
    return { minBal: min - range * 0.1, maxBal: max + range * 0.1 };
  }, [branches]);

  const getX = (month: string) => {
    const idx = allMonths.indexOf(month);
    if (idx < 0) return padding.left;
    return padding.left + (idx / Math.max(1, allMonths.length - 1)) * chartW;
  };

  const getY = (balance: number) => {
    const ratio = (balance - minBal) / (maxBal - minBal);
    return padding.top + chartH - ratio * chartH;
  };

  // Generate path for a branch's cumulative balance line
  const buildLinePath = (branch: TimelineBranch): string => {
    const points = branch.cumulativeBalance;
    if (points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.month)} ${getY(p.balance)}`)
      .join(' ');
  };

  // Determine nice Y-axis tick values
  const yTicks = useMemo(() => {
    const range = maxBal - minBal;
    const step = Math.pow(10, Math.floor(Math.log10(range || 1)));
    const niceStep = range / step > 8 ? step * 2 : step;
    const ticks: number[] = [];
    let v = Math.floor(minBal / niceStep) * niceStep;
    while (v <= maxBal) {
      ticks.push(v);
      v += niceStep;
    }
    return ticks;
  }, [minBal, maxBal]);

  // Axis & dot intervals driven by zoom level
  const xLabelInterval = zoom.labelEvery;
  const nodeInterval = zoom.dotEvery;

  const handleNodeClick = (month: string, branch: TimelineBranch, e: React.MouseEvent<SVGCircleElement>) => {
    if (!containerRef.current) return;
    const svgRect = containerRef.current.querySelector('svg')?.getBoundingClientRect();
    if (!svgRect) return;
    const circleRect = e.currentTarget.getBoundingClientRect();
    const x = circleRect.left - svgRect.left + circleRect.width / 2;
    const y = circleRect.top - svgRect.top;
    setActiveNode({ month, x, y, branchId: branch.id, branchCode: branch.hierarchyCode, branchColor: branch.color });
    setPromptValue('');
  };

  const handlePromptSubmit = () => {
    if (!activeNode || !promptValue.trim() || isProcessing) return;
    onQuickBranch(activeNode.month, promptValue.trim(), activeNode.branchId);
    setActiveNode(null);
    setPromptValue('');
  };

  return (
    <div ref={containerRef} className="w-full glass rounded-2xl p-6 relative min-h-[450px] border border-slate-700/50">
      {/* Sticky header — stays in place when scrolling horizontally */}
      <div className="sticky left-0 z-10 flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-timeline text-blue-400"></i>
          <span className="text-sm font-semibold tracking-wider uppercase text-slate-400">Multiverse Navigator</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Hint */}
          <span className="flex items-center gap-1 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            <i className="fa-solid fa-circle-info text-[8px]"></i> Click a dot to branch
          </span>

          {/* Pan arrows (visible only when zoomed in) */}
          {zoom.months < fullMonths.length && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPanOffset(p => Math.min(p + Math.max(1, Math.floor(zoom.months / 2)), fullMonths.length - zoom.months))}
                disabled={!canPanLeft}
                className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Pan left (earlier)"
              >
                <i className="fa-solid fa-chevron-left text-[9px]"></i>
              </button>
              <button
                onClick={() => setPanOffset(p => Math.max(p - Math.max(1, Math.floor(zoom.months / 2)), 0))}
                disabled={!canPanRight}
                className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Pan right (later)"
              >
                <i className="fa-solid fa-chevron-right text-[9px]"></i>
              </button>
            </div>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-800/80 rounded-xl border border-slate-700 px-1.5 py-1">
            <button
              onClick={() => setZoomIdx(i => Math.max(0, i - 1))}
              disabled={zoomIdx === 0}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom out"
            >
              <i className="fa-solid fa-magnifying-glass-minus text-[10px]"></i>
            </button>
            <span className="text-[10px] font-bold text-blue-300 w-7 text-center font-mono">{zoom.label}</span>
            <button
              onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Zoom in"
            >
              <i className="fa-solid fa-magnifying-glass-plus text-[10px]"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable chart area */}
      <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto">
        {/* Horizontal grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padding.left} y1={getY(v)}
              x2={width - padding.right} y2={getY(v)}
              stroke="#1e293b" strokeWidth="1"
            />
            <text
              x={padding.left - 8} y={getY(v) + 4}
              textAnchor="end" fontSize="9" fill="#64748b" className="font-mono"
            >
              {formatCurrency(v)}
            </text>
          </g>
        ))}

        {/* X axis baseline */}
        <line
          x1={padding.left} y1={height - padding.bottom}
          x2={width - padding.right} y2={height - padding.bottom}
          stroke="#334155" strokeWidth="1"
        />

        {/* X-axis month labels */}
        {allMonths.map((m, i) => {
          if (i % xLabelInterval !== 0 && i !== allMonths.length - 1) return null;
          const x = getX(m);
          return (
            <g key={m}>
              <text x={x} y={height - padding.bottom + 16} textAnchor="middle" fontSize="9" fill="#64748b" className="font-heading">
                {formatMonthLabel(m)}
              </text>
              <line x1={x} y1={height - padding.bottom} x2={x} y2={height - padding.bottom + 4} stroke="#334155" strokeWidth="1" />
            </g>
          );
        })}

        {/* Branch lines */}
        {branches.map(branch => {
          const isSelected = selectedBranchId === branch.id;
          const path = buildLinePath(branch);
          if (!path) return null;

          // Divergence marker for alternate branches
          const divergenceX = !branch.isOriginal ? getX(branch.divergenceMonth) : null;
          const divergenceEntry = !branch.isOriginal
            ? branch.cumulativeBalance.find(e => e.month === branch.divergenceMonth)
            : null;
          const divergenceY = divergenceEntry ? getY(divergenceEntry.balance) : null;

          // End point for label
          const lastPoint = branch.cumulativeBalance[branch.cumulativeBalance.length - 1];

          return (
            <g key={branch.id} onClick={() => onSelectBranch(branch.id)} className="cursor-pointer group">
              {/* Glow effect */}
              {isSelected && (
                <path d={path} fill="none" stroke={branch.color} strokeWidth={6} strokeOpacity={0.15} className="blur-sm" />
              )}

              <path
                d={path}
                fill="none"
                stroke={branch.color}
                strokeWidth={isSelected ? 3 : 1.5}
                strokeOpacity={isSelected ? 1 : 0.4}
                className="transition-all duration-500"
              />

              {/* Divergence point indicator */}
              {divergenceX !== null && divergenceY !== null && (
                <g>
                  <circle cx={divergenceX} cy={divergenceY} r={5} fill={branch.color} stroke="#0f172a" strokeWidth="2" />
                  {isSelected && (
                    <g className="opacity-80">
                      <line x1={divergenceX} y1={divergenceY} x2={divergenceX} y2={padding.top} stroke={branch.color} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.3" />
                      <rect x={divergenceX - 30} y={padding.top - 2} width={60} height={16} rx={4} fill="#0f172a" stroke={branch.color} strokeWidth="0.5" />
                      <text x={divergenceX} y={padding.top + 10} textAnchor="middle" fontSize="8" fill={branch.color} className="font-mono">
                        {formatMonthLabel(branch.divergenceMonth)}
                      </text>
                    </g>
                  )}
                </g>
              )}

              {/* End-of-line label showing final value */}
              {lastPoint && isSelected && (
                <g>
                  <rect
                    x={getX(lastPoint.month) + 4} y={getY(lastPoint.balance) - 10}
                    width={65} height={20} rx={4}
                    fill="#0f172a" stroke={branch.color} strokeWidth="0.5"
                  />
                  <text
                    x={getX(lastPoint.month) + 36} y={getY(lastPoint.balance) + 4}
                    textAnchor="middle" fontSize="9" fill={branch.color} className="font-mono font-bold"
                  >
                    {formatCurrency(lastPoint.balance)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Interactive month-dot nodes on ALL branches */}
        {branches.map(branch => {
          const isSelectedBranch = selectedBranchId === branch.id;
          return branch.cumulativeBalance
            .filter(pt => allMonths.includes(pt.month))
            .map((pt) => {
              const monthIdx = allMonths.indexOf(pt.month);
              if (monthIdx < 0 || monthIdx % nodeInterval !== 0) return null;
              // For alternate branches, only show dots from the divergence month onward
              if (!branch.isOriginal && pt.month < branch.divergenceMonth) return null;
              const cx = getX(pt.month);
              const cy = getY(pt.balance);
              const nodeKey = `${branch.id}-${pt.month}`;
              const isActive = activeNode?.branchId === branch.id && activeNode?.month === pt.month;
              const isHovered = hoveredNode?.month === pt.month && Math.abs((hoveredNode?.x ?? 0) - cx) < 1 && Math.abs((hoveredNode?.y ?? 0) - cy) < 1;
              const dotColor = branch.color;
              return (
                <g key={nodeKey}>
                  {/* Hover ring — larger invisible target */}
                  <circle
                    cx={cx} cy={cy} r={12}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); handleNodeClick(pt.month, branch, e as unknown as React.MouseEvent<SVGCircleElement>); }}
                    onMouseEnter={() => setHoveredNode({ month: pt.month, balance: pt.balance, x: cx, y: cy, branchColor: dotColor })}
                    onMouseLeave={() => setHoveredNode(null)}
                  />
                  {/* Visible dot */}
                  <circle
                    cx={cx} cy={cy}
                    r={isActive ? 5 : isHovered ? 4.5 : isSelectedBranch ? 3 : 2}
                    fill={isActive ? dotColor : isHovered ? dotColor : '#1e293b'}
                    stroke={isActive || isHovered ? dotColor : '#475569'}
                    strokeWidth={isActive || isHovered ? 2 : 1}
                    className="cursor-pointer"
                    opacity={isSelectedBranch || isActive || isHovered ? 1 : 0.5}
                    style={{ filter: isActive ? `drop-shadow(0 0 4px ${dotColor})` : isHovered ? `drop-shadow(0 0 3px ${dotColor})` : 'none', transition: 'all 0.15s ease' }}
                    onClick={(e) => { e.stopPropagation(); handleNodeClick(pt.month, branch, e as unknown as React.MouseEvent<SVGCircleElement>); }}
                    onMouseEnter={() => setHoveredNode({ month: pt.month, balance: pt.balance, x: cx, y: cy, branchColor: dotColor })}
                    onMouseLeave={() => setHoveredNode(null)}
                  />
                  {/* Hover tooltip */}
                  {isHovered && !isActive && (
                    <g>
                      <rect
                        x={cx - 55} y={cy - 48}
                        width={110} height={38} rx={6}
                        fill="#0f172a" fillOpacity="0.95"
                        stroke={dotColor} strokeWidth="0.5"
                      />
                      <text x={cx} y={cy - 34} textAnchor="middle" fontSize="8" fill={dotColor} className="font-mono font-bold">
                        Branch {branch.hierarchyCode}
                      </text>
                      <text x={cx} y={cy - 24} textAnchor="middle" fontSize="9" fill="#94a3b8" className="font-mono">
                        {formatMonthLabel(pt.month)}
                      </text>
                      <text x={cx} y={cy - 14} textAnchor="middle" fontSize="10" fill="#e2e8f0" className="font-mono font-bold">
                        {formatCurrency(pt.balance)}
                      </text>
                    </g>
                  )}
                </g>
              );
            });
        })}
      </svg>

      {/* Inline prompt popup */}
      {activeNode && (
        <div
          className="absolute z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{
            left: `${Math.min(Math.max(activeNode.x - 140, 8), (containerRef.current?.clientWidth ?? 800) - 300)}px`,
            top: `${activeNode.y - 8}px`,
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur-xl border rounded-xl shadow-2xl p-3 w-[280px]" style={{ borderColor: `${activeNode.branchColor}66`, boxShadow: `0 4px 24px ${activeNode.branchColor}15` }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: activeNode.branchColor }}></div>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: activeNode.branchColor }}>
                {activeNode.branchCode} → {formatMonthLabel(activeNode.month)}
              </span>
              <button
                onClick={() => { setActiveNode(null); setPromptValue(''); }}
                className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); handlePromptSubmit(); }}
              className="flex gap-2"
            >
              <input
                ref={promptInputRef}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder="What if I stopped buying coffee?"
                disabled={isProcessing}
                className="flex-1 bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!promptValue.trim() || isProcessing}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg px-2.5 py-1.5 transition-colors"
              >
                {isProcessing
                  ? <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                  : <i className="fa-solid fa-code-branch text-xs"></i>
                }
              </button>
            </form>
            <p className="text-[9px] text-slate-600 mt-1.5 leading-snug">
              e.g. "What if I invested $5k in NVIDIA?" or "What if I cut dining?"
            </p>
          </div>
        </div>
      )}
      </div>{/* end scrollable chart area */}

      {/* Sticky legend — stays in place when scrolling horizontally */}
      <div className="sticky left-0 z-10 flex flex-wrap gap-3 max-w-full mt-4">
        {branches.map(b => (
          <button
            key={b.id}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all text-[10px] font-bold uppercase tracking-widest ${selectedBranchId === b.id ? 'bg-white/10 border-white/30 text-white shadow-lg shadow-black/20' : 'bg-slate-900/50 border-transparent text-slate-500 hover:text-slate-300'}`}
            onClick={() => onSelectBranch(b.id)}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }}></div>
            {b.hierarchyCode} {b.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TimelineGraph;
