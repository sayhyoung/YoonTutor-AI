import streamlit as st
from modules.db_manager import get_student_name
from modules.ui_styles import get_common_css

st.set_page_config(
    page_title="윤선생 AI 코치",
    page_icon="🎓",
    layout="centered",
    initial_sidebar_state="collapsed",
)

st.markdown(get_common_css(), unsafe_allow_html=True)

# 로그인 페이지 전용 추가 CSS
st.markdown("""
<style>
    .stApp {
        background: linear-gradient(135deg, #EEF2FF 0%, #E0ECFF 55%, #EDE9FE 100%) !important;
    }
    .block-container {
        max-width: 480px !important;
        padding-top: 3rem !important;
    }
    /* 사이드바 햄버거 버튼 숨기기 (로그인 페이지는 사이드바 불필요) */
    [data-testid="collapsedControl"] { display: none !important; }
    /* 모바일에서도 헤더 숨김 (로그인 페이지는 사이드바 없음) */
    @media (max-width: 768px) {
        header { visibility: hidden !important; height: 0px !important; }
        .block-container {
            max-width: 100% !important;
            padding: 1.5rem 1rem 1rem 1rem !important;
        }
    }
    /* form 테두리 제거 */
    [data-testid="stForm"] {
        border: none !important;
        padding: 0 !important;
    }
</style>
""", unsafe_allow_html=True)

SHEET_URL = "https://docs.google.com/spreadsheets/d/18CTkxyG79jZRzniWxM1Xde8TngSi-eAUqOBF98Aash0/edit"

# ── 브랜드 헤더 ──────────────────────────────
st.markdown("""
<div style="text-align:center; padding: 1rem 0 2rem 0;">
    <div style="font-size:3.8rem; line-height:1; margin-bottom:0.6rem;">🎓</div>
    <h1 style="font-size:2rem; font-weight:900; margin:0; padding:0;
               background: linear-gradient(135deg, #4361EE, #4CC9F0);
               -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
        윤선생 AI 코치
    </h1>
    <p style="color:#64748B; font-size:0.92rem; margin-top:0.4rem; margin-bottom:0;">
        AI 기반 맞춤형 영어 학습 리뷰 시스템
    </p>
</div>
""", unsafe_allow_html=True)

# ── 로그인 탭 ──────────────────────────────
tab_student, tab_teacher = st.tabs(["👦 학생 로그인", "👩‍🏫 선생님 로그인"])

# ── 학생 탭 ──
with tab_student:
    st.markdown(
        '<p style="color:#475569; font-size:0.9rem; margin:1rem 0 0.4rem 0;">'
        '회원번호를 입력하면 바로 학습을 시작할 수 있어!</p>',
        unsafe_allow_html=True,
    )

    # st.form: Enter 키로 제출 가능
    with st.form("student_form", clear_on_submit=False):
        student_id_input = st.text_input(
            "회원번호",
            placeholder="예: 1111",
            label_visibility="collapsed",
        )
        login_btn = st.form_submit_button(
            "학습 시작하기 🚀",
            type="primary",
            use_container_width=True,
        )

    if login_btn:
        if student_id_input.strip():
            with st.spinner("회원 정보 확인 중..."):
                found_name = get_student_name(SHEET_URL, student_id_input.strip())
            if found_name:
                st.success(f"반가워, **{found_name}** 친구! 👋")
                st.session_state["user_role"] = "student"
                st.session_state["user_id"] = student_id_input.strip()
                st.session_state["user_name"] = found_name
                st.switch_page("pages/1_Student_Room.py")
            else:
                st.error("등록되지 않은 회원번호야. 번호를 다시 확인해줘!")
        else:
            st.warning("회원번호를 입력해줘.")

# ── 선생님 탭 ──
with tab_teacher:
    st.markdown(
        '<p style="color:#475569; font-size:0.9rem; margin:1rem 0 0.4rem 0;">'
        '관리자 비밀번호를 입력해주세요.</p>',
        unsafe_allow_html=True,
    )

    # st.form: Enter 키로 제출 가능
    with st.form("teacher_form", clear_on_submit=False):
        teacher_pw = st.text_input(
            "비밀번호",
            type="password",
            placeholder="관리자 비밀번호",
            label_visibility="collapsed",
        )
        teacher_btn = st.form_submit_button(
            "관리자 대시보드 입장 👩‍🏫",
            use_container_width=True,
        )

    if teacher_btn:
        if teacher_pw == "1234":
            st.session_state["user_role"] = "teacher"
            st.switch_page("pages/2_Teacher_Dashboard.py")
        else:
            st.error("비밀번호가 틀렸습니다.")

# ── 푸터 ──────────────────────────────
st.markdown("""
<div style="text-align:center; margin-top:2.5rem; padding-top:1rem;
            border-top:1px solid rgba(67,97,238,0.12);">
    <p style="color:#94A3B8; font-size:0.78rem; margin:0;">
        Powered by OpenAI GPT-4o &nbsp;·&nbsp; 윤선생영어
    </p>
</div>
""", unsafe_allow_html=True)
