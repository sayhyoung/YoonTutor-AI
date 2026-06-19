import type { LearningItem } from "../types";
import type { LearningProvider } from "./types";

// Thin placeholder until the external learning API contract is finalized (see
// CLAUDE_NEXT_STEPS.md Priority 8: base URL, auth, endpoints, response schema).
export const externalLearningApiProvider: LearningProvider = {
  async getWrongAnswerItems(): Promise<LearningItem[]> {
    throw new Error("External learning API provider is not implemented yet");
  },
};
