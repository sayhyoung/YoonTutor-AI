# 앱 아이콘·파비콘 제작 요구사항

윤선생 AI 전화관리(학생 앱: Android·iOS, 교사 웹, 학생 웹 프리뷰)에 들어갈 아이콘 이미지 요구사항이다.
디자이너에게 이 문서를 전달하고, 받은 파일은 아래 "파일 위치"대로 넣으면 된다.

현재 상태(2026-10-21): 베플리 헤드셋 로고 1차 시안을 적용했다. 앱 아이콘·스플래시·알림 아이콘은 `apps/mobile/assets/icon/`과 `app.json`에, 교사 웹 파비콘은 `apps/teacher-web/src/app/`에 있다. 스토어용 이미지와 편집용 마스터(SVG)는 `design/app-icon/`에 보관한다. Android 적응형 아이콘 배경색은 로고에 맞춰 `#12151C`로 바꿨다.

## 1. 디자인 방향

- 모티프: 베플리 캐릭터(헤드셋을 쓴 얼굴) 또는 "전화 + 말풍선". 서비스가 "선생님이 전화해 주는 복습"이라는 점이 드러나야 한다.
- 글자 넣지 않기: 서비스명·"AI" 같은 텍스트는 작은 크기에서 읽히지 않는다. 앱 이름은 OS가 아이콘 아래에 표시한다.
- 16×16 픽셀(브라우저 탭)에서도 형태가 알아보여야 한다. 캐릭터 전신 대신 얼굴·실루엣처럼 단순한 형태를 쓴다.
- 브랜드 색(앱 디자인 토큰 `apps/mobile/src/theme.ts`):

  | 용도 | 색 |
  |---|---|
  | 베플리 브라운 | `#7B4A2E` |
  | 베플리 소프트 | `#F3E7D9` |
  | 노랑 포인트(머리) | `#F5C842` |
  | 액션 블루 | `#2F55D4` |
  | 통화 화면 다크 | `#12151C` |
  | 페이퍼 배경 | `#F6F3EE` |

- 밝은 배경과 어두운 배경(다크 모드 홈 화면·브라우저 다크 탭) 모두에서 테두리가 묻히지 않아야 한다.
- 베플리 캐릭터는 회사 소유 IP이므로 원본 캐릭터 파일(`apps/mobile/assets/befly/`)에서 출발한다.

## 2. 마스터 원본 (공통)

| 파일 | 규격 | 비고 |
|---|---|---|
| `icon-master.svg` | 벡터 | 모든 크기의 원본. 선·면 정렬을 정수 좌표에 맞춤 |
| `icon-master-1024.png` | 1024×1024, sRGB, PNG | 아래 플랫폼별 파일의 기준 |

## 3. Android

| 파일 | 규격 | 설명 |
|---|---|---|
| `android-adaptive-foreground.png` | 1024×1024, 투명 배경 PNG | 적응형 아이콘 전경. 기기마다 원·물방울·사각형으로 잘리므로 **핵심 형태는 가운데 지름 약 640px 원 안**(안전 영역 66/108dp)에 둔다. 바깥쪽은 잘리거나 시차 효과로 움직일 수 있다 |
| `android-adaptive-background.png` (선택) | 1024×1024, 불투명 PNG | 배경을 그림으로 쓸 때만. 단색이면 색상값만 주면 된다(현재 `#171522`, 변경 가능) |
| `android-monochrome.png` | 1024×1024, 투명 배경, 단색(흰색) 실루엣 | Android 13+ "테마 아이콘". 시스템이 배경 색에 맞춰 칠한다. 전경과 같은 안전 영역 규칙 |
| `notification-icon.png` | 96×96, 투명 배경, **흰색 단색** | 상태 표시줄 알림 아이콘. 색이 있으면 회색 사각형으로 보인다. 가는 선 피하기 |
| 알림 강조색 | 색상값 1개 | 알림 아이콘 원·앱 이름 색(예: `#7B4A2E`) |
| `play-store-icon-512.png` | 512×512, 32비트 PNG | Google Play 등록용 고해상도 아이콘 |
| `play-feature-graphic.png` | 1024×500, PNG/JPG | Google Play 대표 그래픽(스토어 등록 시) |

## 4. iOS

