import React from 'react';
import { motion } from 'motion/react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ArrowRight,
  Play,
  Calendar,
  Trophy,
  TrendingUp,
  Users,
  BookOpen,
  Activity,
  Shield,
  FileCheck,
  GraduationCap,
  Layout,
  MessageSquare,
  Sparkles,
  Target,
  Zap,
  Quote,
  Circle,
  Bookmark,
  BookmarkCheck,
  Layers as LayersIcon,
  Github,
  Linkedin,
  Globe
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import YouTubeEmbed from './YouTubeEmbed';
import DailyChallenge from './DailyChallenge';
import BuddyQuickAsk from './BuddyQuickAsk';
import { useAuth } from '../hooks/useAuth';
import { Course, Lesson, Module, AppUser, Cohort, PublicProfile } from '../types';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  RadarChart,
  PolarGrid,
  Radar
} from 'recharts';

export default function Dashboard({ 
  course, 
  lessons = [], 
  modules = [], 
  onOpenChat,
  mentors = [],
  students = [],
  cohorts = []
}: { 
  course?: Course, 
  lessons?: Lesson[], 
  modules?: Module[],
  onOpenChat: (user: PublicProfile) => void,
  mentors?: PublicProfile[],
  students?: PublicProfile[],
  cohorts?: Cohort[]
}) {
  const { user } = useAuth();

  if (user?.role === 'admin') {
    return <AdminDashboard />;
  }

  if (user?.role === 'mentor') {
    return <MentorDashboard students={students} onOpenChat={onOpenChat} cohorts={cohorts} lessons={lessons} />;
  }

  return (
    <StudentDashboard 
      course={course} 
      lessons={lessons} 
      modules={modules} 
      mentors={mentors}
      students={students}
      onOpenChat={onOpenChat}
    />
  );
}

