import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter,
  ExternalLink,
  MessageSquare,
  ChevronRight,
  X,
  Save,
  User,
  Eye,
  BookOpen,
  ArrowUpDown,
  Calendar,
  FileText,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Submission, Course, Assignment } from '../types';
import { cn } from '../lib/utils';
import RichTextEditor from './RichTextEditor';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { toast } from 'sonner';
import { autoGradeSubmission } from '../services/gemini';
import { createNotification } from '../services/notificationService';

export default function ReviewTab() {
  const [submissions, setSubmissions] = useState<(Submission & { assignmentTitle: string })[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeCourses = onSnapshot(collection(db, 'courses'), (snap) => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));

    const unsubscribeAssignments = onSnapshot(collection(db, 'assignments'), (snap) => {
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'assignments'));

    const unsubscribeSubmissions = onSnapshot(collection(db, 'submissions'), (snap) => {
      const subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission));
      // We will map assignmentTitle in the render or effect, but let's do it here
      setSubmissions(subs as (Submission & { assignmentTitle: string })[]);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'submissions'));

    return () => {
      unsubscribeCourses();
      unsubscribeAssignments();
      unsubscribeSubmissions();
    };
  }, []);

  // Map assignment titles
  const submissionsWithTitles = submissions.map(sub => {
    const assignment = assignments.find(a => a.id === sub.assignmentId);
    return { ...sub, assignmentTitle: assignment?.title || 'Unknown Assignment' };
  });

  const [selectedSubmission, setSelectedSubmission] = useState<(Submission & { assignmentTitle: string }) | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'resubmit'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'submittedAt' | 'dueDate' | 'createdAt'>('submittedAt');
  const [assignmentFeedback, setAssignmentFeedback] = useState<{ [id: string]: string }>({});
  const [isAIGrading, setIsAIGrading] = useState(false);

  const currentAssignment = assignments.find(a => a.id === selectedAssignmentId);

  const handleAIGrade = async () => {
    if (!selectedSubmission) return;
    const assignment = assignments.find(a => a.id === selectedSubmission.assignmentId);
    if (!assignment || !assignment.rubric || assignment.rubric.length === 0) {
      toast.error('Assignment must have a rubric for AI grading.');
      return;
    }

    setIsAIGrading(true);
    toast.info('AI is evaluating the submission...', { duration: 4000 });
    
    try {
      const result = await autoGradeSubmission(
        assignment.description,
        assignment.rubric,
        selectedSubmission.content
      );
      
      const newRubricGrades = result.rubricGrades || {};
      const newTotalGrade = result.totalGrade || 0;
      let newFeedback = result.feedback || '';

      // Force HTML format out of markdown if it returned MD (RichTextEditor expects HTML-like or translates it roughly, but we can append it directly to current)
      const formattedFeedback = `
        <div class="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4">
          <p class="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-2">✨ AI Mentor Analysis</p>
          <div class="text-sm text-zinc-300">
            ${newFeedback.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}
          </div>
        </div>
      `;

      await handleUpdateStatus(selectedSubmission.id, {
        rubricGrades: newRubricGrades,
        grade: newTotalGrade,
        feedback: (selectedSubmission.feedback || '') + formattedFeedback
      });
      
      toast.success('AI Grading applied successfully. Please review the results.');
    } catch (error) {
      toast.error('AI Grading failed. Please try again or grade manually.');
    } finally {
      setIsAIGrading(false);
    }
  };

  const filteredSubmissions = submissionsWithTitles
    .filter(s => {
      const assignment = assignments.find(a => a.id === s.assignmentId);
      const matchesFilter = filter === 'all' || s.status === filter;
      const matchesCourse = selectedCourseId === 'all' || assignment?.courseId === selectedCourseId;
      const matchesAssignment = selectedAssignmentId === 'all' || s.assignmentId === selectedAssignmentId;
      const dateStr = new Date(s.submittedAt).toLocaleDateString().toLowerCase();
      const matchesSearch = 
        s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.assignmentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dateStr.includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch && matchesCourse && matchesAssignment;
    })
    .sort((a, b) => {
      const assignmentA = assignments.find(as => as.id === a.assignmentId);
      const assignmentB = assignments.find(as => as.id === b.assignmentId);
      
      if (sortBy === 'submittedAt') return b.submittedAt - a.submittedAt;
      if (sortBy === 'dueDate') return (assignmentB?.dueDate || 0) - (assignmentA?.dueDate || 0);
      if (sortBy === 'createdAt') return (assignmentB?.createdAt || 0) - (assignmentA?.createdAt || 0);
      return 0;
    });

  const handleUpdateStatus = async (id: string, updates: Partial<Submission>) => {
    try {
      await updateDoc(doc(db, 'submissions', id), updates);
      toast.success('Submission updated');
      
      const sub = submissionsWithTitles.find(s => s.id === id);
      if (sub) {
        if (updates.status === 'reviewed') {
          await createNotification(sub.studentId, 'grade', 'Assignment Graded', `Your submission for "${sub.assignmentTitle}" has been graded.`);
        } else if (updates.status === 'resubmit') {
          await createNotification(sub.studentId, 'grade', 'Revision Requested', `Your submission for "${sub.assignmentTitle}" needs revisions.`);
        }
      }

      if (selectedSubmission?.id === id) {
        setSelectedSubmission(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `submissions/${id}`);
      toast.error('Failed to update submission');
    }
  };

  const handleBulkUpdateStatus = async (status: 'pending' | 'reviewed' | 'resubmit') => {
    try {
      await Promise.all(selectedIds.map(async (id) => {
        await updateDoc(doc(db, 'submissions', id), { status });
        const sub = submissionsWithTitles.find(s => s.id === id);
        if (sub) {
          if (status === 'reviewed') {
            await createNotification(sub.studentId, 'grade', 'Assignment Graded', `Your submission for "${sub.assignmentTitle}" has been graded.`);
          } else if (status === 'resubmit') {
            await createNotification(sub.studentId, 'grade', 'Revision Requested', `Your submission for "${sub.assignmentTitle}" needs revisions.`);
          }
        }
      }));
      toast.success(`Updated ${selectedIds.length} submissions`);
      setSelectedIds([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'submissions');
      toast.error('Failed to update submissions');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredSubmissions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSubmissions.map(s => s.id));
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-amber-400 bg-amber-400/10';
      case 'reviewed': return 'text-emerald-400 bg-emerald-400/10';
      case 'resubmit': return 'text-red-400 bg-red-400/10';
      default: return 'text-zinc-400 bg-zinc-400/10';
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Review Submissions</h1>
          <p className="text-zinc-500 mt-1">Grade and provide feedback to your cohort students.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-auto group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search students, assignments, or dates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-full pl-12 pr-6 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 w-full sm:w-96 transition-all placeholder:text-zinc-600"
            />
          </div>
          <div className="flex bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
            {(['all', 'pending', 'reviewed', 'resubmit'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all capitalize whitespace-nowrap flex-1 sm:flex-none",
                  filter === f ? "bg-emerald-500 text-black" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 bg-zinc-900/30 backdrop-blur-sm p-4 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-3 pr-4 border-r border-zinc-800">
          <button 
            onClick={toggleSelectAll}
            className={cn(
              "w-5 h-5 rounded border flex items-center justify-center transition-all",
              selectedIds.length === filteredSubmissions.length && filteredSubmissions.length > 0
                ? "bg-emerald-500 border-emerald-500 text-black"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
            )}
          >
            {selectedIds.length === filteredSubmissions.length && filteredSubmissions.length > 0 && <CheckCircle2 size={12} strokeWidth={3} />}
          </button>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Select All</span>
        </div>

        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-zinc-500" />
          <select 
            value={selectedCourseId}
            onChange={(e) => {
              setSelectedCourseId(e.target.value);
              setSelectedAssignmentId('all'); // Reset assignment filter when course changes
            }}
            className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">All Courses</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <FileText size={16} className="text-zinc-500" />
          <select 
            value={selectedAssignmentId}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">All Assignments</option>
            {assignments
              .filter(a => selectedCourseId === 'all' || a.courseId === selectedCourseId)
              .map(assignment => (
                <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
              ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <ArrowUpDown size={16} className="text-zinc-500" />
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          >
            <option value="submittedAt">Sort by Submission Date</option>
            <option value="dueDate">Sort by Assignment Due Date</option>
            <option value="createdAt">Sort by Assignment Creation Date</option>
          </select>
        </div>
      </div>

      {/* Overall Assignment Feedback Section */}
      {selectedAssignmentId !== 'all' && currentAssignment && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-3xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-emerald-400" size={20} />
              <h2 className="text-lg font-bold text-white">Overall Assignment Feedback</h2>
            </div>
            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded">Visible to all students</p>
          </div>
          <textarea 
            value={assignmentFeedback[selectedAssignmentId] || ''}
            onChange={(e) => setAssignmentFeedback({ ...assignmentFeedback, [selectedAssignmentId]: e.target.value })}
            placeholder="Provide general feedback for all students on this assignment..."
            className="w-full bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 h-24 resize-none"
          />
          <div className="flex justify-end">
            <button className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
              <Save size={14} /> Save Overall Feedback
            </button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {filteredSubmissions.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-600">
              <Filter size={32} />
            </div>
            <p className="text-zinc-500">No submissions found matching your criteria.</p>
          </div>
        ) : (
          filteredSubmissions.map((submission) => (
            <motion.div
              layout
              key={submission.id}
              onClick={() => setSelectedSubmission(submission)}
              className={cn(
                "group bg-zinc-900/40 backdrop-blur-sm border p-5 rounded-2xl hover:border-zinc-700 transition-all cursor-pointer flex items-center justify-between",
                selectedIds.includes(submission.id) ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-800"
              )}
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={(e) => toggleSelect(submission.id, e)}
                  className={cn(
                    "w-5 h-5 rounded border flex items-center justify-center transition-all shrink-0",
                    selectedIds.includes(submission.id)
                      ? "bg-emerald-500 border-emerald-500 text-black"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
                  )}
                >
                  {selectedIds.includes(submission.id) && <CheckCircle2 size={12} strokeWidth={3} />}
                </button>
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-800 group-hover:border-emerald-500/30 transition-colors">
                  <img src={submission.studentPhoto} alt={submission.studentName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white group-hover:text-emerald-400 transition-colors">{submission.studentName}</h3>
                    {courses.find(c => c.id === assignments.find(a => a.id === submission.assignmentId)?.courseId) && (
                      <span className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[8px] font-bold text-zinc-400 uppercase">
                        {courses.find(c => c.id === assignments.find(a => a.id === submission.assignmentId)?.courseId)?.title}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">{submission.assignmentTitle}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Submitted {new Date(submission.submittedAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5", 
                  getStatusColor(submission.status)
                )}>
                  {submission.status === 'pending' && <Clock size={10} />}
                  {submission.status === 'reviewed' && <CheckCircle2 size={10} />}
                  {submission.status === 'resubmit' && <AlertCircle size={10} />}
                  {submission.status}
                </div>
                {submission.grade !== null && (
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 uppercase font-bold tracking-tighter">Grade</p>
                    <p className="text-lg font-black text-white">{submission.grade}%</p>
                  </div>
                )}
                <ChevronRight size={20} className="text-zinc-700 group-hover:text-emerald-400 transition-colors" />
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-8 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 pr-8 border-r border-zinc-800">
              <div className="w-8 h-8 bg-emerald-500 text-black rounded-full flex items-center justify-center font-bold text-sm">
                {selectedIds.length}
              </div>
              <span className="text-sm font-medium text-zinc-300">Submissions Selected</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mr-2">Bulk Actions:</span>
              {(['pending', 'reviewed', 'resubmit'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleBulkUpdateStatus(s)}
                  className={cn(
                    "px-4 py-2 text-[10px] font-bold uppercase rounded-xl border transition-all",
                    "bg-zinc-900/40 backdrop-blur-sm border-zinc-800 text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-400"
                  )}
                >
                  Mark as {s}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setSelectedIds([])}
              className="ml-4 text-zinc-500 hover:text-white transition-colors p-1"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submission Detail Modal */}
      <AnimatePresence>
        {selectedSubmission && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                  <img src={selectedSubmission.studentPhoto} className="w-10 h-10 rounded-full border border-zinc-700" referrerPolicy="no-referrer" />
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedSubmission.studentName}</h2>
                    <p className="text-xs text-emerald-500 font-medium">{selectedSubmission.assignmentTitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={handleAIGrade} 
                    disabled={isAIGrading}
                    className="flex items-center gap-2 text-xs font-bold text-emerald-950 bg-emerald-500 px-4 py-2 rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50"
                  >
                    {isAIGrading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {isAIGrading ? 'Analyzing...' : 'Grade with AI'}
                  </button>
                  <button onClick={() => setSelectedSubmission(null)} className="text-zinc-500 hover:text-white transition-colors">
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-8 overflow-y-auto space-y-8">
                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Assignment Instructions</h3>
                  <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 p-6 rounded-2xl prose prose-invert prose-emerald max-w-none prose-sm">
                    <ReactMarkdown>
                      {assignments.find(a => a.id === selectedSubmission.assignmentId)?.description || '*No instructions available.*'}
                    </ReactMarkdown>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Submission Content</h3>
                  <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 p-6 rounded-2xl text-zinc-300 leading-relaxed">
                    {selectedSubmission.content.startsWith('http') ? (
                      <a 
                        href={selectedSubmission.content} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-emerald-400 hover:underline font-medium"
                      >
                        <ExternalLink size={18} />
                        {selectedSubmission.content}
                      </a>
                    ) : (
                      <p className="whitespace-pre-wrap">{selectedSubmission.content}</p>
                    )}
                  </div>
                </section>

                {/* Rubric Grading Section */}
                {assignments.find(a => a.id === selectedSubmission.assignmentId)?.rubric && (
                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Grading Rubric</h3>
                    <div className="space-y-3">
                      {assignments.find(a => a.id === selectedSubmission.assignmentId)?.rubric?.map(crit => (
                        <div key={crit.id} className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <h4 className="text-sm font-bold text-white">{crit.name}</h4>
                            <p className="text-xs text-zinc-500 mt-1">{crit.description}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <input 
                              type="number" 
                              min="0" 
                              max={crit.maxPoints}
                              value={selectedSubmission.rubricGrades?.[crit.id] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : Math.max(0, Math.min(crit.maxPoints, parseInt(e.target.value) || 0));
                                const newRubricGrades = { ...(selectedSubmission.rubricGrades || {}), [crit.id]: val };
                                
                                // Calculate total grade based on rubric
                                const totalPoints = Object.values(newRubricGrades).reduce((a, b) => a + b, 0);
                                const maxTotal = assignments.find(a => a.id === selectedSubmission.assignmentId)?.rubric?.reduce((a, b) => a + b.maxPoints, 0) || 100;
                                const calculatedGrade = Math.round((totalPoints / maxTotal) * 100);

                                handleUpdateStatus(selectedSubmission.id, { 
                                  rubricGrades: newRubricGrades,
                                  grade: calculatedGrade
                                });
                              }}
                              className="w-16 bg-zinc-950/40 backdrop-blur-sm border border-zinc-800 rounded-lg px-2 py-1 text-center text-emerald-400 font-bold focus:outline-none focus:border-emerald-500/50"
                            />
                            <span className="text-xs font-bold text-zinc-600">/ {crit.maxPoints}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Grading</h3>
                    <div className="flex items-center gap-4">
                      <input 
                        type="number" 
                        min="0" 
                        max="100"
                        value={selectedSubmission.grade === null ? '' : selectedSubmission.grade}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          handleUpdateStatus(selectedSubmission.id, { grade: val });
                        }}
                        className="w-24 bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-xl px-4 py-3 text-white text-xl font-bold focus:outline-none focus:border-emerald-500/50"
                        placeholder="0"
                      />
                      <span className="text-2xl font-bold text-zinc-700">/ 100</span>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Status</h3>
                    <div className="flex gap-2">
                      {(['pending', 'reviewed', 'resubmit'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => handleUpdateStatus(selectedSubmission.id, { status: s })}
                          className={cn(
                            "flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border transition-all",
                            selectedSubmission.status === s 
                              ? "bg-emerald-500 border-emerald-500 text-black" 
                              : "bg-zinc-900/40 backdrop-blur-sm border-zinc-800 text-zinc-500 hover:border-zinc-700"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Detailed Feedback</h3>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => handleUpdateStatus(selectedSubmission.id, { feedback: selectedSubmission.feedback + "<p><strong>Great job! Keep it up.</strong></p>" })}
                        className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded hover:bg-emerald-500/20 transition-colors"
                      >
                        + Positive
                      </button>
                      <button 
                        onClick={() => handleUpdateStatus(selectedSubmission.id, { feedback: selectedSubmission.feedback + "<p><em>Please review the requirements and resubmit.</em></p>" })}
                        className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded hover:bg-red-500/20 transition-colors"
                      >
                        + Resubmit
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <RichTextEditor 
                      content={selectedSubmission.feedback}
                      onChange={(content) => handleUpdateStatus(selectedSubmission.id, { feedback: content })}
                      placeholder="Write your detailed feedback here... Use the toolbar for formatting, lists, and code blocks."
                    />
                    
                    <div className="flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <Eye size={14} className="text-zinc-500" />
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase">Live Preview</label>
                      </div>
                      <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 overflow-y-auto prose prose-invert prose-emerald max-w-none prose-sm h-64">
                        <div dangerouslySetInnerHTML={{ __html: selectedSubmission.feedback || '<p><em>No feedback yet...</em></p>' }} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-600 italic">Rich text editor is used for detailed feedback formatting.</p>
                </section>
              </div>

              <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 backdrop-blur-sm flex justify-end">
                <button 
                  onClick={() => setSelectedSubmission(null)}
                  className="flex items-center gap-2 bg-emerald-500 text-black px-8 py-3 rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/10"
                >
                  <Save size={20} />
                  Save Review
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
