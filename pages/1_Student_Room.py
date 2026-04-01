import hashlib

import pandas as pd
import streamlit as st
from langchain_core.messages import AIMessage, HumanMessage

from modules.ai_tutor import generate_final_report, get_ai_response, init_socratic_tutor
from modules.db_manager import fetch_wrong_answers
from modules.log_manager import save_learning_log
from modules.ui_styles import get_common_css, sidebar_brand_html, sidebar_user_card_html
from modules.voice_utils import render_voice_settings_in_sidebar, stt_recorder_widget, tts_speak

st.set_page_config(
    page_title="AI 코칭룸",
    page_icon="🎯",
    layout="centered",
    initial_sidebar_state="expanded",
)
st.markdown(get_common_css(), unsafe_allow_html=True)

SHEET_URL = "https://docs.google.com/spreadsheets/d/18CTkxyG79jZRzniWxM1Xde8TngSi-eAUqOBF98Aash0/edit"

# ── 로그인 체크 ──────────────────────────────
if "user_role" not in st.session_state or st.session_state["user_role"] != "student":
    st.warning("로그인이 필요해!")
    st.switch_page("main.py")

user_id = st.session_state.get("user_id", "알수없음")
user_name = st.session_state.get("user_name", "친구")

# ── 세션 초기화 ──────────────────────────────
_defaults = {
    "messages": [],
    "chat_started": False,
    "is_finished": False,
    "learning_results": [],
    "current_q_index": 0,
    "attempt_count": 0,
    "last_tts_hash": "",
}
for key, default in _defaults.items():
    if key not in st.session_state:
        st.session_state[key] = default

