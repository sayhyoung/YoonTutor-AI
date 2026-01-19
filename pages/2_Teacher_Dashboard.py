import streamlit as st
import pandas as pd
import json
import plotly.express as px
from modules.log_manager import get_all_logs

st.set_page_config(page_title="교사용 대시보드", page_icon="👩‍🏫", layout="wide")
st.markdown("""
    <style>
        /* 1. 오른쪽 상단 햄버거 메뉴(점 3개) 숨기기 */
        #MainMenu {visibility: hidden;}
        
        /* 2. 하단 'Made with Streamlit' 푸터 숨기기 */
        footer {visibility: hidden;}
        
        /* 3. 상단 헤더 줄 숨기기 (선택사항 - 깔끔하게 하려면 추천) */
        header {visibility: hidden;}
        
        /* 4. Streamlit Cloud의 'Manage app' 버튼 숨기기 */
        .stDeployButton {display:none;}
    </style>
""", unsafe_allow_html=True)

# ✅ [수정] 이중 로그인 방지 (세션 상태 확인)
if "user_role" not in st.session_state or st.session_state["user_role"] != "teacher":
    st.warning("관리자 로그인이 필요합니다. 메인 화면에서 로그인해주세요.")
    st.switch_page("main.py")
    st.stop()

st.title("👩‍🏫 윤선생 AI 학습 관리자")

# 로그아웃 버튼 (선택 사항)
with st.sidebar:
    st.write(f"로그인 상태: 선생님 모드")
    if st.button("새로고침 🔄"):
        st.rerun()
    if st.button("로그아웃 🚪"):
        st.session_state["user_role"] = None
        st.switch_page("main.py")

df = get_all_logs()

if df.empty:
    st.info("아직 학습 데이터가 없습니다.")
else:
    # 1. 상단 지표
    col1, col2, col3 = st.columns(3)
    col1.metric("총 학습 횟수", f"{len(df)}건")
    col2.metric("전체 평균 점수", f"{int(df['score'].mean())}점")
    col3.metric("최근 학습자", df.iloc[0]['name'])

    # 2. 성취도 추이 (그래프)
    st.markdown("---")
    st.subheader("📈 최근 성취도 추이 (개인별)")
    
    chart_df = df.sort_values(by="timestamp").copy()
    chart_df['Label'] = chart_df['name'] + " (" + chart_df['timestamp'].str[5:10] + ")"
    
    fig = px.line(chart_df, x="timestamp", y="score", color="name", markers=True,
                  title="학생별 성취도 변화", labels={"timestamp": "학습 일시", "score": "점수", "name": "학생 이름"})
    
    fig.update_yaxes(range=[0, 105])
    st.plotly_chart(fig, use_container_width=True)

    # 3. 상세 분석
    st.markdown("---")
    st.subheader("📝 학생별 문항 상세 분석")
    
    for index, row in df.iterrows():
        label = f"[{row['timestamp']}] {row['name']} - {row['score']}점"
        with st.expander(label):
            details_raw = row.get('details', '[]')
            try:
                if isinstance(details_raw, list): details = details_raw
                else: details = json.loads(details_raw)
                
                if details:
                    detail_df = pd.DataFrame(details)
                    def highlight_status(val):
                        if val == 'Not mastered': return 'color: red; font-weight: bold'
                        elif val == 'Perfect': return 'color: green; font-weight: bold'
                        return ''
                    
                    # 보여줄 컬럼 선택 (source_sheet 유무에 따라)
                    cols_to_show = ['source_sheet', 'question', 'status'] if 'source_sheet' in detail_df.columns else ['question', 'status']
                    
                    st.dataframe(detail_df[cols_to_show].style.map(highlight_status, subset=['status']), use_container_width=True)
                else:
                    st.write("상세 문항 데이터 없음")
            except Exception as e:
                st.error("데이터 형식 오류")