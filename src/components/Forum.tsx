import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import Markdown from 'react-markdown';
import { ForumThread, ForumReply } from '../types';
import { MessageSquare, ArrowBigUp, ArrowBigDown, Sparkles, Tag, Search, Plus, Filter, Loader2, Bot, ChevronLeft } from 'lucide-react';
import { generateForumReply } from '../services/gemini';
import { createNotification } from '../services/notificationService';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const CATEGORIES = ['All', 'General', 'Help Needed', 'Showcase', 'Career Tips', 'Bug Reports'];

export default function Forum() {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [activeThread, setActiveThread] = useState<ForumThread | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // New Thread State
  const [newThread, setNewThread] = useState({ title: '', content: '', category: 'General' });
  const [isAiCopilotEnabled, setIsAiCopilotEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Reply State
  const [newReply, setNewReply] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'forumThreads'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setThreads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ForumThread)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'forumThreads'));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeThread) return;
    const q = query(collection(db, `forumThreads/${activeThread.id}/replies`), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ForumReply)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `forumThreads/${activeThread.id}/replies`));
    return unsubscribe;
  }, [activeThread]);

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsSubmitting(true);
    try {
      const threadDoc = await addDoc(collection(db, 'forumThreads'), {
        ...newThread,
        createdAt: Date.now(),
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Student',
        repliesCount: 0,
        upvotes: 0,
        upvotedBy: []
      });

      // AI Co-pilot auto-reply logic
      if (isAiCopilotEnabled) {
        toast.info("Buddy is generating a reply...", { duration: 3000 });
        const aiResponse = await generateForumReply(newThread.title, newThread.content);
        
        await addDoc(collection(db, `forumThreads/${threadDoc.id}/replies`), {
          threadId: threadDoc.id,
          content: aiResponse,
          createdAt: Date.now(),
          authorId: 'ai-buddy',
          authorName: 'Buddy (AI)',
          isAI: true,
          upvotes: 0,
          upvotedBy: []
        });

        await updateDoc(threadDoc, { repliesCount: 1 });
        
        await createNotification(
          auth.currentUser.uid,
          'reply',
          'Buddy responded to your thread!',
          `Buddy has posted an AI-generated reply to "${newThread.title.substring(0, 30)}..."`
        );
      }

      setNewThread({ title: '', content: '', category: 'General' });
      setIsAiCopilotEnabled(false);
      setView('list');
      toast.success("Thread created seamlessly!");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'forumThreads');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !activeThread) return;
    setIsReplying(true);
    try {
      await addDoc(collection(db, `forumThreads/${activeThread.id}/replies`), {
        threadId: activeThread.id,
        content: newReply,
        createdAt: Date.now(),
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Student',
        upvotes: 0,
        upvotedBy: []
      });
      await updateDoc(doc(db, 'forumThreads', activeThread.id), {
        repliesCount: (activeThread.repliesCount || 0) + 1
      });
      
      // Dispatch Notification to Thread Author
      await createNotification(
        activeThread.authorId,
        'reply',
        'New Reply to your thread',
        `${auth.currentUser.displayName || 'Someone'} replied: "${newReply.substring(0, 50)}${newReply.length > 50 ? '...' : ''}"`
      );

      setNewReply('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `forumThreads/${activeThread.id}/replies`);
    } finally {
      setIsReplying(false);
    }
  };

  const handleToggleUpvote = async (threadId: string, isReply: boolean = false, replyId?: string) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    
    try {
      const docRef = isReply && replyId
        ? doc(db, `forumThreads/${threadId}/replies`, replyId)
        : doc(db, 'forumThreads', threadId);

      const targetItem = isReply 
        ? replies.find(r => r.id === replyId) 
        : threads.find(t => t.id === threadId);
        
      if (!targetItem) return;

      const hasUpvoted = targetItem.upvotedBy?.includes(uid);
      const newUpvotes = (targetItem.upvotes || 0) + (hasUpvoted ? -1 : 1);

      await updateDoc(docRef, {
        upvotes: newUpvotes,
        upvotedBy: hasUpvoted ? arrayRemove(uid) : arrayUnion(uid)
      });
      
    } catch (err) {
      console.error("Upvote failed", err);
      toast.error("Failed to register upvote.");
    }
  };

  const filteredThreads = threads.filter(t => {
    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (view === 'create') return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => setView('list')} className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-white tracking-tight">Post a New Thread</h2>
      </div>
      
      <form onSubmit={handleCreateThread} className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 p-8 rounded-3xl space-y-6 shadow-xl">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Title</label>
          <input 
            type="text" 
            value={newThread.title} 
            onChange={e => setNewThread({...newThread, title: e.target.value})} 
            placeholder="What's on your mind?" 
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-white hover:border-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors" 
            required 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Category</label>
            <select 
              value={newThread.category}
              onChange={e => setNewThread({...newThread, category: e.target.value})}
              className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-white hover:border-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
            >
              {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={14} /> AI Co-pilot
            </label>
            <button 
              type="button"
              onClick={() => setIsAiCopilotEnabled(!isAiCopilotEnabled)}
              className={cn(
                "w-full p-4 rounded-xl border flex justify-between items-center transition-all",
                isAiCopilotEnabled 
                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                  : "bg-zinc-950/50 border-zinc-800 text-zinc-500 hover:border-zinc-700"
              )}
            >
              <span className="font-bold text-sm">Ask Buddy to reply instantly</span>
              <div className={cn("w-10 h-6 rounded-full p-1 transition-colors", isAiCopilotEnabled ? "bg-emerald-500" : "bg-zinc-700")}>
                <div className={cn("w-4 h-4 bg-white rounded-full transition-transform", isAiCopilotEnabled ? "translate-x-4" : "translate-x-0")} />
              </div>
            </button>
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Content (Markdown)</label>
          <textarea 
            value={newThread.content} 
            onChange={e => setNewThread({...newThread, content: e.target.value})} 
            placeholder="Elaborate your question or insight here..." 
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-white hover:border-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none" 
            rows={10} 
            required 
          />
        </div>

        <div className="flex justify-end gap-4 pt-4 border-t border-zinc-800/50">
          <button type="button" onClick={() => setView('list')} className="px-6 py-3 text-zinc-400 font-bold hover:text-white transition-colors">Cancel</button>
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-8 rounded-xl transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting && <Loader2 size={18} className="animate-spin" />}
            {isSubmitting ? 'Posting...' : 'Post Thread'}
          </button>
        </div>
      </form>
    </motion.div>
  );

  if (view === 'detail' && activeThread) return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => setView('list')} className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
           <span className="px-3 py-1 bg-zinc-800 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-zinc-700">
            {activeThread.category || 'General'}
          </span>
          <span className="text-sm text-zinc-500">Back to {selectedCategory === 'All' ? 'Forum' : selectedCategory}</span>
        </div>
      </div>

      {/* Main Thread Body */}
      <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl flex gap-6">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <button onClick={() => handleToggleUpvote(activeThread.id)} className={cn("p-2 rounded-xl transition-colors hover:bg-zinc-800", activeThread.upvotedBy?.includes(auth.currentUser?.uid!) ? "text-emerald-500" : "text-zinc-500")}>
            <ArrowBigUp size={24} fill={activeThread.upvotedBy?.includes(auth.currentUser?.uid!) ? "currentColor" : "none"} />
          </button>
          <span className="font-bold text-white text-lg">{activeThread.upvotes || 0}</span>
          <button className="p-2 rounded-xl text-zinc-700 hover:text-red-500 transition-colors">
            <ArrowBigDown size={24} />
          </button>
        </div>
        <div className="flex-1 space-y-6">
          <h1 className="text-3xl font-bold text-white leading-tight">{activeThread.title}</h1>
          <div className="flex items-center gap-3 text-xs text-zinc-500 border-b border-zinc-800/50 pb-6">
            <div className="w-6 h-6 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center font-bold">
              {activeThread.authorName.charAt(0)}
            </div>
            <span className="font-bold text-zinc-300">{activeThread.authorName}</span>
            <span>•</span>
            <span>{new Date(activeThread.createdAt).toLocaleString()}</span>
          </div>
          <div className="prose prose-invert prose-emerald max-w-none text-zinc-300 leading-relaxed">
            <Markdown>{activeThread.content}</Markdown>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pl-4">
        <MessageSquare size={20} className="text-zinc-500" />
        <h3 className="text-xl font-bold text-white">{replies.length} Replies</h3>
      </div>

      {/* Replies */}
      <div className="space-y-4">
        <AnimatePresence>
          {replies.map((reply, i) => (
            <motion.div 
              key={reply.id} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn("bg-zinc-900/30 p-6 rounded-2xl border flex gap-6", reply.isAI ? "border-emerald-500/30 bg-emerald-500/5 shadow-[inset_0_0_20px_rgba(16,185,129,0.02)]" : "border-zinc-800 ml-4 lg:ml-12")}
            >
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button onClick={() => handleToggleUpvote(activeThread.id, true, reply.id)} className={cn("p-1.5 rounded-lg transition-colors hover:bg-zinc-800", reply.upvotedBy?.includes(auth.currentUser?.uid!) ? "text-emerald-500" : "text-zinc-500")}>
                  <ArrowBigUp size={20} fill={reply.upvotedBy?.includes(auth.currentUser?.uid!) ? "currentColor" : "none"} />
                </button>
                <span className="font-bold text-zinc-400 text-sm">{reply.upvotes || 0}</span>
                <button className="p-1.5 rounded-lg text-zinc-700 hover:text-red-500 transition-colors">
                  <ArrowBigDown size={20} />
                </button>
              </div>
              <div className="flex-1 space-y-4">
                 <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {reply.isAI ? (
                    <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded">
                      <Bot size={14} /> Buddy (AI)
                    </div>
                  ) : (
                    <>
                      <div className="w-5 h-5 bg-zinc-800 text-zinc-300 rounded-full flex items-center justify-center font-bold text-[10px]">
                        {reply.authorName.charAt(0)}
                      </div>
                      <span className="font-bold text-zinc-300">{reply.authorName}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{new Date(reply.createdAt).toLocaleString()}</span>
                </div>
                <div className="prose prose-invert prose-emerald max-w-none text-zinc-300 text-sm">
                  <Markdown>{reply.content}</Markdown>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Reply Box */}
      <form onSubmit={handleAddReply} className="mt-8 bg-zinc-900/40 p-6 border border-zinc-800 rounded-3xl ml-4 lg:ml-12 shadow-xl">
        <h4 className="text-sm font-bold text-white mb-4">Add your thoughts</h4>
        <textarea 
          value={newReply} 
          onChange={e => setNewReply(e.target.value)} 
          placeholder="Write a helpful reply... Markdown is supported." 
          className="w-full p-4 rounded-xl bg-zinc-950/50 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors resize-y min-h-[120px]" 
          required 
        />
        <div className="flex justify-end mt-4">
          <button 
            type="submit" 
            disabled={isReplying}
            className="bg-zinc-800 hover:bg-emerald-500 hover:text-black text-white font-bold py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isReplying && <Loader2 size={16} className="animate-spin" />}
            Post Reply
          </button>
        </div>
      </form>
    </motion.div>
  );

  // List View
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight flex items-center gap-3">
            <MessageSquare size={32} className="text-emerald-500" />
            Campus Forum
          </h1>
          <p className="text-zinc-500 mt-2">Connect, ask questions, and share knowledge with your peers.</p>
        </div>
        <button 
          onClick={() => setView('create')} 
          className="bg-emerald-500 text-black font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-emerald-400 hover:-translate-y-0.5 transition-all flex items-center gap-2"
        >
          <Plus size={20} /> New Discussion
        </button>
      </header>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-zinc-900/30 p-2 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto p-1 scrollbar-hide">
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                selectedCategory === category
                  ? "bg-zinc-800 text-emerald-400 shadow-md"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80 group px-2 md:px-0">
          <Search className="absolute left-6 md:left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search discussions..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl pl-12 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Threads List */}
      <div className="space-y-4">
        <AnimatePresence>
          {filteredThreads.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center border-2 border-dashed border-zinc-800 rounded-3xl bg-zinc-900/10">
              <MessageSquare size={48} className="mx-auto text-zinc-700 mb-4" />
              <p className="text-zinc-500 font-medium">No discussions found matching your criteria.</p>
              <button onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }} className="mt-4 text-emerald-500 text-sm hover:underline font-bold">Clear Filters</button>
            </motion.div>
          ) : (
            filteredThreads.map((thread, i) => (
              <motion.button 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={thread.id} 
                onClick={() => { setActiveThread(thread); setView('detail'); }} 
                className="w-full text-left bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800 hover:border-emerald-500/50 transition-all flex items-center justify-between group flex-col sm:flex-row gap-4"
              >
                <div className="flex gap-5 items-center w-full sm:w-auto">
                  <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 bg-zinc-950 rounded-xl border border-zinc-800 group-hover:border-emerald-500/30 transition-colors">
                    <span className="font-bold text-white leading-none">{thread.upvotes || 0}</span>
                    <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Votes</span>
                  </div>
                  <div className="flex flex-col justify-center space-y-1">
                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">{thread.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><Tag size={12} /> {thread.category || 'General'}</span>
                      <span>•</span>
                      <span>Posted by <span className="text-zinc-300 font-medium">{thread.authorName}</span></span>
                      <span>•</span>
                      <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center ml-auto">
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border",
                    thread.repliesCount! > 0 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  )}>
                    <MessageSquare size={14} />
                    {thread.repliesCount || 0} Replies
                  </div>
                </div>
              </motion.button>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
