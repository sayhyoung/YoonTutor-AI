# AI 전화관리 운영 배포 체크리스트

`web/`(BFF)은 `main`에 푸시하면 App Hosting(`yoon-tutor-web`, asia-east1)으로 자동 배포된다. 아래 순서를 지키면 새 기능이 꺼진 채로 먼저 배포되고, 설정을 하나씩 켤 때마다 동작이 늘어난다. 시크릿 값은 문서·채팅·커밋에 적지 않는다.

## 0. 진행 현황(2026-10-22)

- [x] Firestore 규칙·색인 배포(`callReports` 등 4개 컬렉션 클라이언트 차단, `callReports(studentId, endedAt)` 색인)
- [x] Secret Manager: `CALL_REVIEW_SESSION_SECRET`, `CALL_REVIEW_CRON_SECRET`, `AZURE_SPEECH_KEY`, `CALL_REVIEW_GEMINI_API_KEY`(백엔드 `yoon-tutor-web` 접근 허용)
  - 프로젝트에 이미 있는 `GEMINI_API_KEY` 시크릿은 Cloud Functions용이라 건드리지 않는다. 앱의 `GEMINI_API_KEY` 환경변수는 `CALL_REVIEW_GEMINI_API_KEY` 시크릿을 읽는다.
- [x] `web/apphosting.yaml`에서 전화관리 설정 켬(main 반영 시 롤아웃)
- [x] 교사 화면 운영 배포(6번): 백엔드 `call-review-teacher`, https://call-review-teacher--eduai-tutor-62825.asia-east1.hosted.app
- [ ] 서버 푸시 예약 작업(4번) → 만든 뒤 `CALL_REVIEW_PUSH_DISPATCH=enabled`. 그 전에는 앱이 기기 자체 알림을 쓴다.
- [ ] 운영 BFF 주소로 앱 빌드(5번)

## 1. Firestore 규칙·색인 배포

새 컬렉션 `callReports`, `callSchedules`, `callDevices`, `callDispatches`는 클라이언트 접근을 모두 막고 BFF(firebase-admin)만 쓴다. 학생별 기록 조회에 `callReports(studentId, endedAt desc)` 색인이 필요하다.

```bash
npm --prefix web run firebase:deploy:firestore
```

## 2. 시크릿 만들기(Secret Manager)

```bash
cd web
./node_modules/.bin/firebase apphosting:secrets:set CALL_REVIEW_SESSION_SECRET
./node_modules/.bin/firebase apphosting:secrets:set CALL_REVIEW_CRON_SECRET
```

- 값은 각각 `openssl rand -hex 32`로 만든 임의 문자열(32자 이상). 로컬 `.env.local`과 다른 값을 쓴다.
- 세션 서명 키를 바꾸면 기존 모바일 토큰·교사 세션이 모두 무효가 되어 다시 로그인해야 한다.
- 명령이 백엔드 접근 권한 부여를 물으면 `yoon-tutor-web`에 허용한다.

## 3. `web/apphosting.yaml` 설정 켜기

파일 끝 `AI 전화관리` 주석 블록에서 필요한 항목의 주석을 해제한다.

- `CALL_REVIEW_SESSION_SECRET`, `CALL_REVIEW_CRON_SECRET`: 필수
- `CALL_REVIEW_FIRESTORE=enabled`: 통화 결과·일정을 운영 Firestore에 저장(App Hosting 서비스 계정 권한 사용)
- `CALL_REVIEW_FREE_TALK_MODEL`: 짧은 대화 질문이 느리면 더 빠른 모델 지정(선택)

커밋·푸시하면 롤아웃된다. 확인: 학생 앱 로그인 → 통화 → 결과 저장 → 교사 리포트.

## 4. 서버 푸시 예약 작업(Cloud Scheduler)

5분마다 BFF를 호출해 그 사이 도래한 전화·사전 알림을 보낸다. 같은 회차는 `callDispatches` 기록으로 한 번만 보낸다.

```bash
gcloud scheduler jobs create http call-review-dispatch \
  --project=eduai-tutor-62825 --location=asia-east1 \
  --schedule="*/5 * * * *" --time-zone="Asia/Seoul" \
  --http-method=POST \
  --uri="https://yoon-tutor-web--eduai-tutor-62825.asia-east1.hosted.app/api/call-review/dispatch" \
  --headers="Authorization=Bearer <CALL_REVIEW_CRON_SECRET 값>"
```

