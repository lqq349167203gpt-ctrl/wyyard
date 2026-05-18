import re
import json
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.services.operation_log_service import create_log
from app.models.operation_log import OperationLogCreate

SECTION_MAP = {
    "/api/customers": "用户管理",
    "/api/visits": "到场人员",
    "/api/healing-records": "疗愈记录",
    "/api/courses": "沙龙类型",
    "/api/course-types": "沙龙类型",
    "/api/spaces": "疗愈空间",
    "/api/member-identities": "会员身份",
    "/api/membership-cards": "会员活动",
    "/api/group-cases": "觉醒游戏",
    "/api/group-case-sessions": "觉醒游戏",
    "/api/emotional-releases": "情绪释放",
    "/api/emotional-release-sessions": "情绪释放",
    "/api/energy-knots": "能量结",
    "/api/energy-knot-sessions": "能量结",
    "/api/internal-courses": "内部课程",
    "/api/internal-course-sessions": "内部课程",
    "/api/agents": "AI 配置",
    "/api/ai-configs": "AI 配置",
    "/api/knowledge": "知识库",
    "/api/business": "业务数据",
    "/api/class-records": "活动日历",
    "/api/accounts": "账号管理",
    "/api/positions": "角色管理",
    "/api/healing-identities": "疗愈身份",
}

# 路径前缀 → (section, service_module, get_function_name)
GETTER_MAP = {
    "/api/customers": ("用户管理", "customer_service", "get_customer"),
    "/api/healing-records": ("疗愈记录", "healing_record_service", "get_record"),
    "/api/courses": ("沙龙类型", "course_service", "get_course"),
    "/api/spaces": ("疗愈空间", "space_service", "get_space"),
    "/api/member-identities": ("会员身份", "member_identity_service", "get_identity"),
    "/api/membership-cards": ("会员活动", "membership_card_service", "get_card"),
    "/api/group-cases": ("觉醒游戏", "group_case_service", "get_case"),
    "/api/group-case-sessions": ("觉醒游戏", "group_case_session_service", "get_session"),
    "/api/emotional-releases": ("情绪释放", "emotional_release_service", "get_release"),
    "/api/emotional-release-sessions": ("情绪释放", "emotional_release_session_service", "get_session"),
    "/api/energy-knots": ("能量结", "energy_knot_service", "get_knot"),
    "/api/energy-knot-sessions": ("能量结", "energy_knot_session_service", "get_session"),
    "/api/internal-courses": ("内部课程", "internal_course_service", "get_course"),
    "/api/internal-course-sessions": ("内部课程", "internal_course_session_service", "get_session"),
    "/api/agents": ("AI 配置", "agent_service", "get_agent"),
    "/api/ai-configs": ("AI 配置", "ai_config_service", "get_config"),
    "/api/class-records": ("活动日历", "class_record_service", "get_record"),
    "/api/accounts": ("账号管理", "account_service", "get_account"),
    "/api/visits": ("到场人员", "visit_service", "get_visit"),
}

SKIP_PATHS = [
    "/api/health",
    "/api/accounts/login",
    "/api/accounts/roles",
    "/api/member-identities/batch",
    "/api/member-identities/refresh-all",
    "/api/uploads",  # 文件上传是二进制 multipart，不能 decode("utf-8")
]

FIELD_NAMES = {
    "nickname": "昵称", "name": "名称", "title": "标题", "username": "用户名",
    "phone": "手机", "email": "邮箱", "gender": "性别", "birthday": "生日",
    "member_type": "会员类型", "member_identity": "会员身份", "healing_identity": "疗愈身份",
    "note": "备注", "description": "描述", "content": "内容", "section": "板块",
    "status": "状态", "type": "类型", "date": "日期", "start_time": "开始时间",
    "end_time": "结束时间", "teacher_ids": "课程老师", "course_name": "沙龙名称",
    "course_type": "课程类型", "course_description": "课程描述",
    "owner_name": "案主", "host_name": "主持人", "host_names": "课程老师",
    "participant_ids": "参与者", "achiever_name": "成就君", "achiever_id": "成就君",
    "host_id": "主持人", "leader_id": "组长", "deputy_id": "副组长",
    "member_ids": "成员", "host_ids": "课程老师",
    "price": "价格", "amount": "金额", "count": "次数", "total": "总计",
    "sort_order": "排序", "is_public_welfare": "公益",
    "arrived": "到店状态", "arrival_time": "到店时间", "experience": "体验反馈",
    "needs": "需求", "activity_participation": "活动参与", "visit_date": "到访日期",
    "visit_time": "预计时间", "nickname": "昵称", "customer_id": "客户",
    "space_id": "空间", "position": "职位", "role": "角色", "permissions": "权限",
    "groups": "分组", "materials": "资料", "images": "图片",
    "location": "地点", "address": "地址",
    "start_date": "开始日期", "end_date": "结束日期",
    "owner_id": "案主", "space_name": "空间",
    "card_type": "卡类型", "remaining_count": "剩余次数",
    "customer_id": "用户", "customer_name": "用户",
    "password": "密码", "old_password": "旧密码", "new_password": "新密码",
    "positions": "职位",
}


