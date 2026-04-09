import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Book, 
  Layers, 
  FileText, 
  Sparkles,
  Save,
  X,
  Loader2,
  Eye,
  Info,
  Link,
  CheckCircle2,
  Award,
  HelpCircle
} from 'lucide-react';
import { Course, Module, Lesson, Cohort, AppUser, Assignment, Quiz, Badge, QuizQuestion, Article } from '../types';
import { generateLessonContent, generateCourseContent, generateAssignmentContent } from '../services/gemini';
import YouTubeEmbed from './YouTubeEmbed';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { toast } from 'sonner';

const getYouTubeId = (url: string) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : url;
};

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'curriculum' | 'cohorts' | 'users' | 'assignments' | 'quizzes' | 'badges' | 'articles'>('curriculum');
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<{ type: 'course' | 'module' | 'lesson' | 'cohort' | 'cohort_students' | 'assignment' | 'quiz' | 'badge' | 'article', id?: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Form states
  const [formData, setFormData] = useState<any>({});

  // Fetch data from Firestore
  React.useEffect(() => {
    const unsubCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      setCourses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
    });
    const unsubModules = onSnapshot(collection(db, 'modules'), (snap) => {
      setModules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Module)));
    });
    const unsubLessons = onSnapshot(collection(db, 'lessons'), (snap) => {
      setLessons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lesson)));
    });
    const unsubAssignments = onSnapshot(collection(db, 'assignments'), (snap) => {
      setAssignments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
    });
    const unsubCohorts = onSnapshot(collection(db, 'cohorts'), (snap) => {
      setCohorts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cohort)));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser)));
    });
    const unsubQuizzes = onSnapshot(collection(db, 'quizzes'), (snap) => {
      setQuizzes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz)));
    });
    const unsubBadges = onSnapshot(collection(db, 'badges'), (snap) => {
      setBadges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Badge)));
    });
    const unsubArticles = onSnapshot(collection(db, 'articles'), (snap) => {
      setArticles(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article)));
    });

    return () => {
      unsubCourses();
      unsubModules();
      unsubLessons();
      unsubAssignments();
      unsubCohorts();
      unsubUsers();
      unsubQuizzes();
      unsubBadges();
      unsubArticles();
    };
  }, []);

  const handleSave = async () => {
    if (!isEditing) return;

    const collectionName = 
      isEditing.type === 'course' ? 'courses' :
      isEditing.type === 'module' ? 'modules' :
      isEditing.type === 'lesson' ? 'lessons' :
      (isEditing.type === 'cohort' || isEditing.type === 'cohort_students') ? 'cohorts' :
      isEditing.type === 'assignment' ? 'assignments' :
      isEditing.type === 'quiz' ? 'quizzes' :
      isEditing.type === 'badge' ? 'badges' :
      isEditing.type === 'article' ? 'articles' : '';

    if (!collectionName) return;
    const id = isEditing.id || `${isEditing.type.charAt(0)}${Date.now()}`;

    try {
      const docRef = doc(db, collectionName, id);
      
      const finalData = { ...formData };
      if (isEditing.type === 'cohort' || isEditing.type === 'cohort_students') {
        delete finalData.studentIds; // Don't save studentIds array in cohort document
      }
      
      if (!isEditing.id) {
        finalData.id = id;
        finalData.createdAt = Date.now();
        if (isEditing.type === 'module') finalData.courseId = selectedCourse;
        if (isEditing.type === 'lesson') {
          finalData.courseId = selectedCourse;
          finalData.moduleId = selectedModule;
        }
      }

      await setDoc(docRef, finalData, { merge: true });
      
      // Special handling for linking assignments/quizzes to lessons
      if (isEditing.type === 'assignment' && formData.lessonId) {
        await setDoc(doc(db, 'lessons', formData.lessonId), { assignmentId: id }, { merge: true });
      }
      if (isEditing.type === 'quiz' && formData.lessonId) {
        await setDoc(doc(db, 'lessons', formData.lessonId), { quizId: id }, { merge: true });
      }
      
      // Special handling for cohort students
      if (isEditing.type === 'cohort' || isEditing.type === 'cohort_students') {
        const selectedStudentIds = formData.studentIds || [];
        // Find students who are currently in this cohort but were unselected
        const studentsToRemove = users.filter(u => u.role === 'student' && u.cohortId === id && !selectedStudentIds.includes(u.uid));
        // Find students who were selected but are not currently in this cohort
        const studentsToAdd = users.filter(u => u.role === 'student' && selectedStudentIds.includes(u.uid) && u.cohortId !== id);
        
        // Update all affected students
        await Promise.all([
          ...studentsToRemove.map(u => setDoc(doc(db, 'users', u.uid), { cohortId: null }, { merge: true })),
          ...studentsToAdd.map(u => setDoc(doc(db, 'users', u.uid), { cohortId: id }, { merge: true }))
        ]);
      }

      toast.success(`${isEditing.type.charAt(0).toUpperCase() + isEditing.type.slice(1)} saved successfully!`);
      setIsEditing(null);
      setFormData({});
    } catch (error) {
      console.error("Error saving:", error);
      handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'student' | 'mentor' | 'admin') => {
    if (newRole === 'admin') {
      const confirmed = window.confirm(`⚠️ You are about to grant ADMIN privileges to this user. This gives full control over the platform. Are you sure?`);
      if (!confirmed) return;
    }
    try {
      await setDoc(doc(db, 'users', userId), { role: newRole }, { merge: true });
      await setDoc(doc(db, 'users_public', userId), { role: newRole }, { merge: true });
      toast.success("User role updated successfully.");
    } catch (error) {
      console.error("Error updating user role:", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleCohortChange = async (userId: string, newCohortId: string) => {
    try {
      await setDoc(doc(db, 'users', userId), { cohortId: newCohortId || null }, { merge: true });
      toast.success("User cohort updated successfully.");
    } catch (error) {
      console.error("Error updating user cohort:", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;
    
    try {
      const collectionName = 
        type === 'course' ? 'courses' :
        type === 'module' ? 'modules' :
        type === 'lesson' ? 'lessons' :
        type === 'cohort' ? 'cohorts' :
        type === 'assignment' ? 'assignments' :
        type === 'quiz' ? 'quizzes' :
        type === 'badge' ? 'badges' :
        type === 'article' ? 'articles' : '';

      if (!collectionName) return;

      await deleteDoc(doc(db, collectionName, id));
      
      if (type === 'cohort') {
        const studentsInCohort = users.filter(u => u.cohortId === id);
        await Promise.all(studentsInCohort.map(u => setDoc(doc(db, 'users', u.uid), { cohortId: null }, { merge: true })));
      }

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted.`);
    } catch (error) {
      console.error("Error deleting:", error);
      handleFirestoreError(error, OperationType.DELETE, `${type}/${id}`);
    }
  };

  const handleAiGenerate = async () => {
    if (!formData.title) return toast.error("Please enter a title first.");
    setIsGenerating(true);
    try {
      if (isEditing?.type === 'assignment') {
        const courseTitle = courses.find(c => c.id === formData.courseId)?.title || 'General Tech Course';
        const description = await generateAssignmentContent(formData.title, courseTitle);
        setFormData({ ...formData, description });
      } else {
        const courseTitle = courses.find(c => c.id === selectedCourse)?.title || formData.title;
        const content = await generateLessonContent(courseTitle, formData.title);
        setFormData({ ...formData, content });
      }
    } catch (error) {
      toast.error("Failed to generate content.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiGenerateCourse = async () => {
    if (!formData.title) return toast.error("Please enter a title first.");
    setIsGenerating(true);
    try {
      const { description, content } = await generateCourseContent(formData.title);
      setFormData({ ...formData, description, content });
    } catch (error) {
      toast.error("Failed to generate course content.");
    } finally {
      setIsGenerating(false);
    }
  };

  const seedDemoData = async () => {
    if (!window.confirm("This will add sample jobs, career resources, and knowledge base articles. Continue?")) return;
    
    const mockJobs = [
      {
        title: 'Junior Frontend Developer',
        company: 'TechFlow Solutions',
        location: 'Remote',
        type: 'Full-time',
        description: 'We are looking for a Junior Frontend Developer to join our growing team. You will work with React, Tailwind CSS, and TypeScript to build modern web applications.',
        requirements: ['Proficiency in HTML, CSS, and JS', 'Experience with React', 'Good communication skills'],
        applyUrl: 'https://example.com/apply',
        category: 'Engineering',
        postedAt: Date.now()
      },
      {
        title: 'UX/UI Design Intern',
        company: 'Creative Minds Agency',
        location: 'New York, NY',
        type: 'Internship',
        description: 'Join our design team as an intern and help us create beautiful user experiences for our clients.',
        requirements: ['Portfolio of design work', 'Knowledge of Figma', 'Passion for user-centric design'],
        applyUrl: 'https://example.com/apply',
        category: 'Design',
        postedAt: Date.now() - 1000 * 60 * 60 * 24 * 2
      }
    ];

    const mockCareerResources = [
      {
        title: 'Cracking the Coding Interview',
        description: 'A comprehensive guide to preparing for technical interviews at top tech companies.',
        type: 'Article',
        url: 'https://example.com/interview-guide',
        category: 'Interview Prep',
        postedAt: Date.now()
      },
      {
        title: 'Resume Template for Developers',
        description: 'A clean and professional resume template designed specifically for software engineers.',
        type: 'Template',
        url: 'https://example.com/resume-template',
        category: 'Job Search',
        postedAt: Date.now() - 1000 * 60 * 60 * 24 * 5
      }
    ];

    const mockArticles = [
      {
        title: 'The Future of AI in Web Development',
        slug: 'future-of-ai-web-dev',
        content: '# The Future of AI in Web Development\n\nArtificial Intelligence is transforming how we build and interact with the web...',
        excerpt: 'Explore how AI is changing the landscape of web development and what it means for developers.',
        category: 'Technology',
        authorId: auth.currentUser?.uid || 'system',
        authorName: auth.currentUser?.displayName || 'Admin',
        authorPhoto: auth.currentUser?.photoURL || '',
        publishedAt: Date.now(),
        updatedAt: Date.now(),
        isPublished: true,
        tags: ['AI', 'Web Dev', 'Future']
      }
    ];

    try {
      for (const job of mockJobs) {
        const id = `j${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
        await setDoc(doc(db, 'jobs', id), { id, ...job });
      }
      for (const res of mockCareerResources) {
        const id = `cr${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
        await setDoc(doc(db, 'careerResources', id), { id, ...res });
      }
      for (const art of mockArticles) {
        const id = `art${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
        await setDoc(doc(db, 'articles', id), { id, ...art });
      }
      toast.success("Demo data seeded successfully!");
    } catch (error) {
      console.error("Error seeding data:", error);
      toast.error("Failed to seed demo data.");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-white tracking-tight">Admin Panel</h1>
            <button 
              onClick={seedDemoData}
              className="flex items-center gap-1.5 text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-1 rounded-lg hover:bg-zinc-700 hover:text-white transition-all border border-zinc-700"
            >
              <Sparkles size={12} />
              SEED DEMO DATA
            </button>
          </div>
          <div className="flex gap-4 mt-4">
            <button 
              onClick={() => setActiveTab('curriculum')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'curriculum' ? 'bg-emerald-500 text-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Curriculum
            </button>
            <button 
              onClick={() => setActiveTab('cohorts')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'cohorts' ? 'bg-emerald-500 text-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Cohorts
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'users' ? 'bg-emerald-500 text-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Users
            </button>
            <button 
              onClick={() => setActiveTab('assignments')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'assignments' ? 'bg-emerald-500 text-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Assignments
            </button>
            <button 
              onClick={() => setActiveTab('quizzes')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'quizzes' ? 'bg-emerald-500 text-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Quizzes
            </button>
            <button 
              onClick={() => setActiveTab('badges')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'badges' ? 'bg-emerald-500 text-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Badges
            </button>
            <button 
              onClick={() => setActiveTab('articles')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'articles' ? 'bg-emerald-500 text-black' : 'text-zinc-500 hover:text-white'}`}
            >
              Articles
            </button>
          </div>
        </div>
        {activeTab === 'curriculum' ? (
          <button 
            onClick={() => { setIsEditing({ type: 'course' }); setFormData({ title: '', description: '', thumbnail: '' }); }}
            className="flex items-center gap-2 bg-emerald-500 text-black px-4 py-2 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
          >
            <Plus size={20} />
            New Course
          </button>
        ) : activeTab === 'cohorts' ? (
          <button 
            onClick={() => { setIsEditing({ type: 'cohort' }); setFormData({ name: '', startDate: Date.now(), endDate: Date.now() + 1000 * 60 * 60 * 24 * 90, mentorIds: [], studentIds: [] }); }}
            className="flex items-center gap-2 bg-emerald-500 text-black px-4 py-2 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
          >
            <Plus size={20} />
            New Cohort
          </button>
        ) : activeTab === 'assignments' ? (
          <button 
            onClick={() => { setIsEditing({ type: 'assignment' }); setFormData({ title: '', description: '', dueDate: Date.now() + 1000 * 60 * 60 * 24 * 7 }); }}
            className="flex items-center gap-2 bg-emerald-500 text-black px-4 py-2 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
          >
            <Plus size={20} />
            New Assignment
          </button>
        ) : activeTab === 'quizzes' ? (
          <button 
            onClick={() => { setIsEditing({ type: 'quiz' }); setFormData({ title: '', questions: [] }); }}
            className="flex items-center gap-2 bg-emerald-500 text-black px-4 py-2 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
          >
            <Plus size={20} />
            New Quiz
          </button>
        ) : activeTab === 'articles' ? (
          <button 
            onClick={() => { setIsEditing({ type: 'article' }); setFormData({ title: '', content: '', excerpt: '', category: '', tags: [] }); }}
            className="flex items-center gap-2 bg-emerald-500 text-black px-4 py-2 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
          >
            <Plus size={20} />
            New Article
          </button>
        ) : (
          <button 
            onClick={() => { setIsEditing({ type: 'badge' }); setFormData({ title: '', description: '', imageUrl: '', criteria: '' }); }}
            className="flex items-center gap-2 bg-emerald-500 text-black px-4 py-2 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
          >
            <Plus size={20} />
            New Badge
          </button>
        )}
      </header>

      {activeTab === 'curriculum' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Courses List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Book size={18} /> Courses
          </h2>
          <button 
            onClick={() => { setIsEditing({ type: 'course' }); setFormData({ title: '', description: '', thumbnail: '' }); }}
            className="w-full py-3 border border-dashed border-zinc-700 rounded-2xl text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-all flex items-center justify-center gap-2 text-sm font-bold"
          >
            <Plus size={20} /> Add New Course
          </button>
          {courses.map(course => (
            <div 
              key={course.id}
              onClick={() => setSelectedCourse(course.id === selectedCourse ? null : course.id)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                selectedCourse === course.id ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-zinc-900/40 backdrop-blur-sm border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-white">{course.title}</h3>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); setIsEditing({ type: 'course', id: course.id }); setFormData(course); }} className="p-1 hover:text-emerald-400"><Edit2 size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete('course', course.id); }} className="p-1 hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{course.description}</p>
            </div>
          ))}
        </div>

        {/* Modules List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <Layers size={18} /> Modules
          </h2>
          {selectedCourse ? (
            <>
              <button 
                onClick={() => { setIsEditing({ type: 'module' }); setFormData({ title: '', order: modules.filter(m => m.courseId === selectedCourse).length + 1 }); }}
                className="w-full py-2 border border-dashed border-zinc-700 rounded-xl text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Plus size={16} /> Add Module
              </button>
              {modules.filter(m => m.courseId === selectedCourse).sort((a, b) => a.order - b.order).map(module => (
                <div 
                  key={module.id}
                  onClick={() => setSelectedModule(module.id === selectedModule ? null : module.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                    selectedModule === module.id ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-zinc-900/40 backdrop-blur-sm border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-emerald-500">M{module.order}</span>
                    <h3 className="font-bold text-white flex-1 ml-3">{module.title}</h3>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setIsEditing({ type: 'module', id: module.id }); setFormData(module); }} className="p-1 hover:text-emerald-400"><Edit2 size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete('module', module.id); }} className="p-1 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-3xl text-sm">
              Select a course to view modules
            </div>
          )}
        </div>

        {/* Lessons List */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <FileText size={18} /> Lessons
          </h2>
          {selectedModule ? (
            <>
              <button 
                onClick={() => { setIsEditing({ type: 'lesson' }); setFormData({ title: '', videoUrl: '', content: '', order: lessons.filter(l => l.moduleId === selectedModule).length + 1 }); }}
                className="w-full py-2 border border-dashed border-zinc-700 rounded-xl text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Plus size={16} /> Add Lesson
              </button>
              {lessons.filter(l => l.moduleId === selectedModule).sort((a, b) => a.order - b.order).map(lesson => (
                <div 
                  key={lesson.id}
                  className="p-4 bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-all group"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-zinc-500">L{lesson.order}</span>
                    <h3 className="font-bold text-white flex-1 ml-3">{lesson.title}</h3>
                    {lesson.assignmentId && (
                      <div className="mr-3 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-bold text-emerald-400 uppercase">
                        {assignments.find(a => a.id === lesson.assignmentId)?.title || 'Assignment'}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => { setIsEditing({ type: 'lesson', id: lesson.id }); setFormData(lesson); }} className="p-1 hover:text-emerald-400"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete('lesson', lesson.id)} className="p-1 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-3xl text-sm">
              Select a module to view lessons
            </div>
          )}
        </div>
      </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-4">
          <div className="flex gap-4 mb-4">
            <input 
              type="text" 
              placeholder="Search users..." 
              className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50 flex-1"
              onChange={(e) => setFormData({ ...formData, userSearch: e.target.value })}
            />
            <select 
              className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
              onChange={(e) => setFormData({ ...formData, userRoleFilter: e.target.value })}
              value={formData.userRoleFilter || ''}
            >
              <option value="">All Roles</option>
              <option value="student">Students</option>
              <option value="mentor">Mentors</option>
              <option value="admin">Admins</option>
            </select>
            <select 
              className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
              onChange={(e) => setFormData({ ...formData, userCohortFilter: e.target.value })}
              value={formData.userCohortFilter || ''}
            >
              <option value="">All Cohorts</option>
              <option value="none">No Cohort</option>
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-400">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50 border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 font-bold">User</th>
                    <th className="px-6 py-4 font-bold">Role</th>
                    <th className="px-6 py-4 font-bold">Cohort</th>
                    <th className="px-6 py-4 font-bold text-right">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter(u => !formData.userSearch || u.displayName.toLowerCase().includes(formData.userSearch.toLowerCase()) || u.email.toLowerCase().includes(formData.userSearch.toLowerCase()))
                    .filter(u => !formData.userRoleFilter || u.role === formData.userRoleFilter)
                    .filter(u => !formData.userCohortFilter || (formData.userCohortFilter === 'none' ? !u.cohortId : u.cohortId === formData.userCohortFilter))
                    .map(user => (
                    <tr key={user.uid} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                          <div>
                            <div className="font-bold text-white">{user.displayName}</div>
                            <div className="text-xs text-zinc-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.uid, e.target.value as 'student' | 'mentor' | 'admin')}
                          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value="student">Student</option>
                          <option value="mentor">Mentor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={user.cohortId || ''}
                          onChange={(e) => handleCohortChange(user.uid, e.target.value)}
                          className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">No Cohort</option>
                          {cohorts.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right text-xs">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'cohorts' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cohorts.map(cohort => (
            <div key={cohort.id} className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 space-y-4 hover:border-zinc-700 transition-all group">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-white">{cohort.name}</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    {new Date(cohort.startDate).toLocaleDateString()} - {new Date(cohort.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { 
                    setIsEditing({ type: 'cohort', id: cohort.id }); 
                    setFormData({
                      ...cohort,
                      studentIds: users.filter(u => u.role === 'student' && u.cohortId === cohort.id).map(u => u.uid)
                    }); 
                  }} className="p-2 hover:text-emerald-400 bg-zinc-800 rounded-lg transition-colors"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete('cohort', cohort.id)} className="p-2 hover:text-red-400 bg-zinc-800 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>

              <div className="space-y-3">
                {(() => {
                  const cohortStudents = users.filter(u => u.cohortId === cohort.id && u.role === 'student');
                  const totalLessons = lessons.length || 1;
                  const totalCompleted = cohortStudents.reduce((acc, s) => acc + (s.completedLessonIds?.length || 0), 0);
                  const averageProgress = cohortStudents.length > 0 ? Math.round((totalCompleted / (cohortStudents.length * totalLessons)) * 100) : 0;
                  return (
                    <div className="mb-4">
                      <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                        <span>Average Progress</span>
                        <span>{averageProgress}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${averageProgress}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Mentors</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {cohort.mentorIds.map(mid => {
                      const mentor = users.find(u => u.uid === mid);
                      return mentor ? (
                        <div key={mid} className="flex items-center gap-2 bg-zinc-800 px-2 py-1 rounded-lg border border-zinc-700">
                          <img src={mentor.photoURL} alt="" className="w-4 h-4 rounded-full" />
                          <span className="text-xs text-zinc-300">{mentor.displayName}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Students ({users.filter(u => u.cohortId === cohort.id && u.role === 'student').length})</label>
                  <div className="flex -space-x-2 mt-1 overflow-hidden">
                    {users.filter(u => u.cohortId === cohort.id && u.role === 'student').slice(0, 5).map(student => (
                      <img 
                        key={student.uid} 
                        src={student.photoURL} 
                        alt={student.displayName} 
                        title={student.displayName}
                        className="w-8 h-8 rounded-full border-2 border-zinc-900" 
                      />
                    ))}
                    {cohort.studentCount > 5 && (
                      <div className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center text-[10px] text-zinc-400 font-bold">
                        +{cohort.studentCount - 5}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/50">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Student List</label>
                    <button 
                      onClick={() => { 
                        setIsEditing({ type: 'cohort_students', id: cohort.id }); 
                        setFormData({
                          ...cohort,
                          studentIds: users.filter(u => u.role === 'student' && u.cohortId === cohort.id).map(u => u.uid)
                        }); 
                      }}
                      className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 uppercase tracking-wider"
                    >
                      Manage
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                    {users.filter(u => u.cohortId === cohort.id && u.role === 'student').map(student => (
                      <div key={student.uid} className="flex items-center gap-2 text-xs text-zinc-400">
                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        {student.displayName}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'quizzes' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quizzes.map(quiz => (
            <div key={quiz.id} className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 space-y-4 hover:border-zinc-700 transition-all group">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-white">{quiz.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1">{quiz.questions?.length || 0} Questions</p>
                  {quiz.lessonId && (
                    <span className="mt-2 inline-block px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-bold text-emerald-400 uppercase">
                      Linked to: {lessons.find(l => l.id === quiz.lessonId)?.title || 'Unknown Lesson'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setIsEditing({ type: 'quiz', id: quiz.id }); setFormData(quiz); }} className="p-2 hover:text-emerald-400 bg-zinc-800 rounded-lg transition-colors"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete('quiz', quiz.id)} className="p-2 hover:text-red-400 bg-zinc-800 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
          {quizzes.length === 0 && (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-3xl">
              <HelpCircle size={48} className="mb-4 opacity-20" />
              <p>No quizzes created yet.</p>
            </div>
          )}
        </div>
      ) : activeTab === 'badges' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {badges.map(badge => (
            <div key={badge.id} className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 space-y-4 hover:border-zinc-700 transition-all group">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    {badge.imageUrl ? <img src={badge.imageUrl} alt="" className="w-8 h-8 object-contain" /> : <Award size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{badge.title}</h3>
                    <p className="text-xs text-zinc-500 mt-1">{badge.description}</p>
                  </div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setIsEditing({ type: 'badge', id: badge.id }); setFormData(badge); }} className="p-2 hover:text-emerald-400 bg-zinc-800 rounded-lg transition-colors"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete('badge', badge.id)} className="p-2 hover:text-red-400 bg-zinc-800 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
          {badges.length === 0 && (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-3xl">
              <Award size={48} className="mb-4 opacity-20" />
              <p>No badges created yet.</p>
            </div>
          )}
        </div>
      ) : activeTab === 'articles' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map(article => (
            <div key={article.id} className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 space-y-4 hover:border-zinc-700 transition-all group">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-white">{article.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1">{article.category}</p>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setIsEditing({ type: 'article', id: article.id }); setFormData(article); }} className="p-2 hover:text-emerald-400 bg-zinc-800 rounded-lg transition-colors"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete('article', article.id)} className="p-2 hover:text-red-400 bg-zinc-800 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
              <p className="text-sm text-zinc-400 line-clamp-3">{article.excerpt}</p>
            </div>
          ))}
          {articles.length === 0 && (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-3xl">
              <FileText size={48} className="mb-4 opacity-20" />
              <p>No articles created yet.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map(assignment => {
            const linkedCourse = courses.find(c => c.id === assignment.courseId);
            return (
              <div key={assignment.id} className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 space-y-4 hover:border-zinc-700 transition-all group">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white">{assignment.title}</h3>
                      {linkedCourse && (
                        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-bold text-emerald-400 uppercase">
                          {linkedCourse.title}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Due: {new Date(assignment.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setIsEditing({ type: 'assignment', id: assignment.id }); setFormData(assignment); }} className="p-2 hover:text-emerald-400 bg-zinc-800 rounded-lg transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete('assignment', assignment.id)} className="p-2 hover:text-red-400 bg-zinc-800 rounded-lg transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 line-clamp-3">{assignment.description}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 w-full rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 ${
                isEditing.type === 'lesson' || isEditing.type === 'assignment' || isEditing.type === 'course' ? 'max-w-6xl' : 'max-w-2xl'
              }`}
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30 backdrop-blur-sm">
                <div className="flex flex-col">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {isEditing.id ? 'Edit' : 'Create'} {isEditing.type.charAt(0).toUpperCase() + isEditing.type.slice(1)}
                  </h2>
                  {isEditing.type === 'assignment' && formData.courseId && (
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">
                      Course: {courses.find(c => c.id === formData.courseId)?.title}
                    </p>
                  )}
                </div>
                <button onClick={() => setIsEditing(null)} className="text-zinc-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {isEditing.type !== 'cohort' && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Title</label>
                      <input 
                        type="text" 
                        value={formData.title || ''} 
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        placeholder="Enter title..."
                      />
                    </div>
                    {(isEditing.type === 'module' || isEditing.type === 'lesson') && (
                      <div className="w-24">
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Order</label>
                        <input 
                          type="number" 
                          value={formData.order || 1} 
                          onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                          min="1"
                        />
                      </div>
                    )}
                  </div>
                )}

                {isEditing.type === 'course' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                    <div className="space-y-4">
                      <div className="flex justify-end">
                        <button 
                          onClick={handleAiGenerateCourse}
                          disabled={isGenerating || !formData.title}
                          className="flex items-center gap-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          AI GENERATE CONTENT
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Description</label>
                        <textarea 
                          value={formData.description || ''} 
                          onChange={e => setFormData({ ...formData, description: e.target.value })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50 h-24"
                          placeholder="Enter description..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Thumbnail URL</label>
                        <input 
                          type="text" 
                          value={formData.thumbnail || ''} 
                          onChange={e => setFormData({ ...formData, thumbnail: e.target.value })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Intro Video (YouTube Link)</label>
                        <input 
                          type="text" 
                          value={formData.videoUrl || ''} 
                          onChange={e => setFormData({ ...formData, videoUrl: getYouTubeId(e.target.value) })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                          placeholder="Paste YouTube link or ID..."
                        />
                        {formData.videoUrl && (
                          <p className="text-[10px] text-zinc-500 mt-1">Detected ID: {formData.videoUrl}</p>
                        )}
                      </div>
                      <div className="flex flex-col h-[300px]">
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Course Content (Markdown)</label>
                        <textarea 
                          value={formData.content || ''} 
                          onChange={e => setFormData({ ...formData, content: e.target.value })}
                          className="flex-1 w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
                          placeholder="# Welcome to the course..."
                        />
                      </div>
                    </div>

                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-1">
                        <Eye size={14} className="text-zinc-500" />
                        <label className="block text-xs font-bold text-zinc-500 uppercase">Live Preview</label>
                      </div>
                      <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-xl p-6 overflow-y-auto prose prose-invert prose-emerald max-w-none prose-sm">
                        {formData.videoUrl && (
                          <YouTubeEmbed 
                            videoId={formData.videoUrl} 
                            title="Course Intro Video" 
                            className="mb-6"
                          />
                        )}
                        <ReactMarkdown>
                          {formData.content || '*No content yet...*'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {isEditing.type === 'lesson' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">YouTube Video (Link or ID)</label>
                        <input 
                          type="text" 
                          value={formData.videoUrl || ''} 
                          onChange={e => setFormData({ ...formData, videoUrl: getYouTubeId(e.target.value) })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                          placeholder="Paste YouTube link or ID..."
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <label className="block text-xs font-bold text-zinc-500 uppercase">Linked Assignment</label>
                          <div className="group relative">
                            <Info size={12} className="text-zinc-500 cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-800 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-zinc-700">
                              Linking an assignment makes it appear at the end of this lesson for students.
                            </div>
                          </div>
                        </div>
                        <select 
                          value={formData.assignmentId || ''} 
                          onChange={e => setFormData({ ...formData, assignmentId: e.target.value })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        >
                          <option value="">None</option>
                          {assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <label className="block text-xs font-bold text-zinc-500 uppercase">Linked Quiz</label>
                        </div>
                        <select 
                          value={formData.quizId || ''} 
                          onChange={e => setFormData({ ...formData, quizId: e.target.value })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        >
                          <option value="">None</option>
                          {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col h-[300px]">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-bold text-zinc-500 uppercase">Lesson Content (Markdown)</label>
                          <button 
                            onClick={handleAiGenerate}
                            disabled={isGenerating || !formData.title}
                            className="flex items-center gap-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          >
                            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            AI GENERATE
                          </button>
                        </div>
                        <textarea 
                          value={formData.content || ''} 
                          onChange={e => setFormData({ ...formData, content: e.target.value })}
                          className="flex-1 w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
                          placeholder="# Welcome to the lesson..."
                        />
                      </div>
                    </div>

                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-1">
                        <Eye size={14} className="text-zinc-500" />
                        <label className="block text-xs font-bold text-zinc-500 uppercase">Live Preview</label>
                      </div>
                      <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-xl p-6 overflow-y-auto prose prose-invert prose-emerald max-w-none prose-sm">
                        {formData.videoUrl && (
                          <YouTubeEmbed 
                            videoId={formData.videoUrl} 
                            title="Lesson Video" 
                            className="mb-6"
                          />
                        )}
                        <ReactMarkdown>
                          {formData.content || '*No content yet...*'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {isEditing.type === 'article' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Excerpt</label>
                      <textarea 
                        value={formData.excerpt || ''} 
                        onChange={e => setFormData({ ...formData, excerpt: e.target.value })}
                        className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50 h-20"
                        placeholder="Enter excerpt..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Category</label>
                      <input 
                        type="text" 
                        value={formData.category || ''} 
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                        className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        placeholder="Enter category..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Content (Markdown)</label>
                      <textarea 
                        value={formData.content || ''} 
                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                        className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50 h-64 font-mono text-sm"
                        placeholder="# Article content..."
                      />
                    </div>
                  </div>
                )}

                {isEditing.type === 'assignment' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Linked Course</label>
                        <select 
                          value={formData.courseId || ''} 
                          onChange={e => setFormData({ ...formData, courseId: e.target.value || undefined, lessonId: undefined })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        >
                          <option value="">No Course</option>
                          {courses.map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <label className="block text-xs font-bold text-zinc-500 uppercase">Link to Lesson (Optional)</label>
                          <div className="group relative">
                            <Info size={12} className="text-zinc-500 cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-800 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-zinc-700">
                              Associating this assignment with a specific lesson helps students find it in context.
                            </div>
                          </div>
                        </div>
                        <select 
                          value={formData.lessonId || ''} 
                          onChange={e => setFormData({ ...formData, lessonId: e.target.value || undefined })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        >
                          <option value="">Select a lesson to link...</option>
                          {lessons
                            .filter(l => !formData.courseId || l.courseId === formData.courseId)
                            .map(l => (
                              <option key={l.id} value={l.id}>
                                {modules.find(m => m.id === l.moduleId)?.title} - {l.title}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Due Date</label>
                        <input 
                          type="date" 
                          value={new Date(formData.dueDate).toISOString().split('T')[0]} 
                          onChange={e => setFormData({ ...formData, dueDate: new Date(e.target.value).getTime() })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div className="flex flex-col h-[400px]">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-bold text-zinc-500 uppercase">Description (Markdown)</label>
                          <button 
                            onClick={handleAiGenerate}
                            disabled={isGenerating}
                            className="flex items-center gap-1.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          >
                            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            AI GENERATE
                          </button>
                        </div>
                        <textarea 
                          value={formData.description || ''} 
                          onChange={e => setFormData({ ...formData, description: e.target.value })}
                          className="flex-1 w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
                          placeholder="Enter assignment description..."
                        />
                      </div>

                      {/* Attachments Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-zinc-500 uppercase">Attachments</label>
                          <button 
                            onClick={() => {
                              const attachments = formData.attachments || [];
                              setFormData({ 
                                ...formData, 
                                attachments: [...attachments, { id: `att-${Date.now()}`, name: '', url: '', type: 'pdf' }] 
                              });
                            }}
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            <Plus size={12} /> ADD ATTACHMENT
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(formData.attachments || []).map((att: any, idx: number) => (
                            <div key={att.id} className="flex gap-2 items-start bg-zinc-900/30 backdrop-blur-sm p-3 rounded-xl border border-zinc-800">
                              <div className="flex-1 space-y-2">
                                <input 
                                  type="text" 
                                  placeholder="File Name (e.g. Assignment Guide.pdf)"
                                  value={att.name}
                                  onChange={e => {
                                    const newAtts = [...formData.attachments];
                                    newAtts[idx].name = e.target.value;
                                    setFormData({ ...formData, attachments: newAtts });
                                  }}
                                  className="w-full bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                />
                                <input 
                                  type="text" 
                                  placeholder="File URL (https://...)"
                                  value={att.url}
                                  onChange={e => {
                                    const newAtts = [...formData.attachments];
                                    newAtts[idx].url = e.target.value;
                                    setFormData({ ...formData, attachments: newAtts });
                                  }}
                                  className="w-full bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                />
                              </div>
                              <button 
                                onClick={() => {
                                  const newAtts = formData.attachments.filter((_: any, i: number) => i !== idx);
                                  setFormData({ ...formData, attachments: newAtts });
                                }}
                                className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          {(!formData.attachments || formData.attachments.length === 0) && (
                            <p className="text-[10px] text-zinc-600 italic text-center py-2">No attachments added.</p>
                          )}
                        </div>
                      </div>

                      {/* Rubric Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-zinc-500 uppercase">Grading Rubric</label>
                          <button 
                            onClick={() => {
                              const rubric = formData.rubric || [];
                              setFormData({ 
                                ...formData, 
                                rubric: [...rubric, { id: `rub-${Date.now()}`, name: '', description: '', maxPoints: 10 }] 
                              });
                            }}
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            <Plus size={12} /> ADD CRITERION
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(formData.rubric || []).map((crit: any, idx: number) => (
                            <div key={crit.id} className="flex gap-2 items-start bg-zinc-900/30 backdrop-blur-sm p-3 rounded-xl border border-zinc-800">
                              <div className="flex-1 space-y-2">
                                <div className="flex gap-2">
                                  <input 
                                    type="text" 
                                    placeholder="Criterion Name (e.g. Code Quality)"
                                    value={crit.name}
                                    onChange={e => {
                                      const newRubric = [...formData.rubric];
                                      newRubric[idx].name = e.target.value;
                                      setFormData({ ...formData, rubric: newRubric });
                                    }}
                                    className="flex-1 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                  />
                                  <input 
                                    type="number" 
                                    placeholder="Max Points"
                                    value={crit.maxPoints}
                                    onChange={e => {
                                      const newRubric = [...formData.rubric];
                                      newRubric[idx].maxPoints = parseInt(e.target.value) || 0;
                                      setFormData({ ...formData, rubric: newRubric });
                                    }}
                                    className="w-24 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                  />
                                </div>
                                <textarea 
                                  placeholder="Description of what constitutes full points..."
                                  value={crit.description}
                                  onChange={e => {
                                    const newRubric = [...formData.rubric];
                                    newRubric[idx].description = e.target.value;
                                    setFormData({ ...formData, rubric: newRubric });
                                  }}
                                  className="w-full bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 h-16 resize-none"
                                />
                              </div>
                              <button 
                                onClick={() => {
                                  const newRubric = formData.rubric.filter((_: any, i: number) => i !== idx);
                                  setFormData({ ...formData, rubric: newRubric });
                                }}
                                className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          {(!formData.rubric || formData.rubric.length === 0) && (
                            <p className="text-[10px] text-zinc-600 italic text-center py-2">No rubric defined.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-1">
                        <Eye size={14} className="text-zinc-500" />
                        <label className="block text-xs font-bold text-zinc-500 uppercase">Live Preview</label>
                      </div>
                      <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-xl p-6 overflow-y-auto prose prose-invert prose-emerald max-w-none prose-sm">
                        <ReactMarkdown
                          components={{
                            code({node, inline, className, children, ...props}: any) {
                              const match = /language-(\w+)/.exec(className || '')
                              return !inline && match ? (
                                <SyntaxHighlighter
                                  style={atomDark}
                                  language={match[1]}
                                  PreTag="div"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              )
                            }
                          }}
                        >
                          {formData.description || '*No description yet...*'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {isEditing.type === 'quiz' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Quiz Title</label>
                        <input 
                          type="text" 
                          value={formData.title || ''} 
                          onChange={e => setFormData({ ...formData, title: e.target.value })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                          placeholder="e.g. HTML Basics Checkpoint"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Link to Lesson</label>
                        <select 
                          value={formData.lessonId || ''} 
                          onChange={e => setFormData({ ...formData, lessonId: e.target.value })}
                          className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                        >
                          <option value="">Select a lesson...</option>
                          {lessons.map(l => (
                            <option key={l.id} value={l.id}>{l.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-zinc-500 uppercase">Questions</label>
                        <button 
                          onClick={() => {
                            const questions = formData.questions || [];
                            setFormData({ 
                              ...formData, 
                              questions: [...questions, { id: `q-${Date.now()}`, text: '', options: ['', '', '', ''], correctAnswer: 0 }] 
                            });
                          }}
                          className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                          <Plus size={12} /> ADD QUESTION
                        </button>
                      </div>
                      
                      <div className="space-y-4">
                        {(formData.questions || []).map((q: any, qIdx: number) => (
                          <div key={q.id} className="bg-zinc-900/30 backdrop-blur-sm p-4 rounded-xl border border-zinc-800 space-y-3">
                            <div className="flex gap-3">
                              <span className="flex-shrink-0 w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                {qIdx + 1}
                              </span>
                              <input 
                                type="text"
                                value={q.text}
                                onChange={e => {
                                  const newQs = [...formData.questions];
                                  newQs[qIdx].text = e.target.value;
                                  setFormData({ ...formData, questions: newQs });
                                }}
                                placeholder="Enter question text..."
                                className="flex-1 bg-transparent border-none text-white text-sm focus:ring-0 p-0"
                              />
                              <button 
                                onClick={() => {
                                  const newQs = formData.questions.filter((_: any, i: number) => i !== qIdx);
                                  setFormData({ ...formData, questions: newQs });
                                }}
                                className="text-zinc-500 hover:text-red-400"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-9">
                              {q.options.map((opt: string, oIdx: number) => (
                                <div key={oIdx} className="flex items-center gap-2">
                                  <input 
                                    type="radio"
                                    name={`correct-${q.id}`}
                                    checked={q.correctAnswer === oIdx}
                                    onChange={() => {
                                      const newQs = [...formData.questions];
                                      newQs[qIdx].correctAnswer = oIdx;
                                      setFormData({ ...formData, questions: newQs });
                                    }}
                                    className="w-3 h-3 text-emerald-500 bg-zinc-800 border-zinc-700 focus:ring-emerald-500/50"
                                  />
                                  <input 
                                    type="text"
                                    value={opt}
                                    onChange={e => {
                                      const newQs = [...formData.questions];
                                      newQs[qIdx].options[oIdx] = e.target.value;
                                      setFormData({ ...formData, questions: newQs });
                                    }}
                                    placeholder={`Option ${oIdx + 1}`}
                                    className="flex-1 bg-zinc-950/40 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {isEditing.type === 'badge' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Badge Title</label>
                          <input 
                            type="text" 
                            value={formData.title || ''} 
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                            placeholder="e.g. HTML Master"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Description</label>
                          <textarea 
                            value={formData.description || ''} 
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50 h-24 resize-none"
                            placeholder="Briefly describe the badge..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Icon URL</label>
                          <input 
                            type="text" 
                            value={formData.icon || ''} 
                            onChange={e => setFormData({ ...formData, icon: e.target.value })}
                            className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                            placeholder="https://..."
                          />
                        </div>
                      </div>

                      <div className="flex flex-col h-full">
                        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Criteria (Markdown)</label>
                        <textarea 
                          value={formData.criteria || ''} 
                          onChange={e => setFormData({ ...formData, criteria: e.target.value })}
                          className="flex-1 w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
                          placeholder="- Complete all HTML lessons&#10;- Score 100% on HTML quiz"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(isEditing.type === 'cohort' || isEditing.type === 'cohort_students') && (
                  <div className="space-y-4">
                    {isEditing.type === 'cohort' && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Cohort Name</label>
                          <input 
                            type="text" 
                            value={formData.name || ''} 
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                            placeholder="e.g. Alpha Cohort 2026"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Start Date</label>
                          <input 
                            type="date" 
                            value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''} 
                            onChange={e => setFormData({ ...formData, startDate: new Date(e.target.value).getTime() })}
                            className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">End Date</label>
                          <input 
                            type="date" 
                            value={formData.endDate ? new Date(formData.endDate).toISOString().split('T')[0] : ''} 
                            onChange={e => setFormData({ ...formData, endDate: new Date(e.target.value).getTime() })}
                            className="w-full bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Assign Mentors</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {users.filter(u => u.role === 'mentor').map(mentor => (
                              <label key={mentor.uid} className="flex items-center gap-3 p-3 bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl cursor-pointer hover:border-zinc-700 transition-all">
                                <input 
                                  type="checkbox" 
                                  checked={(formData.mentorIds || []).includes(mentor.uid)}
                                  onChange={e => {
                                    const current = formData.mentorIds || [];
                                    if (e.target.checked) {
                                      setFormData({ ...formData, mentorIds: [...current, mentor.uid] });
                                    } else {
                                      setFormData({ ...formData, mentorIds: current.filter((id: string) => id !== mentor.uid) });
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
                                />
                                <img src={mentor.photoURL} alt="" className="w-8 h-8 rounded-full" />
                                <span className="text-sm text-white font-medium">{mentor.displayName}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Students in Cohort</label>
                      <div className="mt-2 space-y-2">
                        {users.filter(u => u.role === 'student').map(student => (
                          <label key={student.uid} className="flex items-center justify-between p-3 bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl cursor-pointer hover:border-zinc-700 transition-all">
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                checked={(formData.studentIds || []).includes(student.uid)}
                                onChange={e => {
                                  const current = formData.studentIds || [];
                                  if (e.target.checked) {
                                    setFormData({ ...formData, studentIds: [...current, student.uid] });
                                  } else {
                                    setFormData({ ...formData, studentIds: current.filter((id: string) => id !== student.uid) });
                                  }
                                }}
                                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
                              />
                              <img src={student.photoURL} alt="" className="w-8 h-8 rounded-full" />
                              <span className="text-sm text-white font-medium">{student.displayName}</span>
                            </div>
                            {student.cohortId && student.cohortId !== isEditing.id && !(formData.studentIds || []).includes(student.uid) && (
                              <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-1 rounded-md">
                                In {cohorts.find(c => c.id === student.cohortId)?.name}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 backdrop-blur-sm flex justify-end gap-3">
                <button 
                  onClick={() => setIsEditing(null)}
                  className="px-6 py-2 text-zinc-400 font-bold hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="flex items-center gap-2 bg-emerald-500 text-black px-6 py-2 rounded-xl font-bold hover:bg-emerald-400 transition-colors"
                >
                  <Save size={20} />
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
