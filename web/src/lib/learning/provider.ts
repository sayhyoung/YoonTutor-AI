import type { LearningItem, LearningSource } from "../types";
import type { LearningProvider } from "./types";
import { mockLearningProvider } from "./mock-provider";
import { externalLearningApiProvider } from "./external-api-provider";

export function getLearningSource(): LearningSource {
  // 클라이언트에서도 판별 가능해야 하므로 NEXT_PUBLIC_ 플래그를 우선 사용한다.
  // (LEARNING_API_BASE_URL은 서버 전용이라 브라우저에서는 보이지 않음)
  const flag = process.env.NEXT_PUBLIC_LEARNING_SOURCE;
  if (flag === "external-api" || flag === "external") return "external-api";
  if (flag === "mock") return "mock";

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
