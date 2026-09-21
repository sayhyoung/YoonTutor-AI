import type {
  CallHistoryEntry,
  CallPlan,
  CallReport,
  TeacherScheduleSettings,
} from "@yoon-call/shared";

import {
  previewHistory,
  previewPlan,
  previewReport,
  previewSchedule,
} from "./mock";

export type CallReviewSnapshot = {
  plan: CallPlan;
  report: CallReport;
  schedule: TeacherScheduleSettings;
  history: CallHistoryEntry[];
};

export interface CallReviewRepository {
  load(): Promise<CallReviewSnapshot>;
}

export const previewCallReviewRepository: CallReviewRepository = {
  async load() {
    return {
      plan: previewPlan,
      report: previewReport,
      schedule: previewSchedule,
      history: previewHistory,
    };
  },
};
