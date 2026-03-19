import json

import pandas as pd
import plotly.express as px
import streamlit as st

from modules.log_manager import get_all_logs
from modules.ui_styles import get_common_css, sidebar_brand_html, sidebar_user_card_html

st.set_page_config(
    page_title="관리자 대시보드",
    page_icon="👩‍🏫",
    layout="wide",
    initial_sidebar_state="collapsed",
)
st.markdown(get_common_css(), unsafe_allow_html=True)

# 로그인 체크
if "user_role" not in st.session_state or st.session_state["user_role"] != "teacher":
    st.warning("관리자 로그인이 필요합니다.")
    st.switch_page("main.py")
    st.stop()

# ── 사이드바 ──────────────────────────────
with st.sidebar:
    st.markdown(sidebar_brand_html("관리자 대시보드"), unsafe_allow_html=True)
    st.markdown(sidebar_user_card_html("관리자", "admin", "선생님"), unsafe_allow_html=True)

    st.markdown("---")
    st.markdown(
        '<div style="font-size:0.72rem; color:#64748B; font-weight:700; '
        'letter-spacing:0.06em; margin-bottom:6px;">메뉴</div>',
        unsafe_allow_html=True,
    )

    if st.button("🔄 데이터 새로고침", use_container_width=True):
        st.rerun()

    st.markdown("---")

    if st.button("🚪 로그아웃", use_container_width=True):
        st.session_state["user_role"] = None
        st.switch_page("main.py")

# ── 메인 헤더 ──────────────────────────────
st.markdown(
    """
    <div style="padding:0.5rem 0 1.5rem 0; border-bottom:2px solid #E8EDFF; margin-bottom:1.5rem;">
        <h1 style="margin:0; color:#0F172A; font-weight:800; font-size:1.8rem;">
            👩‍🏫 학습 관리 대시보드
        </h1>
        <p style="color:#64748B; margin:0.25rem 0 0 0; font-size:0.9rem;">
            학생별 학습 현황 및 성취도 분석
        </p>
    </div>
    """,
    unsafe_allow_html=True,
)

df = get_all_logs()

