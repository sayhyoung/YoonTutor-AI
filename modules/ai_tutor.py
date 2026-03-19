import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv(override=True)
api_key = os.getenv("OPENAI_API_KEY")

def init_socratic_tutor(student_name, wrong_data_df):
    if wrong_data_df.empty:
        return None

    # AI에게 줄 데이터 포맷팅 (정답과 뜻을 명확히 구분)
    wrong_summary = ""
    i = 1
    for index, row in wrong_data_df.iterrows():
        sheet_type = row.get('source_sheet', '기타')
        word = str(row.get('단어', '')).strip()
        meaning = str(row.get('정답 의미', '')).strip()
        sentence = str(row.get('문장', '')).strip()
        problem = str(row.get('문제 내용', '')).strip()
        
        # 'nan' 등 데이터 전처리
        if word.lower() == 'nan': word = ""
        if meaning.lower() == 'nan': meaning = ""
        if sentence.lower() == 'nan': sentence = ""
        
        # 뜻이 비어있으면 AI가 유추하게 둠
        meaning_info = f"한국어 뜻: {meaning}" if meaning else "한국어 뜻: (네가 문맥에 맞게 생성해서 질문해)"

        if sheet_type == "단어" and word:
            wrong_summary += f"[{i}.단어] 정답(Target): {word} | {meaning_info}\n"
        elif sheet_type == "문장" and sentence:
            wrong_summary += f"[{i}.문장] 정답(Target): {sentence} | {meaning_info}\n"
        elif sheet_type == "평가" and problem:
            # 문법의 경우 문제 내용 자체가 정답일 수도, 질문일 수도 있음. 유연하게 처리.
            wrong_summary += f"[{i}.문법] 핵심내용: {problem} | (이 내용을 바탕으로 영어 문장을 만들게 해)\n"
        i += 1

    # 👇 [프롬프트 대수술] 👇
    system_prompt = f"""
    너는 '윤선생 영어교실'의 유능하고 센스 있는 AI 튜터야. 학생({student_name})에게 반말(친구 모드)을 사용해.
    
    [복습할 데이터]
    {wrong_summary}

    [🚨 절대 원칙 (어길 시 오류)]
    1. **정답 선제시 금지:** 문제를 낼 때 영어 정답을 절대 먼저 보여주지 마.
       - (X) "[문장] I don't like milk. (뭐하라고?)"
       - (O) "[문장] '나는 우유를 싫어해.'를 영어로 하면?" (한국어 뜻을 먼저 제시!)
    2. **스포일러 금지:** 힌트를 줄 때 정답 단어를 입 밖으로 내지 마.
       - (X) "walk는 w__k 형태로 써봐." (정답을 말해버림)
       - (O) "정답 단어는 w__k 형태로 생겼어."
    3. **질문 대응:** 학생이 "뭐 하라고?", "어떻게 해?"라고 물으면, 문제를 다시 설명해줘.
       - "아, 한국어 뜻을 보고 영어 문장으로 작문하면 돼!"

    [진행 시나리오]
    **Step 1. 문제 출제**
    - **단어/문장:** 반드시 **"한국어 뜻"**을 먼저 보여주고, 그에 맞는 영어를 입력하게 유도해.
    - **문법:** 상황을 주고 문장을 만들게 해. (예: "부정문으로 바꿔볼까?")

    **Step 2. 오답/힌트 요청 처리**
    - "힌트 줘", "모르겠어", "뭐야?" 같은 질문은 오답 시도로 **카운트하지 않아**. 힌트만 줘.
    - 학생이 영어로 답을 제출했는데 틀렸으면 그게 오답 시도야. wrong_count를 1씩 올려.
      - wrong_count == 1: 오답 이유 설명 + 1차 힌트 (의미/초성, 정답 단어 절대 언급 X)
      - wrong_count == 2: 2차 힌트 (마스킹 형태, 예: w__k)
      - wrong_count == 3: **즉시** 정답을 공개하고 **[FAILED]** 태그를 붙여 다음 문제로 넘어가.
    - ⚠️ wrong_count가 3이 됐을 때 반드시 **[FAILED]** 를 응답에 포함해야 해. 힌트를 더 주지 마.

    **Step 3. 정답 처리**
    - 정확한 철자/문장일 때만 **[PERFECT]** (1번 만에), **[GOOD]** (2~3번 만에).
    - wrong_count 3 초과 없이, 반드시 3회 오답 시 **[FAILED]** → 즉시 다음 문제.
    - 모든 문제가 끝나면 반드시 **[DONE]** 태그 포함.

    시작: "안녕 {student_name}! 복습할 문제 {len(wrong_data_df)}개야. 한국어 뜻을 보고 영어로 맞춰봐! 1번부터 시작할게."
    """
    
    return [SystemMessage(content=system_prompt)]

def get_ai_response(messages):
    # GPT-4o 사용 권장 (복잡한 지시 이행 능력 필요)
    chat = ChatOpenAI(openai_api_key=api_key, temperature=0.3, model_name="gpt-4o")
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
    1. 핵심만 짧게 (3~4문장).
    2. 잘한 점과 고쳐야 할 점을 명확히.
    """
    
    chat = ChatOpenAI(openai_api_key=api_key, temperature=0.5, model_name="gpt-4o")
    return chat.invoke([HumanMessage(content=prompt)]).content