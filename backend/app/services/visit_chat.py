import asyncio
import contextvars
import json
from datetime import datetime, timedelta, timezone

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

from app.config.settings import settings
from app.models.operation_log import OperationLogCreate
from app.models.visit import VisitRecordCreate
from app.services import customer_service, operation_log_service, visit_service, visit_verification_service
from app.services.miniapp_ai_config_service import get_config as get_miniapp_ai_config
from app.services.visit_ai_config_service import get_config as get_visit_ai_config
from app.services.voice_parser import _find_customer_from_instruction, render_prompt, search_customer_candidates
from app.utils.cn_datetime import date_context_block, normalize_time, parse_anchor, resolve_date

TZ = timezone(timedelta(hours=8))


def _now_hm():
    return datetime.now(TZ).strftime("%H:%M")


def _log_visit(content: str, method: str = "POST"):
    try:
        ctx = _ctx_var.get()
        extra = {"method": method, "path": "/api/voice/visit-chat"}
        if ctx.get("operator"):
            extra["operator"] = ctx["operator"]
        # 拼接日期和空间信息
        date = ctx.get("date", "")
        space_id = ctx.get("space_id", "")
        suffix_parts = []
        if date:
            suffix_parts.append(date)
        if space_id:
            from app.services import space_service
            space = space_service.get_space(space_id)
            if space:
                suffix_parts.append(space.name)
        if suffix_parts:
            content = f"{content}（{'，'.join(suffix_parts)}）"
        operation_log_service.create_log(
            OperationLogCreate(section="邀约", content=content),
            extra=extra,
        )
    except Exception as e:
        print(f"[visit_chat] 写操作日志失败: {e}")


def _search_similar_names(keyword: str, limit: int = 5) -> list:
    """模糊搜索客户昵称（拼音 + 字面相似度），返回相似名字列表"""
    return search_customer_candidates(keyword, limit)


def _resolve_ctx_date(raw: str) -> str | None:
    """解析工具收到的日期参数：空则用上下文锚点日期；
    原始表达（如「上周五」「7月20号」）由确定性解析器换算，非法返回 None。"""
    ctx = _ctx_var.get()
    raw = (raw or "").strip()
    if not raw:
        return ctx.get("date") or None
    return resolve_date(raw, parse_anchor(ctx.get("date")))


def _invalid_date_json(raw: str) -> str:
    return json.dumps(
        {"ok": False, "reason": "invalid_date", "value": raw, "anchor": _ctx_var.get().get("date", "")},
        ensure_ascii=False,
    )


def _find_visit(customer_name: str, date: str, space_id: str = ""):
    visits = visit_service.list_visits(date=date, space_id=space_id) if space_id else visit_service.list_visits(date=date)
    for v in visits:
        if v.is_deleted:
            continue
        nick = ""
        if v.customer_id:
            c = customer_service.get_customer(v.customer_id)
            nick = c.nickname if c else ""
        if nick and (nick in customer_name or customer_name in nick):
            return v
        if customer_name and len(customer_name) >= 2 and customer_name in nick:
            return v
    return None


def _verified_result(date: str, space_id: str) -> str | None:
    if not visit_verification_service.is_verified(date, space_id):
        return None
    return json.dumps(
        {"ok": False, "reason": "verified", "message": "当天邀约已核对，需先解锁后再操作"},
        ensure_ascii=False,
    )


# ── 工具定义 ──────────────────────────────────────────────


