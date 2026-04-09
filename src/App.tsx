import React, { useState, useEffect, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import GlobalSearch from './components/GlobalSearch';
import Notifications from './components/Notifications';
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
const LessonView = React.lazy(() => import('./components/LessonView'));
const ReviewTab = React.lazy(() => import('./components/ReviewTab'));
const CohortView = React.lazy(() => import('./components/CohortView'));
const AssignmentIDE = React.lazy(() => import('./components/AssignmentIDE'));
const Announcements = React.lazy(() => import('./components/Announcements'));
const Forum = React.lazy(() => import('./components/Forum'));
const DirectMessages = React.lazy(() => import('./components/DirectMessages'));
const MentorshipBooking = React.lazy(() => import('./components/MentorshipBooking'));
const PeerReviewSystem = React.lazy(() => import('./components/PeerReviewSystem'));
const ProgressTracking = React.lazy(() => import('./components/ProgressTracking'));
const StudentPortfolio = React.lazy(() => import('./components/StudentPortfolio'));
const JobBoard = React.lazy(() => import('./components/JobBoard'));
const Achievements = React.lazy(() => import('./components/Achievements'));
const ProfilePage = React.lazy(() => import('./components/ProfilePage'));
const KnowledgeBase = React.lazy(() => import('./components/KnowledgeBase'));
const ArticleDetail = React.lazy(() => import('./components/ArticleDetail'));
const ResourceLibrary = React.lazy(() => import('./components/ResourceLibrary'));
const Chat = React.lazy(() => import('./components/Chat'));
const MockInterview = React.lazy(() => import('./components/MockInterview'));
const ResumeBuilder = React.lazy(() => import('./components/ResumeBuilder'));
import MatrixBackground from './components/MatrixBackground';
import ThemeSwitcher from './components/ThemeSwitcher';
import Logo from './components/Logo';
import BuddyLive from './components/BuddyLive';
import { useAuth } from './hooks/useAuth';
import { UserRole, Lesson, Cohort, AppUser, Course, Module, Article, PublicProfile } from './types';
import { ShieldCheck, Loader2, BookOpen, ChevronRight, MessageSquare, Bookmark, BookmarkCheck, Bell } from 'lucide-react';
import { populateVectorStore } from './services/gemini';
import { Toaster } from 'sonner';
import { db } from './firebase';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestoreError';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  const { user, loading, login, logout, switchRoleForDemo, updateProfile, toggleBookmark } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState('c1');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [activeChat, setActiveChat] = useState<PublicProfile | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [publicPortfolioId, setPublicPortfolioId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [users, setUsers] = useState<PublicProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ... (rest of the component)

  useEffect(() => {
    // Check for public portfolio URL
    const path = window.location.pathname;
    if (path.startsWith('/portfolio/')) {
      const id = path.split('/')[2];
      if (id) {
        setPublicPortfolioId(id);
        setActiveTab('portfolio');
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    let coursesLoaded = false;
    let modulesLoaded = false;
    let lessonsLoaded = false;
    let cohortsLoaded = false;
    let usersLoaded = false;

    const checkAllLoaded = () => {
      if (coursesLoaded && modulesLoaded && lessonsLoaded && cohortsLoaded && usersLoaded) {
        setDataLoading(false);
      }
    };

    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
      coursesLoaded = true; checkAllLoaded();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));

    const unsubModules = onSnapshot(collection(db, 'modules'), (snap) => {
      setModules(snap.docs.map(d => ({ id: d.id, ...d.data() } as Module)));
      modulesLoaded = true; checkAllLoaded();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'modules'));

    const unsubLessons = onSnapshot(collection(db, 'lessons'), (snap) => {
      setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson)));
      lessonsLoaded = true; checkAllLoaded();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'lessons'));

    const unsubCohorts = onSnapshot(collection(db, 'cohorts'), (snap) => {
      setCohorts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cohort)));
      cohortsLoaded = true; checkAllLoaded();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cohorts'));

    const unsubUsers = onSnapshot(collection(db, 'users_public'), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as PublicProfile)));
      usersLoaded = true; checkAllLoaded();
    }, (err) => {
      console.warn("Permission denied for listing public users. This is normal for non-admins if visibility is restricted.", err);
      // Fallback: at least the current user should be in the list (as a public profile)
      const publicUser: PublicProfile = {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.role,
        cohortId: user.cohortId,
        bio: user.bio,
        githubUrl: user.githubUrl,
        linkedinUrl: user.linkedinUrl,
        websiteUrl: user.websiteUrl,
        skills: user.skills,
        location: user.location,
        visibility: user.visibility || 'public',
        xp: user.xp || 0,
        level: user.level || 1,
        completedCount: user.completedLessonIds?.length || 0,
        createdAt: user.createdAt,
        availability: user.availability
      };
      setUsers(prev => prev.length === 0 ? [publicUser] : prev);
      usersLoaded = true; checkAllLoaded();
    });

    return () => {
      unsubCourses();
      unsubModules();
      unsubLessons();
      unsubCohorts();
      unsubUsers();
    };
  }, [user]);

  const currentCourse = courses.find(c => c.id === selectedCourseId) || courses[0] || { id: 'empty', title: 'No Courses', description: 'No courses available.', thumbnail: '', videoUrl: '', content: '', createdAt: Date.now() };
  const currentModules = modules.filter(m => m.courseId === currentCourse.id);
  const currentLessons = lessons.filter(l => l.courseId === currentCourse.id);

  useEffect(() => {
    if (lessons.length > 0) {
      populateVectorStore(lessons.map(l => ({ id: l.id, title: l.title, content: l.content })));
    }
  }, [lessons]);

  if (loading || (user && dataLoading)) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={48} />
      </div>
    );
  }

  if (publicPortfolioId) {
    return (
      <div className="flex bg-black min-h-screen text-zinc-200 font-sans selection:bg-emerald-500/30 overflow-hidden">
        <MatrixBackground />
        <div className="flex-1 overflow-y-auto relative z-10 w-full h-full">
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center">
              <Loader2 className="animate-spin text-emerald-500" size={48} />
            </div>
          }>
            <div className="p-4 md:p-8">
              <StudentPortfolio 
                userId={publicPortfolioId} 
                onBack={() => { window.location.href = '/'; }} 
              />
            </div>
          </Suspense>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center text-white relative overflow-hidden">
        <MatrixBackground />
        <div className="z-10 bg-zinc-950/80 backdrop-blur-md p-8 rounded-3xl border border-zinc-800 flex flex-col items-center max-w-md w-full mx-4">
          <div className="mb-6">
            <Logo size={64} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Tech4Dummies</h1>
          <p className="text-zinc-400 text-center mb-8">Sign in to access the campus and continue your learning journey.</p>
          <button 
            onClick={login}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-4 rounded-xl transition-all hover-glow mb-4"
          >
            Sign In with Google
          </button>
          
          <div className="text-center space-y-2">
            <p className="text-xs text-zinc-500">
              Having trouble logging in? 
            </p>
            <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="text-xs text-emerald-500 hover:underline font-medium"
            >
              Open in a New Tab
            </button>
            <p className="text-[10px] text-zinc-600 max-w-[200px] mx-auto">
              Iframes can sometimes block authentication requests. Opening in a new tab usually fixes this.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (selectedLesson) {
      return <LessonView lesson={selectedLesson} onBack={() => setSelectedLesson(null)} />;
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            course={currentCourse} 
            lessons={currentLessons} 
            modules={currentModules} 
            onOpenChat={setActiveChat}
            mentors={users.filter(u => u.role === 'mentor')}
            students={users.filter(u => u.role === 'student')}
            cohorts={cohorts}
          />
        );
      case 'lessons':
        if (user.role === 'admin') {
          return <AdminPanel />;
        }
        if (user.role === 'mentor') {
          return <ReviewTab />;
        }
        return (
          <div className="p-8 max-w-4xl mx-auto space-y-8">
            <header className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Your Curriculum</h1>
                <p className="text-zinc-500 mt-1">Pick up where you left off in <span className="text-emerald-500 font-bold">{currentCourse.title}</span>.</p>
              </div>
              <div className="flex gap-2">
                {courses.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCourseId(c.id)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      selectedCourseId === c.id 
                        ? "bg-emerald-500 text-black" 
                        : "bg-zinc-900/40 text-zinc-500 hover:text-white border border-zinc-800"
                    )}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </header>
            <div className="space-y-4">
              {currentLessons.map((lesson) => {
                const isBookmarked = user.bookmarkedLessonIds?.includes(lesson.id);
                return (
                  <div 
                    key={lesson.id}
                    onClick={() => setSelectedLesson(lesson)}
                    className="flex items-center justify-between p-6 bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl hover:border-zinc-700 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center font-bold text-lg">
                        {lesson.order}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">{lesson.title}</h3>
                        <p className="text-sm text-zinc-500">
                          {currentModules.find(m => m.id === lesson.moduleId)?.title || 'Module'} • 15 mins
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(lesson.id);
                        }}
                        className={cn(
                          "p-2 rounded-xl transition-all",
                          isBookmarked ? "text-emerald-500" : "text-zinc-700 hover:text-zinc-500"
                        )}
                      >
                        {isBookmarked ? <BookmarkCheck size={20} fill="currentColor" /> : <Bookmark size={20} />}
                      </button>
                      <ChevronRight size={24} className="text-zinc-700 group-hover:text-emerald-400 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case 'review':
        if (user.role === 'student') {
          return (
            <div className="p-8 flex items-center justify-center h-full text-red-500">
              <div className="text-center">
                <ShieldCheck size={48} className="mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p>Only mentors and admins can access this panel.</p>
              </div>
            </div>
          );
        }
        return <ReviewTab />;
      case 'cohort':
        const userCohort = cohorts.find(c => c.id === user.cohortId) || cohorts[0];
        if (!userCohort) return <div className="p-8 text-white">No cohort assigned or available.</div>;
        const cohortMentors = users.filter(u => userCohort.mentorIds?.includes(u.uid));
        const cohortStudents = users.filter(u => u.cohortId === userCohort.id && u.role === 'student');
        return <CohortView cohort={userCohort} mentors={cohortMentors} students={cohortStudents} />;
      case 'knowledge':
        return selectedArticle ? (
          <ArticleDetail 
            article={selectedArticle} 
            onBack={() => setSelectedArticle(null)} 
          />
        ) : (
          <KnowledgeBase onSelectArticle={setSelectedArticle} />
        );
      case 'resources':
        return <ResourceLibrary />;
      case 'assignments':
        return <AssignmentIDE assignmentId="a1" />;
      case 'announcements':
        return <Announcements userRole={user.role} />;
      case 'forum':
        return <Forum />;
      case 'messages':
        return <DirectMessages />;
      case 'mentorship':
        return <MentorshipBooking />;
      case 'peer-review':
        return <PeerReviewSystem />;
      case 'achievements':
        return <Achievements />;
      case 'mock-interview':
        return <MockInterview />;
      case 'resume-builder':
        return <ResumeBuilder />;
      case 'progress':
        return <ProgressTracking />;
      case 'portfolio':
        return <StudentPortfolio userId={publicPortfolioId || undefined} onBack={publicPortfolioId ? () => setPublicPortfolioId(null) : undefined} />;
      case 'job-board':
        return <JobBoard />;
      case 'profile':
        const profileCohort = cohorts.find(c => c.id === user.cohortId);
        return <ProfilePage user={user} cohort={profileCohort} onUpdateProfile={updateProfile} onViewPortfolio={() => setActiveTab('portfolio')} />;
      case 'admin':
        if (user.role !== 'admin') {
          return (
            <div className="p-8 flex items-center justify-center h-full text-red-500">
              <div className="text-center">
                <ShieldCheck size={48} className="mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p>Only administrators can access this panel.</p>
              </div>
            </div>
          );
        }
        return <AdminPanel />;
      default:
        return (
          <div className="p-8 flex items-center justify-center h-full text-zinc-500">
            <p>This module is scheduled for a future phase.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-black text-zinc-200 font-sans selection:bg-emerald-500/30">
      <MatrixBackground />
      <Sidebar 
        role={user.role} 
        activeTab={activeTab} 
        onTabChange={(tab) => { 
          setActiveTab(tab); 
          setSelectedLesson(null); 
          setSelectedArticle(null);
        }} 
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onLogout={logout}
      />
      
      <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-zinc-900/10 via-black/40 to-black/60 relative">
        {/* Top Controls */}
        <div className="absolute top-4 right-4 z-[60] flex items-center gap-4">
          {/* Role Switcher for Demo */}
          <div className="flex items-center gap-2 bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 p-2 rounded-xl shadow-2xl">
            <button
              onClick={() => setIsNotificationsOpen(true)}
              className="p-2 text-zinc-400 hover:text-emerald-400 transition-colors"
            >
              <Bell size={18} />
            </button>
            <span className="text-xs font-bold text-zinc-500 uppercase px-2">Demo Role:</span>
            {(['student', 'mentor', 'admin'] as UserRole[]).map((role) => (
              <button
                key={role}
                onClick={() => switchRoleForDemo(role)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  user.role === role 
                    ? 'bg-emerald-500 text-black' 
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </button>
            ))}
          </div>

          <ThemeSwitcher />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + (selectedLesson ? '-lesson' : '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <Suspense fallback={
              <div className="h-full flex items-center justify-center">
                <Loader2 className="animate-spin text-emerald-500" size={48} />
              </div>
            }>
              {renderContent()}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <GlobalSearch 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        data={[
          ...lessons.map(l => ({ ...l, type: 'Lesson' })),
          ...courses.map(c => ({ ...c, type: 'Course' })),
          ...users.map(u => ({ ...u, type: 'User' })),
        ]}
        onNavigate={(item) => {
          if (item.type === 'Lesson') {
            setSelectedLesson(item);
            setActiveTab('lessons');
          } else if (item.type === 'Course') {
            setSelectedCourseId(item.id);
            setActiveTab('lessons');
          } else if (item.type === 'User') {
            setActiveChat(item);
            setActiveTab('messages');
          }
        }}
      />

      <Notifications 
        isOpen={isNotificationsOpen} 
        onClose={() => setIsNotificationsOpen(false)} 
      />

      <BuddyLive hidden={!!selectedLesson} />
      <Toaster position="top-right" theme="dark" richColors />

      {activeChat && (
        <Chat 
          recipient={activeChat} 
          onClose={() => setActiveChat(null)} 
        />
      )}
    </div>
  );
}
