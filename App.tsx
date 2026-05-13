
import React, { useState, useRef, useEffect } from 'react';
import { AppState, Persona, InterviewSession, FeedbackData } from './types';
import { PERSONAS } from './constants';
import { generateFeedback } from './services/geminiService';
import LiveInterview from './components/LiveInterview';
import { 
  Users, 
  Briefcase, 
  ChevronRight, 
  Play, 
  CheckCircle, 
  Target, 
  RefreshCcw,
  Sparkles,
  FileText,
  Video as VideoIcon,
  MessageSquare,
  AlertCircle,
  Quote
} from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LANDING);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [targetRole, setTargetRole] = useState<string>('Software Engineer Intern');
  const [resumeText, setResumeText] = useState<string>('');
  const [sessionResults, setSessionResults] = useState<InterviewSession | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const startSetup = () => setAppState(AppState.SETUP);
  const startSimulation = () => {
    if (!resumeText.trim()) {
      alert("Please provide your resume details first.");
      return;
    }
    setAppState(AppState.SIMULATING);
  };

  const handleEndSimulation = async (session: InterviewSession) => {
    setSessionResults(session);
    if (session.videoBlob) {
      setVideoUrl(URL.createObjectURL(session.videoBlob));
    }
    setAppState(AppState.FEEDBACK);
    setIsGeneratingFeedback(true);
    
    const transcriptText = session.transcription.join('\n');
    if (transcriptText) {
      const data = await generateFeedback(session.role, session.resumeText, session.persona.name, transcriptText);
      setFeedback(data);
    }
    setIsGeneratingFeedback(false);
  };

  const renderLanding = () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-8 bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 mb-4 animate-bounce">
          <Sparkles size={16} />
          <span className="text-xs font-bold uppercase tracking-widest">Self-Development HR AI</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight leading-tight">
          Verify Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Presentation</span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          The first HR simulator that lets you watch your performance back. Upload your resume, record your interview, and get question-by-question coaching.
        </p>
      </div>

      <button 
        onClick={startSetup}
        className="group flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-lg transition-all hover:scale-105 shadow-xl shadow-blue-600/20"
      >
        <Play fill="currentColor" size={20} />
        Start Career Growth
        <ChevronRight className="group-hover:translate-x-1 transition-transform" />
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 max-w-5xl">
        {[
          { icon: <FileText className="text-blue-400" />, title: "Resume Aware", desc: "Questions tailored directly to your student experience." },
          { icon: <VideoIcon className="text-emerald-400" />, title: "Self-Verification", desc: "Watch yourself back to analyze body language and tone." },
          { icon: <MessageSquare className="text-purple-400" />, title: "Granular Review", desc: "Specific critique for every single response given." }
        ].map((feat, i) => (
          <div key={i} className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 text-left">
            <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center mb-4">{feat.icon}</div>
            <h3 className="text-lg font-bold text-white mb-2">{feat.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSetup = () => (
    <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Prepare Session</h2>
            <p className="text-slate-400">Provide your background for a tailored experience.</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Briefcase size={16} className="text-blue-400" />
                Target Job Position
              </label>
              <input 
                type="text" 
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="e.g. Data Science Intern"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <FileText size={16} className="text-emerald-400" />
                Paste Resume Details
              </label>
              <textarea 
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={8}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm resize-none"
                placeholder="Paste your education, skills, and projects here..."
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Users size={16} className="text-purple-400" />
            Interview Challenge Level
          </label>
          <div className="grid grid-cols-1 gap-4">
            {PERSONAS.map(p => (
              <button 
                key={p.id}
                onClick={() => setSelectedPersona(p)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${selectedPersona.id === p.id ? 'bg-blue-600/10 border-blue-500' : 'bg-slate-900 border-slate-800'}`}
              >
                <img src={p.avatar} className="w-12 h-12 rounded-full object-cover" alt={p.name} />
                <div className="flex-1">
                  <h4 className="font-bold text-white">{p.name}</h4>
                  <p className="text-xs text-slate-400">{p.description}</p>
                </div>
              </button>
            ))}
          </div>

          <button 
            onClick={startSimulation}
            disabled={!resumeText.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-lg transition-all shadow-xl flex items-center justify-center gap-2"
          >
            Start Recorded Session
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderFeedback = () => (
    <div className="min-h-screen bg-[#0a0f1d] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-900/40 p-8 rounded-[3rem] border border-white/5 shadow-2xl">
          <div className="text-center md:text-left">
            <h2 className="text-4xl font-black text-white tracking-tight">Performance Deep-Dive</h2>
            <p className="text-slate-500 mt-2 font-medium uppercase text-xs tracking-[0.2em]">Session Report: {targetRole}</p>
          </div>
          <button 
            onClick={() => setAppState(AppState.SETUP)}
            className="flex items-center gap-3 px-10 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black transition-all border border-white/5 shadow-xl uppercase text-xs tracking-widest"
          >
            <RefreshCcw size={18} />
            Reset Practice
          </button>
        </div>

        {isGeneratingFeedback ? (
          <div className="bg-slate-900/50 rounded-[4rem] border border-white/5 p-32 text-center space-y-10 shadow-inner">
            <div className="w-24 h-24 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_30px_rgba(59,130,246,0.5)]"></div>
            <div className="space-y-4">
              <h3 className="text-2xl font-black text-white uppercase tracking-widest">Generating Your DNA Report</h3>
              <p className="text-slate-500 max-w-md mx-auto leading-relaxed">Cross-referencing your vocal responses with the {targetRole} job description and your specific resume projects.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
            {/* Left: Video and Scoring */}
            <div className="xl:col-span-4 space-y-8">
              <div className="bg-slate-900 rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl relative">
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <VideoIcon size={20} className="text-red-500" />
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Self-Review Tape</span>
                  </div>
                  <div className="px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full">
                    <span className="text-[8px] font-black text-red-500 uppercase">Secure Storage</span>
                  </div>
                </div>
                {videoUrl && (
                  <video src={videoUrl} controls className="w-full aspect-video bg-black" />
                )}
                <div className="p-10 text-center bg-gradient-to-b from-transparent to-blue-500/5">
                   <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.3em] mb-4">Presentation Index</p>
                   <div className="text-8xl font-black text-white tracking-tighter shadow-blue-500/20 drop-shadow-2xl">{feedback?.score || 0}<span className="text-2xl text-blue-500">%</span></div>
                   <div className="w-full bg-slate-800 h-1 rounded-full mt-6 overflow-hidden">
                      <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${feedback?.score}%` }}></div>
                   </div>
                </div>
              </div>

              <div className="bg-slate-900 p-10 rounded-[3rem] border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Target size={120} />
                </div>
                <h4 className="text-white font-black mb-6 flex items-center gap-3 uppercase text-xs tracking-widest">
                   <Sparkles size={18} className="text-purple-400" />
                   AI Evaluator Note
                </h4>
                <p className="text-slate-300 leading-relaxed italic text-lg font-medium border-l-4 border-purple-500/50 pl-8">
                  "{feedback?.overall}"
                </p>
              </div>
            </div>

            {/* Right: Question by Question Review */}
            <div className="xl:col-span-8 space-y-10">
              <div className="flex items-center justify-between">
                <h3 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                  <CheckCircle className="text-emerald-400" size={32} />
                  Correction Ledger
                </h3>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{feedback?.questionAnalysis.length} Observations</span>
              </div>
              
              <div className="space-y-8 max-h-[1200px] overflow-y-auto pr-6 custom-scrollbar">
                {feedback?.questionAnalysis.map((item, idx) => (
                  <div key={idx} className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-[2.5rem] overflow-hidden animate-in slide-in-from-right-10 duration-700" style={{ animationDelay: `${idx * 150}ms` }}>
                    <div className="p-8 bg-slate-900/80 border-b border-white/5 flex items-start gap-6">
                       <span className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-black text-xs shrink-0">#{idx + 1}</span>
                       <div className="space-y-1">
                          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">HR Question</p>
                          <p className="text-slate-100 font-bold text-xl leading-snug">{item.question}</p>
                       </div>
                    </div>
                    <div className="p-8 space-y-8">
                       <div className="relative">
                         <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/20 rounded-full"></div>
                         <div className="pl-8 space-y-2">
                            <span className="text-[10px] text-emerald-500/60 font-black uppercase tracking-widest flex items-center gap-2">
                               <MessageSquare size={12} />
                               Your Transcribed Speech
                            </span>
                            <p className="text-slate-200 text-lg italic leading-relaxed font-medium">"{item.answer || "Silence captured."}"</p>
                         </div>
                       </div>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="bg-red-500/5 p-8 rounded-[2rem] border border-red-500/10 shadow-xl">
                            <span className="text-[10px] text-red-400/70 font-black uppercase tracking-widest block mb-3">Critique</span>
                            <p className="text-sm text-slate-300 leading-relaxed font-medium">{item.critique}</p>
                         </div>
                         <div className="bg-blue-500/5 p-8 rounded-[2rem] border border-blue-500/20 shadow-xl relative overflow-hidden">
                            <div className="absolute -top-2 -right-2 opacity-10">
                               <Quote size={60} />
                            </div>
                            <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest block mb-3 flex items-center gap-2">
                               <Sparkles size={12} />
                               Professional Re-Phrasing
                            </span>
                            <p className="text-sm text-white leading-relaxed font-black">{item.suggestion}</p>
                         </div>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0f1d] selection:bg-blue-500/30 selection:text-white">
      {appState === AppState.LANDING && renderLanding()}
      {appState === AppState.SETUP && renderSetup()}
      {appState === AppState.SIMULATING && (
        <LiveInterview 
          persona={selectedPersona} 
          targetRole={targetRole} 
          resumeText={resumeText}
          onEnd={handleEndSimulation} 
        />
      )}
      {appState === AppState.FEEDBACK && renderFeedback()}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 50px; }
      `}</style>
    </div>
  );
};

export default App;