def get_section(path: str) -> str:
    clean_path = re.sub(r"/[a-f0-9-]+$", "", path)
    for prefix, section in SECTION_MAP.items():
        if clean_path.startswith(prefix):
            return section
    return "系统"


def get_entity_name(body: dict) -> str:
    for key in ["nickname", "name", "title", "content", "section", "username", "course_name", "owner_name"]:
        if key in body and body[key]:
            return str(body[key])[:20]
    return ""


def get_entity_id(path: str) -> str:
    # 批量操作路径不提取 entity_id
    if "/batch/" in path:
        return ""
    # 找 /api/{resource}/ 后的第一个 UUID（支持嵌套路径如 /api/class-records/{id}/groups）
    match = re.search(r"/api/[^/]+/([a-f0-9-]+)(?:/|$)", path)
    if match:
        return match.group(1)
    return ""


def get_before_data(path: str, entity_id: str) -> dict:
    if not entity_id:
        return None
    clean_path = re.sub(r"/[a-f0-9-]+$", "", path)
    for prefix, (section, service_name, func_name) in GETTER_MAP.items():
        if clean_path.startswith(prefix):
            try:
                import importlib
                mod = importlib.import_module(f"app.services.{service_name}")
                fn = getattr(mod, func_name, None)
                if fn:
                    result = fn(entity_id)
                    if result:
                        return result.model_dump(mode="json") if hasattr(result, "model_dump") else result
            except Exception:
                pass
            break
    return None


def _resolve_customer_names(customer_ids: list) -> list:
    """将客户 UUID 列表解析为昵称列表。"""
    if not customer_ids:
        return []
    try:
        from app.services import customer_service
        names = []
        for cid in customer_ids:
            customer = customer_service.get_customer(cid)
            if customer:
                names.append(customer.nickname)
            else:
                names.append(cid[:8])
        return names
    except Exception:
        return [cid[:8] for cid in customer_ids]


def _format_value(val, field_name: str = "") -> str:
    if val is None or val == "" or val == []:
        return ""
    if isinstance(val, bool):
        return "是" if val else "否"
    if isinstance(val, list):
        if len(val) == 0:
            return ""
        # For groups, show group names with member names
        if field_name == "groups" and isinstance(val[0], dict):
            parts = []
            for i, g in enumerate(val):
                name = g.get('name', f'小组{i+1}')
                member_ids = g.get('member_ids', [])
                leader_id = g.get('leader_id', '')
                if member_ids:
                    member_names = _resolve_customer_names(member_ids)
                    member_str = "、".join(member_names)
                    if leader_id:
                        leader_names = _resolve_customer_names([leader_id])
                        if leader_names:
                            member_str += f"，组长：{leader_names[0]}"
                    parts.append(f"{name}（{member_str}）")
                else:
                    parts.append(f"{name}（空）")
            return "、".join(parts)
        # For string lists (like host_names), show directly
        if isinstance(val[0], str):
            return "、".join(val)
        return f"{len(val)}人"
    return str(val)[:30]


