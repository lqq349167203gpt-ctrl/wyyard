import json
import re
from datetime import date
from typing import Any, Dict, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config.settings import settings
from app.models.customer import CustomerCreate
from app.models.visit import VisitRecordCreate
from app.models.membership_card import MembershipCardCreate
from app.models.group_case import GroupCaseCreate
from app.models.emotional_release import EmotionalReleaseCreate
from app.models.energy_knot import EnergyKnotCreate
from app.models.internal_course import InternalCourseCreate
from app.models.other_project import OtherProjectCreate
from app.services import customer_service
from app.services import visit_service
from app.services import membership_card_service
from app.services.chat_parser import _escape_xml
from app.services import group_case_service
from app.services import emotional_release_service
from app.services import energy_knot_service
from app.services import internal_course_service
from app.services import other_project_service
from app.services import system_helper_config_service

ACTION_LABELS = {
    "create_customer": "新建客户",
    "create_visit": "到访记录",
    "create_membership_card": "会员卡购买",
    "create_group_case": "觉醒游戏",
    "create_emotional_release": "情绪释放",
    "create_energy_knot": "能量结",
    "create_internal_course": "内部课程",
    "create_other_project": "其他项目",
}

FIELD_LABELS = {
    "nickname": "昵称",
    "name": "姓名",
    "gender": "性别",
    "phone": "电话",
    "wechat": "微信",
    "visit_date": "到访日期",
    "visit_time": "到访时间",
    "space_id": "空间",
    "needs": "需求",
    "arrived": "已到场",
    "card_type": "卡类型",
    "price": "价格",
    "effective_date": "生效日期",
    "duration_type": "时长类型",
    "duration_value": "时长值",
    "remaining_count": "剩余次数",
    "purchase_count": "购买次数",
    "amount": "金额",
    "course_type": "课程类型",
    "project_name": "项目名称",
    "fee": "费用",
    "activity_mode": "活动模式",
    "closer_name": "成交人",
    "organization_id": "所属组织",
}

ENTRY_PROMPT = """你是"无忧茶苑"后台管理系统的 AI 数据录入助手。用户会用自然语言描述要录入的信息，你需要解析并返回结构化数据。

## 今天日期
{today}

## 系统中的客户列表
{customer_list}

## 支持的操作

### 1. create_customer — 新建客户
识别关键词：新客户、添加客户、新增客户、注册客户
字段：
- nickname（必填）— 昵称
- name（可选）— 姓名
- gender（可选）— 性别（男/女）
- phone（可选）— 电话
- wechat（可选）— 微信

### 2. create_visit — 到访记录
识别关键词：来了、参加、到访、来访、到场、上课
字段：
- customer_id（必填）— 客户ID（从客户列表匹配）
- nickname（必填）— 客户昵称
- visit_date（必填）— 到访日期，格式 YYYY-MM-DD，默认今天
- visit_time（可选）— 到访时间，格式 HH:MM
- needs（可选）— 需求
- arrived（可选）— 是否已到场，默认 true

### 3. create_membership_card — 会员卡购买
识别关键词：买会员、办卡、次卡、会员卡、通卡、半年卡、年卡
字段：
- customer_id（必填）— 客户ID
- nickname（必填）— 客户昵称
- card_type（必填）— 卡类型（体验会员/常规通卡/半年卡/年卡）
- price（必填）— 价格
- effective_date（必填）— 生效日期，格式 YYYY-MM-DD，默认今天
- closer_name（可选）— 成交人
- organization_id（可选）— 所属组织ID

### 4. create_group_case — 觉醒游戏
识别关键词：觉醒游戏、买了觉醒
字段：
- customer_id（必填）— 客户ID
- nickname（必填）— 客户昵称
- purchase_count（可选）— 购买次数
- amount（可选）— 金额
- closer_name（可选）— 成交人

### 5. create_emotional_release — 情绪释放
识别关键词：情绪释放、买了情绪
字段：
- customer_id（必填）— 客户ID
- nickname（必填）— 客户昵称
- purchase_count（可选）— 购买次数
- amount（可选）— 金额
- closer_name（可选）— 成交人

### 6. create_energy_knot — 能量结
识别关键词：能量结、买了能量
字段：
- customer_id（必填）— 客户ID
- nickname（必填）— 客户昵称
- purchase_count（可选）— 购买次数
- amount（可选）— 金额
- closer_name（可选）— 成交人

### 7. create_internal_course — 内部课程
识别关键词：内部课程、买了课程、疗愈师课程、商业框架、落地赋能
字段：
- customer_id（必填）— 客户ID
- nickname（必填）— 客户昵称
- course_type（必填）— 课程类型（疗愈师课程：自爱力构建/商业框架陪跑：自觉力提升/落地赋能班：自洽力整合）
- price（必填）— 价格
- effective_date（必填）— 生效日期，格式 YYYY-MM-DD，默认今天
- closer_name（可选）— 成交人

### 8. create_other_project — 其他项目
识别关键词：其他项目
字段：
- customer_id（必填）— 客户ID
- nickname（必填）— 客户昵称
- project_name（必填）— 项目名称
- effective_date（必填）— 生效日期，格式 YYYY-MM-DD，默认今天
- fee（可选）— 费用
- activity_mode（可选）— 活动模式（线上/线下）

## 客户匹配规则
- 用户提到客户名字时，从上方客户列表中查找
- 精确匹配（nickname 完全相同）→ 填入 customer_id
- 模糊匹配（nickname 包含关键词）→ 在 customer_candidates 中列出候选
- 无匹配 → 不填 customer_id，在 missing_required 中加入 customer_id

## 回复格式
你必须返回一个 JSON 对象，用 ```json 和 ``` 包裹。不要返回其他内容。

```json
{{
  "action": "操作类型（如 create_visit）",
  "confidence": 0.9,
  "data": {{
    "字段名": "字段值"
  }},
  "missing_required": ["缺失的必填字段名"],
  "missing_optional": ["缺失的可选字段名"],
  "customer_candidates": [
    {{"id": "客户ID", "nickname": "昵称"}}
  ],
  "message": "给用户的自然语言回复，说明识别到了什么、缺少什么"
}}
```

## 重要规则
1. 如果用户输入不是数据录入意图（比如在问系统操作问题），返回：
```json
{{
  "action": "chat",
  "message": "用户的问题的自然语言回复"
}}
```
2. 必填字段缺失时，在 missing_required 中列出，并在 message 中告知用户需要提供
3. 可选字段缺失时，在 missing_optional 中列出，并在 message 中询问是否需要补充
4. 日期类字段如果用户没说，默认用今天日期
5. 客户匹配到多个候选时，在 customer_candidates 中全部列出，让用户选择
6. 如果用户说"不需要"或"跳过"，说明是在回复之前关于可选字段的询问"""


