import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  PenTool, 
  Users, 
  Settings, 
  LogOut,
  ClipboardCheck,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Megaphone,
  MessageSquare,
  MessageCircle,
  CalendarDays,
  Star,
  Trophy,
  LineChart,
  Briefcase,
  BookMarked,
  Library,
  Mic,
  FileText
} from 'lucide-react';
import Logo from './Logo';
import { cn } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface SidebarProps {
  role: 'student' | 'mentor' | 'admin';
  activeTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

export default function Sidebar({ role, activeTab, onTabChange, isCollapsed, onToggle, onLogout }: SidebarProps) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const q = collection(db, 'announcements');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unread = snapshot.docs.filter(doc => !doc.data().readBy?.includes(user.uid)).length;
      setUnreadCount(unread);
    }, (err) => {
      console.error("Error fetching announcements count:", err);
    });
    return unsubscribe;
  }, [user?.uid]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['student', 'mentor', 'admin'] },
    { id: 'lessons', label: 'Lessons', icon: BookOpen, roles: ['student', 'mentor', 'admin'] },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookMarked, roles: ['student', 'mentor', 'admin'] },
    { id: 'resources', label: 'Resource Library', icon: Library, roles: ['student', 'mentor', 'admin'] },
    { id: 'assignments', label: 'Assignments', icon: PenTool, roles: ['student', 'mentor'] },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, roles: ['student', 'mentor', 'admin'], badge: unreadCount },
    { id: 'forum', label: 'Forum', icon: MessageSquare, roles: ['student', 'mentor', 'admin'] },
    { id: 'messages', label: 'Messages', icon: MessageCircle, roles: ['student', 'mentor', 'admin'] },
    { id: 'mentorship', label: 'Mentorship', icon: CalendarDays, roles: ['student', 'mentor', 'admin'] },
    { id: 'peer-review', label: 'Peer Review', icon: Star, roles: ['student', 'mentor'] },
    { id: 'achievements', label: 'Achievements', icon: Trophy, roles: ['student', 'mentor'] },
    { id: 'progress', label: 'Progress', icon: LineChart, roles: ['student', 'mentor'] },
    { id: 'mock-interview', label: 'Mock Interview', icon: Mic, roles: ['student'] },
    { id: 'resume-builder', label: 'Resume Builder', icon: FileText, roles: ['student'] },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase, roles: ['student', 'mentor', 'admin'] },
    { id: 'job-board', label: 'Job Board', icon: Briefcase, roles: ['student', 'mentor', 'admin'] },
    { id: 'review', label: 'Review', icon: ClipboardCheck, roles: ['mentor', 'admin'] },
    { id: 'cohort', label: 'My Cohort', icon: Users, roles: ['student', 'mentor'] },
    { id: 'admin', label: 'Admin Panel', icon: Settings, roles: ['admin'] },
    { id: 'profile', label: 'Profile', icon: User, roles: ['student', 'mentor', 'admin'] },
  ];

  return (
    <div className={cn(
      "bg-zinc-950/40 backdrop-blur-sm border-r border-zinc-800/50 h-screen flex flex-col p-4 text-zinc-400 transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn("flex items-center gap-3 px-2 mb-10", isCollapsed ? "justify-center" : "")}>
        <Logo size={isCollapsed ? 32 : 40} />
        {!isCollapsed && <span className="font-bold text-white text-lg tracking-tight whitespace-nowrap">Tech4Dummies</span>}
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.filter(item => item.roles.includes(role)).map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            aria-label={item.label}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group hover-glow",
              activeTab === item.id 
                ? "bg-emerald-500/10 text-emerald-400" 
                : "hover:bg-zinc-900/40 backdrop-blur-sm hover:text-zinc-200",
              isCollapsed ? "justify-center" : ""
            )}
            title={isCollapsed ? item.label : undefined}
          >
            <item.icon size={20} className={cn(
              "transition-colors shrink-0",
              activeTab === item.id ? "text-emerald-400" : "group-hover:text-zinc-200"
            )} />
            {!isCollapsed && <span className="font-medium whitespace-nowrap flex-1">{item.label}</span>}
            {!isCollapsed && item.badge && item.badge > 0 && (
              <span className="bg-emerald-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="pt-4 border-t border-zinc-800 space-y-2">
        <button 
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-900/40 transition-all duration-200 text-zinc-500 hover:text-zinc-300",
            isCollapsed ? "justify-center" : ""
          )}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          {!isCollapsed && <span className="font-medium whitespace-nowrap">Collapse</span>}
        </button>
        <button 
          onClick={onLogout}
          aria-label="Sign Out"
          className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all duration-200",
          isCollapsed ? "justify-center" : ""
        )}
        title={isCollapsed ? "Sign Out" : undefined}
        >
          <LogOut size={20} className="shrink-0" />
          {!isCollapsed && <span className="font-medium whitespace-nowrap">Sign Out</span>}
        </button>
      </div>
    </div>
  );
}