def _diff_activity_participation(before: list, after: list) -> str:
    """逐项比较 activity_participation，只输出参与状态有变化的项。"""
    before_map = {(a.get("name", ""), a.get("role", ""), a.get("type", "")): a.get("participated", False) for a in before}
    after_map = {(a.get("name", ""), a.get("role", ""), a.get("type", "")): a.get("participated", False) for a in after}
    changes = []
    all_keys = set(before_map.keys()) | set(after_map.keys())
    for key in all_keys:
        old_p = before_map.get(key)
        new_p = after_map.get(key)
        if old_p == new_p:
            continue
        name, role = key[0], key[1]
        label = f"{name}" + (f"({role})" if role else "")
        if old_p is None:
            changes.append(f"{label}新增")
        elif new_p is None:
            changes.append(f"{label}移除")
        elif new_p:
            changes.append(f"{label}未参与→已参与")
        else:
            changes.append(f"{label}已参与→未参与")
    return "，".join(changes[:8])


def build_change_description(before: dict, after: dict) -> str:
    if not before or not after:
        return ""
    changes = []
    for key, new_val in after.items():
        if key in ("id", "created_at", "updated_at"):
            continue
        old_val = before.get(key)
        if old_val == new_val:
            continue
        if key == "activity_participation" and isinstance(old_val, list) and isinstance(new_val, list):
            diff = _diff_activity_participation(old_val, new_val)
            if diff:
                changes.append(f"活动参与：{diff}")
            continue
        field_name = FIELD_NAMES.get(key, key)
        old_str = _format_value(old_val, key)
        new_str = _format_value(new_val, key)
        if old_str and new_str:
            changes.append(f"{field_name}({old_str}→{new_str})")
        elif new_str:
            changes.append(f"{field_name}设为{new_str}")
        elif old_str:
            changes.append(f"{field_name}清空(原{old_str})")
    return "，".join(changes[:5])


def build_log_content(method: str, path: str, body: dict, before: dict = None) -> str:
    entity_name = get_entity_name(body) if body else ""
    if not entity_name and before:
        entity_name = get_entity_name(before)
    section = get_section(path)

    # 批量操作
    if "/batch/" in path:
        if "reorder" in path:
            return f"更新{section}排序"
        return f"批量操作{section}"

    if method == "POST":
        if entity_name:
            return f"新增{section}: {entity_name}"
        return f"新增{section}记录"
    elif method in ("PUT", "PATCH"):
        if before:
            desc = build_change_description(before, body)
            if entity_name:
                base = f"更新{section}: {entity_name}"
            else:
                base = f"更新{section}记录"
            if desc:
                return f"{base}（{desc}）"
            else:
                return f"{base}（无变更）"
        else:
            if entity_name:
                return f"更新{section}: {entity_name}"
            else:
                return f"更新{section}记录"
    elif method == "DELETE":
        if entity_name:
            return f"删除{section}: {entity_name}"
        entity_id = get_entity_id(path)
        if entity_id:
            return f"删除{section}记录"
        return f"删除{section}记录"
    return f"操作{section}"


class OperationLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        method = request.method

        if any(path.startswith(p) for p in SKIP_PATHS):
            return await call_next(request)

        if not path.startswith("/api/") or method == "OPTIONS":
            return await call_next(request)

        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            return await call_next(request)

        body_bytes = await request.body()
        body_str = body_bytes.decode("utf-8") if body_bytes else ""
        try:
            body = json.loads(body_str) if body_str else {}
        except json.JSONDecodeError:
            body = {}

        user_id = request.headers.get("X-User-Id", "")
        operator = ""
        operator_role = ""
        if user_id:
            try:
                from app.services import account_service
                account = account_service.get_account(user_id)
                if account:
                    operator = account.username
                    operator_role = account.role
            except Exception:
                operator = user_id[:8]

        ip = request.client.host if request.client else ""

        before_data = None
        if method in ("PUT", "PATCH"):
            entity_id = get_entity_id(path)
            before_data = get_before_data(path, entity_id)

        response = await call_next(request)

        try:
            section = get_section(path)
            content = build_log_content(method, path, body, before_data)
            entity_id = get_entity_id(path)

            create_log(OperationLogCreate(
                section=section,
                content=content,
            ), extra={
                "operator": operator,
                "operator_role": operator_role,
                "method": method,
                "path": path,
                "entity_id": entity_id,
                "ip": ip,
                "before_data": before_data,
                "after_data": body if body else None,
            })
        except Exception:
            pass

        return response
