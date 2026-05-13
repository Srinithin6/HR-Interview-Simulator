
export enum AppState {
  LANDING = 'LANDING',
  SETUP = 'SETUP',
  SIMULATING = 'SIMULATING',
  FEEDBACK = 'FEEDBACK'
}

export enum PersonaType {
  NURTURER = 'NURTURER',
  PRAGMATIST = 'PRAGMATIST',
  HARDBALLER = 'HARDBALLER'
}

export interface Persona {
  id: PersonaType;
  name: string;
  role: string;
  description: string;
  avatar: string;
  instruction: string;
}

export interface QuestionFeedback {
  question: string;
  answer: string;
  critique: string;
  suggestion: string;
}

export interface FeedbackData {
  score: number;
  strengths: string[];
  improvements: string[];
  overall: string;
  questionAnalysis: QuestionFeedback[];
}

export interface InterviewSession {
  role: string;
  persona: Persona;
  transcription: string[];
  videoBlob: Blob | null;
  resumeText: string;
}