- `<…>` 자리는 터미널에서 직접 입력하고 기록에 남기지 않는다(셸 히스토리 주의).
- 응답은 `{ checkedStudents, events, sent, removedTokens }` 집계만 담는다.

## 5. 학생 앱(Expo/EAS)

1. `cd call-review/apps/mobile && npx eas init`: Expo 계정으로 프로젝트를 만들면 `app.json`에 `extra.eas.projectId`가 생긴다. 이 ID가 있어야 서버 푸시용 기기 토큰을 받는다. 없으면 앱은 기기 자체 알림(매주 반복 예약)을 쓴다.
2. 빌드 환경변수 `EXPO_PUBLIC_CALL_REVIEW_API_BASE_URL`을 운영 BFF 주소로 설정(`eas.json`의 각 build profile `env`).
3. `npx eas build --profile preview --platform all`로 내부 배포 빌드 → 실제 기기에서 마이크·푸시·전화 알림 확인.
4. iOS는 Apple 개발자 계정, Android는 FCM 설정이 EAS 빌드 과정에서 필요하다.

## 6. 교사 화면(`call-review/apps/teacher-web`)

교사용 LMS에 들어갈 별도 웹이다. `/api/*`는 `src/app/api/[...path]/route.ts`가 서버에서 BFF(`CALL_REVIEW_BFF_URL`)로 중계하므로 같은 출처에서 httpOnly 쿠키로 로그인한다. next.config의 외부 주소 rewrite는 App Hosting에서 BFF에 닿지 못하고 구글 앞단 401이 나서 쓰지 않는다.

- 교사 웹은 `call-review` npm workspace에 넣지 않고 자기 폴더에 따로 설치한다(`cd apps/teacher-web && npm install`). 공유 패키지는 `file:../../packages/shared`, 디자인 토큰은 `../../tokens.css`로 참조한다. App Hosting은 루트 폴더를 `call-review/apps/teacher-web`로 빌드하지만 저장소 전체를 받아 오므로 상위 폴더도 읽힌다.
- 운영 빌드는 `next build --webpack`이고 빌드 루트(`outputFileTracingRoot`)를 이 폴더로 고정한다. 루트가 상위 폴더면 standalone 결과물이 `apps/teacher-web` 아래로 들어가, App Hosting Next.js 어댑터(일반 npm workspace는 모노레포로 보지 않음)가 결과물을 찾지 못해 빌드가 실패한다. 개발(`next dev`)은 Turbopack에 상위 폴더 루트를 준다.
- 설정은 `apps/teacher-web/apphosting.yaml`(최소 인스턴스 0, BFF 주소).
- App Hosting은 루트 폴더에 잠금 파일이 있어야 빌드한다. `apps/teacher-web/package-lock.json`을 커밋해 두고, 의존성을 바꾸면 그 폴더에서 `npm install`로 갱신한다.
- 배포 전 확인: `cd apps/teacher-web && npm ci && npx --yes --package=@apphosting/adapter-nextjs apphosting-adapter-nextjs-build`가 성공하면 App Hosting 빌드도 통과한다.
- 백엔드 만들기(GitHub 연결이 필요해서 대화형으로 실행):

```bash
cd web
./node_modules/.bin/firebase apphosting:backends:create --project eduai-tutor-62825
```

  - 백엔드 이름 `call-review-teacher`, 리전 `asia-east1`, 저장소 `sayhyoung/YoonTutor-AI`, 루트 폴더 `call-review/apps/teacher-web`, 배포 브랜치 `main`, 자동 배포 사용.
- LMS 연결: 처음에는 LMS 메뉴에서 교사 화면 URL로 이동(교사가 한 번 더 로그인). LMS 계정으로 바로 들어오는 SSO는 담당 부서와 별도 협의.

## 7. 운영 전 확인

- [ ] 개발 DB 테스트 데이터가 운영 Firestore에 섞이지 않았는지(로컬은 에뮬레이터만 사용)
- [ ] 한 계정 한 세션 정책: 같은 계정으로 다른 곳에서 로그인하면 기존 로그인이 풀린다(study-api 동작). 교사·학생 안내 문구 필요 여부
- [ ] 음성: 녹음은 변환에만 쓰고 저장하지 않음(ARCHITECTURE 원칙). 개인정보 처리방침 문구 반영
- [ ] OpenAI 사용량: 통화 1회당 질문 생성 3회 + 음성 인식(답변 수만큼)
