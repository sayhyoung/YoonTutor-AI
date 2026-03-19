import json

import pandas as pd
import plotly.express as px
import streamlit as st

from modules.log_manager import get_all_logs
from modules.ui_styles import get_common_css, sidebar_brand_html, sidebar_user_card_html

st.set_page_config(
    page_title="나의 학습 리포트",
    page_icon="📊",
    layout="centered",
    initial_sidebar_state="collapsed",
)
st.markdown(get_common_css(), unsafe_allow_html=True)

# 로그인 체크
if "user_role" not in st.session_state or st.session_state["user_role"] != "student":
    st.warning("로그인이 필요해! 메인 화면에서 로그인해줘.")
    st.switch_page("main.py")

user_id = st.session_state.get("user_id", "알수없음")
user_name = st.session_state.get("user_name", "친구")

# ── 사이드바 ──────────────────────────────
with st.sidebar:
    st.markdown(sidebar_brand_html("나의 학습 리포트"), unsafe_allow_html=True)
    st.markdown(sidebar_user_card_html(user_name, user_id, "학생"), unsafe_allow_html=True)

    st.markdown("---")
    st.markdown(
        '<div style="font-size:0.72rem; color:#64748B; font-weight:700; '
        'letter-spacing:0.06em; margin-bottom:6px;">메뉴</div>',
        unsafe_allow_html=True,
    )

    if st.button("🎯 학습 코칭룸으로", type="primary", use_container_width=True):
        st.switch_page("pages/1_Student_Room.py")

    if st.button("🏠 홈으로 (로그아웃)", use_container_width=True):
        for k in list(st.session_state.keys()):
            del st.session_state[k]
        st.switch_page("main.py")

# ── 메인 헤더 ──────────────────────────────
st.markdown(
    f"""
    <div style="padding:0.5rem 0 1rem 0; border-bottom:2px solid #E8EDFF; margin-bottom:1rem;">
        <h2 style="margin:0; color:#0F172A; font-weight:800;">📊 나의 학습 리포트</h2>
        <p style="color:#64748B; margin:0.25rem 0 0 0; font-size:0.9rem;">
            <b>{user_name}</b> 학생의 누적 학습 성취 분석
        </p>
    </div>
    """,
    unsafe_allow_html=True,
)

# 데이터 로드
all_logs = get_all_logs()
my_logs = pd.DataFrame()
if not all_logs.empty:
    my_logs = all_logs[all_logs["member_id"].astype(str) == str(user_id)]

