import streamlit as st
import pandas as pd
from modules.db_manager import fetch_wrong_answers
from modules.ai_tutor import init_socratic_tutor, get_ai_response, generate_final_report
from modules.log_manager import save_learning_log
from langchain_core.messages import HumanMessage, AIMessage

st.set_page_config(page_title="학생용 학습방", page_icon="✏️")

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

SHEET_URL = "https://docs.google.com/spreadsheets/d/18CTkxyG79jZRzniWxM1Xde8TngSi-eAUqOBF98Aash0/edit"

if "user_role" not in st.session_state or st.session_state["user_role"] != "student":
    st.warning("로그인이 필요해!")
    st.switch_page("main.py")

user_id = st.session_state.get("user_id", "알수없음")
user_name = st.session_state.get("user_name", "친구") # 이름 가져오기

st.title(f"✏️ 안녕! {user_name} ({user_id})")
# 세션 및 초기화 로직
if "messages" not in st.session_state: st.session_state.messages = []
if "chat_started" not in st.session_state: st.session_state.chat_started = False
if "is_finished" not in st.session_state: st.session_state.is_finished = False
if "learning_results" not in st.session_state: st.session_state.learning_results = [] 
if "current_q_index" not in st.session_state: st.session_state.current_q_index = 0
if "attempt_count" not in st.session_state: st.session_state.attempt_count = 0  # 👈 [추가] 시도 횟수 0으로 초기화




with st.sidebar:
    if st.button("처음부터 다시 하기 🔄"):
        for key in ["messages", "chat_started", "is_finished", "learning_results", "current_q_index", "ai_report_comment"]:
            if key in st.session_state: del st.session_state[key]
        st.rerun()

# 1. 데이터 로딩
if not st.session_state.chat_started and not st.session_state.messages:
    with st.spinner("데이터 로딩 중..."):
        try: member_id = int(user_id) 
        except: st.error("ID 오류"); st.stop()
        
        df1 = fetch_wrong_answers(SHEET_URL, "단어", member_id)
        df2 = fetch_wrong_answers(SHEET_URL, "문장", member_id)
        df3 = fetch_wrong_answers(SHEET_URL, "평가", member_id)
        wrong_df = pd.concat([df1, df2, df3], ignore_index=True)
        
        if wrong_df.empty:
            st.balloons(); st.success("틀린 문제가 없어! 완벽해 🎉")
        else:
            st.session_state.wrong_df = wrong_df
            initial_history = init_socratic_tutor(user_name, wrong_df)
            st.session_state.messages = initial_history
            first_msg = get_ai_response(st.session_state.messages)
            st.session_state.messages.append(AIMessage(content=first_msg))
            st.session_state.chat_started = True
            st.rerun()