function QuizScoresChart({ data }: { data: any[] }) {
  if (data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-zinc-500 text-sm font-medium italic">
        No quiz attempts yet. Complete a quiz to see your progress!
      </div>
    );
  }

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#71717a', fontSize: 10, fontWeight: 600 }}
            dy={10}
          />
          <YAxis 
            domain={[0, 100]} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#71717a', fontSize: 10, fontWeight: 600 }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#09090b', 
              borderColor: '#27272a', 
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 'bold',
              color: '#fff'
            }}
          />
          <Line 
            type="monotone" 
            dataKey="score" 
            stroke="#10b981" 
            strokeWidth={3} 
            dot={{ fill: '#10b981', r: 4 }} 
            activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2, fill: '#fff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StudentDashboard({ 
  course, 
  lessons, 
  modules,
  mentors,
  students,
  onOpenChat
}: { 
  course?: Course, 
  lessons: Lesson[], 
  modules: Module[],
  mentors: PublicProfile[],
  students: PublicProfile[],
  onOpenChat: (user: PublicProfile) => void
}) {
  const { user, toggleBookmark } = useAuth();
  const [quizCount, setQuizCount] = React.useState(0);
  const [submissionCount, setSubmissionCount] = React.useState(0);
  const [submissions, setSubmissions] = React.useState<any[]>([]);
  const [quizAttempts, setQuizAttempts] = React.useState<any[]>([]);
  const [recentFeedback, setRecentFeedback] = React.useState<any[]>([]);
  const [assignments, setAssignments] = React.useState<any[]>([]);
  const [userBadges, setUserBadges] = React.useState<any[]>([]);
  const [allBadges, setAllBadges] = React.useState<any[]>([]);
  const [cohortLeaderboard, setCohortLeaderboard] = React.useState<any[]>([]);
  const [recentActivity, setRecentActivity] = React.useState<any[]>([]);
  const [loadingData, setLoadingData] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    
    const qQuizzes = query(collection(db, 'quizAttempts'), where('studentId', '==', user.uid), orderBy('completedAt', 'asc'), limit(50));
    const qSubmissions = query(collection(db, 'submissions'), where('studentId', '==', user.uid), limit(50));
    const qAssignments = query(collection(db, 'assignments'));
    const qBadges = query(collection(db, 'badges'));
    const qUserBadges = query(collection(db, 'userBadges'), where('userId', '==', user.uid));
    const qActivity = query(collection(db, 'progressUpdates'), where('studentId', '==', user.uid), orderBy('updatedAt', 'desc'), limit(10));
    
    const unsubQuizzes = onSnapshot(qQuizzes, (snap) => {
      setQuizCount(snap.size);
      setQuizAttempts(snap.docs.map(doc => {
        const data = doc.data();
        const lesson = lessons.find(l => l.quizId === data.quizId);
        return {
          name: lesson?.title || 'Quiz',
          score: data.score,
          timestamp: data.completedAt
        };
      }));
      setLoadingData(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'quizAttempts'));

    const unsubSubmissions = onSnapshot(qSubmissions, (snap) => {
      setSubmissionCount(snap.size);
      const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setSubmissions(subs);
      const feedback = subs
        .filter(sub => sub.status === 'graded' && sub.feedback)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3)
        .map(sub => {
          const mentor = mentors.find(m => m.uid === sub.gradedBy);
          return {
            id: sub.id,
            mentor: mentor?.displayName || 'Mentor',
            text: sub.feedback,
            date: new Date(sub.updatedAt).toLocaleDateString(),
            avatar: mentor?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${sub.gradedBy}`
          };
        });
      setRecentFeedback(feedback);
      setLoadingData(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'submissions'));

    const unsubAssignments = onSnapshot(qAssignments, (snap) => {
      setAssignments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'assignments'));

    const unsubAllBadges = onSnapshot(qBadges, (snap) => {
      setAllBadges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'badges'));

    const unsubUserBadges = onSnapshot(qUserBadges, (snap) => {
      setUserBadges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'userBadges'));

    const unsubActivity = onSnapshot(qActivity, (snap) => {
      setRecentActivity(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'progressUpdates'));

    // Leaderboard logic - fetch students in the same cohort and sort by progress/XP
    if (user.cohortId) {
      const qCohortStudents = query(collection(db, 'users_public'), where('cohortId', '==', user.cohortId), where('role', '==', 'student'));
      const unsubLeaderboard = onSnapshot(qCohortStudents, (snap) => {
        const leaderboard = snap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            displayName: data.displayName,
            photoURL: data.photoURL,
            completed: data.completedCount || 0,
            xp: data.xp || 0
          };
        }).sort((a, b) => b.xp - a.xp).slice(0, 5);
        setCohortLeaderboard(leaderboard);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users_public'));
      return () => {
        unsubQuizzes();
        unsubSubmissions();
        unsubAssignments();
        unsubAllBadges();
        unsubUserBadges();
        unsubActivity();
        unsubLeaderboard();
      };
    }
    
    return () => {
      unsubQuizzes();
      unsubSubmissions();
      unsubAssignments();
      unsubAllBadges();
      unsubUserBadges();
      unsubActivity();
    };
  }, [user, lessons, mentors]);

  const completedCount = user?.completedLessonIds?.length || 0;
  const totalLessons = lessons.length || 1;
  const overallProgress = Math.round((completedCount / totalLessons) * 100);

  // XP and Leveling Logic
  const currentXP = user?.xp || (completedCount * 100);
  const currentLevel = user?.level || Math.floor(currentXP / 1000) + 1;
  const xpToNextLevel = currentLevel * 1000;
  const xpInCurrentLevel = currentXP % 1000;
  const levelProgress = Math.round((xpInCurrentLevel / 1000) * 100);

  const moduleProgress = modules.map(m => {
    const moduleLessons = lessons.filter(l => l.moduleId === m.id);
    const completedModuleLessons = moduleLessons.filter(l => user?.completedLessonIds?.includes(l.id));
    const completion = moduleLessons.length > 0 
      ? Math.round((completedModuleLessons.length / moduleLessons.length) * 100) 
      : 0;
    return { name: m.title, completion };
  });

  const overallProgressData = [
    { name: 'Completed', value: overallProgress, fill: '#10b981' },
    { name: 'Remaining', value: 100 - overallProgress, fill: '#27272a' },
  ];

  const firstIncompleteLesson = lessons.length > 0 ? (lessons.find(l => !user?.completedLessonIds?.includes(l.id)) || lessons[0]) : null;
  const currentModule = modules.find(m => m.id === firstIncompleteLesson?.moduleId);
  const moduleLessons = lessons.filter(l => l.moduleId === currentModule?.id);
  const completedModuleLessons = moduleLessons.filter(l => user?.completedLessonIds?.includes(l.id));
  const moduleProgressPercent = moduleLessons.length > 0 
    ? Math.round((completedModuleLessons.length / moduleLessons.length) * 100) 
    : 0;

  const currentLesson = {
    title: firstIncompleteLesson?.title || "No lessons available",
    module: currentModule?.title || "Course Introduction",
    progress: moduleProgressPercent,
    thumbnail: "https://picsum.photos/seed/code/800/450"
  };

  const stats = [
    { label: 'Lessons', value: loadingData ? '...' : completedCount.toString(), icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Quizzes', value: loadingData ? '...' : quizCount.toString(), icon: Clock, color: 'text-amber-400' },
    { label: 'Assignments', value: loadingData ? '...' : submissionCount.toString(), icon: FileCheck, color: 'text-purple-400' },
    { label: 'Progress', value: `${overallProgress}%`, icon: TrendingUp, color: 'text-blue-400' },
  ];

  const dailyGoalData = [
    { name: 'Progress', value: 65, fill: '#10b981' },
  ];

  const handleClaimReward = () => {
    toast.success("Daily Reward Claimed!", {
      description: "You've earned 50 bonus XP for your consistency.",
      icon: <Zap className="text-amber-400" size={16} />
    });
  };

  const bookmarkedLessons = lessons.filter(l => user?.bookmarkedLessonIds?.includes(l.id));

  // Stable deterministic hash so the radar doesn't flicker on re-render
  const hashSkillToScore = (skill: string) => {
    let hash = 0;
    for (let i = 0; i < skill.length; i++) {
      hash = (hash * 31 + skill.charCodeAt(i)) & 0xffff;
    }
    return 50 + (hash % 50); // range 50–99
  };

  const skillData = (user?.skills || ['React', 'TypeScript', 'Node.js', 'Firebase', 'Tailwind']).map(skill => ({
    subject: skill,
    A: hashSkillToScore(skill),
    fullMark: 100,
  }));

  const upcomingDeadlines = assignments
    .filter(a => !submissions.some(s => s.assignmentId === a.id))
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 4)
    .map(a => {
      const isOverdue = a.dueDate < Date.now();
      const isDueSoon = a.dueDate < Date.now() + 1000 * 60 * 60 * 24 * 3; // 3 days
      return {
        title: a.title,
        due: isOverdue ? 'Overdue' : new Date(a.dueDate).toLocaleDateString(),
        type: "Assignment",
        priority: isOverdue ? "High" : isDueSoon ? "Medium" : "Low"
      };
    });

  const recommendedSteps = [];
  if (firstIncompleteLesson) {
    recommendedSteps.push({ title: `Complete '${firstIncompleteLesson.title}'`, icon: Play, duration: "15m" });
    if (firstIncompleteLesson.quizId) {
      recommendedSteps.push({ title: `Take '${firstIncompleteLesson.title}' Quiz`, icon: FileCheck, duration: "10m" });
    }
    if (firstIncompleteLesson.assignmentId) {
      recommendedSteps.push({ title: `Submit '${firstIncompleteLesson.title}' Assignment`, icon: FileCheck, duration: "30m" });
    }
  }
  if (recommendedSteps.length === 0) {
    recommendedSteps.push({ title: "Review completed lessons", icon: BookOpen, duration: "10m" });
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-black shadow-lg shadow-emerald-500/20">
              <span className="text-3xl font-black">{currentLevel}</span>
            </div>
            <div className="absolute -bottom-2 -right-2 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md text-[10px] font-bold text-emerald-400 uppercase tracking-widest shadow-xl">
              Level
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Welcome back, {user?.displayName?.split(' ')[0] || 'Student'}!
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex-1 min-w-[200px]">
                <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                  <span>XP Progress</span>
                  <span>{xpInCurrentLevel} / 1000 XP</span>
                </div>
                <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${levelProgress}%` }}
                    className="h-full bg-emerald-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 font-bold text-sm">
                <Zap size={14} fill="currentColor" />
                {currentXP} XP
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 px-4 py-2 rounded-2xl group cursor-pointer hover:border-emerald-500/50 transition-all" onClick={handleClaimReward}>
          <Trophy className="text-amber-400 group-hover:scale-110 transition-transform" size={20} />
          <div className="text-xs">
            <p className="text-zinc-500 font-bold uppercase tracking-widest">Current Streak</p>
            <p className="text-white font-bold">{user?.streak || 1} {(user?.streak || 1) === 1 ? 'Day' : 'Days'} 🔥</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Stats Grid */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 p-6 rounded-2xl hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-xl bg-zinc-950/40 backdrop-blur-sm border border-zinc-800`}>
                  <stat.icon className={stat.color} size={20} />
                </div>
                <span className="text-2xl font-bold text-white">{stat.value}</span>
              </div>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Daily Goal Card */}
        <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 p-6 rounded-2xl flex items-center gap-4 relative overflow-hidden group">
          <div className="relative w-16 h-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart 
                innerRadius="80%" 
                outerRadius="100%" 
                data={dailyGoalData} 
                startAngle={90} 
                endAngle={450}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={10} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <Target size={14} className="text-emerald-500" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Daily Goal</p>
            <p className="text-lg font-bold text-white">65% <span className="text-[10px] text-zinc-500 font-normal">Done</span></p>
            <p className="text-[10px] text-emerald-500 font-medium mt-0.5">+15% from yesterday</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Progress Section */}
        <div className="lg:col-span-2 space-y-8">
          {/* Current Lesson Hero */}
          <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl overflow-hidden group cursor-pointer shadow-2xl shadow-black/50 hover:border-emerald-500/30 transition-colors">
            <div className="relative aspect-video">
              <img 
                src={currentLesson.thumbnail} 
                alt="Lesson Thumbnail" 
                className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-black shadow-xl shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                  <Play size={32} fill="currentColor" />
                </div>
              </div>
              <div className="absolute top-6 right-6 z-10">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (firstIncompleteLesson) {
                      toggleBookmark(firstIncompleteLesson.id);
                    }
                  }}
                  className={cn(
                    "p-3 rounded-2xl backdrop-blur-md border transition-all",
                    firstIncompleteLesson && user?.bookmarkedLessonIds?.includes(firstIncompleteLesson.id)
                      ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                      : "bg-black/40 border-white/10 text-white/60 hover:text-white hover:border-white/20"
                  )}
                >
                  {firstIncompleteLesson && user?.bookmarkedLessonIds?.includes(firstIncompleteLesson.id) 
                    ? <BookmarkCheck size={20} fill="currentColor" /> 
                    : <Bookmark size={20} />}
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 to-transparent">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-md border border-emerald-500/30">Continue Learning</span>
                  <p className="text-zinc-400 text-xs font-medium">{currentLesson.module}</p>
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">{currentLesson.title}</h2>
              </div>
            </div>
            <div className="p-6 bg-zinc-950/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500" />
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Module Progress</span>
                </div>
                <span className="text-sm font-bold text-white">{currentLesson.progress}%</span>
              </div>
              <div className="h-2 bg-zinc-900/40 backdrop-blur-sm rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${currentLesson.progress}%` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" 
                />
              </div>
            </div>
          </div>

          {/* Module Completion Chart */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <LayersIcon className="text-emerald-500" size={20} />
                Curriculum Mastery
              </h3>
              <div className="flex items-center gap-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Completed
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-zinc-800" />
                  Remaining
                </div>
              </div>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleProgress} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#71717a', fontSize: 12, fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ 
                      backgroundColor: '#09090b', 
                      borderColor: '#27272a', 
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#fff'
                    }}
                  />
                  <Bar dataKey="completion" radius={[6, 6, 6, 6]} barSize={40}>
                    {moduleProgress.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.completion === 100 ? '#10b981' : '#3f3f46'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quiz Scores Chart */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Trophy className="text-emerald-500" size={20} />
                Quiz Performance
              </h3>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Across Lessons</span>
            </div>
            <QuizScoresChart data={quizAttempts} />
          </div>

          {/* Earned Badges */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Shield className="text-emerald-500" size={20} />
                Achievements
              </h3>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{userBadges.length} Earned</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {userBadges.length > 0 ? userBadges.map((ub) => {
                const badge = allBadges.find(b => b.id === ub.badgeId);
                return (
                  <div key={ub.id} className="flex flex-col items-center text-center p-4 bg-zinc-950/40 border border-zinc-800 rounded-2xl group hover:border-emerald-500/30 transition-all">
                    <div className="w-12 h-12 mb-3 relative">
                      <img src={badge?.imageUrl || 'https://cdn-icons-png.flaticon.com/512/190/190411.png'} alt={badge?.title} className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                    </div>
                    <p className="text-[10px] font-bold text-white uppercase tracking-tight">{badge?.title || 'Achievement'}</p>
                    <p className="text-[8px] text-zinc-500 mt-1">{new Date(ub.earnedAt).toLocaleDateString()}</p>
                  </div>
                );
              }) : (
                <div className="col-span-full py-8 text-center border-2 border-dashed border-zinc-800 rounded-2xl">
                  <p className="text-xs text-zinc-500 italic">Complete your first module to earn a badge!</p>
                </div>
              )}
            </div>
          </div>

          {/* Skill Radar */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Target className="text-emerald-500" size={20} />
                Skill Mastery
              </h3>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Current Proficiency</span>
            </div>
            <div className="h-[300px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={skillData}>
                  <PolarGrid stroke="#27272a" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10, fontWeight: 600 }} />
                  <Radar
                    name="Mastery"
                    dataKey="A"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Ask Buddy */}
          <BuddyQuickAsk />

          {/* Recent Feedback */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Quote className="text-emerald-500" size={20} />
                Recent Feedback
              </h3>
              <button className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-white transition-colors">View All</button>
            </div>
            <div className="space-y-4">
              {recentFeedback.length > 0 ? recentFeedback.map((feedback) => (
                <div key={feedback.id} className="p-4 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl group hover:border-zinc-700 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={feedback.avatar} alt={feedback.mentor} className="w-8 h-8 rounded-full border border-zinc-800" referrerPolicy="no-referrer" />
                    <div>
                      <p className="text-xs font-bold text-white">{feedback.mentor}</p>
                      <p className="text-[10px] text-zinc-500">{feedback.date}</p>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed italic">"{feedback.text}"</p>
                </div>
              )) : (
                <div className="p-4 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl text-center">
                  <p className="text-xs text-zinc-500 italic">No recent feedback available.</p>
                </div>
              )}
            </div>
          </div>

          {/* Bookmarked Lessons */}
          {bookmarkedLessons.length > 0 && (
            <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  <Bookmark className="text-emerald-500" size={20} />
                  Bookmarked Lessons
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookmarkedLessons.map((lesson) => (
                  <div 
                    key={lesson.id}
                    className="p-4 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl group hover:border-emerald-500/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center font-bold">
                          {lesson.order}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{lesson.title}</h4>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Module {lesson.moduleId.replace('m', '')}</p>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(lesson.id);
                        }}
                        className="text-emerald-500 hover:text-emerald-400 transition-colors"
                      >
                        <BookmarkCheck size={18} fill="currentColor" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Activity className="text-emerald-500" size={20} />
                Recent Activity
              </h3>
            </div>
            <div className="space-y-6">
              {recentActivity.length > 0 ? recentActivity.map((activity, i) => (
                <div key={activity.id} className="flex gap-4 relative">
                  {i !== recentActivity.length - 1 && (
                    <div className="absolute left-4 top-10 bottom-[-24px] w-[1px] bg-zinc-800" />
                  )}
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 relative z-10">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      Completed <span className="text-white font-bold">"{activity.lessonTitle}"</span>
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest font-bold">
                      {new Date(activity.updatedAt).toLocaleDateString()} • {new Date(activity.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8">
                  <p className="text-xs text-zinc-500 italic">No recent activity yet. Start a lesson to see your progress here!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Section */}
        <div className="space-y-8">
          {/* Study Group */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users size={16} className="text-emerald-500" />
                Study Group
              </h3>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                <Circle size={8} fill="currentColor" className="animate-pulse" />
                {students.filter(s => s.cohortId === user?.cohortId && s.uid !== user?.uid).length} Active
              </span>
            </div>
            <div className="flex -space-x-3 mb-6">
              {students.filter(s => s.cohortId === user?.cohortId && s.uid !== user?.uid).slice(0, 5).map((student, i) => (
                <div key={student.uid} className="relative group">
                  <img 
                    src={student.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.uid}`} 
                    className="w-10 h-10 rounded-full border-2 border-zinc-900 bg-zinc-800" 
                    alt={student.displayName || 'Student'}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-zinc-900 rounded-full" />
                </div>
              ))}
              {students.filter(s => s.cohortId === user?.cohortId && s.uid !== user?.uid).length > 5 && (
                <div className="w-10 h-10 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                  +{students.filter(s => s.cohortId === user?.cohortId && s.uid !== user?.uid).length - 5}
                </div>
              )}
            </div>
            <button className="w-full py-3 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:border-zinc-700 transition-all flex items-center justify-center gap-2">
              <MessageSquare size={14} />
              Join Group Chat
            </button>
          </div>

          {/* Leaderboard */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Trophy size={16} className="text-amber-400" />
                Cohort Top 5
              </h3>
            </div>
            <div className="space-y-4">
              {cohortLeaderboard.map((student, i) => (
                <div key={student.uid} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "text-[10px] font-black w-4",
                      i === 0 ? "text-amber-400" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-700" : "text-zinc-600"
                    )}>
                      {i + 1}
                    </span>
                    <img 
                      src={student.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.uid}`} 
                      className="w-8 h-8 rounded-full border border-zinc-800" 
                      alt="" 
                      referrerPolicy="no-referrer"
                    />
                    <span className={cn(
                      "text-xs font-medium transition-colors",
                      student.uid === user?.uid ? "text-emerald-400 font-bold" : "text-zinc-400 group-hover:text-white"
                    )}>
                      {student.displayName.split(' ')[0]}
                      {student.uid === user?.uid && " (You)"}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-white">{student.xp} XP</p>
                    <p className="text-[8px] text-zinc-500 uppercase tracking-widest">{student.completed} Lessons</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Daily Challenge */}
          <DailyChallenge />

          {/* Overall Progress Circle */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8 flex flex-col items-center text-center">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Overall Progress</h3>
            <div className="relative w-48 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overallProgressData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={0}
                    dataKey="value"
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-white leading-none">{overallProgress}%</span>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Total Mastery</span>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-6 leading-relaxed">
              You've completed <span className="text-white font-bold">{completedCount} of {totalLessons}</span> total lessons in this course.
            </p>
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar size={18} className="text-emerald-500" />
                Deadlines
              </h3>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Next 7 Days</span>
            </div>
            <div className="space-y-4">
              {upcomingDeadlines.map((task) => (
                <div key={task.title} className="group cursor-pointer">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="text-sm font-bold text-zinc-200 group-hover:text-emerald-400 transition-colors">{task.title}</h4>
                    <span className={`text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded border ${
                      task.priority === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      task.priority === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-zinc-500 font-medium">
                      Due {task.due} • {task.type}
                    </p>
                    <ArrowRight size={12} className="text-zinc-700 group-hover:text-emerald-400 transition-colors" />
                  </div>
                  <div className="mt-3 h-[1px] bg-zinc-800 group-last:hidden" />
                </div>
              ))}
            </div>
            <button className="mt-8 w-full py-3 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 text-zinc-400 rounded-2xl text-xs font-bold hover:bg-zinc-900/40 backdrop-blur-sm hover:text-white transition-all">
              View All Tasks
            </button>
          </div>

          {/* Recommended Next Steps */}
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -mr-16 -mt-16" />
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Sparkles size={18} className="text-emerald-500" />
              Next Steps
            </h3>
            <div className="space-y-4">
              {recommendedSteps.map((step, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl hover:border-emerald-500/30 transition-all cursor-pointer group relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="p-2 rounded-lg bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                      <step.icon size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{step.title}</p>
                      <p className="text-[10px] text-zinc-500 font-medium">{step.duration} • Recommended</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative z-10">
                    <span className="text-[10px] font-bold text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">Start Now</span>
                    <ArrowRight size={14} className="text-zinc-700 group-hover:text-emerald-500 transition-all group-hover:translate-x-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mentor Support */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <MessageSquare size={18} className="text-emerald-500" />
              Mentor Support
            </h3>
            <div className="space-y-4">
              {mentors.map(mentor => (
                <div key={mentor.uid} className="flex flex-col gap-3 p-4 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={mentor.photoURL} alt="" className="w-10 h-10 rounded-full border border-zinc-800" />
                      <div>
                        <p className="text-sm font-bold text-white">{mentor.displayName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            mentor.availability?.status === 'online' ? "bg-emerald-500" :
                            mentor.availability?.status === 'away' ? "bg-amber-500" : "bg-zinc-700"
                          )} />
                          <span className="text-[10px] text-zinc-500 font-medium uppercase">
                            {mentor.availability?.status || 'offline'}
                          </span>
                          {mentor.availability && (
                            <span className="text-[10px] text-zinc-600 font-medium ml-2">
                              {mentor.availability.startTime} - {mentor.availability.endTime} {mentor.availability.timezone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => onOpenChat(mentor)}
                      className="p-2 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 transition-colors"
                    >
                      <MessageSquare size={16} />
                    </button>
                  </div>
                  {(mentor.githubUrl || mentor.linkedinUrl || mentor.websiteUrl) && (
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/50">
                      {mentor.githubUrl && (
                        <a href={mentor.githubUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                          <Github size={14} />
                        </a>
                      )}
                      {mentor.linkedinUrl && (
                        <a href={mentor.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-[#0A66C2] transition-colors">
                          <Linkedin size={14} />
                        </a>
                      )}
                      {mentor.websiteUrl && (
                        <a href={mentor.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors">
                          <Globe size={14} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MentorDashboard({ 
  students, 
  onOpenChat,
  cohorts = [],
  lessons = []
}: { 
  students: PublicProfile[], 
  onOpenChat: (user: PublicProfile) => void,
  cohorts?: Cohort[],
  lessons?: Lesson[]
}) {
  const { user } = useAuth();
  const [submissions, setSubmissions] = React.useState<any[]>([]);

  React.useEffect(() => {
    const q = query(collection(db, 'submissions'), orderBy('submittedAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setSubmissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const activeCohorts = cohorts.filter(c => c.mentorIds.includes(user?.uid || '')).map(c => {
    const cohortStudents = students.filter(s => s.cohortId === c.id);
    const totalLessons = lessons.length || 1;
    const totalCompleted = cohortStudents.reduce((acc, s) => acc + (s.completedCount || 0), 0);
    const progress = cohortStudents.length > 0 ? Math.round((totalCompleted / (cohortStudents.length * totalLessons)) * 100) : 0;
    return {
      id: c.id,
      name: c.name,
      students: cohortStudents.length,
      progress
    };
  });

  const mentorCohortIds = activeCohorts.map(c => c.id);
  const mentorStudents = students.filter(s => s.cohortId && mentorCohortIds.includes(s.cohortId));
  const mentorStudentIds = mentorStudents.map(s => s.uid);

  const mentorSubmissions = submissions.filter(s => mentorStudentIds.includes(s.studentId));
  const gradedSubmissions = mentorSubmissions.filter(s => s.status === 'graded' && s.grade !== undefined);
  const avgGrade = gradedSubmissions.length > 0 
    ? Math.round(gradedSubmissions.reduce((acc, s) => acc + s.grade, 0) / gradedSubmissions.length)
    : 0;

  const stats = [
    { label: 'Total Students', value: mentorStudents.length.toString(), icon: Users, color: 'text-emerald-400' },
    { label: 'Pending Reviews', value: mentorSubmissions.filter(s => s.status === 'pending').length.toString(), icon: FileCheck, color: 'text-amber-400' },
    { label: 'Avg. Grade', value: `${avgGrade}%`, icon: Trophy, color: 'text-blue-400' },
  ];

  const studentActivity = [
    { name: 'Mon', active: 18 },
    { name: 'Tue', active: 22 },
    { name: 'Wed', active: 15 },
    { name: 'Thu', active: 20 },
    { name: 'Fri', active: 24 },
    { name: 'Sat', active: 12 },
    { name: 'Sun', active: 10 },
  ];

  const recentSubmissionsList = mentorSubmissions.slice(0, 5).length > 0 ? mentorSubmissions.slice(0, 5).map(sub => ({
    student: students.find(s => s.uid === sub.studentId)?.displayName || 'Unknown Student',
    assignment: sub.assignmentTitle || 'Assignment',
    time: sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : 'Just now'
  })) : [
    { student: 'No submissions yet', assignment: '-', time: '-' }
  ];

  const totalLessons = lessons.length || 1;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Mentor Dashboard
        </h1>
        <p className="text-zinc-500 mt-1">Managing <span className="text-emerald-500 font-bold">{activeCohorts.map(c => c.name).join(', ') || 'No cohorts assigned'}</span></p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 p-6 rounded-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-xl bg-zinc-950/40 backdrop-blur-sm border border-zinc-800">
                <stat.icon className={stat.color} size={20} />
              </div>
              <span className="text-2xl font-bold text-white">{stat.value}</span>
            </div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
            <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
              <Activity className="text-emerald-500" size={20} />
              Student Engagement (Weekly)
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={studentActivity}>
                  <defs>
                    <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#71717a', fontSize: 12 }}
                  />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="active" 
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#colorActive)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Your Students */}
          <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
            <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
              <Users className="text-emerald-500" size={20} />
              Your Students
            </h3>
            <div className="space-y-4">
              {mentorStudents.map(student => (
                <div key={student.uid} className="flex flex-col gap-3 p-4 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl group hover:border-emerald-500/30 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <img src={student.photoURL} alt="" className="w-12 h-12 rounded-full border border-zinc-800" />
                      <div>
                        <p className="text-sm font-bold text-white">{student.displayName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500" 
                              style={{ width: `${Math.round(((student.completedCount || 0) / totalLessons) * 100)}%` }} 
                            />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-bold">{Math.round(((student.completedCount || 0) / totalLessons) * 100)}%</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => onOpenChat(student)}
                      className="p-3 bg-zinc-900/40 backdrop-blur-sm text-zinc-400 rounded-xl hover:bg-emerald-500 hover:text-black transition-all"
                    >
                      <MessageSquare size={18} />
                    </button>
                  </div>
                  {(student.githubUrl || student.linkedinUrl || student.websiteUrl) && (
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/50">
                      {student.githubUrl && (
                        <a href={student.githubUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                          <Github size={14} />
                        </a>
                      )}
                      {student.linkedinUrl && (
                        <a href={student.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-[#0A66C2] transition-colors">
                          <Linkedin size={14} />
                        </a>
                      )}
                      {student.websiteUrl && (
                        <a href={student.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400 transition-colors">
                          <Globe size={14} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            Recent Submissions
          </h3>
          <div className="space-y-6">
            {recentSubmissionsList.map((sub, i) => (
              <div key={i} className="group cursor-pointer">
                <p className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{sub.student}</p>
                <p className="text-xs text-zinc-500 mt-1">{sub.assignment}</p>
                <p className="text-[10px] text-zinc-400 mt-2 font-mono uppercase tracking-widest">{sub.time}</p>
                <div className="mt-4 h-[1px] bg-zinc-800 group-last:hidden" />
              </div>
            ))}
          </div>
          <button className="mt-8 w-full py-3 bg-emerald-500 text-black rounded-2xl text-xs font-bold hover:bg-emerald-400 transition-all">
            Go to Review Panel
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [counts, setCounts] = React.useState({ users: 0, cohorts: 0, courses: 0 });

  React.useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => setCounts(prev => ({ ...prev, users: snap.size })), (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    const unsubCohorts = onSnapshot(collection(db, 'cohorts'), (snap) => setCounts(prev => ({ ...prev, cohorts: snap.size })), (err) => handleFirestoreError(err, OperationType.LIST, 'cohorts'));
    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => setCounts(prev => ({ ...prev, courses: snap.size })), (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));
    
    return () => {
      unsubUsers();
      unsubCohorts();
      unsubCourses();
    };
  }, []);

  const stats = [
    { label: 'Total Users', value: counts.users.toString(), icon: Users, color: 'text-emerald-400' },
    { label: 'Active Cohorts', value: counts.cohorts.toString(), icon: GraduationCap, color: 'text-amber-400' },
    { label: 'Total Courses', value: counts.courses.toString(), icon: BookOpen, color: 'text-blue-400' },
  ];

  const platformGrowth = [
    { name: 'Jan', users: 400 },
    { name: 'Feb', users: 600 },
    { name: 'Mar', users: 800 },
    { name: 'Apr', users: 1000 },
    { name: 'May', users: 1240 },
  ];

  const systemLogs = [
    { event: 'New Course Published', time: '10m ago', status: 'success' },
    { event: 'Database Backup', time: '45m ago', status: 'success' },
    { event: 'Failed Login Attempt', time: '2h ago', status: 'warning' },
    { event: 'System Update', time: '5h ago', status: 'success' },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            System Overview
          </h1>
          <p className="text-zinc-500 mt-1 flex items-center gap-2">
            <Shield size={14} className="text-emerald-500" />
            Platform Administrator
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">System Healthy</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 p-6 rounded-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 rounded-xl bg-zinc-950/40 backdrop-blur-sm border border-zinc-800">
                <stat.icon className={stat.color} size={20} />
              </div>
              <span className="text-2xl font-bold text-white">{stat.value}</span>
            </div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
          <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
            <TrendingUp className="text-emerald-500" size={20} />
            User Growth
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={platformGrowth}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#71717a', fontSize: 12 }}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="users" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ fill: '#10b981', r: 4 }} 
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Activity size={18} className="text-emerald-500" />
              Recent System Logs
            </h3>
            <div className="bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl overflow-hidden">
              {systemLogs.map((log, i) => (
                <div key={i} className="flex items-center justify-between p-4 border-b border-zinc-800 last:border-0 hover:bg-zinc-900/30 backdrop-blur-sm transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="text-sm font-medium text-zinc-300">{log.event}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{log.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Layout size={18} className="text-blue-500" />
            Quick Management
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Create New Course', icon: BookOpen },
              { label: 'Manage Cohorts', icon: GraduationCap },
              { label: 'User Permissions', icon: Shield },
              { label: 'System Logs', icon: Activity },
            ].map((action, i) => (
              <button 
                key={i}
                className="w-full flex items-center justify-between p-4 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl hover:bg-zinc-900/40 backdrop-blur-sm hover:border-zinc-700 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <action.icon size={16} className="text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{action.label}</span>
                </div>
                <ArrowRight size={14} className="text-zinc-700 group-hover:text-emerald-400 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper icons for the chart
function Layers({ className, size }: { className?: string, size?: number }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 24} 
      height={size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
      <path d="m2.6 12.08 8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83l-8.58 3.91a2 2 0 0 0-1.66 0L2.6 10.25a1 1 0 0 0 0 1.83Z"/>
      <path d="m2.6 16.08 8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83l-8.58 3.91a2 2 0 0 0-1.66 0L2.6 14.25a1 1 0 0 0 0 1.83Z"/>
    </svg>
  );
}
