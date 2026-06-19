"use client";

import { useState } from "react";

import { demoStudent } from "@/lib/mock-data";
import type { StudentLogin } from "@/lib/auth/use-app-user";

type LoginScreenProps = {
  onLoginStudent: (login: StudentLogin) => Promise<void> | void;
  onLoginTeacher: (displayName: string) => Promise<void> | void;
};

type Tab = "student" | "teacher";

// Pilot only ships one demo student. Real member lookup arrives with the
// external learning API (CLAUDE_NEXT_STEPS.md Priority 8).
function resolvePilotStudent(memberId: string): StudentLogin | null {
  if (memberId.trim() === demoStudent.memberId) {
    return {
      studentId: demoStudent.id,
      memberId: demoStudent.memberId,
      displayName: demoStudent.name,
    };
  }
  return null;
}

export function LoginScreen({ onLoginStudent, onLoginTeacher }: LoginScreenProps) {
  const [tab, setTab] = useState<Tab>("student");
  const [memberId, setMemberId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitStudent() {
    if (isSubmitting) return;
    const student = resolvePilotStudent(memberId);
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
