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

// 소속 센터·BM. 2026-09 변경으로 회원·교사 로그인은 memberships 배열로 내려온다
// (소속이 1개여도 배열). 센터장 로그인만 기존처럼 평면 필드 1건이다.
export type StudyMembershipData = {
  agencyNo?: string | number;
  agencyName?: string;
  bmName?: string | null;
};

// 로그인 응답 data: 토큰 + 사용자 유형별 profile 필드.
// USER:    userId, customerNo, customerName, memberships[]
// TEACHER: userId, teacherNo, teacherName, memberships[]
// CENTER:  userId, agencyNo, agencyName, bmName (teacherNo 없음)
export type StudyLoginData = StudyTokenPair & {
  memberships?: StudyMembershipData[];
  userId?: string;
  customerNo?: string | number;
  customerName?: string;
  teacherNo?: string | number;
  teacherName?: string;
  agencyNo?: string | number;
  agencyName?: string;
  bmName?: string;
};

export type StudyMembership = {
  agencyNo?: string;
  agencyName?: string;
  bmName?: string;
};

// 화면 표시/식별에 필요한 최소 profile (토큰 제외).
// agencyNo/agencyName/bmName은 첫 소속(호환용)이고, 전체는 memberships를 본다.
export type StudyProfile = {
  memberships: StudyMembership[];
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

// GET /api/teacher/customers — 교사가 담당하는 회원 목록 항목
export type TeacherCustomer = {
  teacherNo?: number | string;
  agencyNo?: number | string;
  customerNo: number | string;
  customerName?: string;
  schoolYear?: number;
  usingPerfectCare?: boolean;
  // 회원별 BM. 없으면 교사 memberships의 같은 센터 BM으로 보완한다.
  bmName?: string | null;
};

const str = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));

function toMembership(raw: StudyMembershipData): StudyMembership {
  return { agencyNo: str(raw.agencyNo), agencyName: str(raw.agencyName), bmName: str(raw.bmName) };
}

export function extractProfile(data: StudyLoginData): StudyProfile {
  const memberships = Array.isArray(data.memberships)
    ? data.memberships.map(toMembership)
    : data.agencyNo !== undefined || data.bmName !== undefined
      ? [toMembership({ agencyNo: data.agencyNo, agencyName: data.agencyName, bmName: data.bmName })]
      : [];
  const first = memberships[0];
  return {
    userId: str(data.userId),
    customerNo: str(data.customerNo),
    customerName: str(data.customerName),
    teacherNo: str(data.teacherNo),
    teacherName: str(data.teacherName),
    agencyNo: first?.agencyNo,
    agencyName: first?.agencyName,
    bmName: first?.bmName,
    memberships,
  };
}

// 학원 BM(숲·IGSE)은 학원 학습 API, 그 외 WYC 계열(교실·웰·우영)은 Smart Befly API.
// BM을 모르면(누락·null) 두 API를 모두 조회해 누락을 막는다.
const ACADEMY_BMS = new Set(["FOREST", "IGSE"]);

export type LearningSources = { smartBefly: boolean; academy: boolean };

export function learningSourcesForBms(bms: (string | null | undefined)[] | undefined): LearningSources {
  const known = (bms ?? []).map((bm) => bm?.trim().toUpperCase()).filter((bm): bm is string => Boolean(bm));
  if (known.length === 0) return { smartBefly: true, academy: true };
  return {
    smartBefly: known.some((bm) => !ACADEMY_BMS.has(bm)),
    academy: known.some((bm) => ACADEMY_BMS.has(bm)),
  };
}

export function bmsOf(memberships: StudyMembership[] | undefined): string[] {
  return (memberships ?? []).map((m) => m.bmName).filter((bm): bm is string => Boolean(bm));
}