@tool
def add_to_visit_list(customer_name: str, visit_date: str = "") -> str:
    """添加客户到到店名单。如已存在则返回提示。

    Args:
        customer_name: 客户昵称（如"余墨"）
        visit_date: 到店日期，可传用户原话（如"上周五""7月20号"）或 YYYY-MM-DD，不填则用当前选中日期
    """
    ctx = _ctx_var.get()
    date = _resolve_ctx_date(visit_date)
    if not date:
        return _invalid_date_json(visit_date)
    space_id = ctx["space_id"]
    if locked := _verified_result(date, space_id):
        return locked
    print(f"[tool] add_to_visit_list: customer={customer_name}, date={date}, space_id={space_id}")

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    existing = _find_visit(customer["nickname"], date, space_id)
    if existing:
        return json.dumps({"ok": False, "reason": "already_exists", "name": customer["nickname"]}, ensure_ascii=False)

    visit_service.create_visit(VisitRecordCreate(
        visit_date=date, visit_time=_now_hm(),
        customer_id=customer["id"],
        space_id=space_id, arrived=False,
    ))
    _log_visit(f"新增邀约 {customer['nickname']}（{date}）")
    return json.dumps({"ok": True, "action": "add", "name": customer["nickname"], "date": date}, ensure_ascii=False)


@tool
def set_arrival(customer_name: str, time: str = "", arrived: bool = True) -> str:
    """设置客户的到店信息。根据当前状态自动判断：
    - 未到店 + arrived=true：标记到店（设实际到场时间）
    - 未到店 + arrived=false：只改预计到店时间
    - 已到店 + 有时间：修正实际到场时间

    Args:
        customer_name: 客户昵称（如"余墨"）
        time: 时间，可传用户原话（如"下午3点"）或 HH:MM，不填则用当前时间
        arrived: true 表示用户说了"到了/来了"，false 表示只是改时间
    """
    date = _ctx_var.get()["date"]
    space_id = _ctx_var.get()["space_id"]
    if locked := _verified_result(date, space_id):
        return locked

    if time:
        normalized = normalize_time(time)
        if not normalized:
            return json.dumps({"ok": False, "reason": "invalid_time", "value": time}, ensure_ascii=False)
        time = normalized

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    visit = _find_visit(customer["nickname"], date, space_id)
    if not visit:
        # 不在名单中，自动添加
        if arrived:
            time_str = time or _now_hm()
            visit_service.create_visit(VisitRecordCreate(
                visit_date=date, visit_time=_now_hm(),
                customer_id=customer["id"],
                space_id=space_id, arrived=True, arrival_time=time_str,
            ))
            _log_visit(f"新增邀约 {customer['nickname']}（{date}）并标记到店（{time_str}）")
            return json.dumps({"ok": True, "action": "arrive", "name": customer["nickname"], "time": time_str, "auto_added": True}, ensure_ascii=False)
        else:
            visit_service.create_visit(VisitRecordCreate(
                visit_date=date, visit_time=time or "09:00",
                customer_id=customer["id"],
                space_id=space_id, arrived=False,
            ))
            _log_visit(f"新增邀约 {customer['nickname']}（{date}）")
            return json.dumps({"ok": True, "action": "add", "name": customer["nickname"], "date": date, "auto_added": True}, ensure_ascii=False)

    # 在名单中
    if not visit.arrived and arrived:
        # 标记到店
        time_str = time or _now_hm()
        visit_service.update_visit(visit.id, {"arrived": True, "arrival_time": time_str})
        _log_visit(f"{customer['nickname']}标记到店（{time_str}）", method="PATCH")
        return json.dumps({"ok": True, "action": "arrive", "name": customer["nickname"], "time": time_str}, ensure_ascii=False)

    if not visit.arrived and not arrived:
        # 只改预计时间
        visit_service.update_visit(visit.id, {"visit_time": time})
        _log_visit(f"{customer['nickname']}预计到店时间改为 {time}", method="PATCH")
        return json.dumps({"ok": True, "action": "update_time", "name": customer["nickname"], "visit_time": time}, ensure_ascii=False)

    if visit.arrived:
        # 已到店，修正到场时间
        if time and time != visit.arrival_time:
            visit_service.update_visit(visit.id, {"arrival_time": time})
            _log_visit(f"{customer['nickname']}到店时间改为 {time}", method="PATCH")
            return json.dumps({"ok": True, "action": "arrive", "name": customer["nickname"], "time": time}, ensure_ascii=False)
        return json.dumps({"ok": False, "reason": "already_arrived", "name": customer["nickname"], "time": visit.arrival_time}, ensure_ascii=False)

    return json.dumps({"ok": True, "action": "noop", "name": customer["nickname"]}, ensure_ascii=False)