def _build_customer_list() -> str:
    customers = customer_service.list_customers()
    if not customers:
        return "（暂无客户）"
    lines = []
    for c in customers:
        if not c.is_deleted:
            lines.append(f"- {_escape_xml(c.nickname)} (ID: {c.id})")
    return "\n".join(lines) if lines else "（暂无客户）"


def _get_llm():
    config = system_helper_config_service.get_config()
    return ChatOpenAI(
        model=config.model or settings.llm_model,
        api_key=config.api_key or settings.llm_api_key,
        base_url=config.base_url or settings.llm_base_url,
        temperature=0.1,
        max_tokens=2048,
    )


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def parse_entry_intent(text: str, history: list = None) -> Dict[str, Any]:
    llm = _get_llm()
    customer_list = _build_customer_list()
    today = date.today().isoformat()
    prompt = ENTRY_PROMPT.format(today=today, customer_list=customer_list)

    messages = [SystemMessage(content=prompt)]
    if history:
        for msg in history[-6:]:
            if msg.get("role") == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg.get("role") == "assistant":
                messages.append(HumanMessage(content=f"[助手之前的回复: {msg['content'][:200]}]"))
    messages.append(HumanMessage(content=text))

    response = llm.invoke(messages)
    result = _extract_json(response.content)

    if not result:
        return {
            "action": "chat",
            "message": response.content,
        }

    if result.get("action") == "chat":
        return result

    action = result.get("action", "")
    if action not in ACTION_LABELS:
        return {
            "action": "chat",
            "message": result.get("message", "抱歉，我不太理解您的意思。"),
        }

    return result


def analyze_image_intent(image_base64: str, text: str = "", history: list = None) -> Dict[str, Any]:
    llm = _get_llm()
    customer_list = _build_customer_list()
    today = date.today().isoformat()
    prompt = ENTRY_PROMPT.format(today=today, customer_list=customer_list)

    user_content = []
    if text:
        user_content.append({"type": "text", "text": text})
    else:
        user_content.append({"type": "text", "text": "请分析这张图片，提取其中的客户信息、到访记录、购买记录等数据。"})
    user_content.append({
        "type": "image_url",
        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
    })

    messages = [SystemMessage(content=prompt)]
    if history:
        for msg in history[-6:]:
            if msg.get("role") == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg.get("role") == "assistant":
                messages.append(HumanMessage(content=f"[助手之前的回复: {msg['content'][:200]}]"))
    messages.append(HumanMessage(content=user_content))

    response = llm.invoke(messages)
    result = _extract_json(response.content)

    if not result:
        return {
            "action": "chat",
            "message": response.content,
        }

    if result.get("action") == "chat":
        return result

    action = result.get("action", "")
    if action not in ACTION_LABELS:
        return {
            "action": "chat",
            "message": result.get("message", "抱歉，无法从图片中识别出有效的录入信息。"),
        }

    return result


