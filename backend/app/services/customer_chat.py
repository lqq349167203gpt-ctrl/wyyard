import asyncio
import contextvars
import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

from app.config.settings import settings
from app.models.customer import CustomerCreate, CustomerUpdate
from app.models.operation_log import OperationLogCreate
from app.services import (
    customer_contact_service,
    customer_service,
    membership_card_service,
    operation_log_service,
    project_deduction_service,
    visit_service,
)
from app.services.customer_ai_config_service import get_config as get_customer_ai_config
from app.services.miniapp_ai_config_service import get_config as get_miniapp_ai_config
from app.services.voice_parser import _find_customer_from_instruction, search_customer_candidates
from app.utils.normalize import (
    normalize_gender,
    normalize_phone,
    normalize_traffic_source,
    normalize_work_status,
)


def _normalize_customer_fields(fields: dict) -> tuple:
    """对客户字段做确定性归一化与校验。
    返回 (fields, error_json)：有错时 error_json 为 ok:False 的 JSON 字符串。"""
    if fields.get("gender"):
        gender, err = normalize_gender(fields["gender"])
        if err:
            return fields, json.dumps(
                {"ok": False, "reason": "invalid_field", "field": "gender", "error": err},
                ensure_ascii=False,
            )
        fields["gender"] = gender
    if fields.get("phone"):
        phone, err = normalize_phone(fields["phone"])
        if err:
            return fields, json.dumps(
                {"ok": False, "reason": "invalid_field", "field": "phone", "error": err},
                ensure_ascii=False,
            )
        fields["phone"] = phone
    if fields.get("traffic_source"):
        fields["traffic_source"] = normalize_traffic_source(fields["traffic_source"])
    if fields.get("work_status"):
        fields["work_status"] = normalize_work_status(fields["work_status"])
    return fields, None


def _search_similar_names(keyword: str, limit: int = 5) -> list:
    """模糊搜索客户昵称（拼音 + 字面相似度），返回相似名字列表"""
    return search_customer_candidates(keyword, limit)


def _log_customer(content: str, method: str = "POST"):
    try:
        ctx = _ctx_var.get()
        extra = {"method": method, "path": "/api/voice/customer-chat"}
        if ctx.get("operator"):
            extra["operator"] = ctx["operator"]
        operation_log_service.create_log(
            OperationLogCreate(section="客户", content=content),
            extra=extra,
        )
    except Exception as e:
        print(f"[customer_chat] 写操作日志失败: {e}")


# ── 工具定义 ──────────────────────────────────────────────