@tool
def remove_from_visit_list(customer_name: str) -> str:
    """将客户从到店名单中移除。

    Args:
        customer_name: 客户昵称（如"余墨"）
    """
    date = _ctx_var.get()["date"]
    space_id = _ctx_var.get()["space_id"]
    if locked := _verified_result(date, space_id):
        return locked

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    visit = _find_visit(customer["nickname"], date, space_id)
    if not visit:
        return json.dumps({"ok": False, "reason": "not_in_list", "name": customer["nickname"]}, ensure_ascii=False)

    visit_service.delete_visit(visit.id)
    _log_visit(f"移除邀约 {customer['nickname']}", method="DELETE")
    return json.dumps({"ok": True, "action": "leave", "name": customer["nickname"]}, ensure_ascii=False)


@tool
def record_customer_needs(customer_name: str, needs: str) -> str:
    """记录客户的到店需求或安排。如不在名单中则自动添加。

    Args:
        customer_name: 客户昵称（如"余墨"）
        needs: 需求描述（如"想做情绪释放"）
    """
    date = _ctx_var.get()["date"]
    space_id = _ctx_var.get()["space_id"]
    operator = _ctx_var.get().get("operator", "")
    account_id = _ctx_var.get().get("account_id", "")

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    visit = _find_visit(customer["nickname"], date, space_id)
    if not visit:
        if locked := _verified_result(date, space_id):
            return locked
        visit = visit_service.create_visit(VisitRecordCreate(
            visit_date=date, visit_time=_now_hm(),
            customer_id=customer["id"],
            space_id=space_id,
            created_by_id=account_id,
            created_by=operator,
        ))
        from app.services import visit_note_service

        visit_note_service.create_note(
            visit.id,
            "visit_need",
            needs,
            creator_id=account_id,
            creator=operator or "AI 助手",
        )
        _log_visit(f"新增邀约 {customer['nickname']}（{date}）并记录来访需求：{needs}")
        return json.dumps({"ok": True, "action": "needs", "name": customer["nickname"], "needs": needs, "auto_added": True}, ensure_ascii=False)

    from app.services import visit_note_service

    visit_note_service.create_note(
        visit.id,
        "visit_need",
        needs,
        creator_id=account_id,
        creator=operator or "AI 助手",
    )
    _log_visit(f"{customer['nickname']}记录来访需求：{needs}", method="PATCH")
    return json.dumps({"ok": True, "action": "needs", "name": customer["nickname"], "needs": needs}, ensure_ascii=False)


@tool
def record_customer_feedback(customer_name: str, feedback: str) -> str:
    """记录客户的反馈信息。

    Args:
        customer_name: 客户昵称（如"余墨"）
        feedback: 反馈内容（如"感觉很好"）
    """
    date = _ctx_var.get()["date"]
    space_id = _ctx_var.get()["space_id"]

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    visit = _find_visit(customer["nickname"], date, space_id)
    if not visit:
        return json.dumps({"ok": False, "reason": "not_in_list", "name": customer["nickname"]}, ensure_ascii=False)

    from app.services import visit_note_service

    operator = _ctx_var.get().get("operator", "")
    visit_note_service.create_note(
        visit.id,
        "customer_info",
        feedback,
        creator=operator or "AI 助手",
    )
    _log_visit(f"{customer['nickname']}记录反馈：{feedback}", method="PATCH")
    return json.dumps({"ok": True, "action": "feedback", "name": customer["nickname"], "feedback": feedback}, ensure_ascii=False)


