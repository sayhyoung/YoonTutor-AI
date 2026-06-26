"use client";

import { useState } from "react";

import { demoStudent } from "@/lib/mock-data";
import { getLearningSource } from "@/lib/learning/provider";
import type { StudentLogin, StudyCredentials } from "@/lib/auth/use-app-user";

type LoginScreenProps = {
  onLoginStudent: (login: StudentLogin) => Promise<void> | void;
  onLoginStudentCredentials: (credentials: StudyCredentials) => Promise<void> | void;
  onLoginTeacher: (displayName: string) => Promise<void> | void;
};

type Tab = "student" | "teacher";

// mock 모드 데모 회원번호(1111) → 데모 학생.
function resolveDemoStudent(memberId: string): StudentLogin | null {
  const id = memberId.trim();
  if (id && id === demoStudent.memberId) {
    return {
      studentId: demoStudent.id,
      memberId: demoStudent.memberId,
      displayName: demoStudent.name,
    };
  }
  return null;
}

export function LoginScreen({
  onLoginStudent,
  onLoginStudentCredentials,
  onLoginTeacher,
}: LoginScreenProps) {
  // external 모드(study-api 실연동): 아이디/비밀번호로 JWT 로그인.
  // mock 모드(데모): 회원번호 1111만 허용.
  const isExternal = getLearningSource() === "external-api";
  const [tab, setTab] = useState<Tab>("student");
  const [memberId, setMemberId] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitStudent() {
    if (isSubmitting) return;

    if (isExternal) {
      if (!userId.trim() || !password) {
        setError("아이디와 비밀번호를 입력해줘.");
        return;
      }
      setError("");
      setIsSubmitting(true);
      try {
        await onLoginStudentCredentials({ userId: userId.trim(), password });
      } catch (e) {
        setError(e instanceof Error ? e.message : "로그인에 실패했어.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const student = resolveDemoStudent(memberId);
    if (!student) {
      setError(`회원번호를 확인해줘. (파일럿 데모 번호: ${demoStudent.memberId})`);
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await onLoginStudent(student);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitTeacher() {
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      await onLoginTeacher(teacherName.trim() || "선생님");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">Y</div>
          <div>
            <h1 className="brand-title">윤선생 AI 코치</h1>
            <p className="auth-subtitle">AI 복습 코칭 파일럿에 로그인</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === "student" ? "active" : ""}`}
            onClick={() => {
              setTab("student");
              setError("");
            }}
          >
            학생
          </button>
          <button
            className={`auth-tab ${tab === "teacher" ? "active" : ""}`}
            onClick={() => {
              setTab("teacher");
              setError("");
            }}
          >
            교사
          </button>
        </div>

        {tab === "student" ? (
          <div className="auth-body">
            {isExternal ? (
              <>
                <label className="auth-field">
                  <span>아이디</span>
                  <input
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitStudent();
                    }}
                    placeholder="베플리 아이디"
                    autoFocus
                  />
                </label>
                <label className="auth-field">
                  <span>비밀번호</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitStudent();
                    }}
                    placeholder="비밀번호"
                  />
                </label>
              </>
            ) : (
              <label className="auth-field">
                <span>회원번호</span>
                <input
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitStudent();
                  }}
                  placeholder="예: 1111"
                  inputMode="numeric"
                  autoFocus
                />
              </label>
            )}
            <button
              className="button primary auth-submit"
              onClick={submitStudent}
              disabled={isSubmitting}
            >
              {isSubmitting ? "입장 중…" : "코칭룸 입장"}
            </button>
          </div>
        ) : (
          <div className="auth-body">
            <label className="auth-field">
              <span>이름 (선택)</span>
              <input
                value={teacherName}
                onChange={(event) => setTeacherName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitTeacher();
                }}
                placeholder="예: 김선생"
                autoFocus
              />
            </label>
            <button
              className="button primary auth-submit"
              onClick={submitTeacher}
              disabled={isSubmitting}
            >
              {isSubmitting ? "입장 중…" : "대시보드 입장"}
            </button>
          </div>
        )}

        {error ? <p className="auth-error">{error}</p> : null}
      </div>
    </div>
  );
}
