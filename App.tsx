
import React, { useState, useEffect, useCallback } from 'react';
import { TimelineBranch, ChatMessage, SimulationScenario, FinancialEvent } from './types';
import { MOCK_ORIGINAL_BRANCH, INITIAL_EVENTS } from './constants';
import TimelineGraph from './components/TimelineGraph';
import ScenarioChat from './components/ScenarioChat';
import StatCards from './components/StatCards';
import { generateScenario } from './services/geminiService';
import { calculateCompoundGrowth, formatCurrency } from './services/financeUtils';

const App: React.FC = () => {
  const [branches, setBranches] = useState<TimelineBranch[]>([MOCK_ORIGINAL_BRANCH]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(MOCK_ORIGINAL_BRANCH.id);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Welcome, Traveler. I am your Temporal Architect. I've mapped your Prime Timeline. You can now branch from ANY point in your history. Try clicking an event on the timeline or telling me what you'd change. I will use historical market data to simulate the outcome.",
      timestamp: new Date()
    }
  ]);

  // Recalculate the Original Branch on mount to ensure the baseline math is consistent with the engine
  useEffect(() => {
    const trueOriginalWorth = calculateCompoundGrowth(0, INITIAL_EVENTS, []);
    setBranches(prev => prev.map(b => 
      b.id === 'original' 
        ? { ...b, calculatedNetWorth: trueOriginalWorth }
        : b
    ));
  }, []);

  const selectedBranch = branches.find(b => b.id === selectedBranchId) || branches[0];
  const originalBranch = branches.find(b => b.id === 'original') || MOCK_ORIGINAL_BRANCH;

  const createBranch = async (content: string, overrideYear?: number, fromBranchId?: string) => {
    const parentId = fromBranchId || selectedBranchId;
    const parentBranch = branches.find(b => b.id === parentId) || branches[0];
    
    setIsProcessing(true);

    // Build context for AI
    const contextStr = `Current Timeline context (${parentBranch.name}):
    Events: ${parentBranch.events.map(e => `${e.year}: ${e.label} ($${e.amount})`).join(', ')}
    ${overrideYear ? `Target Year to change: ${overrideYear}` : ''}
    User Request: ${content}`;

    try {
      const scenario = await generateScenario(contextStr);
      const newBranchId = `alt-${Date.now()}`;
      
      const divergenceYear = overrideYear || scenario.divergenceYear;

      // 1. Historical Events: Keep everything BEFORE the divergence
      const historicalEvents = parentBranch.events.filter(e => e.year < divergenceYear);

      // 2. Future Events: Keep everything strictly AFTER the divergence
      // This ensures we don't lose the 2023 Promotion if we change 2022.
      // We only keep them if the AI hasn't explicitly replaced them (same year + same type).
      const newEventKeys = new Set(scenario.newEvents.map(e => `${e.year}-${e.type}`));
      const parentFutureEvents = parentBranch.events.filter(e => e.year > divergenceYear);
      
      const preservedFutureEvents = parentFutureEvents.filter(pe => {
        // If AI generated a conflict (same year & type), we prefer the AI's version.
        // Otherwise, we keep the original future event.
        return !newEventKeys.has(`${pe.year}-${pe.type}`);
      });

      // 3. Combined: History + New AI Events (Divergence) + Preserved Future
      const combinedEvents = [
        ...historicalEvents, 
        ...scenario.newEvents, 
        ...preservedFutureEvents
      ].sort((a, b) => a.year - b.year);

      // Use the AI-generated market trends for the new timeline calculation
      const newWorth = calculateCompoundGrowth(0, combinedEvents, scenario.marketTrends);

      const newBranch: TimelineBranch = {
        id: newBranchId,
        parentId: parentId,
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
        content: `Temporal shift confirmed! We've branched from "${parentBranch.name}" at year ${divergenceYear}. ${scenario.explanation} Your new projected worth: ${formatCurrency(newWorth)}.`,
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
    createBranch(content);
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
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Active Link: Plaid</span>
          </div>
          <button className="glass px-4 py-2 rounded-2xl hover:bg-white/10 transition-all border-slate-700/50 group">
            <i className="fa-solid fa-bolt text-slate-400 group-hover:text-yellow-400 transition-colors"></i>
          </button>
        </div>
      </header>

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
            originalWorth={originalBranch.calculatedNetWorth} 
          />

          <div className="glass p-6 rounded-2xl relative overflow-hidden group border border-slate-700/50">
            <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: selectedBranch.color }}></div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <i className="fa-solid fa-list-check text-slate-400"></i>
                Timeline Ledger: <span style={{ color: selectedBranch.color }}>{selectedBranch.name}</span>
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