@tool
def set_referrer_handler(customer_name: str, referrer_handler: str, visit_date: str = "") -> str:
    """设置或修改客户的邀约人（承接人）。客户必须已存在于系统中，如不在到店名单中则自动添加到当天名单。

    Args:
        customer_name: 客户昵称（如"余墨"），必须是系统中已有的客户
        referrer_handler: 邀约人昵称（如"小明"），必须是系统中已有的客户
        visit_date: 到店日期，可传用户原话或 YYYY-MM-DD，不填则用当前选中日期
    """
    date = _resolve_ctx_date(visit_date)
    if not date:
        return _invalid_date_json(visit_date)
    space_id = _ctx_var.get()["space_id"]
    if locked := _verified_result(date, space_id):
        return locked

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    # 邀约人必须是系统中已有的客户
    referrer = _find_customer_from_instruction(referrer_handler)
    if not referrer:
        suggestions = _search_similar_names(referrer_handler)
        result = {"ok": False, "reason": "referrer_not_found", "name": referrer_handler}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    visit = _find_visit(customer["nickname"], date, space_id)
    if not visit:
        visit_service.create_visit(VisitRecordCreate(
            visit_date=date, visit_time=_now_hm(),
            customer_id=customer["id"],
            space_id=space_id, referrer_handler=referrer_handler,
        ))
        _log_visit(f"新增邀约 {customer['nickname']}（{date}）邀约人：{referrer_handler}")
        return json.dumps({"ok": True, "action": "referrer", "name": customer["nickname"], "referrer_handler": referrer_handler, "auto_added": True}, ensure_ascii=False)

    visit_service.update_visit(visit.id, {"referrer_handler": referrer_handler})
    _log_visit(f"{customer['nickname']}邀约人改为 {referrer_handler}", method="PATCH")
    return json.dumps({"ok": True, "action": "referrer", "name": customer["nickname"], "referrer_handler": referrer_handler}, ensure_ascii=False)


