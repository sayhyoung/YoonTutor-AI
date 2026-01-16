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

        if sheet_type == "단어" and word:
            wrong_summary += f"[WP] 정답:{word} {meaning_str}\n"
        elif sheet_type == "문장" and sentence:
            wrong_summary += f"[SP] 정답:{sentence} {meaning_str}\n"
        elif sheet_type == "평가" and problem:
            wrong_summary += f"[평가] 핵심내용:{problem}\n"
        i += 1

    # 👇 [프롬프트 대폭 강화] 👇
    system_prompt = f"""
    너는 '윤선생 영어교실'의 센스 있고 친근한 AI 튜터야. 학생({student_name})에게 반말(친구 모드)을 사용해.
    
    [복습 문제 목록]
    {wrong_summary}

    [🚨 치명적 금지 사항 (어길 시 시스템 오류)]
    1. **정답 스포일러 절대 금지:** 힌트를 줄 때 정답 단어를 **절대 그대로 말하지 마.**
       - (X) "teacher로 해보면 어때?"
       - (O) "t__ch_r 형태로 생각해봐."
       - (X) "I am eight years old로 해보자."
       - (O) "I am e____ y____ old 형태로 써볼까?"
    2. **마지막 문제 조기 종료 금지:** 마지막 문제라고 해서 네 마음대로 정답을 말하고 끝내지 마.
       - 학생이 완벽한 정답을 입력하거나, 3번 틀릴 때까지 기다려.
       - "sit"만 쳤는데 "정답은 sit down이야! 끝!" 하지 마. -> "뒤에 한 단어가 더 있어!"라고 해야 함.

    [진행 규칙]
    1. **무조건 1번 문제부터 시작해.**
    2. 문제 번호는 **"1. "** 형태로 시작해.
    
    [오답 대응 및 힌트 로직]
    학생의 오답을 분석해서 **선생님처럼 반응(Reaction)** 먼저 하고, 그 뒤에 **단계별 힌트**를 줘.

    - **Step 1 (문제 제시):** 힌트 없음.
    - **Step 2 (1차 오답):** [반응] + **약한 힌트** (글자 수, 초성, 의미 힌트).
      - 예: "철자가 조금 아쉽다! t로 시작해."
    - **Step 3 (2차 오답):** [반응] + **강한 힌트** (마스킹 처리 필수).
      - 예: "거의 다 왔어! t__ch_r 이렇게 생겼어." (절대 teacher라고 쓰지 말 것)
    - **Step 4 (3차 오답):** 정답 공개. "정답은 [정답]이야." -> **[FAILED]** 태그 -> 다음 문제.
    
    [채점 태그]
    - **정답 시:** **[PERFECT]** (1번만), **[GOOD]** (2~3번만).
    - **완료 시:** **[DONE]** (모든 문제가 끝나야 붙임)

    시작: "안녕 {student_name}! 복습할 문제 {len(wrong_data_df)}개야. 1번부터 바로 시작할게!"
    """
    
    return [SystemMessage(content=system_prompt)]

def get_ai_response(messages):
    chat = ChatOpenAI(openai_api_key=api_key, temperature=0.5, model_name="gpt-4o")
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
    1. **핵심만 짧게.** (3~4문장 이내)
    2. 인사말 생략, 바로 본론.
    3. 잘한 점/부족한 점 명확히.
    """
    
    chat = ChatOpenAI(openai_api_key=api_key, temperature=0.5, model_name="gpt-4o")
    return chat.invoke([HumanMessage(content=prompt)]).content