# 실데이터 검증 브리프 (Claude Code / 로컬 전용)

> Cowork 세션은 사내 study-api(`test-study-api.yoons.or.kr`)에 네트워크로 도달할 수 없어
> **실데이터 검증은 Sam의 로컬 머신에서만 가능**하다. 이 문서를 VS Code의 Claude Code에 그대로 넘겨 실행.
> CLAUDE.md 가드레일 준수: 아이디/비밀번호/회원번호/토큰을 명령어·로그에 평문으로 찍지 말 것. 환경변수로만 주입.

## 0. 이번에 바뀐 것 (컨텍스트)

리뷰 학습 플로우를 POC 형태로 이관하면서 다음을 추가/변경했다.

- `web/src/lib/openai.ts` (신규): OpenAI Responses API 공통 헬퍼(`callOpenAiText`, `isOpenAiEnabled`). 모델은 `OPENAI_MODEL`(현재 `gpt-5.2`).
- `web/src/app/api/quiz/route.ts` (재작성): **하이브리드 채점**. `quiz-engine`이 정답/3진아웃을 결정론적으로 확정(guardrail)하고, OpenAI는 학생 답에 맞춘 **맥락형 힌트**만 생성(예: 정답 `America`인데 `American` 입력 시 "그건 '미국의/미국인'이라는 뜻이야…"). 정답 오판 위험 없음.
- `web/src/app/api/report/route.ts` (신규): 세션 종료 시 3~4문장 AI 코치 총평 생성(POC `generate_final_report` 대응). 실패 시 결정론적 fallback.
- `web/src/lib/types.ts`: `QuizSession.coachComment?` 추가.
- `web/src/components/tutor-prototype.tsx`: 세션 완료 화면(점수·결과표·AI 코치 피드백), 오답 0건 축하 화면, 종료 시 `/api/report` 호출 후 Firestore에 코멘트 저장, 리포트 뷰에 최근 코멘트 노출.
- `web/.env.local`: `USE_MOCK_AI=false` 로 전환(실 OpenAI 사용).

로컬 검증 통과 기준: `typecheck` / `lint` / `build` 무오류 + 아래 1~4단계.

## 1. 빌드 무결성

```bash
cd web
npm run typecheck && npm run lint && npm run build
```

(Cowork 샌드박스에선 SWC 리눅스 바이너리 미다운로드로 build만 실패했음 — 로컬 Mac에선 정상.)

## 2. OpenAI 모델 동작 확인 (가장 큰 미지수: gpt-5.2 + Responses API)

`.env.local`을 셸로 로드한 뒤(값은 화면에 안 찍힘) 모델만 점검:

```bash
cd web
set -a; . ./.env.local; set +a            # 시크릿을 현재 셸로만 로드
node -e "fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.2',input:'한국어로 한 문장만 인사해줘.',max_output_tokens:60})}).then(r=>r.json()).then(d=>console.log('MODEL OK ->', d.output_text || JSON.stringify(d).slice(0,300))).catch(e=>console.log('MODEL FAIL ->', String(e)))"
```

- `MODEL OK -> ...한국어 문장...` 이면 통과.
- `model ... does not exist` / 4xx 가 나오면 `gpt-5.2`가 미존재 → `.env.local`·`apphosting.yaml`의 `OPENAI_MODEL`을 `gpt-4o`로 교체 후 재시도. (앱은 이 경우에도 결정론적 fallback으로 동작하지만, **맥락형 힌트가 사라지므로 반드시 OK로 만들 것**.)

## 3. study-api 실데이터 — BFF 라우트 스모크 (회원번호는 env로만)

dev 서버를 띄우고, 토큰은 httpOnly 쿠키에 담겨 화면엔 안 나오는 구조 그대로 점검한다.

```bash
cd web
npm run dev          # 별도 터미널, http://localhost:3000

# 같은 셸에서 자격증명을 env로만 주입 (히스토리에 남기지 않으려면 read -s 사용)
read -r TEST_USER;  read -rs TEST_PW; echo
read -r CUSTOMER_NO

# 3-1) 로그인 → 쿠키 저장 (성공/실패만 출력)
curl -s -c cookies.txt -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$TEST_USER\",\"password\":\"$TEST_PW\",\"role\":\"student\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('LOGIN', 'OK' if d.get('profile') else 'FAIL', d.get('errorCode',''))"

# 3-2) 오답 조회 (회원번호는 $CUSTOMER_NO 로만, 개수/소스만 출력)
curl -s -b cookies.txt "localhost:3000/api/study/wrong-answers?customerNo=$CUSTOMER_NO" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('items=',len(d.get('items',[])),'source=',d.get('source'),'range=',d.get('studyStartDate'),d.get('studyEndDate'))"

unset TEST_USER TEST_PW CUSTOMER_NO; rm -f cookies.txt   # 정리
```

- `LOGIN OK` + `items= N (N>0)` 이면 실연동 성공.
- `items= 0` 이면 조회 기간에 오답 데이터가 없는 것 → `.env.local`의 `STUDY_API_DEMO_DATE`(또는 `STUDY_API_DEMO_START/END`)를 **데이터가 있는 날짜**로 지정 후 재시도.
- 401/A-1207 등은 토큰 만료 → 재로그인. `mapping.ts`가 `isCorrect===false`만 오답으로 추리므로, 응답 스키마가 다르면 0건이 날 수 있음(이때 `web/src/lib/study-api/mapping.ts` 점검).

## 4. 전체 플로우 UI 검증 (실 회원 로그인)

브라우저 `localhost:3000`:

1. 학생 탭 → 베플리 아이디/비밀번호로 로그인 → 코칭룸 진입, 오답 문항 로드 확인.
2. 한 문항에 **일부러 근접 오답**(예: America 문제에 `American`) 제출 → AI가 **맞춤형 힌트**를 주는지 확인(핵심 검증 포인트).
3. `힌트`라고 입력 → 시도 횟수에 안 세고 힌트만 주는지 확인.
4. 3회 오답 → 정답 공개 + Not mastered 마감 확인.
5. 모든 문항 종료 → **완료 화면**(점수·Perfect/Good/재복습·결과표·🦉 AI 코치 피드백) 표시 확인.
6. `내 학습 리포트` → 세션 누적 + 최근 AI 코치 피드백 노출 확인.
7. 새로고침 후 리포트에 세션이 남아있는지(Firestore 저장) 확인.

## 합격 기준

- [ ] typecheck / lint / build 무오류
- [ ] OpenAI 모델 호출 OK (gpt-5.2 또는 대체 모델)
- [ ] study-api 로그인 OK + 오답 items > 0
- [ ] 근접 오답에 맥락형 힌트가 나옴
- [ ] 완료 화면에 AI 코치 총평 표시
- [ ] 새로고침 후 리포트에 세션 유지(Firestore 저장됨)

## 가드레일 재확인

- 아이디/비밀번호/회원번호/accessToken/refreshToken을 `echo`·`console.log`·커밋에 노출 금지.
- 위 명령은 성공여부/개수만 출력하도록 작성됨. 디버깅으로 토큰을 찍어야 하면 길이만(`len`) 출력.
- `.env.local`·`cookies.txt`는 커밋 금지(이미 .gitignore 확인). 검증 후 `cookies.txt` 삭제.