@tool
def set_leader(customer_name: str, is_leader: bool = True) -> str:
    """设置或取消客户的组长身份。

    Args:
        customer_name: 客户昵称（如"微微"）
        is_leader: True 设为组长，False 取消组长
    """
    date = _ctx_var.get()["date"]
    space_id = _ctx_var.get()["space_id"]
    if locked := _verified_result(date, space_id):
        return locked

    customer = _find_customer_from_instruction(customer_name)
    if not customer:
        suggestions = _search_similar_names(customer_name)
        result = {"ok": False, "reason": "not_found", "name": customer_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    visit = _find_visit(customer["nickname"], date, space_id)
    if not visit:
        return json.dumps({"ok": False, "reason": "not_in_list", "name": customer["nickname"]}, ensure_ascii=False)

    visit_service.update_visit(visit.id, {"is_leader": is_leader})
    action = "set_leader" if is_leader else "unset_leader"
    label = f"{customer['nickname']}设为组长" if is_leader else f"{customer['nickname']}取消组长"
    _log_visit(label, method="PATCH")
    return json.dumps({"ok": True, "action": action, "name": customer["nickname"]}, ensure_ascii=False)


@tool
def set_group_member(member_name: str, leader_name: str) -> str:
    """将一个客户放到某个组长下面，成为该组长的组员。通过调整排序实现。

    Args:
        member_name: 组员昵称（如"娟娟"）
        leader_name: 组长昵称（如"微微"）
    """
    date = _ctx_var.get()["date"]
    space_id = _ctx_var.get()["space_id"]
    if locked := _verified_result(date, space_id):
        return locked

    member_customer = _find_customer_from_instruction(member_name)
    if not member_customer:
        suggestions = _search_similar_names(member_name)
        result = {"ok": False, "reason": "not_found", "name": member_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    leader_customer = _find_customer_from_instruction(leader_name)
    if not leader_customer:
        suggestions = _search_similar_names(leader_name)
        result = {"ok": False, "reason": "not_found", "name": leader_name}
        if suggestions:
            result["suggestions"] = suggestions
        return json.dumps(result, ensure_ascii=False)

    member_visit = _find_visit(member_customer["nickname"], date, space_id)
    if not member_visit:
        return json.dumps({"ok": False, "reason": "not_in_list", "name": member_customer["nickname"]}, ensure_ascii=False)

    leader_visit = _find_visit(leader_customer["nickname"], date, space_id)
    if not leader_visit:
        return json.dumps({"ok": False, "reason": "not_in_list", "name": leader_customer["nickname"]}, ensure_ascii=False)

    if not leader_visit.is_leader:
        return json.dumps({"ok": False, "reason": "not_leader", "name": leader_customer["nickname"]}, ensure_ascii=False)

    # 获取当天所有 visit，按当前排序
    all_visits = visit_service.list_visits(date=date, space_id=space_id)
    ids = [v.id for v in all_visits]

    # 从原位置移除 member
    if member_visit.id in ids:
        ids.remove(member_visit.id)

    # 插入到 leader 后面
    leader_idx = ids.index(leader_visit.id) if leader_visit.id in ids else len(ids) - 1
    ids.insert(leader_idx + 1, member_visit.id)

    visit_service.reorder_visits(ids)
    _log_visit(f"{member_customer['nickname']}调至{leader_customer['nickname']}组下", method="PATCH")
    return json.dumps({"ok": True, "action": "set_member", "name": member_customer["nickname"], "leader": leader_customer["nickname"]}, ensure_ascii=False)


@tool
def query_visit_list(visit_date: str = "") -> str:
    """查询某天的到店人员名单。

    Args:
        visit_date: 查询日期，可传用户原话（如"上周五"）或 YYYY-MM-DD，不填则用当前选中日期
    """
    date = _resolve_ctx_date(visit_date)
    if not date:
        return _invalid_date_json(visit_date)
    space_id = _ctx_var.get()["space_id"]

    visits = visit_service.list_visits(date=date, space_id=space_id)
    from app.services import visit_note_service

    context = _ctx_var.get()
    own_needs = {
        note.visit_id: note.content
        for note in visit_note_service.list_visible_notes(
            [visit.id for visit in visits],
            context.get("account_id", ""),
            context.get("operator", ""),
        )
        if note.category == "visit_need"
    }
    def _nick(v):
        c = customer_service.get_customer(v.customer_id) if v.customer_id else None
        return c.nickname if c else ""
    arrived = [{"name": _nick(v), "time": v.arrival_time, "leader": v.is_leader, "needs": own_needs.get(v.id, "")}
               for v in visits if v.arrived and not v.is_deleted]
    not_arrived = [{"name": _nick(v), "visit_time": v.visit_time, "leader": v.is_leader}
                   for v in visits if not v.arrived and not v.is_deleted]
    return json.dumps({"ok": True, "action": "query", "date": date, "arrived": arrived, "not_arrived": not_arrived}, ensure_ascii=False)


TOOLS = [add_to_visit_list, set_arrival, remove_from_visit_list, record_customer_needs, record_customer_feedback, set_referrer_handler, set_leader, set_group_member, query_visit_list]
TOOL_MAP = {t.name: t for t in TOOLS}

# 运行时上下文，每次调用 visit_chat 时设置（async-safe）
_ctx_var = contextvars.ContextVar(
    "visit_chat_ctx",
    default={"date": "", "space_id": "", "operator": "", "account_id": ""},
)


async def visit_chat(
    message: str,
    history: list,
    date: str,
    space_id: str,
    operator: str = "",
    account_id: str = "",
) -> dict:
    """邀约对话主入口。使用 LLM tool calling 理解意图并执行操作。"""
    anchor = parse_anchor(date)
    anchor_iso = anchor.isoformat()
    _ctx_var.set({
        "date": anchor_iso,
        "space_id": space_id,
        "operator": operator,
        "account_id": account_id,
    })

    prompt_config = get_visit_ai_config()
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

    system_text = render_prompt(prompt_config.system_prompt, {"date": anchor_iso})
    system_text += "\n\n" + date_context_block(anchor)

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

    print(f"[visit_chat] LLM 响应: tool_calls={response.tool_calls}, content={response.content[:200] if response.content else 'None'}")

    # 执行工具调用（多轮：LLM 可能需要依次处理多个人）
    tool_call_log = []
    for _round in range(5):  # 最多 5 轮，防止死循环
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
                print(f"[visit_chat] 工具调用: {tc['name']}({tc['args']}) => {str(result)[:200]}")
                tool_call_log.append({"name": tc["name"], "args": tc["args"], "result": str(result)[:500]})
                messages.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))
            else:
                print(f"[visit_chat] 未知工具: {tc['name']}")
        try:
            response = await asyncio.to_thread(llm.invoke, messages)
        except Exception as e:
            return {"reply": f"AI 调用失败：{str(e)[:100]}", "action": "error"}
        print(f"[visit_chat] 第{_round+1}轮 LLM 响应: tool_calls={response.tool_calls}, content={response.content[:200] if response.content else 'None'}")

    # 生成回复：优先采用 LLM 的文本（可能是澄清反问，也可能是结果汇总），
    # 为空时用工具结果兜底。不要丢弃无工具调用的回复——那往往是 AI 在向用户确认，
    # 强制覆盖成「没太听懂」会让助手显得完全不理解用户。
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
            mode="visit",
            space_id=space_id,
            date=anchor_iso,
        ))
    except Exception as e:
        print(f"[visit_chat] 写对话日志失败: {e}")

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
            if action == "add":
                return f"{name}已添加到{result.get('date', '今天的')}到店名单。"
            if action == "arrive":
                return f"{name}已标记到店。"
            if action == "leave":
                return f"{name}已从名单中移除。"
            if action == "needs":
                return f"{name}的来访需求已记录。"
            if action == "feedback":
                return f"{name}的反馈已记录。"
            if action == "referrer":
                handler = result.get("referrer_handler", "")
                return f"{name}的邀约人已设为{handler}。"
            if action == "update_time":
                t = result.get("visit_time", "")
                return f"{name}预计到店时间改为{t}。"
            if action == "set_leader":
                return f"{name}已设为组长。"
            if action == "set_member":
                leader = result.get("leader", "")
                return f"{name}已调至{leader}组下。"
            if action == "noop":
                return f"{name}的信息没有变化。"
            if action == "unset_leader":
                return f"{name}已取消组长。"
            if action == "query":
                arrived = result.get("arrived", [])
                not_arrived = result.get("not_arrived", [])
                if not arrived and not not_arrived:
                    return f"{result.get('date', '今天')}还没有人到店。"
                parts = []
                if arrived:
                    names = "、".join(a["name"] for a in arrived)
                    parts.append(f"已到店：{names}")
                if not_arrived:
                    names = "、".join(a["name"] for a in not_arrived)
                    parts.append(f"未到店：{names}")
                return "，".join(parts) + "。"
        else:
            reason = result.get("reason", "")
            name = result.get("name", "")
            if reason in ("not_found", "referrer_not_found"):
                suggestions = result.get("suggestions", [])
                if suggestions:
                    return f"找不到「{name}」，你是不是想说：{'、'.join(suggestions)}？"
                return f"找不到「{name}」，确认一下名字？"
            if reason == "already_exists":
                return f"{name}已经在名单里了。"
            if reason == "already_arrived":
                return f"{name}已经到店了。"
            if reason == "not_in_list":
                return f"{name}还不在今天的名单里。"
            if reason == "not_leader":
                return f"{name}还不是组长，需要先设为组长。"
            if reason == "invalid_date":
                return f"没听懂这个日期「{result.get('value', '')}」，换个说法试试？比如「明天」「周五」或「7月20号」。"
            if reason == "invalid_time":
                return f"没听懂这个时间「{result.get('value', '')}」，换个说法试试？比如「下午3点」或「15:00」。"

    return "操作完成。"
