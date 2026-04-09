import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { FileText, Download, Sparkles, Loader2, Briefcase, Award, Code2, CheckCircle2 } from 'lucide-react';
import { ai, GEMINI_MODEL } from '../services/gemini';
import { useAuth } from '../hooks/useAuth';
import Markdown from 'react-markdown';
import { toast } from 'sonner';
import { db, auth } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function ResumeBuilder() {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [resumeContent, setResumeContent] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<any>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users_public', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserStats(doc.data());
      }
    });
    return unsubscribe;
  }, []);

  const generateResume = async () => {
    if (!user) return;
    setIsGenerating(true);
    setResumeContent(null);

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `You are an expert technical resume writer. Create a professional, ATS-friendly resume for a Junior Web Developer based on the following platform statistics:
        
        Name: ${user.displayName || 'Tech4Dummies Student'}
        Email: ${user.email}
        Level: ${userStats?.level || 1}
        Total XP: ${userStats?.xp || 0}
        Lessons Completed: ${userStats?.completedCount || 0}
        
        Include the following sections:
        1. **Professional Summary**: A strong opening statement highlighting their dedication to learning and practical skills.
        2. **Technical Skills**: List relevant web development skills (HTML, CSS, JavaScript, React, etc.).
        3. **Projects & Experience**: Create 2-3 realistic project descriptions based on typical beginner web dev assignments (e.g., Portfolio Website, To-Do App, Weather Dashboard). Emphasize problem-solving and clean code.
        4. **Education**: Mention their progress on the Tech4Dummies platform.
        
        Format the output entirely in Markdown. Make it look professional and ready to be exported to PDF.`,
      });

      setResumeContent(response.text || 'Failed to generate resume.');
      toast.success('Resume generated successfully!');
    } catch (error) {
      console.error('Error generating resume:', error);
      toast.error('Failed to generate resume.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!resumeContent) return;
    const blob = new Blob([resumeContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Tech4Dummies_Resume.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Resume downloaded as Markdown!');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <FileText className="text-emerald-500" size={32} />
          AI Resume Builder
        </h1>
        <p className="text-zinc-400 mt-2 text-lg">Turn your platform progress into a professional, ATS-ready resume.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Your Profile Data</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-3 text-zinc-300">
                  <Award size={18} className="text-emerald-500" />
                  <span className="text-sm font-medium">Level</span>
                </div>
                <span className="text-white font-bold">{userStats?.level || 1}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-3 text-zinc-300">
                  <Sparkles size={18} className="text-yellow-500" />
                  <span className="text-sm font-medium">Total XP</span>
                </div>
                <span className="text-white font-bold">{userStats?.xp || 0}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-3 text-zinc-300">
                  <Code2 size={18} className="text-blue-500" />
                  <span className="text-sm font-medium">Lessons</span>
                </div>
                <span className="text-white font-bold">{userStats?.completedCount || 0}</span>
              </div>
            </div>

            <button
              onClick={generateResume}
              disabled={isGenerating}
              className="w-full mt-6 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              {isGenerating ? 'Generating...' : 'Generate Resume'}
            </button>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4">How it works</h3>
            <ul className="space-y-3 text-sm text-zinc-400">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>Analyzes your completed lessons and XP.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>Translates progress into professional skills.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>Formats for Applicant Tracking Systems (ATS).</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-8 min-h-[600px] relative flex flex-col">
            {isGenerating ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400">
                <Loader2 className="animate-spin mb-4 text-emerald-500" size={48} />
                <p className="text-lg font-medium">Crafting your professional story...</p>
                <p className="text-sm mt-2">Analyzing skills and generating project descriptions.</p>
              </div>
            ) : resumeContent ? (
              <>
                <div className="flex justify-end mb-6">
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 px-4 rounded-xl transition-all text-sm"
                  >
                    <Download size={16} />
                    Download Markdown
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                  <div className="prose prose-invert prose-emerald max-w-none bg-zinc-950 p-8 rounded-2xl border border-zinc-800/50">
                    <Markdown>{resumeContent}</Markdown>
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                <FileText size={64} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No resume generated yet.</p>
                <p className="text-sm mt-2">Click the button to generate your AI resume.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