if my_logs.empty:
    st.markdown(
        """
        <div style="text-align:center; padding:3rem; background:white;
                    border-radius:20px; border:2px dashed #E2E8F0; margin-top:1rem;">
            <div style="font-size:3rem;">📭</div>
            <p style="color:#64748B; font-size:1rem; margin-top:1rem;">
                아직 완료된 학습 기록이 없어.<br>
                AI 코칭룸에서 첫 학습을 완료해봐!
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    if st.button("🎯 지금 학습 시작하기", type="primary", use_container_width=True):
        st.switch_page("pages/1_Student_Room.py")
else:
    # ── 누적 통계 ──────────────────────────────
    total_study_cnt = len(my_logs)
    avg_score = int(my_logs["score"].mean())
    best_score = int(my_logs["score"].max())
    last_study_date = str(my_logs.iloc[0]["timestamp"])[:10]

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("📚 총 학습 횟수", f"{total_study_cnt}회")
    col2.metric("📊 평균 성취도", f"{avg_score}점")
    col3.metric("🏆 최고 점수", f"{best_score}점")
    col4.metric("📅 최근 학습일", last_study_date)

    # ── 성취도 추이 차트 ──────────────────────────────
    if len(my_logs) > 1:
        st.markdown(
            '<h3 style="color:#0F172A; font-size:0.95rem; font-weight:700; '
            'margin:1.5rem 0 0.5rem 0;">📈 나의 성취도 변화</h3>',
            unsafe_allow_html=True,
        )
        trend_df = my_logs.sort_values(by="timestamp")
        fig_trend = px.line(
            trend_df,
            x="timestamp",
            y="score",
            markers=True,
            labels={"timestamp": "학습일시", "score": "점수"},
            color_discrete_sequence=["#4361EE"],
        )
        fig_trend.update_traces(
            line=dict(width=3),
            marker=dict(size=8, color="#4361EE", line=dict(width=2, color="white")),
        )
        fig_trend.update_layout(
            paper_bgcolor="white",
            plot_bgcolor="#F8FAFF",
            font=dict(family="Noto Sans KR, sans-serif"),
            margin=dict(l=20, r=20, t=20, b=20),
            yaxis=dict(range=[0, 105], gridcolor="#E2E8F0"),
            xaxis=dict(gridcolor="#E2E8F0"),
        )
        st.plotly_chart(fig_trend, use_container_width=True)

    st.markdown("---")

    # ── 상세 학습 기록 ──────────────────────────────
    st.markdown(
        '<h3 style="color:#0F172A; font-size:0.95rem; font-weight:700; margin-bottom:0.75rem;">'
        '📝 학습 세션별 상세 기록</h3>',
        unsafe_allow_html=True,
    )

    for idx, (_, row) in enumerate(my_logs.iterrows()):
        score = row["score"]
        if score >= 90:
            badge_color = "#10B981"
            badge_bg = "#ECFDF5"
            score_icon = "👑"
        elif score >= 70:
            badge_color = "#4361EE"
            badge_bg = "#EEF2FF"
            score_icon = "✅"
        else:
            badge_color = "#EF4444"
            badge_bg = "#FFF1F2"
            score_icon = "💪"

        date_str = str(row["timestamp"])[:16]
        expander_label = f"{score_icon} {date_str}  —  {score}점"

        with st.expander(expander_label, expanded=(idx == 0)):
            details_raw = row.get("details", "[]")
            try:
                details = (
                    json.loads(details_raw)
                    if isinstance(details_raw, str)
                    else details_raw
                )
                if details:
                    detail_df = pd.DataFrame(details)

                    def get_icon(val):
                        if val == "Perfect":
                            return "👑 Perfect (100점)"
                        elif val == "Good":
                            return "✅ Good (75점)"
                        return "⚠️ Not mastered (50점)"

                    display_df = detail_df.copy()
                    display_df["성취도"] = display_df["status"].apply(get_icon)
                    cols = ["question", "성취도"]
                    if "source_sheet" in display_df.columns:
                        cols.insert(0, "source_sheet")

                    st.dataframe(
                        display_df[cols],
                        column_config={
                            "source_sheet": "영역",
                            "question": "학습 내용",
                            "성취도": "결과",
                        },
                        use_container_width=True,
                        hide_index=True,
                    )

                    # 파이 차트
                    if not detail_df.empty and "status" in detail_df.columns:
                        col_chart, col_summary = st.columns([1, 1])
                        with col_chart:
                            status_counts = (
                                detail_df["status"].value_counts().reset_index()
                            )
                            status_counts.columns = ["Status", "Count"]
                            pie = px.pie(
                                status_counts,
                                values="Count",
                                names="Status",
                                color="Status",
                                color_discrete_map={
                                    "Perfect": "#10B981",
                                    "Good": "#4361EE",
                                    "Not mastered": "#EF4444",
                                },
                                hole=0.4,
                            )
                            pie.update_layout(
                                paper_bgcolor="white",
                                margin=dict(l=0, r=0, t=0, b=0),
                                height=220,
                                showlegend=True,
                                legend=dict(orientation="h"),
                                font=dict(family="Noto Sans KR, sans-serif"),
                            )
                            st.plotly_chart(pie, use_container_width=True)

                        with col_summary:
                            p_cnt = (detail_df["status"] == "Perfect").sum()
                            g_cnt = (detail_df["status"] == "Good").sum()
                            n_cnt = (detail_df["status"] == "Not mastered").sum()
                            st.markdown(
                                f"""
                                <div style="padding:1rem; background:#F8FAFF;
                                            border-radius:12px; margin-top:0.5rem;">
                                    <div style="font-size:0.8rem; color:#64748B;
                                                margin-bottom:0.5rem;">이 날의 성취 요약</div>
                                    <div style="display:flex; flex-direction:column; gap:6px;">
                                        <div style="display:flex; justify-content:space-between;">
                                            <span style="color:#10B981;">👑 Perfect</span>
                                            <span style="font-weight:700;">{p_cnt}개</span>
                                        </div>
                                        <div style="display:flex; justify-content:space-between;">
                                            <span style="color:#4361EE;">✅ Good</span>
                                            <span style="font-weight:700;">{g_cnt}개</span>
                                        </div>
                                        <div style="display:flex; justify-content:space-between;">
                                            <span style="color:#EF4444;">⚠️ Not mastered</span>
                                            <span style="font-weight:700;">{n_cnt}개</span>
                                        </div>
                                    </div>
                                </div>
                                """,
                                unsafe_allow_html=True,
                            )
                else:
                    st.caption("상세 문항 데이터 없음")
            except Exception:
                st.error("상세 데이터를 불러오는 중 오류가 발생했어.")
