# AI 전화관리 운영 배포 체크리스트

`web/`(BFF)은 `main`에 푸시하면 App Hosting(`yoon-tutor-web`, asia-east1)으로 자동 배포된다. 아래 순서를 지키면 새 기능이 꺼진 채로 먼저 배포되고, 설정을 하나씩 켤 때마다 동작이 늘어난다. 시크릿 값은 문서·채팅·커밋에 적지 않는다.

## 0. 현재 상태(설정 전)

- `/api/call-review/*`는 세션 서명 키가 없으면 503을 돌려준다. 기존 웹 튜터에는 영향이 없다.
- study-api는 아직 개발 DB(`https://test-study-api.yoons.or.kr`)다. 운영 API가 준비되면 `LEARNING_API_BASE_URL`만 바꾼다.

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

- 교사용 LMS에 들어갈 별도 웹이다. `/api/*`를 BFF로 넘기므로(`CALL_REVIEW_BFF_URL`) 같은 출처에서 httpOnly 쿠키로 로그인한다.
- 배포 후보: 두 번째 App Hosting 백엔드. 이 앱은 npm workspace(`@yoon-call/shared`)를 쓰므로 루트 디렉터리를 `call-review`로 두고 teacher-web만 빌드·실행하도록 구성해야 한다(현재 `call-review/package.json`의 `build:teacher`). App Hosting의 workspace 지원 방식은 배포 시 확인이 필요하다.
- 환경변수: `CALL_REVIEW_BFF_URL=https://yoon-tutor-web--eduai-tutor-62825.asia-east1.hosted.app`
- LMS 연결: 처음에는 LMS 메뉴에서 교사 화면 URL로 이동(교사가 한 번 더 로그인). LMS 계정으로 바로 들어오는 SSO는 담당 부서와 별도 협의.

## 7. 운영 전 확인

- [ ] 개발 DB 테스트 데이터가 운영 Firestore에 섞이지 않았는지(로컬은 에뮬레이터만 사용)
- [ ] 한 계정 한 세션 정책: 같은 계정으로 다른 곳에서 로그인하면 기존 로그인이 풀린다(study-api 동작). 교사·학생 안내 문구 필요 여부
- [ ] 음성: 녹음은 변환에만 쓰고 저장하지 않음(ARCHITECTURE 원칙). 개인정보 처리방침 문구 반영
- [ ] OpenAI 사용량: 통화 1회당 질문 생성 3회 + 음성 인식(답변 수만큼)
