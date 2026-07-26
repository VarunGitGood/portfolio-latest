import raw from "./content.json";

export interface Project {
  id: string;
  title: string;
  blurb: string;
  /** longer description shown when the row is expanded in the stream */
  details: string;
  stack: string[];
  /** normalized [x, y] region the bg traffic converges toward */
  region: [number, number];
  /* --- AI-facing engineering depth (prompt-stuffed via functions/ask.ts) --- */
  architecture: string;
  design_decisions: string[];
  tradeoffs: string[];
  challenges: string[];
  improvements: string[];
  links: Record<string, string>;
  meta: {
    difficulty: string;
    domains: string[];
    highlights: string[];
    /** anticipated visitor questions — retrieval hints for the assistant */
    questions: string[];
  };
}
export interface SkillGroup {
  group: string;
  items: [string, number][];
}
export interface Experience {
  role: string;
  org: string;
  period: string;
  summary: string;
}
export interface Content {
  name: string;
  taglines: string[];
  /** onboarding chips under the askbar */
  suggestedQuestions: string[];
  about: { bio: string; facts: string[]; games: string[] };
  projects: Project[];
  skills: SkillGroup[];
  experience: Experience[];
  /** future long-form content; empty for now, shape reserved */
  blogs: unknown[];
  contact: { email: string; github: string; linkedin: string };
  resumeUrl: string;
}

export const content = raw as unknown as Content; // JSON import widens tuples to number[]
