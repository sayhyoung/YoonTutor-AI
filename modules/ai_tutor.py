import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv(override=True)
api_key = os.getenv("OPENAI_API_KEY")

def init_socratic_tutor(student_name, wrong_data_df):
    if wrong_data_df.empty:
        return None

    wrong_summary = ""
    i = 1
    for index, row in wrong_data_df.iterrows():
        sheet_type = row.get('source_sheet', '기타')
        word = str(row.get('단어', '')).strip()
        meaning = str(row.get('정답 의미', '')).strip()
        sentence = str(row.get('문장', '')).strip()
        problem = str(row.get('문제 내용', '')).strip()
        
        # 'nan' 처리
        if word.lower() == 'nan': word = ""
        if meaning.lower() == 'nan': meaning = ""
        
        meaning_str = f"(뜻: {meaning})" if meaning else ""

        # AI에게 전달할 데이터 포맷
        if sheet_type == "단어" and word:
            wrong_summary += f"[단어] 정답:{word} {meaning_str}\n"
        elif sheet_type == "문장" and sentence:
            wrong_summary += f"[문장] 정답:{sentence} {meaning_str}\n"
        elif sheet_type == "평가" and problem:
            wrong_summary += f"[문법] 핵심내용:{problem}\n"
        i += 1

    # 👇 [프롬프트 강력 수정] 👇
    system_prompt = f"""
    너는 '윤선생 영어교실'의 꼼꼼하고 엄격한 AI 튜터야. 학생({student_name})에게 반말(친구 모드)을 사용해.
    
    [복습 문제 목록]
    {wrong_summary}

    [🚨 절대 금지 사항 (어길 시 오류)]
    1. **영양가 없는 추임새 금지:** "아쉽다", "조금 아쉽네", "안타까워" 같은 감정적인 멘트는 **절대 쓰지 마.**
       - 오답이 나오면 바로 **왜 틀렸는지(철자, 의미, 문법)**를 건조하고 정확하게 지적해.
    2. **숫자 세기 금지:** "3글자야", "4단어 문장이야"라고 말하지 마. (네가 자주 틀리기 때문이야.)
       - 대신 **마스킹(___)**이나 **시작 철자**를 알려줘.
    3. **불완전한 정답 인정 금지:** - 정답이 "Stand up"인데 "Stand"만 입력하면 **오답**이야.
       - 정답이 "Nice to meet you"인데 "Nice to"만 입력하면 **오답**이야.
       - 학생에게 "문장을 끝까지 완성해서 다시 적어줘"라고 지시해.

    [진행 규칙]
    1. **무조건 1번 문제부터 시작해.** 번호는 "1. " 형태.
    2. 문제를 낼 때 "(힌트 없음)" 같은 말 붙이지 마. 깔끔하게 문제만 내.

    [오답 대응 및 힌트 로직 (엄격 모드)]
    
    - **Step 1 (문제 제시):** 힌트 없이 문제만.
    - **Step 2 (1차 오답):** [분석적 피드백] + **약한 힌트(초성)**.
      - (예: Dad인데 Mom이라고 함) -> "그건 엄마잖아. 아빠는 d로 시작해." (O)
      - (예: "아쉽다. 다시 해봐") -> (X) 절대 금지
    - **Step 3 (2차 오답):** [분석적 피드백] + **강한 힌트(마스킹)**.
      - (예) "d_d 형태로 써봐." (글자 수 언급 없이 형태만 보여줌)
      - (예: Sentence) "Nice t_ m___ y__ 형태로 문장을 완성해봐."
    - **Step 4 (3차 오답):** 정답 공개. "정답은 [정답]이야." -> **[FAILED]** 태그 -> 다음 문제.

    [채점 태그]
    - **정답 시:** **[PERFECT]** (1번만), **[GOOD]** (2~3번만).
    - **완료 시:** **[DONE]**

    시작: "안녕 {student_name}! 복습할 문제 {len(wrong_data_df)}개야. 1번부터 바로 시작할게!"
    """
    
    return [SystemMessage(content=system_prompt)]

def get_ai_response(messages):
    chat = ChatOpenAI(openai_api_key=api_key, temperature=0.3, model_name="gpt-4o") # 엄격함을 위해 temperature 낮춤
    response = chat.invoke(messages)
    return response.content

def generate_final_report(student_name, results_list):
    summary_text = ""
    for res in results_list:
        summary_text += f"- {res.get('source_sheet', '기타')}: {res['question']} -> {res['status']}\n"
        
    prompt = f"""
    학생({student_name})의 학습 결과를 보고 피드백을 작성해줘.
    
    [결과 데이터]
    {summary_text}
    
    [작성 규칙]
    1. 핵심만 짧게. (3문장 이내)
    2. 인사말 생략.
    3. 잘한 점/부족한 점 명확히.
    """
    
    chat = ChatOpenAI(openai_api_key=api_key, temperature=0.5, model_name="gpt-4o")
    return chat.invoke([HumanMessage(content=prompt)]).content