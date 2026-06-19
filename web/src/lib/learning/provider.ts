import type { LearningItem, LearningSource } from "../types";
import type { LearningProvider } from "./types";
import { mockLearningProvider } from "./mock-provider";
import { externalLearningApiProvider } from "./external-api-provider";

export function getLearningSource(): LearningSource {
  const baseUrl = process.env.LEARNING_API_BASE_URL;
  return baseUrl && baseUrl.trim().length > 0 ? "external-api" : "mock";
}

export function getLearningProvider(): LearningProvider {
  return getLearningSource() === "external-api"
    ? externalLearningApiProvider
    : mockLearningProvider;
}

export function getWrongAnswerItems(studentId: string): Promise<LearningItem[]> {
  return getLearningProvider().getWrongAnswerItems(studentId);
}
