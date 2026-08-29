import raw from "./content.json";

/** How much weight a statement carries. The assistant is required to keep these
 *  distinct - a benchmark is not a production measurement, and neither is a plan. */
export type ClaimStatus =
  | "implemented"
  | "benchmarked"
  | "measured"
  | "known limitation"
  | "planned";

export interface Claim {
  status: ClaimStatus;
  text: string;
}

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
  /** every notable statement about the project, tagged with what backs it */
  claims: Claim[];
  links: Record<string, string>;
  meta: {
    difficulty: string;
    domains: string[];
    highlights: string[];
    /** anticipated visitor questions - retrieval hints for the assistant */
    questions: string[];
  };
}
export interface SkillGroup {
  group: string;
  items: string[];
}
export interface Experience {
  role: string;
  org: string;
  period: string;
  location?: string;
  /** employer work - the assistant may only restate what's written here */
  confidential?: boolean;
  summary: string;
  points: string[];
}
export interface Achievement {
  title: string;
  detail: string;
}
export interface Content {
  name: string;
  /** canonical origin, used for canonical/OG tags and the JSON-LD Person */
  siteUrl: string;
  /** the static hero stack - what a 30-second visitor reads */
  role: string;
  credentials: string;
  focus: string;
  /** onboarding chips under the askbar - short label, full question sent on click */
  suggestedQuestions: { label: string; question: string }[];
  about: { bio: string; facts: string[]; proof: string[]; games?: string[] };
  projects: Project[];
  skills: SkillGroup[];
  experience: Experience[];
  achievements: Achievement[];
  education: { school: string; degree: string; period: string };
  /** future long-form content; empty for now, shape reserved */
  blogs: unknown[];
  contact: { email: string; github: string; linkedin: string };
  resumeUrl: string;
}

export const content = raw as unknown as Content; // JSON import widens tuples to number[]
