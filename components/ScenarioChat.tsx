
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface ScenarioChatProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isProcessing: boolean;
}

const ScenarioChat: React.FC<ScenarioChatProps> = ({ messages, onSendMessage, isProcessing }) => {
  const { isDark } = useTheme();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className={`rounded-2xl h-[550px] flex flex-col overflow-hidden border ${isDark ? 'glass border-slate-700/50' : 'bg-white border-slate-200 shadow-lg'}`}>
      <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-slate-700/50 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <i className="fa-solid fa-robot text-white"></i>
          </div>
          <div>
            <h3 className={`font-bold text-sm tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Temporal Architect</h3>
            <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Online & Analyzing</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : isDark
                  ? 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/50'
                  : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className={`rounded-2xl rounded-tl-none p-4 border ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700/50' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
              <p className="text-[10px] mt-2 text-slate-400 font-mono italic">Calculating compound ripple effects...</p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className={`p-4 border-t ${isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
        <div className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What if I stopped buying coffee in 2020?"
            className={`w-full border rounded-xl py-3 px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all text-sm ${
              isDark
                ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-600'
                : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
            }`}
          />
          <button 
            type="submit" 
            disabled={isProcessing}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-600/20"
          >
            <i className="fa-solid fa-paper-plane text-xs"></i>
          </button>
        </div>
        <p className="text-[10px] text-slate-500 mt-2 text-center">
          Ask to change any event in your timeline or add a new one.
        </p>
      </form>
    </div>
  );
};

export default ScenarioChat;
