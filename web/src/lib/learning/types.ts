import type { LearningItem } from "../types";

export type { LearningItem };

export interface LearningProvider {
  getWrongAnswerItems(studentId: string): Promise<LearningItem[]>;
}
