import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, X, Loader2, MessageSquare } from 'lucide-react';
import { ai, GEMINI_LIVE_MODEL } from '../services/gemini';
import { Modality, LiveServerMessage } from '@google/genai';
import { toast } from 'sonner';

export default function BuddyLive({ hidden = false }: { hidden?: boolean }) {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [buddyTranscript, setBuddyTranscript] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const startSession = async () => {
    try {
      setIsConnecting(true);
      
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
        // Convert Float32 to Int16
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        // Convert to base64
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        
        sessionRef.current.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      // Connect to Gemini Live
      const session = await ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            toast.success("Buddy is listening!");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
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

            // Handle transcriptions
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setBuddyTranscript(prev => prev + message.serverContent!.modelTurn!.parts[0].text);
            }
            
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setBuddyTranscript('');
              setIsThinking(false);
            }
          },
          onclose: () => {
            stopSession();
            toast.info("Buddy session ended.");
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            toast.error("Buddy encountered a connection error.");
            stopSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are 'Buddy', the Tech4Dummies AI Learning Assistant. You are having a real-time voice conversation with a student.
          
          Persona:
          - Friendly, patient, and encouraging.
          - Uses simple analogies (e.g., "Think of a variable like a labeled box").
          - Avoids overly technical jargon unless explaining it.
          - Always refers to yourself as Buddy.
          - Keeps responses concise (under 3 sentences) for better conversation flow.
          
          Context:
          - You are part of the Tech4Dummies platform, which teaches web development (HTML, CSS, JS, React).
          - You can help with coding assignments, explain concepts, or just provide motivation.`,
        },
      });

      sessionRef.current = session;

    } catch (err) {
      console.error("Failed to start Buddy Live:", err);
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

  const stopSession = () => {
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
    setBuddyTranscript('');
  };

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  if (hidden) return null;

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-72 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl shadow-black/50"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Sparkles size={20} className="text-black" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-zinc-900 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Buddy Live</h4>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                    {isThinking ? "Thinking..." : "Connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <MessageSquare size={18} />
                </button>
                <button 
                  onClick={stopSession}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {!isMinimized && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4">
                    <div className="h-24 bg-zinc-950/50 rounded-2xl p-4 overflow-y-auto custom-scrollbar">
                      <p className="text-xs text-zinc-400 leading-relaxed italic">
                        {buddyTranscript || "Buddy is listening... Go ahead and speak!"}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-4">
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`p-4 rounded-2xl transition-all ${
                          isMuted 
                            ? "bg-red-500/10 text-red-500 border border-red-500/20" 
                            : "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
                        }`}
                      >
                        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                      
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <motion.div
                            key={i}
                            animate={{
                              height: isMuted ? 4 : [8, 16, 8],
                            }}
                            transition={{
                              repeat: Infinity,
                              duration: 0.5,
                              delay: i * 0.1,
                            }}
                            className="w-1 bg-emerald-500 rounded-full"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={isActive ? stopSession : startSession}
        disabled={isConnecting}
        className={`relative group p-5 rounded-full shadow-2xl transition-all ${
          isActive 
            ? "bg-red-500 text-white" 
            : "bg-emerald-500 text-black hover:bg-emerald-400"
        }`}
      >
        {isConnecting ? (
          <Loader2 className="animate-spin" size={24} />
        ) : isActive ? (
          <X size={24} />
        ) : (
          <Mic size={24} />
        )}
        
        {!isActive && !isConnecting && (
          <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-4 py-2 bg-zinc-900 border border-zinc-800 text-white text-xs font-bold rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Talk to Buddy
          </div>
        )}
      </motion.button>
    </div>
  );
}