if df.empty:
    st.markdown(
        """
        <div style="text-align:center; padding:4rem; background:white;
                    border-radius:20px; border:2px dashed #E2E8F0;">
            <div style="font-size:3rem;">📭</div>
            <p style="color:#64748B; font-size:1rem; margin-top:1rem;">
                아직 학습 데이터가 없습니다.<br>학생들이 학습을 완료하면 여기에 표시됩니다.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
else:
    # ── 전체 KPI 지표 ──────────────────────────────
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("📚 총 학습 세션", f"{len(df)}건")
    col2.metric("📊 전체 평균 점수", f"{int(df['score'].mean())}점")
    col3.metric("👤 총 학습 회원", f"{df['name'].nunique()}명")
    col4.metric("📅 최근 학습일", str(df.iloc[0]["timestamp"])[:10])

    st.markdown("---")

    # ── 차트 영역 ──────────────────────────────
    col_chart, col_dist = st.columns([3, 2])

    with col_chart:
        st.markdown(
            '<h3 style="color:#0F172A; font-size:1rem; font-weight:700; margin-bottom:0.5rem;">'
            '📈 학생별 성취도 변화 추이</h3>',
            unsafe_allow_html=True,
        )
        chart_df = df.sort_values(by="timestamp").copy()
        fig = px.line(
            chart_df,
            x="timestamp",
            y="score",
            color="name",
            markers=True,
            labels={"timestamp": "학습 일시", "score": "점수", "name": "학생"},
            color_discrete_sequence=["#4361EE", "#4CC9F0", "#F72585", "#7B2FBE", "#FB923C"],
        )
        fig.update_layout(
            paper_bgcolor="white",
            plot_bgcolor="#F8FAFF",
            font=dict(family="Noto Sans KR, sans-serif"),
            margin=dict(l=20, r=20, t=20, b=20),
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            yaxis=dict(range=[0, 105], gridcolor="#E2E8F0"),
            xaxis=dict(gridcolor="#E2E8F0"),
        )
        st.plotly_chart(fig, use_container_width=True)

    with col_dist:
        st.markdown(
            '<h3 style="color:#0F172A; font-size:1rem; font-weight:700; margin-bottom:0.5rem;">'
            '🥧 전체 성취도 분포</h3>',
            unsafe_allow_html=True,
        )
        all_statuses = []
        for _, row in df.iterrows():
            try:
                details = (
                    json.loads(row["details"])
                    if isinstance(row["details"], str)
                    else row["details"]
                )
                for d in details:
                    all_statuses.append(d.get("status", ""))
            except Exception:
                pass

        if all_statuses:
            status_s = pd.Series(all_statuses).value_counts().reset_index()
            status_s.columns = ["Status", "Count"]
            pie_fig = px.pie(
                status_s,
                values="Count",
                names="Status",
                color="Status",
                color_discrete_map={
                    "Perfect": "#10B981",
                    "Good": "#4361EE",
                    "Not mastered": "#EF4444",
                },
            )
            pie_fig.update_layout(
                paper_bgcolor="white",
                margin=dict(l=10, r=10, t=10, b=10),
                font=dict(family="Noto Sans KR, sans-serif"),
                legend=dict(orientation="h"),
            )
            st.plotly_chart(pie_fig, use_container_width=True)
        else:
            st.info("상세 문항 데이터가 없습니다.")

    st.markdown("---")

    # ── 회원별 세션 기록 조회 ──────────────────────────────
    st.markdown(
        '<h3 style="color:#0F172A; font-size:1rem; font-weight:700; margin-bottom:1rem;">'
        '📋 학습 세션 기록 조회</h3>',
        unsafe_allow_html=True,
    )

    # 회원 선택 필터
    student_names = sorted(df["name"].unique().tolist())
    filter_col, spacer = st.columns([2, 5])
    with filter_col:
        selected_student = st.selectbox(
            "회원 선택",
            options=["👥 전체 보기"] + student_names,
            key="student_filter",
            label_visibility="collapsed",
        )

    # 필터링
    if selected_student == "👥 전체 보기":
        filtered_df = df
    else:
        filtered_df = df[df["name"] == selected_student].copy()

        # 선택 회원 요약 카드
        s_avg = int(filtered_df["score"].mean())
        s_best = int(filtered_df["score"].max())
        s_cnt = len(filtered_df)
        s_last = str(filtered_df.iloc[0]["timestamp"])[:10]

        st.markdown(
            f"""
            <div style="background:linear-gradient(135deg,#4361EE,#4CC9F0); border-radius:16px;
                        padding:1.2rem 1.5rem; margin:0.75rem 0 1rem 0; color:white;">
                <div style="font-size:0.75rem; opacity:0.85; margin-bottom:4px;">선택 회원</div>
                <div style="font-size:1.4rem; font-weight:800; margin-bottom:0.6rem;">
                    👤 {selected_student}
                </div>
                <div style="display:flex; gap:2rem; flex-wrap:wrap;">
                    <div><div style="font-size:0.7rem; opacity:0.75;">총 세션</div>
                         <div style="font-size:1.1rem; font-weight:700;">{s_cnt}회</div></div>
                    <div><div style="font-size:0.7rem; opacity:0.75;">평균 점수</div>
                         <div style="font-size:1.1rem; font-weight:700;">{s_avg}점</div></div>
                    <div><div style="font-size:0.7rem; opacity:0.75;">최고 점수</div>
                         <div style="font-size:1.1rem; font-weight:700;">{s_best}점</div></div>
                    <div><div style="font-size:0.7rem; opacity:0.75;">최근 학습일</div>
                         <div style="font-size:1.1rem; font-weight:700;">{s_last}</div></div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # 세션 목록
    st.caption(f"총 {len(filtered_df)}건의 세션 (최신순)")

    for _, row in filtered_df.iterrows():
        score = row["score"]
        if score >= 90:
            score_icon = "👑"
        elif score >= 70:
            score_icon = "✅"
        else:
            score_icon = "💪"

        # 전체 보기일 때는 이름 포함, 회원별 보기일 때는 날짜+점수만
        if selected_student == "👥 전체 보기":
            label = f"{score_icon}  {row['name']}  —  {str(row['timestamp'])[:16]}  —  {score}점"
        else:
            label = f"{score_icon}  {str(row['timestamp'])[:16]}  —  {score}점"

        with st.expander(label):
            details_raw = row.get("details", "[]")
            try:
                details = (
                    json.loads(details_raw)
                    if isinstance(details_raw, str)
                    else details_raw
                )
                if details:
                    detail_df = pd.DataFrame(details)

                    def highlight_status(val):
                        if val == "Not mastered":
                            return "color: #EF4444; font-weight: bold"
                        elif val == "Perfect":
                            return "color: #10B981; font-weight: bold"
                        elif val == "Good":
                            return "color: #4361EE; font-weight: bold"
                        return ""

                    cols_to_show = (
                        ["source_sheet", "question", "status"]
                        if "source_sheet" in detail_df.columns
                        else ["question", "status"]
                    )
                    st.dataframe(
                        detail_df[cols_to_show]
                        .rename(columns={
                            "source_sheet": "영역",
                            "question": "학습 내용",
                            "status": "결과",
                        })
                        .style.map(highlight_status, subset=["결과"]),
                        use_container_width=True,
                        hide_index=True,
                    )
                else:
                    st.caption("상세 문항 데이터 없음")
            except Exception:
                st.error("데이터 형식 오류")
