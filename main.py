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

# 로그인 페이지 전용 CSS
st.markdown("""
<style>
    .stApp {
        background: linear-gradient(140deg, #EEF2FF 0%, #E0ECFF 50%, #EDE9FE 100%) !important;
    }
    .block-container {
        max-width: 460px !important;
        padding-top: 3.5rem !important;
    }
    [data-testid="collapsedControl"] { display: none !important; }
    @media (max-width: 768px) {
        header { visibility: hidden !important; height: 0px !important; }
        .block-container {
            max-width: 100% !important;
            padding: 2rem 1rem 1rem 1rem !important;
        }
    }
    [data-testid="stForm"] {
        border: none !important;
        padding: 0 !important;
        background: transparent !important;
    }
    /* 로그인 카드 */
    .login-card {
        background: rgba(255,255,255,0.75);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.9);
        border-radius: 24px;
        padding: 2rem 2rem 1.5rem 2rem;
        box-shadow: 0 8px 32px rgba(67, 97, 238, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06);
    }
</style>
""", unsafe_allow_html=True)

SHEET_URL = "https://docs.google.com/spreadsheets/d/18CTkxyG79jZRzniWxM1Xde8TngSi-eAUqOBF98Aash0/edit"

# ── 브랜드 헤더 ──
st.markdown("""
<div style="text-align:center; padding:0.5rem 0 2rem 0;">
    <div style="width:64px; height:64px; margin:0 auto 1rem auto;
                background:linear-gradient(135deg, #4361EE, #4CC9F0);
                border-radius:18px; display:flex; align-items:center;
                justify-content:center; font-size:2rem;
                box-shadow:0 8px 24px rgba(67,97,238,0.30);">
        🎓
    </div>
    <h1 style="font-size:1.85rem; font-weight:900; margin:0; padding:0;
               letter-spacing:-0.03em; color:#0F172A;">
        윤선생 AI 코치
    </h1>
    <p style="color:#64748B; font-size:0.85rem; margin-top:0.4rem;
              font-weight:500; letter-spacing:0.01em;">
        AI 기반 맞춤형 영어 학습 리뷰
    </p>
</div>
""", unsafe_allow_html=True)

# ── 로그인 카드 래퍼 ──
st.markdown('<div class="login-card">', unsafe_allow_html=True)

tab_student, tab_teacher = st.tabs(["학생 로그인", "선생님 로그인"])

# ── 학생 탭 ──
with tab_student:
    st.markdown(
        '<p style="color:#475569; font-size:0.85rem; margin:1rem 0 0.6rem 0; font-weight:500;">'
        '회원번호를 입력하면 바로 학습을 시작할 수 있어요.</p>',
        unsafe_allow_html=True,
    )
    with st.form("student_form", clear_on_submit=False):
        student_id_input = st.text_input(
            "회원번호",
            placeholder="예: 1111",
            label_visibility="collapsed",
        )
        login_btn = st.form_submit_button(
            "학습 시작하기  →",
            type="primary",
            use_container_width=True,
        )

    if login_btn:
        if student_id_input.strip():
            with st.spinner("회원 정보 확인 중..."):
                found_name = get_student_name(SHEET_URL, student_id_input.strip())
            if found_name:
                st.success(f"반가워요, **{found_name}** 학생! 👋")
                st.session_state["user_role"] = "student"
                st.session_state["user_id"] = student_id_input.strip()
                st.session_state["user_name"] = found_name
                st.switch_page("pages/1_Student_Room.py")
            else:
                st.error("등록되지 않은 회원번호예요. 번호를 다시 확인해 주세요.")
        else:
            st.warning("회원번호를 입력해 주세요.")

# ── 선생님 탭 ──
with tab_teacher:
    st.markdown(
        '<p style="color:#475569; font-size:0.85rem; margin:1rem 0 0.6rem 0; font-weight:500;">'
        '관리자 비밀번호를 입력해 주세요.</p>',
        unsafe_allow_html=True,
    )
    with st.form("teacher_form", clear_on_submit=False):
        teacher_pw = st.text_input(
            "비밀번호",
            type="password",
            placeholder="관리자 비밀번호",
            label_visibility="collapsed",
        )
        teacher_btn = st.form_submit_button(
            "대시보드 입장  →",
            use_container_width=True,
        )

    if teacher_btn:
        if teacher_pw == "1234":
            st.session_state["user_role"] = "teacher"
            st.switch_page("pages/2_Teacher_Dashboard.py")
        else:
            st.error("비밀번호가 맞지 않습니다.")

st.markdown('</div>', unsafe_allow_html=True)

# ── 푸터 ──
st.markdown("""
<div style="text-align:center; margin-top:2rem;">
    <p style="color:#94A3B8; font-size:0.75rem; margin:0; font-weight:500;
              letter-spacing:0.02em;">
        Powered by GPT-4o &nbsp;·&nbsp; 윤선생영어
    </p>
</div>
""", unsafe_allow_html=True)
