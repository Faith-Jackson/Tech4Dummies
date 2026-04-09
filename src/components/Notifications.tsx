import React, { useEffect, useState } from 'react';
import { Bell, X, Check, Megaphone, Inbox, GraduationCap, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, query, orderBy, limit } from 'firebase/firestore';
import { AppNotification } from '../types';
import { cn } from '../lib/utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  readBy: string[];
  createdAt: number;
}

interface NotificationsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Notifications({ isOpen, onClose }: NotificationsProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [personalNotifications, setPersonalNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch global announcements
    const unsubAnnouncements = onSnapshot(collection(db, 'announcements'), (snapshot) => {
      // Mock createdAt for legacy announcements if missing, but real system should write it
      const data = snapshot.docs.map(doc => ({ id: doc.id, createdAt: Date.now(), ...doc.data() } as Announcement));
      setAnnouncements(data);
    }, (err) => console.error("Error fetching announcements:", err));

    // Fetch personal notifications
    const q = query(
      collection(db, `users/${auth.currentUser.uid}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubPersonal = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification));
      setPersonalNotifications(data);
    }, (err) => console.error("Error fetching notifications:", err));

    return () => {
      unsubAnnouncements();
      unsubPersonal();
    };
  }, [auth.currentUser?.uid]);

  const markAnnouncementRead = async (id: string) => {
    if (!auth.currentUser) return;
    const docRef = doc(db, 'announcements', id);
    await updateDoc(docRef, { readBy: arrayUnion(auth.currentUser.uid) });
  };

  const markPersonalRead = async (id: string) => {
    if (!auth.currentUser) return;
    const docRef = doc(db, `users/${auth.currentUser.uid}/notifications`, id);
    await updateDoc(docRef, { read: true });
  };

  // Combine and sort
  const combined = [
    ...announcements.map(a => ({
      ...a,
      isGlobal: true,
      isRead: a.readBy?.includes(auth.currentUser?.uid || ''),
      icon: Megaphone,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/20"
    })),
    ...personalNotifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      createdAt: n.createdAt,
      type: n.type,
      isGlobal: false,
      isRead: n.read,
      icon: n.type === 'grade' ? GraduationCap : n.type === 'reply' ? MessageSquare : Inbox,
      color: n.type === 'grade' ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"
    }))
  ].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div 
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed top-0 right-0 h-full w-full max-w-sm bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Bell size={24} className="text-emerald-500" />
                <h2 className="text-xl font-bold text-white">Notifications</h2>
              </div>
              <button onClick={onClose} className="p-2 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              {combined.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl">
                  <Inbox size={32} className="mx-auto text-zinc-700 mb-3" />
                  <p className="text-zinc-500 font-medium">All caught up!</p>
                </div>
              )}
              
              <AnimatePresence>
                {combined.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div 
                      key={`${item.isGlobal ? 'ann' : 'per'}-${item.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={cn(
                        "p-5 rounded-2xl border transition-all",
                        item.isRead ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-800 border-zinc-700 shadow-lg"
                      )}
                    >
                      <div className="flex gap-4 items-start">
                        <div className={cn("p-2 rounded-xl border shrink-0", item.color, item.isRead && "opacity-50 grayscale")}>
                          <Icon size={18} />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between items-start">
                            <h3 className={cn("font-bold text-sm", item.isRead ? "text-zinc-500" : "text-white")}>{item.title}</h3>
                            {!item.isRead && (
                              <button 
                                onClick={() => item.isGlobal ? markAnnouncementRead(item.id) : markPersonalRead(item.id)}
                                className="text-emerald-500 hover:text-emerald-400 p-1"
                                title="Mark as read"
                              >
                                <Check size={16} />
                              </button>
                            )}
                          </div>
                          <p className={cn("text-xs leading-relaxed", item.isRead ? "text-zinc-600" : "text-zinc-400")}>{item.message}</p>
                          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider pt-2">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
