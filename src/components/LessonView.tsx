import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Play, 
  MessageSquare, 
  Send, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight,
  Loader2,
  X,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Paperclip,
  ClipboardList,
  Bookmark,
  BookmarkCheck
} from 'lucide-react';
import YouTubeEmbed from './YouTubeEmbed';
import { Lesson, Assignment, Quiz as QuizType } from '../types';
import { Quiz } from './Quiz';
import { askBuddy } from '../services/gemini';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { db, auth } from '../firebase';
import { doc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';

interface LessonViewProps {
  lesson: Lesson;
  onBack: () => void;
}

export default function LessonView({ lesson, onBack }: LessonViewProps) {
  const { user, toggleBookmark, completeLesson, gainXP } = useAuth();
  const [showBuddy, setShowBuddy] = useState(false);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [submissionContent, setSubmissionContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);

  const isBookmarked = user?.bookmarkedLessonIds?.includes(lesson.id);

  const handleBookmark = () => {
    toggleBookmark(lesson.id);
    if (!isBookmarked) {
      toast.success("Lesson Bookmarked", {
        description: "You can find this in your bookmarks section.",
        icon: <BookmarkCheck className="text-emerald-500" size={16} />
      });
    } else {
      toast.info("Bookmark Removed");
    }
  };

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [quizzes, setQuizzes] = useState<QuizType[]>([]);

  React.useEffect(() => {
    const unsubAssignments = onSnapshot(collection(db, 'assignments'), (snap) => {
      setAssignments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
    });
    const unsubQuizzes = onSnapshot(collection(db, 'quizzes'), (snap) => {
      setQuizzes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuizType)));
    });
    return () => {
      unsubAssignments();
      unsubQuizzes();
    };
  }, []);

  const assignment = lesson.assignmentId ? assignments.find(a => a.id === lesson.assignmentId) : null;
  const quiz = lesson.quizId ? quizzes.find(q => q.id === lesson.quizId) : null;

  const handleAsk = async () => {
    if (!question.trim()) return;
    const userMsg = question;
    setChat([...chat, { role: 'user', text: userMsg }]);
    setQuestion('');
    setIsAsking(true);
    try {
      const answer = await askBuddy(lesson.content, userMsg);
      setChat(prev => [...prev, { role: 'ai', text: answer || 'I am not sure about that.' }]);
    } catch (error) {
      setChat(prev => [...prev, { role: 'ai', text: 'Sorry, I am having trouble connecting right now.' }]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleQuizComplete = async (score: number) => {
    if (!user || !quiz) return;
    setQuizScore(score);
    setShowQuiz(false);
    
    try {
      const attemptRef = doc(collection(db, 'quizAttempts'));
      await setDoc(attemptRef, {
        id: attemptRef.id,
        quizId: quiz.id,
        studentId: user.uid,
        score: score,
        answers: [], // We could track answers if needed
        completedAt: Date.now()
      });
      
      toast.success(`Quiz completed! You scored ${score}/${quiz.questions.length}`);
      
      // If score is passing (e.g. > 70%), complete the lesson
      if (score / quiz.questions.length >= 0.7) {
        completeLesson(lesson.id, lesson.title);
        
        // Bonus for perfect score
        if (score === quiz.questions.length) {
          gainXP(50, `Perfect Quiz: ${lesson.title}`);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'quizAttempts');
    }
  };

  const handleAssignmentSubmit = async () => {
    if (!user || !assignment || !submissionContent.trim()) return;
    setIsSubmitting(true);
    
    try {
      const submissionRef = doc(collection(db, 'submissions'));
      await setDoc(submissionRef, {
        id: submissionRef.id,
        assignmentId: assignment.id,
        studentId: user.uid,
        studentName: user.displayName,
        content: submissionContent,
        submittedAt: Date.now(),
        status: 'pending'
      });
      
      setSubmitted(true);
      toast.success("Assignment submitted successfully!");
      
      // Also complete the lesson
      completeLesson(lesson.id, lesson.title);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'submissions');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full bg-black">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-4"
        >
          <ChevronLeft size={20} />
          Back to Curriculum
        </button>

        <YouTubeEmbed 
          videoId={lesson.videoUrl} 
          title={lesson.title} 
          className="rounded-3xl"
        />

        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">{lesson.title}</h1>
              <div className="flex items-center gap-4 mt-4 text-sm text-zinc-500">
                <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full font-bold">Lesson {lesson.order}</span>
                <span>•</span>
                <span>15 mins read</span>
              </div>
            </div>
            <button 
              onClick={handleBookmark}
              className={cn(
                "p-4 rounded-2xl border transition-all flex items-center gap-2 group",
                isBookmarked 
                  ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                  : "bg-zinc-900/40 backdrop-blur-sm border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-white"
              )}
            >
              {isBookmarked ? <BookmarkCheck size={24} fill="currentColor" /> : <Bookmark size={24} className="group-hover:scale-110 transition-transform" />}
              <span className="text-xs font-bold uppercase tracking-widest hidden sm:inline">
                {isBookmarked ? 'Bookmarked' : 'Bookmark'}
              </span>
            </button>
          </header>

          <div className="prose prose-invert prose-emerald max-w-none bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 p-8 rounded-3xl">
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
              {lesson.content}
            </ReactMarkdown>
          </div>

          {/* Quiz Section */}
          {quiz && (
            <div className="mt-12 space-y-8 border-t border-zinc-800 pt-12">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/10 text-yellow-500 rounded-xl flex items-center justify-center">
                    <HelpCircle size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Lesson Quiz: {quiz.title}</h2>
                    <p className="text-sm text-zinc-500">Test your knowledge of the concepts covered.</p>
                  </div>
                </div>
                {!showQuiz && quizScore === null && (
                  <button 
                    onClick={() => setShowQuiz(true)}
                    className="px-6 py-2 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 transition-colors"
                  >
                    Start Quiz
                  </button>
                )}
              </div>

              {showQuiz ? (
                <Quiz 
                  quizId={quiz.id}
                  title={quiz.title}
                  questions={quiz.questions}
                  onComplete={handleQuizComplete}
                />
              ) : quizScore !== null ? (
                <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-3xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">Quiz Completed</h3>
                      <p className="text-sm text-zinc-500">Your score: {quizScore} / {quiz.questions.length}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowQuiz(true)}
                    className="text-sm font-bold text-yellow-500 hover:text-yellow-400 transition-colors"
                  >
                    Retake Quiz
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Assignment Section */}
          {assignment && (
            <div className="mt-12 space-y-8 border-t border-zinc-800 pt-12">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                  <FileText size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Assignment: {assignment.title}</h2>
                  <p className="text-sm text-zinc-500">Due {new Date(assignment.dueDate).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Overall Feedback (if available) */}
              {assignment.overallFeedback && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-3xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Sparkles size={18} />
                    <h3 className="font-bold text-sm uppercase tracking-widest">Mentor's Overall Feedback</h3>
                  </div>
                  <div 
                    className="text-zinc-300 text-sm italic prose prose-invert prose-emerald max-w-none"
                    dangerouslySetInnerHTML={{ __html: assignment.overallFeedback }}
                  />
                </div>
              )}

              {/* Submission Status — shown after student submits */}
              {submitted && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-3xl flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 text-black rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">Submitted Successfully!</h3>
                    <p className="text-sm text-zinc-400 mt-1">Your mentor will review your work and provide feedback. You'll be notified once it's graded.</p>
                    <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">Pending Review</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-3xl space-y-4">
                    <h3 className="text-lg font-bold text-white">Instructions</h3>
                    <div className="prose prose-invert prose-emerald max-w-none text-sm">
                      <ReactMarkdown>{assignment.description}</ReactMarkdown>
                    </div>
                  </div>

                  {/* Submission Form */}
                  <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-3xl space-y-4">
                    <h3 className="text-lg font-bold text-white">Your Submission</h3>
                    {submitted ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-2xl flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500 text-black rounded-full flex items-center justify-center">
                          <CheckCircle2 size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-white">Assignment Submitted!</h4>
                          <p className="text-sm text-zinc-400">Your mentor will review it soon.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <textarea 
                          value={submissionContent}
                          onChange={e => setSubmissionContent(e.target.value)}
                          placeholder="Paste your GitHub link or write your submission here..."
                          className="w-full bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-emerald-500/50 h-48 resize-none"
                        />
                        <button 
                          onClick={handleAssignmentSubmit}
                          disabled={isSubmitting || !submissionContent.trim()}
                          className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                          Submit Assignment
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Attachments */}
                  {assignment.attachments && assignment.attachments.length > 0 && (
                    <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-3xl space-y-4">
                      <div className="flex items-center gap-2">
                        <Paperclip size={18} className="text-zinc-500" />
                        <h3 className="font-bold text-white text-sm uppercase tracking-widest">Attachments</h3>
                      </div>
                      <div className="space-y-2">
                        {assignment.attachments.map(att => (
                          <a 
                            key={att.id}
                            href={att.url}
                            className="flex items-center justify-between p-3 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="text-zinc-500 group-hover:text-emerald-400 transition-colors">
                                <FileText size={16} />
                              </div>
                              <span className="text-xs text-zinc-300 truncate max-w-[120px]">{att.name}</span>
                            </div>
                            <Download size={14} className="text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rubric */}
                  {assignment.rubric && assignment.rubric.length > 0 && (
                    <div className="bg-zinc-900/30 border border-zinc-800 p-6 rounded-3xl space-y-4">
                      <div className="flex items-center gap-2">
                        <ClipboardList size={18} className="text-zinc-500" />
                        <h3 className="font-bold text-white text-sm uppercase tracking-widest">Grading Rubric</h3>
                      </div>
                      <div className="space-y-4">
                        {assignment.rubric.map(crit => (
                          <div key={crit.id} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-zinc-300">{crit.name}</span>
                              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">{crit.maxPoints} pts</span>
                            </div>
                            <p className="text-[10px] text-zinc-500 leading-relaxed">{crit.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Buddy Sidebar Toggle */}
      <button 
        onClick={() => setShowBuddy(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-emerald-500 text-black rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/20 hover:scale-110 transition-transform z-40"
      >
        <Sparkles size={32} />
      </button>

      {/* Buddy Sidebar */}
      <AnimatePresence>
        {showBuddy && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="w-96 bg-zinc-950/40 backdrop-blur-sm border-l border-zinc-800 flex flex-col shadow-2xl z-50 fixed right-0 top-0 bottom-0"
          >
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="text-emerald-400" size={20} />
                <h3 className="font-bold text-white">Ask Buddy</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowBuddy(false)} 
                  className="text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest px-2 py-1 bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-md"
                >
                  Hide
                </button>
                <button onClick={() => setShowBuddy(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chat.length === 0 && (
                <div className="text-center py-12 text-zinc-600">
                  <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm">Hi! I'm Buddy. Ask me anything about this lesson!</p>
                </div>
              )}
              {chat.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-emerald-500 text-black font-medium rounded-tr-none' 
                      : 'bg-zinc-900/40 backdrop-blur-sm text-zinc-300 border border-zinc-800 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isAsking && (
                <div className="flex justify-start">
                  <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 p-3 rounded-2xl rounded-tl-none">
                    <Loader2 className="animate-spin text-emerald-500" size={16} />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 backdrop-blur-sm">
              <div className="relative">
                <input 
                  type="text" 
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleAsk()}
                  placeholder="Ask a question..."
                  className="w-full bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
                <button 
                  onClick={handleAsk}
                  disabled={isAsking || !question.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-500 hover:text-emerald-400 disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
