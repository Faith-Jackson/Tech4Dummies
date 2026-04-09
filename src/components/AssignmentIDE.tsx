import React, { useState, useEffect, useRef } from 'react';
import IDE from './IDE';
import Sandbox from './Sandbox';
import { Assignment, Submission } from '../types';
import { ai, GEMINI_MODEL } from '../services/gemini';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';
import { Sparkles, Zap } from 'lucide-react';
import Markdown from 'react-markdown';

interface AssignmentIDEProps {
  assignmentId: string;
}

export default function AssignmentIDE({ assignmentId }: AssignmentIDEProps) {
  const { user, gainXP } = useAuth();
  const [files, setFiles] = useState([
    { name: 'index.js', language: 'javascript', content: '// Write your code here\nfunction helloWorld() {\n  console.log("Hello, World!");\n}\nhelloWorld();' },
    { name: 'style.css', language: 'css', content: 'body { background: #000; color: #fff; }' }
  ]);
  const [output, setOutput] = useState('');
  const [aiFeedback, setAiFeedback] = useState('');
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const isRemoteUpdate = useRef(false);

  useEffect(() => {
    if (!user) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', userId: user.uid }));
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'code-sync' && data.assignmentId === assignmentId) {
          isRemoteUpdate.current = true;
          setFiles(data.files);
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    setWs(socket);
    return () => socket.close();
  }, [user, assignmentId]);

  useEffect(() => {
    const loadAssignment = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'assignments', assignmentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAssignment(docSnap.data() as Assignment);
        } else {
          setError('Assignment not found');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'assignments/' + assignmentId);
      } finally {
        setLoading(false);
      }
    };
    loadAssignment();
  }, [assignmentId]);

  useEffect(() => {
    const loadCode = async () => {
      if (!auth.currentUser) return;
      const path = 'codePersistence/' + auth.currentUser.uid;
      try {
        const docRef = doc(db, 'codePersistence', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setFiles(docSnap.data().files);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, path);
      }
    };
    loadCode();
  }, []);

  const handleCodeChange = (newFiles: any[]) => {
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    setFiles(newFiles);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'code-sync', assignmentId, files: newFiles }));
    }
  };

  const saveCode = async (newFiles: any[]) => {
    setFiles(newFiles);
    if (!auth.currentUser) return;
    const path = 'codePersistence/' + auth.currentUser.uid;
    try {
      const docRef = doc(db, 'codePersistence', auth.currentUser.uid);
      await setDoc(docRef, { files: newFiles, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleRun = () => {
    setOutput('');
    setRunKey(prev => prev + 1);
  };

  const getAiFeedback = async () => {
    if (!assignment) return;
    setIsAnalyzing(true);
    setAiFeedback('');
    setSuggestedCode(null);
    const jsFile = files.find(f => f.name === 'index.js');
    
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `You are an expert code reviewer. Analyze this JavaScript code for the assignment: "${assignment.title}".
        
        Assignment Description: ${assignment.description}
        
        Code:
        ${jsFile?.content}
        
        Provide a structured review with the following sections:
        1. **Code Quality**: Readability, naming conventions, and best practices.
        2. **Logic & Correctness**: Does it meet the assignment requirements?
        3. **Performance & Optimization**: Any bottlenecks or better ways to solve it?
        4. **Security**: Any potential vulnerabilities?
        
        Also, provide the FULL corrected/improved version of the code inside a markdown code block labeled "SUGGESTED_CODE".
        
        Keep the feedback encouraging and educational.`,
      });
      
      const text = response.text || '';
      const feedback = text.replace(/```SUGGESTED_CODE\n([\s\S]*?)```/, '').trim();
      const codeMatch = text.match(/```SUGGESTED_CODE\n([\s\S]*?)```/);
      
      setAiFeedback(feedback || 'No feedback available.');
      if (codeMatch) {
        setSuggestedCode(codeMatch[1].trim());
      }
      
      // Award XP for seeking feedback
      gainXP(25, `AI Feedback: ${assignment.title}`);
    } catch (e) {
      setAiFeedback('Failed to get AI feedback. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyAiFix = () => {
    if (!suggestedCode) return;
    setFiles(prev => prev.map(f => f.name === 'index.js' ? { ...f, content: suggestedCode } : f));
    setSuggestedCode(null);
    toast.success("AI suggestions applied!");
  };

  const handleSubmit = async () => {
    if (!auth.currentUser || !assignment) return;
    setIsSubmitting(true);
    try {
      const submissionData: Omit<Submission, 'id'> = {
        assignmentId: assignment.id,
        studentId: auth.currentUser.uid,
        studentName: auth.currentUser.displayName || 'Student',
        studentPhoto: auth.currentUser.photoURL || '',
        cohortId: user?.cohortId || '',
        content: JSON.stringify(files),
        status: 'pending',
        grade: null,
        feedback: '',
        submittedAt: Date.now(),
      };
      await addDoc(collection(db, 'submissions'), submissionData);
      
      // Award XP for submission
      gainXP(150, `Submitted Assignment: ${assignment.title}`);
      
      toast.success('Assignment submitted successfully!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'submissions');
      toast.error('Failed to submit assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading assignment...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!assignment) return null;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white tracking-tight">{assignment.title}</h1>
            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-800 rounded-full border border-zinc-700">
              <div className={`w-2 h-2 rounded-full ${ws?.readyState === WebSocket.OPEN ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                {ws?.readyState === WebSocket.OPEN ? 'Live Sync' : 'Offline'}
              </span>
            </div>
          </div>
          <p className="text-zinc-500 mt-1">{assignment.description}</p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-6 rounded-xl transition-all"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
        </button>
      </header>
      
      <IDE files={files} onSave={saveCode} onRun={handleRun} onChange={handleCodeChange} output={output} />
      
      <div className="hidden">
        <Sandbox key={runKey} files={files} onOutput={setOutput} tests={assignment.tests} />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Tests</h2>
          <ul className="space-y-2">
            {assignment.tests?.map(test => (
              <li key={test.id} className="text-zinc-400 text-sm">
                {test.description}
              </li>
            ))}
          </ul>
        </div>
        
        <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">AI Feedback</h2>
              {suggestedCode && (
                <button
                  onClick={applyAiFix}
                  className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all"
                >
                  <Zap size={12} />
                  Apply AI Fix
                </button>
              )}
            </div>
            <button 
              onClick={getAiFeedback}
              disabled={isAnalyzing}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold py-2 px-4 rounded-xl transition-all"
            >
              {isAnalyzing ? 'Analyzing...' : 'Get AI Feedback'}
            </button>
          </div>
          <p className="text-zinc-400 text-sm whitespace-pre-wrap">{aiFeedback || 'Click the button to get feedback on your code.'}</p>
        </div>
      </div>
    </div>
  );
}