# ── 사이드바 ──────────────────────────────
with st.sidebar:
    st.markdown(sidebar_brand_html("학생 학습 코칭룸"), unsafe_allow_html=True)
    st.markdown(
        sidebar_user_card_html(user_name, user_id, "학생"), unsafe_allow_html=True
    )

    # 현재 세션 진행 상황
    if st.session_state.chat_started and "wrong_df" in st.session_state:
        total_q_sb = len(st.session_state.wrong_df)
        done_q_sb = len(st.session_state.learning_results)
        pct = int(done_q_sb / total_q_sb * 100) if total_q_sb > 0 else 0
        st.markdown(
            f"""
            <div style="background:rgba(255,255,255,0.04); border-radius:12px;
                        padding:0.75rem 1rem; margin-bottom:0.8rem;
                        border:1px solid rgba(255,255,255,0.07);">
                <div style="font-size:0.65rem; color:#475569; margin-bottom:6px;
                            font-weight:600; letter-spacing:0.05em; text-transform:uppercase;">
                    오늘의 진행률
                </div>
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
                    <span style="font-size:1.25rem; color:#60A5FA; font-weight:800;
                                 letter-spacing:-0.02em;">{done_q_sb}<span style="font-size:0.85rem; font-weight:600; color:#334155;">/{total_q_sb}</span></span>
                    <span style="font-size:0.75rem; color:#60A5FA; font-weight:700;">{pct}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.08); border-radius:99px; height:5px; overflow:hidden;">
                    <div style="background:linear-gradient(90deg,#4361EE,#4CC9F0); border-radius:99px;
                                height:5px; width:{pct}%; transition:width 0.4s ease;"></div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("---")

    # 음성 설정
    tts_on, stt_on = render_voice_settings_in_sidebar()

    st.markdown("---")

    st.markdown(
        '<div style="font-size:0.65rem; color:#475569; font-weight:700; '
        'letter-spacing:0.06em; text-transform:uppercase; margin-bottom:8px;">메뉴</div>',
        unsafe_allow_html=True,
    )

    if st.button("학습 리포트", use_container_width=True):
        st.switch_page("pages/report.py")

    if st.button("처음부터 다시 시작", use_container_width=True):
        for k in [
            "messages", "chat_started", "is_finished", "learning_results",
            "current_q_index", "ai_report_comment", "wrong_df",
            "attempt_count", "last_tts_hash", "_last_stt_hash", "balloons_shown",
        ]:
            if k in st.session_state:
                del st.session_state[k]
        st.rerun()

    if st.button("로그아웃", use_container_width=True):
        for k in list(st.session_state.keys()):
            del st.session_state[k]
        st.switch_page("main.py")

# ── 메인 헤더 ──────────────────────────────
st.markdown(
    f"""
    <div style="padding:0.25rem 0 1.25rem 0; border-bottom:1px solid rgba(99,120,221,0.13);
                margin-bottom:1.25rem; display:flex; align-items:center; gap:12px;">
        <div style="width:40px; height:40px; background:linear-gradient(135deg,#4361EE,#4CC9F0);
                    border-radius:12px; display:flex; align-items:center; justify-content:center;
                    font-size:1.1rem; flex-shrink:0; box-shadow:0 4px 12px rgba(67,97,238,0.3);">
            🎯
        </div>
        <div>
            <h2 style="margin:0; color:#0F172A; font-weight:800; font-size:1.3rem;
                       letter-spacing:-0.02em; line-height:1.2;">AI 코칭룸</h2>
            <p style="color:#64748B; margin:2px 0 0 0; font-size:0.83rem; font-weight:500;">
                {user_name} 학생의 맞춤형 영어 학습
            </p>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

# ── 1. 데이터 로딩 ──────────────────────────────
if not st.session_state.chat_started and not st.session_state.messages:
    with st.spinner("📚 오늘의 학습 데이터를 불러오는 중..."):
        try:
            member_id = int(user_id)
        except ValueError:
            st.error("회원 ID 오류가 발생했어. 다시 로그인해줘!")
            st.stop()

        df1 = fetch_wrong_answers(SHEET_URL, "단어", member_id)
        df2 = fetch_wrong_answers(SHEET_URL, "문장", member_id)
        df3 = fetch_wrong_answers(SHEET_URL, "평가", member_id)
        wrong_df = pd.concat([df1, df2, df3], ignore_index=True)

    if wrong_df.empty:
        st.balloons()
        st.success("🎉 틀린 문제가 없어! 오늘 학습은 완벽해!")
        st.markdown(
            '<div style="text-align:center; padding:2rem; background:white; '
            'border-radius:16px; margin-top:1rem;">'
            '<div style="font-size:3rem;">👑</div>'
            '<p style="color:#10B981; font-weight:700; font-size:1.1rem;">모든 문제 정복 완료!</p>'
            '<p style="color:#64748B;">다음 학습도 기대할게!</p>'
            '</div>',
            unsafe_allow_html=True,
        )
    else:
        st.session_state.wrong_df = wrong_df
        initial_history = init_socratic_tutor(user_name, wrong_df)
        st.session_state.messages = initial_history
        first_msg = get_ai_response(st.session_state.messages)
        st.session_state.messages.append(AIMessage(content=first_msg))
        st.session_state.chat_started = True
        st.rerun()


# ── 헬퍼: 현재 문제 정보 추출 ──────────────────────────────
def _get_curr_question_info():
    """현재 인덱스의 문제 content와 type을 반환"""
    curr_content = "내용 없음"
    curr_type = "기타"
    idx = st.session_state.current_q_index
    if idx < len(st.session_state.wrong_df):
        row = st.session_state.wrong_df.iloc[idx]
        curr_type = row.get("source_sheet", "기타")
        if curr_type == "단어":
            curr_content = row.get("단어", "")
        elif curr_type == "문장":
            curr_content = row.get("문장", "")
        elif curr_type == "평가":
            curr_content = row.get("문제 내용", "")
        if not curr_content:
            curr_content = (
                row.get("단어") or row.get("문장")
                or row.get("문제 내용") or "확인 필요"
            )
    return curr_content, curr_type


def _pad_missing_results():
    """wrong_df 중 learning_results에 없는 문제를 Not mastered로 채움"""
    done = len(st.session_state.learning_results)
    total = len(st.session_state.wrong_df)
    for i in range(done, total):
        row = st.session_state.wrong_df.iloc[i]
        ct = row.get("source_sheet", "기타")
        if ct == "단어":
            cc = row.get("단어", "내용없음")
        elif ct == "문장":
            cc = row.get("문장", "내용없음")
        elif ct == "평가":
            cc = row.get("문제 내용", "내용없음")
        else:
            cc = "내용없음"
        if not cc or str(cc).lower() == "nan":
            cc = "내용없음"
        st.session_state.learning_results.append(
            {"question": cc, "status": "Not mastered", "source_sheet": ct}
        )


# ── 2. 메인 채팅 화면 ──────────────────────────────
if st.session_state.chat_started:
    total_q = len(st.session_state.wrong_df)

    # ── [Fix 4] 학습 완료 시 채팅 화면 완전히 숨기고 결과만 표시 ──
    if st.session_state.is_finished:

        # 풍선 애니메이션 1회만
        if "balloons_shown" not in st.session_state:
            st.session_state.balloons_shown = True
            st.balloons()

        st.markdown(
            """
            <div style="text-align:center; padding:1.5rem 0 1.25rem 0;">
                <div style="width:64px; height:64px; margin:0 auto 0.9rem auto;
                            background:linear-gradient(135deg,#F59E0B,#FBBF24);
                            border-radius:18px; display:flex; align-items:center;
                            justify-content:center; font-size:1.8rem;
                            box-shadow:0 8px 24px rgba(245,158,11,0.30);">🏆</div>
                <h2 style="color:#0F172A; margin:0 0 0.3rem 0; font-weight:800;
                           font-size:1.4rem; letter-spacing:-0.02em;">학습 완료!</h2>
                <p style="color:#64748B; font-size:0.85rem; margin:0; font-weight:500;">
                    오늘의 학습 결과를 확인해 보세요
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # 결과 테이블
        res_df = pd.DataFrame(st.session_state.learning_results)

        def get_icon(val):
            if val == "Perfect":
                return "👑 Perfect (100점)"
            elif val == "Good":
                return "✅ Good (75점)"
            return "⚠️ Not mastered (50점)"

        res_df["성취도"] = res_df["status"].apply(get_icon)
        st.dataframe(
            res_df[["source_sheet", "question", "성취도"]],
            column_config={"source_sheet": "영역", "question": "학습 내용", "성취도": "결과"},
            use_container_width=True,
            hide_index=True,
        )

        # 점수 계산
        score_sum = sum(
            100 if r["status"] == "Perfect" else 75 if r["status"] == "Good" else 50
            for r in st.session_state.learning_results
        )
        avg_score = int(score_sum / total_q) if total_q > 0 else 0
        perfect_cnt = sum(1 for r in st.session_state.learning_results if r["status"] == "Perfect")
        good_cnt = sum(1 for r in st.session_state.learning_results if r["status"] == "Good")

        col1, col2, col3 = st.columns(3)
        col1.metric("📊 최종 점수", f"{avg_score}점")
        col2.metric("👑 Perfect", f"{perfect_cnt}개")
        col3.metric("✅ Good", f"{good_cnt}개")

        # AI 코치 피드백
        st.markdown(
            '<h3 style="color:#0F172A; margin-top:1.5rem;">💡 AI 코치 피드백</h3>',
            unsafe_allow_html=True,
        )
        if "ai_report_comment" not in st.session_state:
            with st.spinner("AI 코치가 분석 중..."):
                report_comment = generate_final_report(user_name, st.session_state.learning_results)
                st.session_state.ai_report_comment = report_comment

        st.info(f"🦉 {st.session_state.ai_report_comment}")

        if tts_on and "ai_report_comment" in st.session_state:
            comment_hash = hashlib.md5(
                st.session_state.ai_report_comment.encode()
            ).hexdigest()
            if comment_hash != st.session_state.get("last_tts_hash", ""):
                st.session_state.last_tts_hash = comment_hash
                tts_speak(st.session_state.ai_report_comment, lang="ko-KR")

        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("📈 내 전체 학습 리포트 보기", type="primary", use_container_width=True):
            st.switch_page("pages/report.py")

    else:
        # ── 진행 중 화면 ──────────────────────────────
        done_q = len(st.session_state.learning_results)
        progress_pct = done_q / total_q if total_q > 0 else 0

        st.progress(
            progress_pct,
            text=f"📊 학습 진행: {done_q}/{total_q} 문제 완료 ({int(progress_pct * 100)}%)",
        )

        # 채팅 컨테이너
        chat_container = st.container(height=470)
        with chat_container:
            for msg in st.session_state.messages:
                if msg.type == "system":
                    continue
                clean_text = (
                    msg.content
                    .replace("[PERFECT]", "").replace("[GOOD]", "")
                    .replace("[FAILED]", "").replace("[DONE]", "")
                )
                if msg.type == "human":
                    with st.chat_message("user"):
                        st.write(clean_text)
                else:
                    with st.chat_message("assistant", avatar="🦉"):
                        st.write(clean_text)

        # TTS: 새 AI 메시지 자동 읽기
        if tts_on and st.session_state.messages:
            last_msg = st.session_state.messages[-1]
            if last_msg.type == "ai":
                msg_hash = hashlib.md5(last_msg.content.encode()).hexdigest()
                if msg_hash != st.session_state.get("last_tts_hash", ""):
                    st.session_state.last_tts_hash = msg_hash
                    clean_for_tts = (
                        last_msg.content
                        .replace("[PERFECT]", "").replace("[GOOD]", "")
                        .replace("[FAILED]", "").replace("[DONE]", "")
                    )
                    tts_speak(clean_for_tts, lang="ko-KR")

        # ── 입력 영역 ──
        # 음성 입력 (STT)
        if stt_on:
            st.markdown(
                '<div style="background:#F0F4FF; border-radius:12px; padding:0.75rem 1rem; '
                'margin-bottom:0.5rem; border:1px solid #C7D2FE;">'
                '<span style="font-size:0.82rem; color:#4361EE; font-weight:600;">🎤 음성 입력 모드</span>'
                '<span style="font-size:0.78rem; color:#64748B;"> — 마이크를 눌러 영어로 말하세요</span>'
                '</div>',
                unsafe_allow_html=True,
            )
            voice_text = stt_recorder_widget()
            if voice_text:
                st.info(f"🎤 인식된 답변: **{voice_text}**")
                st.session_state.messages.append(HumanMessage(content=voice_text))
                st.session_state.attempt_count += 1
                st.rerun()

        # ── AI 응답 처리 ──
        if (
            st.session_state.messages
            and isinstance(st.session_state.messages[-1], HumanMessage)
        ):
            with chat_container:
                with st.chat_message("assistant", avatar="🦉"):
                    with st.spinner("AI 코치가 생각 중..."):
                        ai_reply = get_ai_response(st.session_state.messages)

                        curr_content, curr_type = _get_curr_question_info()

                        # ── [Fix 3] 채점 로직: AI 태그 + Python 안전장치 ──
                        is_correct = "[PERFECT]" in ai_reply or "[GOOD]" in ai_reply
                        is_failed_by_ai = "[FAILED]" in ai_reply

                        # Python 안전장치: 4회 이상 시도에도 결과 태그 없으면 강제 FAILED
                        force_fail = (
                            not is_correct
                            and not is_failed_by_ai
                            and st.session_state.attempt_count >= 4
                        )
                        if force_fail:
                            is_failed_by_ai = True

                        status = None
                        if is_correct or is_failed_by_ai:
                            attempts = st.session_state.attempt_count
                            if is_correct:
                                if attempts == 1:
                                    status = "Perfect"
                                    st.toast("💯 완벽해! 한 번에 맞췄어!", icon="🎉")
                                elif 2 <= attempts <= 3:
                                    status = "Good"
                                    st.toast(f"👍 {attempts}번 만에 성공! 잘했어!", icon="✅")
                                else:
                                    status = "Not mastered"
                                    st.toast("맞췄지만 여러 번 시도했어. 다시 복습하자!", icon="⚠️")
                            else:
                                status = "Not mastered"
                                st.toast("아쉽지만 다음엔 꼭 맞힐 수 있어!", icon="💪")

                        if status:
                            st.session_state.learning_results.append(
                                {"question": curr_content, "status": status, "source_sheet": curr_type}
                            )
                            st.session_state.current_q_index += 1
                            st.session_state.attempt_count = 0

                        # ── [Fix 2] [DONE] 처리: 누락 문제 자동 보완 후 저장 ──
                        if "[DONE]" in ai_reply or (
                            force_fail
                            and st.session_state.current_q_index >= total_q
                        ):
                            _pad_missing_results()  # 누락 문제 Not mastered로 채움
                            st.session_state.is_finished = True
                            save_learning_log(
                                str(user_id), user_name, total_q,
                                st.session_state.learning_results,
                            )

                        clean_text = (
                            ai_reply
                            .replace("[PERFECT]", "").replace("[GOOD]", "")
                            .replace("[FAILED]", "").replace("[DONE]", "")
                        )
                        # force_fail 시 AI 메시지에 안내 문구 추가
                        if force_fail and not is_correct:
                            clean_text = clean_text + "\n\n_(시도 횟수 초과 — 다음 문제로 넘어갑니다)_"

                        st.write(clean_text)
                        st.session_state.messages.append(AIMessage(content=ai_reply))
                        st.rerun()

# ── 텍스트 입력창 (최상위 레벨 — Streamlit Cloud에서 항상 렌더링) ──────────────
_chat_active = (
    st.session_state.get("chat_started", False)
    and not st.session_state.get("is_finished", False)
)
_placeholder = "답을 입력하거나 모르는 게 있으면 질문해봐..." if _chat_active else "학습을 시작하면 입력할 수 있어요"
user_input = st.chat_input(_placeholder, disabled=not _chat_active)
if user_input and _chat_active:
    st.session_state.messages.append(HumanMessage(content=user_input))
    st.session_state.attempt_count += 1
    st.rerun()
