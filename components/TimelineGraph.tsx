
import React, { useMemo } from 'react';
import { TimelineBranch } from '../types';
import { START_YEAR, CURRENT_YEAR } from '../constants';

interface TimelineGraphProps {
  branches: TimelineBranch[];
  selectedBranchId: string;
  onSelectBranch: (id: string) => void;
  onQuickBranch: (year: number, branchId: string) => void;
}

const TimelineGraph: React.FC<TimelineGraphProps> = ({ branches, selectedBranchId, onSelectBranch, onQuickBranch }) => {
  const padding = 60;
  const width = 1000;
  const height = 400;
  const midY = height / 2;
  
  const yearStep = (width - padding * 2) / (CURRENT_YEAR - START_YEAR);
  const getX = (year: number) => padding + (year - START_YEAR) * yearStep;

  // Memoize branch positioning to handle recursion/nesting
  const branchPositions = useMemo(() => {
    const positions: Record<string, number> = { 'original': midY };
    const sortedBranches = [...branches].sort((a, b) => a.divergenceYear - b.divergenceYear);
    
    let topOffset = 70;
    let bottomOffset = 70;

    sortedBranches.forEach(branch => {
      if (branch.isOriginal) return;
      
      // Determine if we go up or down based on index
      const nonOriginalIdx = branches.filter(b => !b.isOriginal).indexOf(branch);
      if (nonOriginalIdx % 2 === 0) {
        positions[branch.id] = midY - topOffset;
        topOffset += 60;
      } else {
        positions[branch.id] = midY + bottomOffset;
        bottomOffset += 60;
      }
    });
    return positions;
  }, [branches, midY]);

  return (
    <div className="w-full glass rounded-2xl p-6 overflow-x-auto relative min-h-[450px] border border-slate-700/50">
      <div className="absolute top-4 left-6 flex items-center justify-between w-[92%]">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-timeline text-blue-400"></i>
          <span className="text-sm font-semibold tracking-wider uppercase text-slate-400">Multiverse Navigator</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Prime</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Alternate</span>
        </div>
      </div>
      
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto">
        {/* Background Grid Lines */}
        {Array.from({ length: 5 }).map((_, i) => (
          <line 
            key={i} 
            x1={padding} 
            y1={50 + i * 75} 
            x2={width - padding} 
            y2={50 + i * 75} 
            stroke="#1e293b" 
            strokeWidth="1" 
          />
        ))}

        {/* Year Axis */}
        <line x1={padding} y1={height - 30} x2={width - padding} y2={height - 30} stroke="#334155" strokeWidth="2" strokeDasharray="4 4" />
        {Array.from({ length: CURRENT_YEAR - START_YEAR + 1 }).map((_, i) => {
          const year = START_YEAR + i;
          const x = getX(year);
          return (
            <g key={year}>
              <text x={x} y={height - 10} textAnchor="middle" fontSize="10" fill="#64748b" className="font-heading">{year}</text>
              <line x1={x} y1={height - 35} x2={x} y2={height - 25} stroke="#334155" strokeWidth="1" />
            </g>
          );
        })}

        {/* Branches Rendering */}
        {branches.map(branch => {
          const parentBranch = branches.find(b => b.id === (branch.parentId || 'original'));
          const startX = getX(branch.divergenceYear);
          const startY = branch.isOriginal ? midY : (branchPositions[parentBranch?.id || 'original'] || midY);
          const endY = branchPositions[branch.id];
          const endX = getX(CURRENT_YEAR);
          const isSelected = selectedBranchId === branch.id;

          // Step Line Path (Vertical then Horizontal)
          // M startX startY -> L startX endY -> L endX endY
          const path = branch.isOriginal 
            ? `M ${getX(START_YEAR)} ${midY} L ${endX} ${midY}`
            : `M ${startX} ${startY} L ${startX} ${endY} L ${endX} ${endY}`;

          return (
            <g key={branch.id} onClick={() => onSelectBranch(branch.id)} className="cursor-pointer group">
              {/* Glow effect for selected branch */}
              {isSelected && (
                <path
                  d={path}
                  fill="none"
                  stroke={branch.color}
                  strokeWidth={8}
                  strokeOpacity={0.15}
                  className="blur-sm"
                />
              )}
              
              <path
                d={path}
                fill="none"
                stroke={branch.color}
                strokeWidth={isSelected ? 4 : 2}
                strokeOpacity={isSelected ? 1 : 0.3}
                className="transition-all duration-500"
              />
              
              {/* Event Nodes */}
              {branch.events.map((event, idx) => {
                const nodeX = getX(event.year);
                if (!branch.isOriginal && event.year < branch.divergenceYear) return null;
                
                // Simplified Y for markers (assuming horizontal after divergence)
                const nodeY = branch.isOriginal ? midY : endY;
                
                return (
                  <g key={`${branch.id}-${idx}`} className="group/node">
                    <circle
                      cx={nodeX}
                      cy={nodeY}
                      r={isSelected ? 6 : 4}
                      fill={branch.color}
                      className="transition-all duration-300"
                    />
                    
                    {/* Tooltip & Actions for selected branch nodes */}
                    {isSelected && (
                      <g className="opacity-0 group-hover/node:opacity-100 transition-opacity">
                        <rect 
                          x={nodeX - 40} y={nodeY - 55} width={80} height={35} rx={6} 
                          fill="#0f172a" stroke={branch.color} strokeWidth="1" 
                        />
                        <text x={nodeX} y={nodeY - 40} textAnchor="middle" fontSize="9" fill="white" className="font-bold">
                          {event.label}
                        </text>
                        <text 
                          x={nodeX} y={nodeY - 28} textAnchor="middle" fontSize="7" fill={branch.color} 
                          className="font-bold uppercase tracking-widest cursor-pointer hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onQuickBranch(event.year, branch.id);
                          }}
                        >
                          Branch Here +
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Interactive Legend */}
      <div className="absolute bottom-6 left-6 flex flex-wrap gap-3 max-w-[80%]">
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