@tool
def create_customer(nickname: str, gender: str = "", age: str = "", phone: str = "",
                    wechat: str = "", member_type: str = "", service_teacher: str = "",
                    referrer: str = "", referrer_handler: str = "",
                    traffic_source: str = "", traffic_source_detail: str = "",
                    basic_info: str = "", core_situation: str = "", tags: str = "",
                    other_info: str = "", work_status: str = "", work_description: str = "") -> str:
    """创建新客户。根据用户提供的信息填充字段。

    Args:
        nickname: 昵称（必填）
        gender: 性别
        age: 年龄
        phone: 手机号
        wechat: 微信号
        member_type: 会员身份
        service_teacher: 服务老师
        referrer: 引流人
        referrer_handler: 承接人
        traffic_source: 流量来源
        traffic_source_detail: 来源详情
        basic_info: 创伤经历
        core_situation: 当下卡点
        tags: 到访目的
        other_info: 其他信息
        work_status: 工作情况
        work_description: 工作描述
    """
    print(f"[tool] create_customer: nickname={nickname}")

    # 检查昵称是否已存在
    existing = customer_service.list_customers()
    for c in existing:
        if not c.is_deleted and c.nickname == nickname:
            return json.dumps({"ok": False, "reason": "already_exists", "name": nickname, "id": c.id}, ensure_ascii=False)

    fields = {
        "nickname": nickname, "gender": gender, "age": age, "phone": phone,
        "wechat": wechat, "member_type": member_type, "service_teacher": service_teacher,
        "referrer": referrer, "referrer_handler": referrer_handler,
        "traffic_source": traffic_source, "traffic_source_detail": traffic_source_detail,
        "basic_info": basic_info, "core_situation": core_situation, "tags": tags,
        "other_info": other_info, "work_status": work_status, "work_description": work_description,
    }
    # 只保留非空字段
    clean = {k: v for k, v in fields.items() if v}

    # 确定性归一化与校验（性别/手机号/流量来源/工作情况），不合法不入库
    clean, err_json = _normalize_customer_fields(clean)
    if err_json:
        return err_json

    try:
        data = CustomerCreate(**clean)
        customer = customer_service.create_customer(data)
        _log_customer(f"新建客户 {nickname}")
        return json.dumps(
            {"ok": True, "action": "create", "name": data.nickname, "id": customer.id, "values": clean},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps({"ok": False, "reason": "error", "name": nickname, "error": str(e)[:200]}, ensure_ascii=False)


@tool
def update_customer_fields(customer_name: str, nickname: str = "", gender: str = "",
                           age: str = "", phone: str = "", wechat: str = "",
                           member_type: str = "", service_teacher: str = "",
                           referrer: str = "", referrer_handler: str = "",
                           traffic_source: str = "", traffic_source_detail: str = "",
                           basic_info: str = "", core_situation: str = "", tags: str = "",
                           other_info: str = "", work_status: str = "", work_description: str = "") -> str:
    """修改现有客户的信息。只需传入要修改的字段，不传的字段保持不变。

    Args:
        customer_name: 客户昵称（用于查找，必填）
        nickname: 新昵称（改名时用）
        gender: 性别
        age: 年龄
        phone: 手机号
        wechat: 微信号
        member_type: 会员身份
        service_teacher: 服务老师
        referrer: 引流人
        referrer_handler: 承接人
        traffic_source: 流量来源
        traffic_source_detail: 来源详情
        basic_info: 创伤经历
        core_situation: 当下卡点
        tags: 到访目的
        other_info: 其他信息
        work_status: 工作情况
        work_description: 工作描述
    """
    print(f"[tool] update_customer_fields: customer={customer_name}")

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    fields = {
        "nickname": nickname, "gender": gender, "age": age, "phone": phone,
        "wechat": wechat, "member_type": member_type, "service_teacher": service_teacher,
        "referrer": referrer, "referrer_handler": referrer_handler,
        "traffic_source": traffic_source, "traffic_source_detail": traffic_source_detail,
        "basic_info": basic_info, "core_situation": core_situation, "tags": tags,
        "other_info": other_info, "work_status": work_status, "work_description": work_description,
    }
    # 只保留用户明确提供的非空字段
    update_data = {k: v for k, v in fields.items() if v}

    if not update_data:
        return json.dumps({"ok": False, "reason": "no_fields", "name": customer["nickname"]}, ensure_ascii=False)

    # AI 对话不能绕过角色联系方式权限；首次新建仍由 create_customer 独立处理。
    role = _ctx_var.get().get("role", "")
    denied_contact_fields = [
        field
        for field in ("phone", "wechat")
        if field in update_data
        and not customer_contact_service.can_access(role, field, "edit")
    ]
    if denied_contact_fields:
        field_labels = ["手机号" if field == "phone" else "微信号" for field in denied_contact_fields]
        return json.dumps(
            {
                "ok": False,
                "reason": "forbidden_contact_edit",
                "name": customer["nickname"],
                "fields": field_labels,
            },
            ensure_ascii=False,
        )

    # 确定性归一化与校验（性别/手机号/流量来源/工作情况），不合法不入库
    update_data, err_json = _normalize_customer_fields(update_data)
    if err_json:
        return err_json

    try:
        data = CustomerUpdate(**update_data)
        updated = customer_service.update_customer(customer["id"], data)
        if updated:
            FIELD_LABELS = {
                "nickname": "昵称", "name": "姓名", "gender": "性别", "age": "年龄",
                "phone": "电话", "wechat": "微信", "member_type": "会员身份",
                "service_teacher": "服务老师", "referrer": "引流人", "referrer_handler": "承接人",
                "traffic_source": "流量来源", "traffic_source_detail": "来源详情",
                "basic_info": "创伤经历", "core_situation": "当下卡点",
                "tags": "到访目的", "other_info": "其他信息",
                "work_status": "工作情况", "work_description": "工作描述",
            }
            changed = "、".join(FIELD_LABELS.get(k, k) for k in update_data.keys())
            _log_customer(f"修改客户 {customer['nickname']}：{changed}", method="PATCH")
            return json.dumps(
                {"ok": True, "action": "update", "name": customer["nickname"],
                 "fields": list(update_data.keys()), "values": update_data},
                ensure_ascii=False,
            )
        return json.dumps({"ok": False, "reason": "update_failed", "name": customer["nickname"]}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"ok": False, "reason": "error", "name": customer["nickname"], "error": str(e)[:200]}, ensure_ascii=False)


