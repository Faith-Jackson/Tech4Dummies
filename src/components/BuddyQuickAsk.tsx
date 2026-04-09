import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, Sparkles, Loader2, X, ChevronRight, Clock } from 'lucide-react';
import { askBuddy } from '../services/gemini';
import ReactMarkdown from 'react-markdown';

const COOLDOWN_MS = 10_000; // 10 second cooldown between AI requests

export default function BuddyQuickAsk() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick down the cooldown every second
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    cooldownTimer.current = setInterval(() => {
      setCooldownLeft(prev => {
        if (prev <= 1000) {
          clearInterval(cooldownTimer.current!);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(cooldownTimer.current!);
  }, [cooldownLeft]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || cooldownLeft > 0) return;

    setLoading(true);
    setIsOpen(true);
    try {
      const res = await askBuddy('', query);
      setResponse(res);
      setCooldownLeft(COOLDOWN_MS); // start cooldown after successful call
    } catch (err) {
      setResponse("Sorry, I encountered an error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 shadow-xl shadow-black/20">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles size={18} className="text-emerald-500" />
          Quick Ask Buddy
        </h3>
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">AI Assistant</span>
      </div>

      <form onSubmit={handleAsk} className="relative group">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything about your course..."
          className="w-full bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl py-4 pl-6 pr-14 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-all"
        />
        <button
          type="submit"
          disabled={loading || !query.trim() || cooldownLeft > 0}
          className="absolute right-2 top-2 bottom-2 px-4 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-xs font-bold"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={18} />
          ) : cooldownLeft > 0 ? (
            <><Clock size={14} />{Math.ceil(cooldownLeft / 1000)}s</>
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 overflow-hidden"
          >
            <div className="p-6 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl relative">
              <button 
                onClick={() => { setIsOpen(false); setResponse(null); setQuery(''); }}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
              
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Buddy's Response</span>
              </div>

              <div className="prose prose-invert prose-emerald max-w-none text-xs leading-relaxed">
                {loading ? (
                  <div className="flex items-center gap-3 text-zinc-500 italic">
                    <Loader2 className="animate-spin" size={14} />
                    Thinking through your question...
                  </div>
                ) : (
                  <ReactMarkdown>{response || ''}</ReactMarkdown>
                )}
              </div>

              {!loading && response && (
                <button 
                  onClick={() => { setIsOpen(false); setResponse(null); setQuery(''); }}
                  className="mt-6 flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-emerald-400 transition-colors group"
                >
                  Got it, thanks!
                  <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