# 2. 메인 화면
if st.session_state.chat_started:
    total_q = len(st.session_state.wrong_df)
    done_q = len(st.session_state.learning_results)
    st.progress(done_q / total_q if total_q > 0 else 0, text=f"진행률: {done_q}/{total_q}")

    chat_container = st.container(height=450)
    with chat_container:
        for msg in st.session_state.messages:
            if msg.type == "system": continue
            text = msg.content.replace("[PERFECT]", "").replace("[GOOD]", "").replace("[FAILED]", "").replace("[DONE]", "")
            if msg.type == "human":
                with st.chat_message("user"): st.write(text)
            else:
                with st.chat_message("assistant", avatar="🦉"): st.write(text)

    if not st.session_state.is_finished:
        if user_input := st.chat_input("정답 입력..."):
            st.session_state.messages.append(HumanMessage(content=user_input))
            st.session_state.attempt_count += 1  # 👈 [추가] 입력할 때마다 시도 횟수 증가
            st.rerun()

    if st.session_state.messages and isinstance(st.session_state.messages[-1], HumanMessage) and not st.session_state.is_finished:
        with chat_container:
             with st.chat_message("assistant", avatar="🦉"):
               with st.spinner("채점 중..."):
                    ai_reply = get_ai_response(st.session_state.messages)
                    
                    # 1. 현재 문제 정보 가져오기 (기존 코드 유지)
                    curr_content = "내용 없음"
                    curr_type = "기타"
                    
                    if st.session_state.current_q_index < len(st.session_state.wrong_df):
                        row = st.session_state.wrong_df.iloc[st.session_state.current_q_index]
                        curr_type = row.get('source_sheet', '기타')
                        
                        if curr_type == '단어': curr_content = row.get('단어', '')
                        elif curr_type == '문장': curr_content = row.get('문장', '')
                        elif curr_type == '평가': curr_content = row.get('문제 내용', '')
                        
                        if not curr_content:
                            curr_content = row.get('단어') or row.get('문장') or row.get('문제 내용') or "확인 필요"

                    # 2. [핵심 수정] 시도 횟수 기반 채점 로직
                    status = None
                    is_correct = False
                    
                    # 정답인지 오답인지 태그로 판단
                    if "[PERFECT]" in ai_reply or "[GOOD]" in ai_reply:
                        is_correct = True
                    
                    # 정답을 맞췄거나, 3번 틀려서 FAILED(정답공개)가 떴을 때 상태 결정
                    if is_correct or "[FAILED]" in ai_reply:
                        attempts = st.session_state.attempt_count
                        
                        if is_correct:
                            # 1번 만에 맞춤 -> Perfect
                            if attempts == 1: 
                                status = "Perfect"
                                st.toast(f"완벽해! 한 번에 맞췄어! (100점) 💯", icon="🎉")
                            # 2~3번 만에 맞춤 -> Good
                            elif 2 <= attempts <= 3: 
                                status = "Good"
                                st.toast(f"{attempts}번 만에 성공! 잘했어 (75점) 👍", icon="✅")
                            # 4번 이상 -> Not mastered
                            else: 
                                status = "Not mastered"
                                st.toast(f"맞췄지만 여러 번 시도했어. 복습하자! (50점)", icon="⚠️")
                        else:
                            # 틀려서 정답이 공개된 경우 -> Not mastered
                            status = "Not mastered"
                            st.toast("아쉽지만 다음엔 맞힐거야 (50점)", icon="💪")
                    
                    # 3. 결과 저장 및 다음 문제로 넘기기
                    if status:
                        st.session_state.learning_results.append({
                            "question": curr_content,
                            "status": status,
                            "source_sheet": curr_type
                        })
                        st.session_state.current_q_index += 1
                        st.session_state.attempt_count = 0  # 👈 [중요] 다음 문제를 위해 카운트 리셋

                    if "[DONE]" in ai_reply:
                        st.session_state.is_finished = True
                        # save_learning_log 함수 호출 시 인자 개수 주의 (코드에 맞게 수정 필요)
                        try:
                            save_learning_log(str(member_id), user_name, total_q, len(st.session_state.learning_results), 0, st.session_state.learning_results)
                        except:
                            # 인자 개수가 다를 경우 대비 (구버전 호환)
                            save_learning_log(str(member_id), user_name, total_q, st.session_state.learning_results)
                            
                        st.balloons()
                        
                    clean_text = ai_reply.replace("[PERFECT]", "").replace("[GOOD]", "").replace("[FAILED]", "").replace("[DONE]", "")
                    st.write(clean_text)
                    st.session_state.messages.append(AIMessage(content=ai_reply))
                    st.rerun() 

    # 3. 결과 리포트
    if st.session_state.is_finished:
        st.markdown("---")
        st.header("📊 학습 결과 리포트")
        
        res_df = pd.DataFrame(st.session_state.learning_results)
        def get_icon(val):
            if val == "Perfect": return "👑 Perfect (100)"
            elif val == "Good": return "✅ Good (75)"
            else: return "⚠️ Not mastered (50)"
        res_df['성취도'] = res_df['status'].apply(get_icon)
        
        st.dataframe(res_df[['source_sheet', 'question', '성취도']], 
                     column_config={"source_sheet":"영역", "question":"학습 내용"}, use_container_width=True)
        
        score_sum = 0
        for r in st.session_state.learning_results:
            if r['status'] == 'Perfect': score_sum += 100
            elif r['status'] == 'Good': score_sum += 75
            else: score_sum += 50
        avg_score = int(score_sum / total_q) if total_q > 0 else 0
        st.metric("오늘의 최종 점수", f"{avg_score}점")
        
        st.subheader("💡 AI 선생님의 핵심 피드백")
        if "ai_report_comment" not in st.session_state:
            with st.spinner("분석 중..."):
                report_comment = generate_final_report(user_name, st.session_state.learning_results)
                st.session_state.ai_report_comment = report_comment
        
        st.info(st.session_state.ai_report_comment)