
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateFeedback = async (role: string, resumeText: string, personaName: string, transcript: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
      Analyze this HR Interview Session. 
      Role: ${role}
      Candidate Resume: ${resumeText}
      Interviewer: ${personaName}
      
      Full Transcript:
      ${transcript}

      INSTRUCTIONS:
      1. Group the conversation into Question and Answer pairs.
      2. Analyze the candidate's verbal response (the "Answer").
      3. Provide a "Critique" focusing on whether they used their resume experience effectively.
      4. Provide a "Suggestion" which is a RE-WRITTEN, high-impact professional version of what they should have said.
      5. Strictly output JSON in the specified schema.

      Return JSON:
      {
        "overall": "High-level summary of the interview performance",
        "score": 0-100,
        "strengths": ["list of 3 key strengths"],
        "improvements": ["list of 3 key areas for improvement"],
        "questionAnalysis": [
          {
            "question": "The exact question asked by the HR AI",
            "answer": "The exact text transcribed from the candidate's voice",
            "critique": "Analysis of the candidate's tone, content, and accuracy based on their resume.",
            "suggestion": "A corrected, better phrased, and professional version of the response."
          }
        ]
      }
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overall: { type: Type.STRING },
          score: { type: Type.NUMBER },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          questionAnalysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                critique: { type: Type.STRING },
                suggestion: { type: Type.STRING }
              },
              required: ["question", "answer", "critique", "suggestion"]
            }
          }
        },
        required: ["overall", "score", "strengths", "improvements", "questionAnalysis"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse feedback JSON", e);
    return null;
  }
};
