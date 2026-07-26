"use client";

import { useState } from "react";

import { Koko } from "@/components/koko";

import styles from "./theme-preview.module.css";

type PreviewView = "home" | "coach" | "complete";

const reviewItems = [
  {
    type: "단어",
    title: "habit",
    description: "뜻과 철자를 다시 확인해요",
    meta: "최근 오답 · 2일 전",
  },
  {
    type: "문장",
    title: "I usually walk to school.",
    description: "빈도부사와 어순을 연습해요",
    meta: "최근 오답 · 어제",
  },
  {
    type: "문법",
    title: "be동사와 일반동사",
    description: "문장 형태를 구분해요",
    meta: "평가 오답 · 오늘",
  },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function HomePreview({ onStart }: { onStart: () => void }) {
  return (
    <>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>7월 26일 일요일</p>
          <h1>민준아, 오늘도 가볍게 시작해볼까?</h1>
          <p className={styles.heroCopy}>
            지난 학습에서 놓친 표현 3개를 코코와 함께 복습해요.
            약 8분이면 충분해요.
          </p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={onStart}>
          오늘의 복습 시작
          <ArrowIcon />
        </button>
      </section>

      <section className={styles.overviewGrid}>
        <article className={styles.progressCard}>
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.cardKicker}>이번 주 학습</p>
              <h2>꾸준히 잘하고 있어요</h2>
            </div>
            <span className={styles.weekBadge}>주 4일 달성</span>
          </div>
          <div className={styles.weekDays} aria-label="이번 주 학습 현황">
            {[
              ["월", true],
              ["화", true],
              ["수", false],
              ["목", true],
              ["금", true],
              ["토", false],
              ["일", false],
            ].map(([day, completed]) => (
              <div className={styles.day} key={String(day)}>
                <span className={completed ? styles.dayDone : ""}>
                  {completed ? <CheckIcon /> : null}
                </span>
                <small>{day}</small>
              </div>
            ))}
          </div>
          <div className={styles.levelBlock}>
            <div className={styles.levelLabel}>
              <span>레벨 3</span>
              <span>180 / 280 XP</span>
            </div>
            <div className={styles.progressTrack}>
              <span style={{ width: "64%" }} />
            </div>
            <p>다음 레벨까지 100 XP 남았어요</p>
          </div>
        </article>

        <article className={styles.coachCard}>
          <div className={styles.coachContent}>
            <span className={styles.coachLabel}>AI 코치 코코</span>
            <h2>어제보다 한 문제 더 정확했어!</h2>
            <p>오늘은 헷갈렸던 철자부터 차근차근 다시 만나보자.</p>
          </div>
          <div className={styles.kokoWrap}>
            <Koko size={112} mood="happy" />
          </div>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.cardKicker}>오늘의 복습</p>
            <h2>다시 보면 내 것이 되는 표현</h2>
          </div>
          <button className={styles.textButton} type="button">
            학습 기록 보기
          </button>
        </div>
        <div className={styles.studyGrid}>
          {reviewItems.map((item, index) => (
            <article className={styles.studyCard} key={item.title}>
              <div className={styles.studyTop}>
                <span className={styles.typeBadge}>{item.type}</span>
                <span className={styles.itemNumber}>0{index + 1}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className={styles.studyMeta}>
                <span>{item.meta}</span>
                <button type="button" aria-label={`${item.title} 열기`}>
                  <ArrowIcon />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function CoachPreview({ onComplete }: { onComplete: () => void }) {
  return (
    <section className={styles.coachLayout}>
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <div>
            <p className={styles.cardKicker}>오늘의 복습</p>
            <h1>단어와 문장 다시 보기</h1>
          </div>
          <span>1 / 3</span>
        </div>
        <div className={styles.chatProgress}>
          <span style={{ width: "33%" }} />
        </div>

        <div className={styles.chatFeed}>
          <div className={styles.assistantRow}>
            <div className={styles.miniKoko}>
              <Koko size={46} />
            </div>
            <div className={styles.assistantBubble}>
              <strong>코코</strong>
              <p>“습관”에 맞는 영어 단어를 써볼래?</p>
            </div>
          </div>
          <div className={styles.studentBubble}>happy</div>
          <div className={styles.assistantRow}>
            <div className={styles.miniKoko}>
              <Koko size={46} mood="cheer" />
            </div>
            <div className={styles.assistantBubble}>
              <strong>코코</strong>
              <p>
                방향을 조금만 바꿔보자. 네가 쓴 단어는 “행복한”이라는
                뜻이고, 지금 찾는 건 자주 반복하는 행동을 뜻해. 다시 한번
                생각해볼래?
              </p>
            </div>
          </div>
        </div>

        <div className={styles.composer}>
          <input aria-label="답 입력 프리뷰" placeholder="영어로 답을 입력하세요" />
          <button className={styles.primaryButton} type="button" onClick={onComplete}>
            답 보내기
          </button>
        </div>
      </div>

      <aside className={styles.contextPanel}>
        <span className={styles.typeBadge}>단어</span>
        <p className={styles.contextLabel}>지금 풀고 있는 문제</p>
        <h2>습관</h2>
        <p>매일 반복해서 자연스럽게 하게 되는 행동이에요.</p>
        <div className={styles.hintBox}>
          <span>힌트</span>
          <strong>h _ _ _ t</strong>
        </div>
        <div className={styles.rewardPreview}>
          <span>이번 학습</span>
          <strong>+0 XP</strong>
        </div>
      </aside>
    </section>
  );
}

function CompletePreview({ onRestart }: { onRestart: () => void }) {
  return (
    <section className={styles.completeShell}>
      <article className={styles.completeHero}>
        <div className={styles.completeKoko}>
          <Koko size={132} mood="celebrate" />
        </div>
        <p className={styles.eyebrow}>오늘의 복습 완료</p>
        <h1>끝까지 해냈어, 민준아!</h1>
        <p>헷갈리던 표현 3개를 모두 다시 확인했어요.</p>
        <div className={styles.rewardPills}>
          <span>+40 XP</span>
          <span>별 +7</span>
          <span>4일 연속</span>
        </div>
      </article>

      <div className={styles.resultGrid}>
        <article className={styles.resultSummary}>
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.cardKicker}>학습 결과</p>
              <h2>정확도 83%</h2>
            </div>
            <span className={styles.scoreRing}>83</span>
          </div>
          <div className={styles.resultRows}>
            <div>
              <span>한 번에 해결</span>
              <strong>1개</strong>
            </div>
            <div>
              <span>다시 풀어 해결</span>
              <strong>2개</strong>
            </div>
            <div>
              <span>다음에 다시 보기</span>
              <strong>0개</strong>
            </div>
          </div>
        </article>

        <article className={styles.nextLevelCard}>
          <p className={styles.cardKicker}>레벨 진행</p>
          <h2>레벨 4까지 60 XP</h2>
          <p>내일 한 번 더 복습하면 거의 도착해요.</p>
          <div className={styles.progressTrack}>
            <span style={{ width: "73%" }} />
          </div>
          <button className={styles.ghostButton} type="button" onClick={onRestart}>
            홈으로 돌아가기
          </button>
        </article>
      </div>
    </section>
  );
}

export default function ThemePreviewPage() {
  const [view, setView] = useState<PreviewView>("home");

  return (
    <main className={styles.preview}>
      <div className={styles.previewBar}>
        <div>
          <span>DESIGN PREVIEW</span>
          <p>Quizlet-inspired theme · 실제 서비스 화면에는 미적용</p>
        </div>
        <div className={styles.previewTabs} aria-label="프리뷰 화면 선택">
          {[
            ["home", "홈"],
            ["coach", "코칭룸"],
            ["complete", "완료"],
          ].map(([value, label]) => (
            <button
              className={view === value ? styles.previewTabActive : ""}
              key={value}
              type="button"
              onClick={() => setView(value as PreviewView)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <header className={styles.topNav}>
        <div className={styles.navInner}>
          <button className={styles.logo} type="button" onClick={() => setView("home")}>
            <span>Y</span>
            <strong>YoonTutor</strong>
          </button>
          <nav className={styles.desktopNav} aria-label="주 메뉴">
            <button type="button">오늘의 학습</button>
            <button type="button">학습 리포트</button>
          </nav>
          <label className={styles.search}>
            <SearchIcon />
            <input aria-label="학습 내용 검색" placeholder="학습 내용 검색" />
          </label>
          <div className={styles.navActions}>
            <span className={styles.streak}>4일 연속</span>
            <button className={styles.avatar} type="button" aria-label="민준 프로필">
              민준
            </button>
          </div>
        </div>
      </header>

      <div className={styles.page}>
        {view === "home" ? <HomePreview onStart={() => setView("coach")} /> : null}
        {view === "coach" ? (
          <CoachPreview onComplete={() => setView("complete")} />
        ) : null}
        {view === "complete" ? (
          <CompletePreview onRestart={() => setView("home")} />
        ) : null}
      </div>
    </main>
  );
}
