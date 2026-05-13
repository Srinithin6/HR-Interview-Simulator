
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Blob as GeminiBlob } from '@google/genai';
import { Persona, InterviewSession } from '../types';
import { Mic, MicOff, LogOut, Terminal, Cpu, Play, Volume2, Headphones, Activity, ListChecks, History } from 'lucide-react';

interface LiveInterviewProps {
  persona: Persona;
  targetRole: string;
  resumeText: string;
  onEnd: (session: InterviewSession) => void;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const LiveInterview: React.FC<LiveInterviewProps> = ({ persona, targetRole, resumeText, onEnd }) => {
  const [isReady, setIsReady] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [currentOutputTranscription, setCurrentOutputTranscription] = useState<string>("");
  const [currentInputTranscription, setCurrentInputTranscription] = useState<string>("");
  const [transcriptionHistory, setTranscriptionHistory] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
  
  const transcriptionBuffer = useRef({ input: "", output: "" });
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);

  const updateSpeakingState = useCallback(() => {
    setIsInterviewerSpeaking(sourcesRef.current.size > 0);
  }, []);

  const cleanup = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        if (session && typeof session.close === 'function') session.close();
      } catch (e) {}
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    sourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
    sourcesRef.current.clear();
    if (inputAudioCtxRef.current) await inputAudioCtxRef.current.close().catch(() => {});
    if (outputAudioCtxRef.current) await outputAudioCtxRef.current.close().catch(() => {});
    setIsLive(false);
    setIsInterviewerSpeaking(false);
  }, []);

  const handleEndSession = useCallback(async () => {
    const history = [...transcriptionHistory];
    if (transcriptionBuffer.current.input) history.push(`Candidate: ${transcriptionBuffer.current.input}`);
    if (transcriptionBuffer.current.output) history.push(`${persona.name}: ${transcriptionBuffer.current.output}`);

    const videoBlob = recordedChunksRef.current.length > 0 
      ? new Blob(recordedChunksRef.current, { type: 'video/webm' }) 
      : null;
    await cleanup();
    onEnd({
      role: targetRole,
      persona: persona,
      transcription: history,
      videoBlob: videoBlob,
      resumeText: resumeText
    });
  }, [targetRole, persona, transcriptionHistory, resumeText, onEnd, cleanup]);

  const startInterview = async () => {
    try {
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorder.start(1000);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioCtxRef.current = inputAudioContext;
      outputAudioCtxRef.current = outputAudioContext;

      const outputNode = outputAudioContext.createGain();
      outputNode.gain.value = 1.6; 
      outputNode.connect(outputAudioContext.destination);
      outputNodeRef.current = outputNode;

      await inputAudioContext.resume();
      await outputAudioContext.resume();

      const systemInstruction = `
        ${persona.instruction}
        Position: ${targetRole}
        FULL RESUME DATA (Crucial: Interview the candidate on EVERY point here): ${resumeText}
        
        MANDATORY OPERATIONAL RULES FOR THIS SESSION:
        1. INFINITE INTERVIEW MODE: You MUST NOT end the interview session. Never say "Thank you for coming" or "That's all". You are required to continue asking questions indefinitely until the user clicks the exit button.
        2. EXHAUSTIVE RESUME COVERAGE: You MUST systematically ask questions about every single section of the candidate's resume:
           - Education & Background
           - Project #1 (Specific tech, hurdles, outcomes)
           - Project #2 (Specific tech, hurdles, outcomes)
           - Technical Skills (Ask them to explain how they've used specific tools)
           - Professional Experience (Conflicts, growth, responsibilities)
        3. GRANULARITY: If you run out of things to ask from the resume, ask deeper technical or behavioral follow-up questions about their previous answers. NEVER stop probing.
        4. ENGLISH ONLY: Strictly English conversation.
        5. AUDIO MANDATORY: You must respond with audio for every turn. If the user stops talking, you must probe them with a follow-up or a new topic from the resume.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.id === 'HARDBALLER' ? 'Charon' : persona.id === 'PRAGMATIST' ? 'Puck' : 'Kore' } }
          },
          systemInstruction: systemInstruction,
          inputAudioTranscription: { },
          outputAudioTranscription: { }
        },
        callbacks: {
          onopen: async () => {
            setIsLive(true);
            setIsReady(true);
            
            const source = inputAudioContext.createMediaStreamSource(stream);
            const inputGain = inputAudioContext.createGain();
            inputGain.gain.value = 4.0; // Significant boost for voice-to-text accuracy
            
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (isMutedRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: GeminiBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then(session => {
                try { session.sendRealtimeInput({ media: pcmBlob }); } catch (err) {}
              });
            };
            
            source.connect(inputGain);
            inputGain.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (outputAudioContext.state === 'suspended') {
              await outputAudioContext.resume().catch(console.error);
            }

            if (message.serverContent?.outputTranscription) {
              transcriptionBuffer.current.output += message.serverContent.outputTranscription.text;
              setCurrentOutputTranscription(transcriptionBuffer.current.output);
            }

            if (message.serverContent?.inputTranscription) {
              transcriptionBuffer.current.input += message.serverContent.inputTranscription.text;
              setCurrentInputTranscription(transcriptionBuffer.current.input);
            }

            if (message.serverContent?.turnComplete) {
              setTranscriptionHistory(prev => {
                const items = [...prev];
                const input = transcriptionBuffer.current.input.trim();
                const output = transcriptionBuffer.current.output.trim();
                if (input) items.push(`Candidate: ${input}`);
                if (output) items.push(`${persona.name}: ${output}`);
                return items;
              });
              transcriptionBuffer.current = { input: "", output: "" };
              setCurrentInputTranscription("");
              setCurrentOutputTranscription("");
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              const buffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
              const source = outputAudioContext.createBufferSource();
              source.buffer = buffer;
              source.connect(outputNodeRef.current || outputAudioContext.destination);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              
              sourcesRef.current.add(source);
              updateSpeakingState();

              source.onended = () => {
                sourcesRef.current.delete(source);
                updateSpeakingState();
              };
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              updateSpeakingState();
            }
          },
          onerror: (e) => {
            console.error("AI System Error:", e);
            setIsLive(false);
          },
          onclose: (e) => {
            setIsLive(false);
            setIsInterviewerSpeaking(false);
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error("Device initialization failed:", err);
    }
  };

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return (
    <div className="flex flex-col h-full bg-[#020617] overflow-hidden font-sans">
      {!isReady && (
        <div className="absolute inset-0 z-[100] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-white/10 p-16 rounded-[4rem] text-center max-w-xl space-y-12 shadow-[0_40px_120px_rgba(0,0,0,1)] ring-1 ring-white/10">
            <div className="w-40 h-40 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto border-4 border-blue-500/20 shadow-inner relative">
               <div className="absolute inset-0 rounded-full animate-ping bg-blue-500/10 opacity-50"></div>
               <Volume2 size={80} className="text-blue-400" />
            </div>
            <div className="space-y-6">
              <h2 className="text-5xl font-black text-white tracking-tighter leading-none uppercase italic">START SIMULATION</h2>
              <p className="text-slate-400 text-lg font-medium leading-relaxed">
                Hardware check completed. {persona.name} is standing by to conduct an <b>exhaustive resume interview</b>. Ensure your microphone is active.
              </p>
            </div>
            <button 
              onClick={startInterview}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-8 rounded-[2rem] font-black flex items-center justify-center gap-5 transition-all active:scale-95 shadow-[0_20px_60px_rgba(59,130,246,0.5)] uppercase tracking-[0.4em] text-lg group"
            >
              <Play size={32} fill="currentColor" className="group-hover:scale-110 transition-transform" />
              Begin Session
            </button>
          </div>
        </div>
      )}

      <header className="bg-slate-900/90 backdrop-blur-3xl p-6 border-b border-white/10 flex justify-between items-center z-50 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-700 ${isLive ? 'bg-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.6)] rotate-0' : 'bg-slate-800 rotate-45'}`}>
            <Cpu className={isLive ? 'text-white animate-pulse' : 'text-slate-500'} size={32} />
          </div>
          <div>
            <h3 className="font-black text-white text-2xl tracking-tighter uppercase">{persona.name}</h3>
            <div className="flex items-center gap-3">
               <div className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
               <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.4em]">EXHAUSTIVE MODE: {targetRole}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-5">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`p-5 rounded-3xl transition-all border border-white/10 active:scale-90 shadow-lg ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
          </button>
          <button 
            onClick={handleEndSession}
            className="flex items-center gap-4 px-10 py-5 bg-red-600 hover:bg-red-500 text-white font-black rounded-[2rem] transition-all active:scale-95 text-sm uppercase shadow-[0_20px_50px_rgba(220,38,38,0.4)] tracking-[0.3em]"
          >
            <LogOut size={22} />
            <span>Finish Interview</span>
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 p-10 gap-10 overflow-hidden">
        {/* LEFT HALF: HR INTERVIEWER STAGE (Full-Height, Video Hidden) */}
        <div className={`relative rounded-[4.5rem] overflow-hidden border-4 transition-all duration-1000 bg-black h-full flex flex-col ${isInterviewerSpeaking ? 'border-blue-500 shadow-[0_0_150px_rgba(59,130,246,0.4)]' : 'border-white/5'}`}>
           <img 
             src={persona.avatar} 
             alt={persona.name} 
             className={`w-full h-full object-cover transition-all duration-[3s] transform ${isInterviewerSpeaking ? 'scale-110 brightness-110' : 'scale-100 brightness-[0.3] grayscale-[40%]'}`} 
           />
           
           {isInterviewerSpeaking && (
             <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none z-10 space-y-10">
               <div className="flex gap-5 items-end h-48">
                 {[...Array(24)].map((_, i) => (
                   <div 
                     key={i} 
                     className="w-3 bg-white rounded-full animate-vocal-bounce shadow-[0_0_30px_rgba(255,255,255,0.6)]"
                     style={{ 
                       animationDelay: `${i * 0.05}s`,
                       height: `${20 + Math.random() * 80}%`
                     }}
                   ></div>
                 ))}
               </div>
               <div className="bg-blue-600/90 backdrop-blur-2xl px-10 py-5 rounded-full border border-blue-400/50 shadow-[0_0_50px_rgba(59,130,246,0.8)]">
                 <span className="text-white text-sm font-black uppercase tracking-[0.7em] flex items-center gap-4">
                   <Activity size={24} className="animate-pulse" />
                   HR VOCAL TRANSMISSION
                 </span>
               </div>
             </div>
           )}

           <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/50 to-transparent opacity-100"></div>
           
           <div className="absolute bottom-20 left-20 right-20">
              <div className={`bg-slate-900/80 backdrop-blur-3xl p-14 rounded-[4rem] border border-white/20 transition-all duration-1000 transform ${isInterviewerSpeaking ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-70 scale-95'}`}>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-6 h-6 rounded-full ${isInterviewerSpeaking ? 'bg-blue-500 animate-ping shadow-[0_0_20px_rgba(59,130,246,0.8)]' : 'bg-slate-700'}`}></div>
                  <p className="text-blue-400 text-sm font-black uppercase tracking-[0.7em]">
                    {isInterviewerSpeaking ? 'AI_SYSTEM_RESPONDING' : 'ANALYZING_RESUME_DNA...'}
                  </p>
                </div>
                <p className="text-white text-4xl font-black leading-[1.1] italic tracking-tighter shadow-black drop-shadow-lg">
                  {currentOutputTranscription || "I am conducting a systematic deep-dive into your resume. Please introduce yourself clearly to begin."}
                </p>
              </div>
           </div>
        </div>

        {/* RIGHT HALF: FULL HEIGHT SPEECH LOGS */}
        <div className="bg-[#0f172a]/95 rounded-[4.5rem] border border-white/10 flex flex-col overflow-hidden shadow-[0_60px_150px_rgba(0,0,0,0.8)] ring-1 ring-white/10 h-full">
          <div className="p-14 border-b border-white/10 bg-slate-900/98 backdrop-blur-3xl flex items-center justify-between">
             <div className="flex items-center gap-8">
               <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 shadow-inner">
                 <Terminal size={36} className="text-emerald-400" />
               </div>
               <div>
                 <span className="text-xl font-black text-white uppercase tracking-[0.6em]">ENGLISH SPEECH LOGS</span>
                 <p className="text-[12px] text-slate-500 font-bold uppercase mt-2 flex items-center gap-3">
                   <ListChecks size={16} className="text-emerald-500" />
                   CONTINUOUS PIPELINE: ACTIVE
                 </p>
               </div>
             </div>
             <div className="bg-slate-950 px-10 py-4 rounded-full border border-white/10 shadow-2xl">
               <div className="flex items-center gap-4">
                 <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse"></div>
                 <span className="text-sm font-black text-emerald-500 uppercase tracking-widest">LIVE TRANSCRIPT</span>
               </div>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-16 space-y-16 font-mono custom-scrollbar bg-[#020617]/40">
            {transcriptionHistory.map((text, idx) => {
              const isAI = text.includes(persona.name);
              return (
                <div key={idx} className={`flex gap-12 animate-in slide-in-from-bottom-12 fade-in duration-1000`}>
                  <div className={`flex-1 p-12 rounded-[3.5rem] border transition-all hover:bg-white/5 ${isAI ? 'bg-blue-500/5 border-blue-500/20 text-slate-300' : 'bg-emerald-500/5 border-emerald-500/20 text-white shadow-[0_20px_60px_rgba(16,185,129,0.08)]'}`}>
                    <div className="flex items-center gap-5 mb-8">
                       <span className={`text-[12px] font-black uppercase px-4 py-2 rounded-xl ${isAI ? 'bg-blue-500/20 text-blue-400 border border-blue-400/20' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/20'}`}>
                         {isAI ? 'HR_AI_SYSTEM' : 'CANDIDATE_INPUT'}
                       </span>
                       <span className="text-[11px] text-slate-600 font-bold flex items-center gap-3">
                         <History size={14} />
                         SEQ_{idx + 1}
                       </span>
                    </div>
                    <p className="leading-relaxed text-2xl font-medium tracking-tight">
                      {text}
                    </p>
                  </div>
                </div>
              );
            })}
            
            {(currentInputTranscription || currentOutputTranscription) && (
              <div className="space-y-12">
                {currentInputTranscription && (
                  <div className="flex gap-12 animate-pulse">
                    <div className="flex-1 p-12 rounded-[3.5rem] border bg-emerald-500/10 border-emerald-500/50 text-emerald-300 italic shadow-[0_0_100px_rgba(16,185,129,0.15)]">
                      <div className="flex items-center gap-4 mb-6">
                         <Activity size={20} className="text-emerald-400" />
                         <span className="text-[12px] font-black uppercase tracking-[0.4em]">CANDIDATE SPEAKING...</span>
                      </div>
                      <p className="text-3xl font-black">{currentInputTranscription}</p>
                    </div>
                  </div>
                )}
                {currentOutputTranscription && (
                  <div className="flex gap-12">
                    <div className="flex-1 p-12 rounded-[3.5rem] border bg-blue-500/10 border-blue-500/50 text-blue-300 italic shadow-[0_0_100px_rgba(59,130,246,0.15)]">
                      <div className="flex items-center gap-4 mb-6">
                         <Volume2 size={20} className="text-blue-400" />
                         <span className="text-[12px] font-black uppercase tracking-[0.4em]">AI RESPONDING...</span>
                      </div>
                      <p className="text-3xl font-black">{currentOutputTranscription}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {transcriptionHistory.length === 0 && !currentInputTranscription && !currentOutputTranscription && (
              <div className="h-full flex flex-col items-center justify-center opacity-10 space-y-20">
                <div className="w-80 h-80 border-[10px] border-white/5 rounded-[5rem] flex items-center justify-center border-dashed animate-spin-slow">
                   <Mic size={140} className="text-white" />
                </div>
                <div className="text-center space-y-8">
                   <p className="font-black tracking-[1.2em] uppercase text-2xl text-white">SYSTEM READY</p>
                   <p className="text-sm text-slate-500 uppercase tracking-[0.3em] leading-loose max-w-md mx-auto font-bold">
                     Awaiting English vocal input. Every part of your resume will be analyzed systematically.
                   </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        @keyframes vocal-bounce {
          0%, 100% { transform: scaleY(0.4); opacity: 0.2; }
          50% { transform: scaleY(1.8); opacity: 1; }
        }
        .animate-vocal-bounce {
          animation: vocal-bounce 0.4s ease-in-out infinite;
          transform-origin: bottom;
        }

        .animate-spin-slow { animation: spin 50s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .custom-scrollbar::-webkit-scrollbar { width: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 50px; border: 4px solid transparent; background-clip: content-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); border: 4px solid transparent; background-clip: content-box; }
      `}</style>
    </div>
  );
};

export default LiveInterview;