@tool
def query_customer_info(customer_name: str) -> str:
    """查询客户的详细信息。

    Args:
        customer_name: 客户昵称
    """
    print(f"[tool] query_customer_info: customer={customer_name}")

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    # 获取完整客户信息
    full = customer_service.get_customer(customer["id"])
    if not full:
        return json.dumps({"ok": False, "reason": "not_found", "name": customer_name}, ensure_ascii=False)

    cid = customer["id"]
    info = {}
    FIELD_MAP = {
        "nickname": "昵称", "name": "姓名", "gender": "性别", "phone": "电话",
        "wechat": "微信", "age": "年龄", "member_type": "会员身份",
        "service_teacher": "服务老师", "referrer": "引流人", "referrer_handler": "承接人",
        "traffic_source": "流量来源", "traffic_source_detail": "来源详情",
        "basic_info": "创伤经历", "core_situation": "当下卡点",
        "tags": "到访目的", "other_info": "其他信息",
        "work_status": "工作情况", "work_description": "工作描述",
        "visit_count": "到店次数",
    }
    for field, label in FIELD_MAP.items():
        val = getattr(full, field, None)
        if field in ("phone", "wechat"):
            val = customer_contact_service.mask_contact(field, str(val or ""))
        if val is not None and val != "" and val != 0:
            info[label] = str(val)

    # 剩余次数
    try:
        remaining = membership_card_service.get_current_card_remaining(cid)
        if remaining is not None:
            info["剩余次数"] = str(remaining)
        total = membership_card_service.get_grand_total(cid)
        if total > 0:
            info["总购买次数"] = str(total)
    except Exception:
        pass

    # 最近到店记录（含跟进点、客户收获、组长反馈、活动参与）
    try:
        visits = visit_service.list_visits(customer_id=cid)
        active_visits = [v for v in visits if not v.is_deleted]
        if active_visits:
            active_visits.sort(key=lambda v: v.visit_date, reverse=True)
            arrived_count = sum(1 for v in active_visits if v.arrived)
            info["到店次数"] = str(arrived_count)
            recent = active_visits[:5]
            visit_lines = []
            for v in recent:
                parts = [v.visit_date]
                status = "已到店" if v.arrived else "未到店"
                parts.append(status)
                if v.healing_notes:
                    parts.append(f"跟进点：{v.healing_notes}")
                if v.feedback:
                    parts.append(f"客户收获：{v.feedback}")
                # 填充活动参与信息
                if not v.activities:
                    try:
                        v.activities = visit_service._get_customer_activities(cid, v.visit_date)
                    except Exception:
                        pass
                if v.activities:
                    act_parts = []
                    for a in v.activities:
                        act_desc = a.name
                        if a.role:
                            act_desc += f"({a.role})"
                        act_parts.append(act_desc)
                    parts.append(f"活动：{'、'.join(act_parts)}")
                visit_lines.append("；".join(parts))
            info["到店/活动记录"] = "\n".join(visit_lines)
    except Exception:
        pass

    # 交易记录（扣减）
    try:
        deductions = project_deduction_service.list_deductions(customer_id=cid)
        if deductions:
            deductions.sort(key=lambda d: d.deduction_date, reverse=True)
            recent_deductions = deductions[:10]
            deduction_lines = []
            for d in recent_deductions:
                deduction_lines.append(f"{d.deduction_date} {d.project_name} 扣{d.count}次，剩余{d.remaining_after}次")
            info["交易记录"] = "\n".join(deduction_lines)
    except Exception:
        pass

    return json.dumps({"ok": True, "action": "query", "name": customer["nickname"], "info": info}, ensure_ascii=False)