| 파일 | 규격 | 설명 |
|---|---|---|
| `ios-icon-1024.png` | 1024×1024, PNG, **투명도(알파) 없음**, 정사각형 | 모서리 둥글게 자르지 말 것(iOS가 자른다). 투명 픽셀이 있으면 App Store 심사에서 거절된다. 작은 크기는 빌드 때 자동 생성 |
| `ios-icon-dark-1024.png` (선택) | 1024×1024, 투명 배경 PNG | iOS 18 다크 모드 아이콘. 배경 없이 전경만 |
| `ios-icon-tinted-1024.png` (선택) | 1024×1024, 흑백(그레이스케일) | iOS 18 색조(tinted) 아이콘 |

## 5. 스플래시(앱 시작 화면, Android·iOS 공통)

| 파일 | 규격 | 설명 |
|---|---|---|
| `splash-icon.png` | 1024×1024, 투명 배경 PNG | 화면 가운데 약 200dp 크기로 표시. 여백 넉넉히 |
| `splash-icon-dark.png` (선택) | 1024×1024, 투명 배경 PNG | 다크 모드용 |
| 배경색 | 밝은 모드·다크 모드 각 1개 | 예: 밝은 `#F6F3EE`, 다크 `#12151C` |

## 6. 웹 파비콘

### 교사 웹(`apps/teacher-web`, Next.js App Router)

| 파일 | 규격 | 설명 |
|---|---|---|
| `favicon.ico` | 16·32·48px를 한 파일에 담은 ICO | 브라우저 탭. 16px용은 따로 다듬은 버전 권장 |
| `icon.svg` (권장) 또는 `icon.png` | SVG 또는 512×512 PNG | 최신 브라우저 탭·북마크. SVG면 `prefers-color-scheme`으로 다크 탭 대응 가능 |
| `apple-icon.png` | 180×180, 불투명 PNG | iPhone "홈 화면에 추가" |
| `icon-192.png`, `icon-512.png` (선택) | 192×192, 512×512 PNG | 웹 앱 매니페스트(설치형 웹앱으로 쓸 때) |
| `icon-maskable-512.png` (선택) | 512×512, 가운데 80% 안전 영역 | 매니페스트 maskable 아이콘 |

교사 웹은 기존 LMS 안에 들어갈 예정이므로, LMS 파비콘을 그대로 쓸지 별도로 둘지 먼저 정한다.

### 학생 웹 프리뷰(Expo web)

| 파일 | 규격 | 설명 |
|---|---|---|
| `web-favicon.png` | 48×48 PNG | `app.json`의 `web.favicon` |

## 7. 파일 위치와 적용

받은 파일은 다음 위치에 둔다.

```
apps/mobile/assets/icon/
  icon.png                      ← ios-icon-1024.png
  adaptive-foreground.png
  adaptive-background.png       (선택)
  monochrome.png
  notification-icon.png
  splash-icon.png
  splash-icon-dark.png          (선택)
  web-favicon.png
apps/teacher-web/src/app/
  favicon.ico
  icon.svg (또는 icon.png)
  apple-icon.png
```

`apps/mobile/app.json` 적용 예:

```json
{
  "expo": {
    "icon": "./assets/icon/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/icon/adaptive-foreground.png",
        "monochromeImage": "./assets/icon/monochrome.png",
        "backgroundColor": "#171522"
      }
    },
    "web": { "favicon": "./assets/icon/web-favicon.png" },
    "plugins": [
      ["expo-notifications", { "icon": "./assets/icon/notification-icon.png", "color": "#7B4A2E" }],
      ["expo-splash-screen", {
        "image": "./assets/icon/splash-icon.png",
        "imageWidth": 200,
        "backgroundColor": "#F6F3EE",
        "dark": { "image": "./assets/icon/splash-icon-dark.png", "backgroundColor": "#12151C" }
      }]
    ]
  }
}
```

- 앱 아이콘·스플래시·알림 아이콘은 네이티브 리소스라 **새 빌드(EAS 또는 로컬 빌드)를 해야 반영**된다. JS만 바꾸는 개발 서버 새로고침으로는 바뀌지 않는다.
- 교사 웹은 `src/app/`에 파일을 두면 Next.js가 자동으로 `<link rel="icon">`을 만든다.

## 8. 검수 체크리스트

- [ ] 16px·32px로 줄였을 때 형태가 알아보인다
- [ ] 밝은·어두운 배경 모두에서 윤곽이 보인다
- [ ] Android 원형·사각형 마스크에서 핵심 형태가 잘리지 않는다
- [ ] iOS 1024 아이콘에 투명 픽셀이 없다
- [ ] 알림 아이콘이 흰색 단색이고 투명 배경이다
- [ ] 이미지에 글자가 없다
- [ ] 모든 PNG가 sRGB다
