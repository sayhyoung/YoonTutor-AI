# CLAUDE.md — YoonTutor-AI 작업 가이드

Claude Code가 이 저장소에서 작업할 때 항상 지켜야 할 규칙. (Anthropic Usage Policy 자동 분류기 오탐 방지 + 보안)

## 절대 금지 — 실 자격증명/개인정보를 컨텍스트에 넣지 말 것

study-api 연동은 "로그인 자격증명 + 회원번호로 개인 학습데이터 조회" 패턴이라,
실제 값을 프롬프트·명령어·로그에 그대로 노출하면 안전 분류기가 응답 전체를 차단할 수 있다
("API Error: ... violates our Usage Policy"). 또한 학생 개인정보 보호 의무가 있다.

- 실제 비밀번호/아이디(예: `M08001`)를 명령어나 메시지에 평문으로 쓰지 말 것 → 환경변수나 stdin으로만 전달.
- 실제 회원번호(`customerNo`, 예: `20001681`)를 URL·로그에 박지 말 것 → 플레이스홀더 사용.
- accessToken/refreshToken을 출력(`echo`, `console.log`)하지 말 것.
- `.env.local` 의 시크릿 값을 print/commit 하지 말 것.

## 테스트 시 사용할 플레이스홀더

실값 대신 아래 표기를 사용하고, 실제 값은 셸 환경변수로만 주입한다.

| 항목 | 프롬프트/문서 표기 | 실행 시 주입 |
|---|---|---|
| 학생 아이디 | `<TEST_USER>` | `$TEST_USER` |
| 비밀번호 | `<TEST_PW>` | `$TEST_PW` (stdin/env, 명령어 평문 금지) |
| 회원번호 | `<CUSTOMER_NO>` | `$CUSTOMER_NO` |
| 토큰 | `<ACCESS_TOKEN>` | 쿠키/env, 출력 금지 |

예) 로그인 점검:
```bash
curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$TEST_USER\",\"password\":\"$TEST_PW\",\"clientId\":\"study-api\",\"deviceType\":\"web\"}" \
  | python3 -c "import sys,json;print('OK' if json.load(sys.stdin).get('data',{}).get('accessToken') else 'FAIL')"
```
→ 토큰 자체는 절대 화면에 찍지 않고 성공 여부(OK/FAIL)만 확인.

## 차단(Usage Policy) 발생 시 대처

1. 새 세션에서 재시도 (요청 단위 차단).
2. 모델 변경.
3. 직전 메시지에서 실 자격증명/회원번호를 플레이스홀더로 교체 후 재시도.
4. `/compact` 또는 세션 초기화로 과거 민감 컨텍스트 제거.

## 기존 가드레일 (web/CLAUDE_NEXT_STEPS.md 참조)

- 루트 Streamlit POC는 삭제하지 않는다.
- `.env.local` 시크릿 print/commit 금지.
- 작은 단위로 변경하고 각 단계 후 `npm run typecheck` / `lint` / 필요 시 `build` 실행.
- Firebase Auth/Firestore 초기화는 lazy + build-safe 유지.