@tool
def delete_customer_record(customer_name: str) -> str:
    """删除客户（软删除，数据可恢复）。

    Args:
        customer_name: 客户昵称
    """
    print(f"[tool] delete_customer_record: customer={customer_name}")

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    customer_service.delete_customer(customer["id"])
    _log_customer(f"删除客户 {customer['nickname']}", method="DELETE")
    return json.dumps({"ok": True, "action": "delete", "name": customer["nickname"]}, ensure_ascii=False)


@tool
def append_customer_info(customer_name: str, field: str, value: str) -> str:
    """向客户的某个文本字段追加内容（不覆盖原有内容）。

    Args:
        customer_name: 客户昵称
        field: 字段名，可选值：basic_info（创伤经历）、core_situation（当下卡点）、tags（到访目的）、other_info（其他信息）、work_description（工作描述）
        value: 要追加的内容
    """
    print(f"[tool] append_customer_info: customer={customer_name}, field={field}")

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    ALLOWED_FIELDS = ["basic_info", "core_situation", "tags", "other_info", "work_description"]
    if field not in ALLOWED_FIELDS:
        return json.dumps({"ok": False, "reason": "invalid_field", "name": customer["nickname"], "field": field}, ensure_ascii=False)

    full = customer_service.get_customer(customer["id"])
    if not full:
        return json.dumps({"ok": False, "reason": "not_found", "name": customer["nickname"]}, ensure_ascii=False)

    old_val = getattr(full, field, "") or ""
    new_val = f"{old_val}\n{value}".strip() if old_val else value

    try:
        data = CustomerUpdate(**{field: new_val})
        customer_service.update_customer(customer["id"], data)
        _log_customer(f"客户 {customer['nickname']}追加{field}", method="PATCH")
        return json.dumps({"ok": True, "action": "append", "name": customer["nickname"], "field": field}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"ok": False, "reason": "error", "name": customer["nickname"], "error": str(e)[:200]}, ensure_ascii=False)


TOOLS = [create_customer, update_customer_fields, query_customer_info, delete_customer_record, append_customer_info]
TOOL_MAP = {t.name: t for t in TOOLS}

# 运行时上下文（async-safe）
_ctx_var = contextvars.ContextVar(
    "customer_chat_ctx",
    default={"operator": "", "role": ""},
)