def execute_entry(action: str, data: Dict[str, Any]) -> Dict[str, Any]:
    try:
        if action == "create_customer":
            return _execute_create_customer(data)
        elif action == "create_visit":
            return _execute_create_visit(data)
        elif action == "create_membership_card":
            return _execute_create_membership_card(data)
        elif action == "create_group_case":
            return _execute_create_group_case(data)
        elif action == "create_emotional_release":
            return _execute_create_emotional_release(data)
        elif action == "create_energy_knot":
            return _execute_create_energy_knot(data)
        elif action == "create_internal_course":
            return _execute_create_internal_course(data)
        elif action == "create_other_project":
            return _execute_create_other_project(data)
        else:
            return {"success": False, "message": f"不支持的操作: {action}"}
    except ValueError as e:
        return {"success": False, "message": str(e)}
    except Exception as e:
        return {"success": False, "message": f"录入失败: {str(e)}"}


def _execute_create_customer(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = CustomerCreate(
        nickname=data.get("nickname", ""),
        name=data.get("name", ""),
        gender=data.get("gender", ""),
        phone=data.get("phone", ""),
        wechat=data.get("wechat", ""),
    )
    customer = customer_service.create_customer(create_data)
    return {
        "success": True,
        "message": f"已新建客户：{customer.nickname}",
        "id": customer.id,
    }


def _execute_create_visit(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = VisitRecordCreate(
        customer_id=data["customer_id"],
        visit_date=data.get("visit_date", date.today().isoformat()),
        visit_time=data.get("visit_time", "09:00"),
        needs=data.get("needs", ""),
        arrived=data.get("arrived", True),
        arrival_time=data.get("arrival_time", ""),
    )
    visit = visit_service.create_visit(create_data)
    from app.services import customer_service
    c = customer_service.get_customer(visit.customer_id) if visit.customer_id else None
    nick = c.nickname if c else ""
    return {
        "success": True,
        "message": f"已录入到访记录：{nick} {visit.visit_date}",
        "id": visit.id,
    }


def _execute_create_membership_card(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = MembershipCardCreate(
        customer_id=data["customer_id"],
        nickname=data["nickname"],
        card_type=data["card_type"],
        price=float(data.get("price", 0)),
        effective_date=data.get("effective_date", date.today().isoformat()),
        closer_name=data.get("closer_name"),
        organization_id=data.get("organization_id"),
    )
    card = membership_card_service.create_card(create_data)
    return {
        "success": True,
        "message": f"已录入会员卡：{card.nickname} {card.card_type}",
        "id": card.id,
    }


def _execute_create_group_case(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = GroupCaseCreate(
        customer_id=data["customer_id"],
        nickname=data["nickname"],
        purchase_count=int(data.get("purchase_count", 0)),
        amount=float(data.get("amount", 0)),
        closer_name=data.get("closer_name"),
        organization_id=data.get("organization_id"),
    )
    case = group_case_service.create_case(create_data)
    return {
        "success": True,
        "message": f"已录入觉醒游戏：{case.nickname}",
        "id": case.id,
    }


def _execute_create_emotional_release(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = EmotionalReleaseCreate(
        customer_id=data["customer_id"],
        nickname=data["nickname"],
        purchase_count=int(data.get("purchase_count", 0)),
        amount=float(data.get("amount", 0)),
        closer_name=data.get("closer_name"),
        organization_id=data.get("organization_id"),
    )
    release = emotional_release_service.create_release(create_data)
    return {
        "success": True,
        "message": f"已录入情绪释放：{release.nickname}",
        "id": release.id,
    }


def _execute_create_energy_knot(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = EnergyKnotCreate(
        customer_id=data["customer_id"],
        nickname=data["nickname"],
        purchase_count=int(data.get("purchase_count", 0)),
        amount=float(data.get("amount", 0)),
        closer_name=data.get("closer_name"),
        organization_id=data.get("organization_id"),
    )
    knot = energy_knot_service.create_knot(create_data)
    return {
        "success": True,
        "message": f"已录入能量结：{knot.nickname}",
        "id": knot.id,
    }


def _execute_create_internal_course(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = InternalCourseCreate(
        customer_id=data["customer_id"],
        nickname=data["nickname"],
        course_type=data["course_type"],
        price=float(data.get("price", 0)),
        effective_date=data.get("effective_date", date.today().isoformat()),
        closer_name=data.get("closer_name"),
        organization_id=data.get("organization_id"),
    )
    course = internal_course_service.create_course(create_data)
    return {
        "success": True,
        "message": f"已录入内部课程：{course.nickname} {course.course_type}",
        "id": course.id,
    }


def _execute_create_other_project(data: Dict[str, Any]) -> Dict[str, Any]:
    create_data = OtherProjectCreate(
        customer_id=data["customer_id"],
        nickname=data["nickname"],
        project_name=data["project_name"],
        effective_date=data.get("effective_date", date.today().isoformat()),
        fee=float(data.get("fee", 0)),
        activity_mode=data.get("activity_mode", "线下"),
        closer_name=data.get("closer_name"),
        organization_id=data.get("organization_id"),
    )
    project = other_project_service.create_project(create_data)
    return {
        "success": True,
        "message": f"已录入其他项目：{project.nickname} {project.project_name}",
        "id": project.id,
    }
