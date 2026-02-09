import streamlit as st
from modules.db_manager import get_student_name

st.set_page_config(page_title="윤선생 AI 튜터", page_icon="🎓", layout="wide")

st.markdown("""
    <style>
        /* 1. 상단 헤더 전체 숨기기 (햄버거 메뉴, 깃허브 아이콘 등) */
        header {
            visibility: hidden !important;
            height: 0px !important;
        }
        
        /* 2. 툴바 및 깃허브 링크 버튼 숨기기 */
        [data-testid="stToolbar"] {
            visibility: hidden !important;
            display: none !important;
        }
        
        /* 3. 혹시라도 남아있는 깃허브 링크(a 태그) 강제 숨김 */
        a[href^="https://github.com"] {
            display: none !important;
        }

        /* 4. 하단 푸터 숨기기 */
        footer {
            visibility: hidden !important;
            display: none !important;
        }
        
        /* 5. 콘텐츠 영역을 위로 바짝 당기기 (헤더가 사라진 빈 공간 제거) */
        .block-container {
            padding-top: 0rem !important; 
        }
        
        /* 6. 배포 버튼 숨기기 */
        .stDeployButton {
            display: none !important;
        }
    </style>
""", unsafe_allow_html=True)


# 구글 시트 주소 (여기에 하나만 정의해두면 편합니다)
SHEET_URL = "https://docs.google.com/spreadsheets/d/18CTkxyG79jZRzniWxM1Xde8TngSi-eAUqOBF98Aash0/edit"

st.title("🎓 윤선생 AI 스마트 학습 리뷰 시스템")
st.markdown("### 환영해! 여기서 바로 로그인하면 돼.")

tab1, tab2 = st.tabs(["👦 학생 로그인 (Student)", "👩‍🏫 선생님 로그인 (Teacher)"])

# 1. 학생 로그인
with tab1:
    st.subheader("학생은 회원번호만 입력해!")
    col_s1, col_s2 = st.columns([3, 1])
    with col_s1:
        student_id_input = st.text_input("회원번호 (예: 1111)", key="student_id_input")
    with col_s2:
        st.write("")
        st.write("")
        if st.button("학생 입장 🚀", type="primary"):
            if student_id_input:
                with st.spinner("회원 정보를 확인 중..."):
                    # DB에서 이름 찾기
                    found_name = get_student_name(SHEET_URL, student_id_input)
                    
                    if found_name:
                        st.success(f"반가워, {found_name} 친구!")
                        # 세션에 정보 저장
                        st.session_state["user_role"] = "student"
                        st.session_state["user_id"] = student_id_input
                        st.session_state["user_name"] = found_name # 이름 저장
                        st.switch_page("pages/1_Student_Room.py")
                    else:
                        st.error("등록되지 않은 회원번호야. 번호를 다시 확인해줘!")
            else:
                st.error("회원번호를 입력해줘.")

# 2. 선생님 로그인
with tab2:
    # (기존 코드 동일)
    st.subheader("선생님은 비밀번호를 입력해주세요.")
    col_t1, col_t2 = st.columns([3, 1])
    with col_t1:
        teacher_pw = st.text_input("관리자 비밀번호(1234)", type="password", key="teacher_pw_input")
    with col_t2:
        st.write("")
        st.write("")
        if st.button("교사 입장 👩‍🏫"):
            if teacher_pw == "1234":
                st.session_state["user_role"] = "teacher"
                st.switch_page("pages/2_Teacher_Dashboard.py")
            else:
                st.error("비밀번호가 틀렸습니다.")

st.markdown("---")