// study-api (회원 데이터 API) 공통 타입.
// 레퍼런스: data api/study-api_프론트엔드_JWT_연동_가이드_v1.0.docx, _에러코드_명세서_v1.0.docx

export type StudyRole = "student" | "teacher" | "center";

// 성공 응답 공통 wrapper. 실제 페이로드는 data에 들어온다.
export type StudyEnvelope<T> = {
  code: string;
  message: string;
  data: T;
};

// 에러 응답 형식: application/problem+json
export type StudyProblem = {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  errorCode?: string;
};

// 로그인/재발급 응답의 토큰 부분 (모든 로그인 유형 공통).
export type StudyTokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  accessTokenExpiresIn: number; // 초
  refreshTokenExpiresIn: number; // 초
};

// 로그인 응답 data: 토큰 + 사용자 유형별 profile 필드(평면 구조).
// USER:    userId, customerNo, customerName, agencyNo, agencyName, bmName
// TEACHER/CENTER: userId, teacherNo, teacherName, agencyNo, agencyName, bmName
export type StudyLoginData = StudyTokenPair & {
  userId?: string;
  customerNo?: string | number;
  customerName?: string;
  teacherNo?: string | number;
  teacherName?: string;
  agencyNo?: string | number;
  agencyName?: string;
  bmName?: string;
};

// 화면 표시/식별에 필요한 최소 profile (토큰 제외).
export type StudyProfile = {
  userId?: string;
  customerNo?: string;
  customerName?: string;
  teacherNo?: string;
  teacherName?: string;
  agencyNo?: string;
  agencyName?: string;
  bmName?: string;
};

// ---- 학습조회(study results) 응답 타입 ----
// 출처: Swagger /api/study/results/smart-befly, /4skill-befly
// (data api/slack chat.pdf + 개발자 공유 Swagger 스키마/Example)

// 단어 결과 (smart-befly, wp)
export type WordResult = {
  isReview?: boolean;
  order?: number;
  question?: string; // 영어 단어 (예 "America")
  meaning?: string; // 한국어 뜻 (예 "미국")
  customerAnswer?: string;
  isCorrect?: boolean;
};

// 문장 결과 (smart-befly, sp)
export type SentenceResult = {
  isReview?: boolean;
  order?: number;
  correctAnswer?: string; // 정답 영어 문장 (예 "How are you?")
  customerAnswer?: string;
  isCorrect?: boolean;
};

// 선택형 평가 결과 (4skill: listeningReading / kwonAssessment / seriesAssessment)
export type ChoiceResult = {
  order?: number;
  substance?: string; // 문항 핵심 내용
  correctAnswer?: string; // 정답 (보기 번호 등)
  customerAnswer?: string;
  isCorrect?: boolean;
  secondCustomerAnswer?: string;
  secondIsCorrect?: boolean;
};

// 한 학습 차시(lesson) 단위 결과. smart-befly/4skill-befly 필드를 합집합으로 둔다.
export type StudyResultEntry = {
  reStudyCnt?: number;
  studyDateTime?: string;
  // smart-befly
  bookName?: string;
  lessonName?: string;
  wordResults?: WordResult[];
  sentenceResults?: SentenceResult[];
  // 4skill-befly
  productNo?: number;
  productName?: string;
  seriesNo?: number;
  seriesName?: string;
  seriesContraction?: string;
  studyUnitCode?: string;
  listeningReadingResults?: ChoiceResult[];
  kwonAssessmentResults?: ChoiceResult[];
  seriesAssessmentResults?: ChoiceResult[];
  speakingResults?: { correctAnswer?: string }[];
  writingResults?: { correctAnswer?: string; customerAnswer?: string }[];
};

// CommonResponseStudyResultQueryResponse.data
// 단일일자 조회: studyDate. 기간 조회: studyStartDate/studyEndDate. studyResults 구조는 동일.
export type StudyQueryData = {
  customerNo: number | string;
  customerName?: string;
  studyDate?: string;
  studyStartDate?: string;
  studyEndDate?: string;
  studyResults?: StudyResultEntry[];
};

export function extractProfile(data: StudyLoginData): StudyProfile {
  const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  return {
    userId: str(data.userId),
    customerNo: str(data.customerNo),
    customerName: str(data.customerName),
    teacherNo: str(data.teacherNo),
    teacherName: str(data.teacherName),
    agencyNo: str(data.agencyNo),
    agencyName: str(data.agencyName),
    bmName: str(data.bmName),
  };
}
