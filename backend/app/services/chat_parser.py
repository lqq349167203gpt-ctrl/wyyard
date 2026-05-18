import json
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.models.customer import CustomerCreate
from app.services.customer_ai_config_service import get_config as get_customer_ai_config
from app.config.settings import settings

PARSE_PROMPT = """你是一个客户信息提取助手。用户会给你一段与客户的聊天记录，你需要从中提取以下信息，以 JSON 格式返回：

{
  "nickname": "客户昵称",
  "name": "客户姓名",
  "phone": "电话号码",
  "wechat": "微信号",
  "age": "年龄",
  "referrer": "引流人/推荐人",
  "paid_content": [
    {"type": "399次卡", "usage_count": 0, "salesperson": "成交人"}
  ],
  "visit_count": 0,
  "core_situation": "核心情况摘要",
  "need_tags": "需求标签",
  "follow_up_node": "跟进节点",
  "follow_up_action": "核心动作",
  "positions": ["课程部"],
  "self_tags": ["自我成长"]
}

paid_content 的 type 只能是：399次卡、3999会员、半年卡、2w疗愈师
positions 的值只能是：课程部、流量部、承接部、售后部、成就君、信息管理（可多选）
self_tags 的值只能是：自我成长、共创、变现

无法从聊天记录中提取的字段留空字符串或空数组。只返回 JSON，不要其他内容。"""

TAG_GENERATION_PROMPT = """你是一个标签优化助手。用户会给你一段客户标签的原始描述，你需要将其优化为简洁、规范的标签格式。

规则：
1. 保留原始描述的核心含义
2. 使用简洁的词语或短语
3. 多个标签用逗号分隔
4. 不要添加额外的解释

只返回优化后的标签文本，不要其他内容。"""


def parse_chat_log(chat_log: str) -> CustomerCreate:
    config = get_customer_ai_config()
    api_key = config.api_key or settings.llm_api_key
    base_url = config.base_url or settings.llm_base_url
    model = config.model or settings.llm_model
    system_prompt = config.system_prompt or PARSE_PROMPT

    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0,
        max_tokens=2048,
    )

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"请从以下聊天记录中提取客户信息：\n\n{chat_log}"),
    ])

    content = response.content
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0]
    if content.startswith("json"):
        content = content[4:]

    data = json.loads(content.strip())
    return CustomerCreate(**data)


def generate_tags(tags: str) -> str:
    config = get_customer_ai_config()
    api_key = config.api_key or settings.llm_api_key
    base_url = config.base_url or settings.llm_base_url
    model = config.model or settings.llm_model

    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0,
        max_tokens=1024,
    )

    response = llm.invoke([
        SystemMessage(content=TAG_GENERATION_PROMPT),
        HumanMessage(content=f"请优化以下客户标签：\n\n{tags}"),
    ])

    return response.content.strip()
