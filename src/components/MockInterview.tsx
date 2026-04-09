import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Play, Square, Loader2, Award, CheckCircle2, XCircle, Sparkles, User, Briefcase } from 'lucide-react';
import { ai, GEMINI_LIVE_MODEL, GEMINI_MODEL } from '../services/gemini';
import { Modality, LiveServerMessage } from '@google/genai';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import Markdown from 'react-markdown';

export default function MockInterview() {
  const { user, gainXP } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interviewerTranscript, setInterviewerTranscript] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const startInterview = async () => {
    try {
      setIsConnecting(true);
      setFeedback(null);
      setTranscript('');
      setInterviewerTranscript('');
      
      // Initialize Audio Context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create processor for input
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processorRef.current.onaudioprocess = (e) => {
        if (isMuted || !sessionRef.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        
        sessionRef.current.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      const session = await ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            toast.success("Interview started!");
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setIsThinking(false);
              const binary = atob(base64Audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const pcmData = new Int16Array(bytes.buffer);
              audioQueueRef.current.push(pcmData);
              if (!isPlayingRef.current) {
                playNextInQueue();
              }
            }

            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setInterviewerTranscript(prev => prev + message.serverContent!.modelTurn!.parts[0].text);
            }
            
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setInterviewerTranscript('');
              setIsThinking(false);
            }
          },
          onclose: () => {
            stopInterview();
            generateFeedback();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            toast.error("Interview encountered a connection error.");
            stopInterview();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          systemInstruction: `You are a Senior Technical Recruiter conducting a mock interview for a Junior Web Developer position.
          
          Persona:
          - Professional, encouraging, but realistic.
          - Ask 3-4 technical or behavioral questions one by one.
          - Wait for the candidate's response before asking the next question.
          - Provide brief, constructive feedback after their answer, then move to the next question.
          - End the interview after 3-4 questions by saying "Thank you for your time, that concludes our interview."
          
          Topics:
          - HTML/CSS basics
          - JavaScript fundamentals (e.g., closures, promises)
          - React basics (e.g., state, props, useEffect)
          - Behavioral (e.g., "Tell me about a time you solved a difficult bug")`,
        },
      });

      sessionRef.current = session;

    } catch (err) {
      console.error("Failed to start interview:", err);
      toast.error("Could not access microphone or connect to AI.");
      setIsConnecting(false);
    }
  };

  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;
    
    const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, 16000);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 0x7FFF;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = playNextInQueue;
    source.start();
  };

  const stopInterview = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsActive(false);
    setIsConnecting(false);
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const generateFeedback = async () => {
    if (!interviewerTranscript) return;
    
    setIsThinking(true);
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Based on the following interview transcript, provide a structured performance review for the candidate.
        
        Transcript:
        ${interviewerTranscript}
        
        Provide:
        1. **Overall Score** (out of 100)
        2. **Strengths**: What did they do well?
        3. **Areas for Improvement**: Where did they struggle?
        4. **Actionable Advice**: What should they study next?`,
      });
      
      setFeedback(response.text || 'No feedback available.');
      gainXP(100, 'Completed Mock Interview');
      toast.success('Interview feedback generated!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate feedback.');
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    return () => {
      stopInterview();
    };
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <Briefcase className="text-emerald-500" size={32} />
          AI Mock Interview
        </h1>
        <p className="text-zinc-400 mt-2 text-lg">Practice your technical and behavioral skills with our AI recruiter.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Mic size={120} />
          </div>
          
          <div className="relative z-10">
            <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center mb-6 mx-auto relative">
              <User size={40} className="text-zinc-400" />
              {isActive && (
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500 animate-ping opacity-20" />
              )}
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">
              {isActive ? 'Interview in Progress' : 'Ready to Start?'}
            </h2>
            <p className="text-zinc-400 mb-8">
              {isActive 
                ? 'Speak clearly. The AI recruiter will ask you questions and evaluate your responses.' 
                : 'Click start to begin a 5-minute mock interview for a Junior Web Developer role.'}
            </p>

            <div className="flex items-center justify-center gap-4">
              {!isActive ? (
                <button
                  onClick={startInterview}
                  disabled={isConnecting}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50"
                >
                  {isConnecting ? <Loader2 className="animate-spin" size={20} /> : <Play size={20} />}
                  Start Interview
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-4 rounded-xl transition-all ${
                      isMuted 
                        ? "bg-red-500/10 text-red-500 border border-red-500/20" 
                        : "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
                    }`}
                  >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  <button
                    onClick={() => { stopInterview(); generateFeedback(); }}
                    className="flex items-center gap-2 bg-red-500 hover:bg-red-400 text-white font-bold py-3 px-8 rounded-xl transition-all"
                  >
                    <Square size={20} />
                    End Interview
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 h-64 flex flex-col">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-500" />
              Live Transcript
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {interviewerTranscript ? (
                <div className="bg-zinc-800/50 rounded-2xl p-4 text-sm text-zinc-300 leading-relaxed">
                  <span className="font-bold text-emerald-500 block mb-1">Recruiter:</span>
                  {interviewerTranscript}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm italic">
                  Transcript will appear here...
                </div>
              )}
            </div>
          </div>

          {(feedback || isThinking) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6"
            >
              <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <Award size={16} className="text-emerald-500" />
                Interview Feedback
              </h3>
              {isThinking ? (
                <div className="flex items-center justify-center py-8 text-zinc-400 gap-3">
                  <Loader2 className="animate-spin" size={20} />
                  Generating your performance review...
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                  <Markdown>{feedback}</Markdown>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