async def customer_chat(
    message: str,
    history: list,
    operator: str = "",
    role: str = "",
) -> dict:
    """客户对话主入口。使用 LLM tool calling 理解意图并执行操作。"""
    _ctx_var.set({"operator": operator, "role": role})

    prompt_config = get_customer_ai_config()
    model_config = get_miniapp_ai_config()
    api_key = model_config.api_key or settings.llm_api_key
    base_url = model_config.base_url or settings.llm_base_url
    model = model_config.model or settings.llm_model

    if not api_key:
        return {"reply": "未配置 AI API Key，请在「小程序模型配置」中设置", "action": "error"}

    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=model_config.temperature,
        max_tokens=model_config.max_tokens,
    ).bind_tools(TOOLS)

    # 获取现有客户列表，帮助 LLM 判断是新建还是修改
    existing_customers = customer_service.list_customers()
    existing_names = [c.nickname for c in existing_customers if not c.is_deleted and c.nickname]

    # 基础提示词从配置读取，动态数据在代码中追加
    system_text = prompt_config.system_prompt
    system_text += f"\n\n当前已有客户（共{len(existing_names)}人）：{'、'.join(existing_names[:50])}{'...' if len(existing_names) > 50 else ''}"

    messages = [SystemMessage(content=system_text)]
    for item in (history or [])[-10:]:
        role = item.get("role", "user")
        content = item.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=message))

    try:
        response = await asyncio.to_thread(llm.invoke, messages)
    except Exception as e:
        return {"reply": f"AI 调用失败：{str(e)[:100]}", "action": "error"}

    print(f"[customer_chat] LLM 响应: tool_calls={response.tool_calls}, content={response.content[:200] if response.content else 'None'}")

    # 执行工具调用（多轮）
    tool_call_log = []
    for _round in range(5):
        if not response.tool_calls:
            break
        # 先把 assistant 的 tool_use 响应加入历史，否则 tool 消息前没有对应的 assistant 消息，API 会报 400
        messages.append(response)
        for tc in response.tool_calls:
            tool_fn = TOOL_MAP.get(tc["name"])
            if tool_fn:
                try:
                    result = await asyncio.to_thread(tool_fn.invoke, tc["args"])
                except Exception as e:
                    result = json.dumps({"ok": False, "error": str(e)[:100]}, ensure_ascii=False)
                print(f"[customer_chat] 工具调用: {tc['name']}({tc['args']}) => {str(result)[:200]}")
                tool_call_log.append({"name": tc["name"], "args": tc["args"], "result": str(result)[:500]})
                messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))
            else:
                print(f"[customer_chat] 未知工具: {tc['name']}")
        try:
            response = await asyncio.to_thread(llm.invoke, messages)
        except Exception as e:
            return {"reply": f"AI 调用失败：{str(e)[:100]}", "action": "error"}
        print(f"[customer_chat] 第{_round+1}轮 LLM 响应: tool_calls={response.tool_calls}, content={response.content[:200] if response.content else 'None'}")

    # 生成回复
    if response.content and response.content.strip():
        reply = response.content.strip()
    elif tool_call_log:
        reply = _build_reply_from_tools(tool_call_log)
    else:
        reply = "没太听懂，能再说一遍吗？"

    # 写对话日志
    try:
        from app.models.chat_log import ChatLogCreate, ToolCall
        from app.services import chat_log_service
        chat_log_service.create_log(ChatLogCreate(
            user_message=message,
            tool_calls=[ToolCall(**tc) for tc in tool_call_log],
            ai_reply=reply,
            mode="customer",
        ))
    except Exception as e:
        print(f"[customer_chat] 写对话日志失败: {e}")

    return {"reply": reply, "action": "done"}


def _build_reply_from_tools(tool_call_log: list) -> str:
    """根据工具调用结果直接生成回复（LLM 返回空内容时的兜底）"""
    for tc in tool_call_log:
        try:
            result = json.loads(tc["result"])
        except (json.JSONDecodeError, TypeError):
            continue

        if result.get("ok"):
            action = result.get("action", "")
            name = result.get("name", "")
            if action == "create":
                return f"已创建客户「{name}」。"
            if action == "update":
                fields = result.get("fields", [])
                return f"已更新「{name}」的{'、'.join(fields)}。"
            if action == "query":
                info = result.get("info", {})
                if not info:
                    return f"「{name}」暂无更多信息。"
                lines = [f"{k}：{v}" for k, v in info.items()]
                return f"「{name}」的信息：\n" + "\n".join(lines)
            if action == "delete":
                return f"已删除客户「{name}」。"
            if action == "append":
                return f"已为「{name}」补充信息。"
        else:
            reason = result.get("reason", "")
            name = result.get("name", "")
            if reason == "not_found":
                suggestions = result.get("suggestions", [])
                if suggestions:
                    return f"找不到「{name}」，你是不是想说：{'、'.join(suggestions)}？"
                return f"找不到「{name}」，确认一下名字？"
            if reason == "already_exists":
                return f"「{name}」已存在，需要修改吗？"
            if reason == "no_fields":
                return f"没有需要修改的内容。"
            if reason == "invalid_field":
                return f"{result.get('error', '字段格式不对')}"
            if reason == "forbidden_contact_edit":
                fields = "、".join(result.get("fields", []))
                return f"当前角色没有修改{fields}的权限。"
            if reason == "error":
                return f"操作失败：{result.get('error', '未知错误')[:100]}"

    return "操作完成。"
