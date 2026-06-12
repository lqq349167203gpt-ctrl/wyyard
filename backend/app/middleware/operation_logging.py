import re
import json
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.services.operation_log_service import create_log
from app.models.operation_log import OperationLogCreate

SECTION_MAP = {
    "/api/customers": "用户管理",
    "/api/visits": "人员安排",
    "/api/healing-records": "客户信息",
    "/api/courses": "活动配置",
    "/api/course-types": "活动配置",
    "/api/spaces": "空间配置",
    "/api/member-identities": "会员身份",
    "/api/activity-permissions": "活动安排",
    "/api/membership-cards": "付费项目",
    "/api/group-cases": "付费项目",
    "/api/group-case-sessions": "活动安排",
    "/api/emotional-releases": "付费项目",
    "/api/emotional-release-sessions": "活动安排",
    "/api/energy-knots": "付费项目",
    "/api/energy-knot-sessions": "活动安排",
    "/api/internal-courses": "付费项目",
    "/api/internal-course-sessions": "活动安排",
    "/api/agents": "AI 配置",
    "/api/ai-configs": "AI 配置",
    "/api/class-records": "人员安排",
    "/api/accounts": "账号管理",
    "/api/positions": "角色管理",
    "/api/healing-identities": "疗愈老师",
    "/api/account-change-password": "密码修改",
    "/api/daily-groupings": "人员安排",
    "/api/position-permissions": "角色管理",
    "/api/position-customer-permissions": "角色管理",
    "/api/system-logs": "系统日志",
    "/api/other-projects": "付费项目",
    "/api/oh-card-readings": "付费项目",
    "/api/oh-card-reading-sessions": "活动安排",
    "/api/project-deductions": "付费项目",
    "/api/reminders": "提醒配置",
    "/api/business-reminders": "提醒配置",
    "/api/activity-themes": "活动安排",
    "/api/organizations": "组织管理",
}

# 路径前缀 → (section, service_module, get_function_name)
GETTER_MAP = {
    "/api/customers": ("用户管理", "customer_service", "get_customer"),
    "/api/healing-records": ("客户信息", "healing_record_service", "get_record"),
    "/api/courses": ("活动配置", "course_service", "get_course"),
    "/api/spaces": ("空间配置", "space_service", "get_space"),
    "/api/member-identities": ("会员身份", "member_identity_service", "get_identity"),
    "/api/membership-cards": ("付费项目", "membership_card_service", "get_card"),
    "/api/group-cases": ("活动安排", "group_case_service", "get_case"),
    "/api/group-case-sessions": ("活动安排", "group_case_session_service", "get_session"),
    "/api/emotional-releases": ("活动安排", "emotional_release_service", "get_release"),
    "/api/emotional-release-sessions": ("活动安排", "emotional_release_session_service", "get_session"),
    "/api/energy-knots": ("活动安排", "energy_knot_service", "get_knot"),
    "/api/energy-knot-sessions": ("活动安排", "energy_knot_session_service", "get_session"),
    "/api/internal-courses": ("活动安排", "internal_course_service", "get_course"),
    "/api/internal-course-sessions": ("活动安排", "internal_course_session_service", "get_session"),
    "/api/agents": ("AI 配置", "agent_service", "get_agent"),
    "/api/ai-configs": ("AI 配置", "ai_config_service", "get_config"),
    "/api/class-records": ("人员安排", "class_record_service", "get_record"),
    "/api/accounts": ("账号管理", "account_service", "get_account"),
    "/api/visits": ("人员安排", "visit_service", "get_visit"),
    "/api/daily-groupings": ("人员安排", "daily_grouping_service", "get_grouping"),
    "/api/positions": ("角色管理", "position_service", "get_position"),
    "/api/position-permissions": ("角色管理", "position_permission_service", "get_permissions"),
    "/api/position-customer-permissions": ("角色管理", "position_customer_permission_service", "get_data"),
    "/api/other-projects": ("活动安排", "other_project_service", "get_project"),
    "/api/oh-card-readings": ("活动安排", "oh_card_reading_service", "get_reading"),
    "/api/oh-card-reading-sessions": ("活动安排", "oh_card_reading_session_service", "get_session"),
    "/api/reminders": ("提醒配置", "reminder_service", "get_reminder"),
    "/api/activity-themes": ("活动安排", "activity_theme_service", "get_theme"),
    "/api/organizations": ("组织管理", "organization_service", "get_organization"),
}

PAGE_LABELS: dict[str, str] = {
    "dashboard": "工作台",
    "customers": "用户管理",
    "healing-records": "客户信息",
    "activity-records": "活动记录",
    "traffic-records": "引流记录",
    "class-records": "人员安排",
    "class-records-visitors": "到场人员",
    "class-records-activities": "当日活动",
    "class-records-arrival": "到场确认",
    "daily-activities": "活动安排",
    "payment": "付费项目",
    "membership-cards": "会员活动",
    "group-cases": "觉醒游戏",
    "emotional-releases": "情绪释放",
    "energy-knots": "能量结",
    "internal-courses": "内部课程",
    "group-case-sessions": "活动安排",
    "emotional-release-sessions": "活动安排",
    "energy-knot-sessions": "活动安排",
    "internal-course-sessions": "活动安排",
    "agents": "AI 配置",
    "knowledge": "知识库",
    "business": "业务数据",
    "system-logs": "系统日志",
    "operation-logs": "操作日志",
    "accounts": "账号管理",
    "change-password": "密码修改",
    "member-identities": "会员身份",
    "healing-identities": "疗愈老师",
    "position-management": "账号管理",
    "courses": "活动配置",
    "spaces": "疗愈空间",
    "other-projects": "其他项目",
    "oh-card-readings": "活动安排",
    "oh-card-reading-sessions": "活动安排",
    "reminders": "提醒配置",
    "business-reminders": "业务提醒",
    "activity-themes": "活动安排",
    "organizations": "组织管理",
}

SKIP_PATHS = [
    "/api/health",
    "/api/accounts/login",
    "/api/accounts/roles",
    "/api/member-identities/batch",
    "/api/member-identities/refresh-all",
    "/api/customers/batch",  # 只读批量查询，不需要记录操作日志
    "/api/uploads",  # 文件上传是二进制 multipart，不能 decode("utf-8")
    "/api/operation-logs",  # 操作日志自身是只读 API，不记录自身操作
    "/api/system-logs",  # 系统日志自身是只读 API，不记录自身操作
]

FIELD_NAMES = {
    "nickname": "昵称", "name": "名称", "title": "标题", "username": "用户名", "owner": "归属人",
    "phone": "手机", "email": "邮箱", "gender": "性别", "birthday": "生日",
    "member_type": "会员类型", "activity_types": "活动类型", "member_identity": "会员身份", "healing_identity": "疗愈老师",
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
    "arrived": "到店状态", "arrival_time": "到店时间", "experience": "客户反馈", "feedback": "疗愈师回复",
    "needs": "需求", "activity_participation": "活动参与", "visit_date": "到访日期",
    "visit_time": "预计时间", "customer_id": "客户",
    "space_id": "空间", "room_id": "房间", "room_name": "房间名", "position": "职位", "role": "角色", "permissions": "权限",
    "groups": "分组", "materials": "资料", "images": "图片",
    "location": "地点", "address": "地址",
    "start_date": "开始日期", "end_date": "结束日期",
    "owner_id": "案主", "space_name": "空间名",
    "card_type": "卡类型", "remaining_count": "剩余次数",
    "customer_name": "用户",
    "password": "密码", "old_password": "旧密码", "new_password": "新密码",
    "positions": "疗愈老师",
    "referrer": "引流人", "traffic_source": "流量来源", "age": "年龄",
    "visit_count": "到店次数", "paid_content": "付费内容",
    "work_status": "工作状态", "work_description": "工作描述",
    "basic_info": "创伤经历", "assessment": "当下卡点",
    "tags": "到访目的", "self_tags": "个人标签",
    "wechat": "微信", "core_situation": "核心情况",
    "need_tags": "需求标签", "follow_up_node": "跟进节点",
    "follow_up_action": "跟进动作", "tracking_plan": "跟进计划",
    "pages": "页面权限", "member_types": "用户信息权限", "page_permissions": "用户信息权限",
    "operator": "匹配方式", "conditions": "匹配条件",
    "customers": "客户信息可见身份", "class_records": "人员安排可见身份", "payment": "付费项目可见身份",
    "purchase_count": "购买次数", "closer_name": "成交人", "closer_id": "成交人", "category": "分类",
    "referrer_handler": "引流处理人", "traffic_source_detail": "流量来源详情",
    "total_payment": "累计付费",
    "activity_mode": "活动模式", "class_count": "课时数", "course_id": "课程",
    "effective_date": "生效日期", "organization_id": "组织", "rooms": "房间", "teachers": "老师", "themes": "主题",
    "enabled": "启用状态", "is_system": "系统角色",
    "daily_card_usage": "日卡使用", "activity_id": "活动ID", "activity_type": "活动类型",
    "healing_notes": "疗愈笔记", "activity_count": "活动次数", "welfare_count": "公益次数",
    "activities": "活动记录",
}


def get_section(path: str) -> str:
    clean_path = re.sub(r"/[a-f0-9-]+$", "", path)
    for prefix, section in SECTION_MAP.items():
        if clean_path.startswith(prefix):
            return section
    return "系统"


def get_entity_name(body: dict) -> str:
    for key in ["nickname", "name", "title", "content", "section", "username", "course_name", "owner_name", "date", "position", "member_type"]:
        if key in body and body[key]:
            return str(body[key])[:20]
    return ""


def get_entity_id(path: str) -> str:
    # 批量操作路径不提取 entity_id
    if "/batch/" in path:
        return ""
    # 找 /api/{resource}/ 后的第一个 UUID（支持嵌套路径如 /api/class-records/{id}/groups）
    match = re.search(r"/api/[^/]+/([^/]+)(?:/|$)", path)
    if match:
        eid = match.group(1)
        # Skip action-like path segments (not real entity IDs)
        if eid in ("batch", "reorder", "refresh-all", "login", "roles", "groups", "deductions", "verify", "toggle", "sync-from-customers", "full"):
            return ""
        return eid
    return ""


def get_before_data(path: str, entity_id: str, body: dict = None) -> dict:
    body = body or {}
    clean_path = re.sub(r"/[a-f0-9-]+$", "", path)

    # position-permissions full: merge page permissions and customer permissions
    if "/api/position-permissions/full" in path:
        position = body.get("position", "")
        if position:
            try:
                from app.services import position_permission_service, position_customer_permission_service
                pages = position_permission_service.get_permissions(position)
                c = position_customer_permission_service.get_customer_permissions("customers", position)
                cr = position_customer_permission_service.get_customer_permissions("class_records", position)
                p = position_customer_permission_service.get_customer_permissions("payment", position)
                return {"position": position, "pages": pages, "customers": c, "class_records": cr, "payment": p}
            except Exception:
                pass
        return None

    # position-permissions: entity key is body["position"]
    if "/api/position-permissions" in path and not "/api/position-customer-permissions" in path:
        position = body.get("position", "")
        if position:
            try:
                from app.services import position_permission_service
                pages = position_permission_service.get_permissions(position)
                return {"position": position, "pages": pages}
            except Exception:
                pass
        return None

    # position-customer-permissions batch: merge all three sections into one before snapshot
    if "/api/position-customer-permissions/batch" in path:
        position = body.get("position", "")
        if position:
            try:
                from app.services import position_customer_permission_service
                c = position_customer_permission_service.get_customer_permissions("customers", position)
                cr = position_customer_permission_service.get_customer_permissions("class_records", position)
                p = position_customer_permission_service.get_customer_permissions("payment", position)
                return {"position": position, "customers": c, "class_records": cr, "payment": p}
            except Exception:
                pass
        return None

    # position-customer-permissions single section (skip — batch handles it, this is for backward compat)
    if "/api/position-customer-permissions/" in path and "/batch" not in path:
        position = body.get("position", "")
        if position:
            try:
                section_match = re.search(r"/api/position-customer-permissions/([^/]+)", path)
                section = section_match.group(1) if section_match else "customers"
                from app.services import position_customer_permission_service
                member_types = position_customer_permission_service.get_customer_permissions(section, position)
                return {"position": position, "member_types": member_types}
            except Exception:
                pass
        return None

    # activity-permissions: return current state for before comparison
    if "/api/activity-permissions" in path:
        try:
            from app.services import activity_permission_service
            return activity_permission_service.get_all()
        except Exception:
            pass
        return None

    # daily-groupings: entity_id from body.date
    if not entity_id and body.get("date"):
        if clean_path.rstrip("/") == "/api/daily-groupings":
            entity_id = body["date"]

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


def _resolve_customer_name_if_uuid(val: str) -> str:
    """如果值看起来像 UUID（8位以上 hex 字符串），尝试解析为客户昵称。"""
    if len(val) >= 8 and all(c in "0123456789abcdef-" for c in val.lower()):
        try:
            from app.services import customer_service
            customer = customer_service.get_customer(val)
            if customer:
                return customer.nickname
        except Exception:
            pass
    return val


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
                    parts.append(f"{name}（无成员）")
            return "、".join(parts)
        # For string lists, show first 5 items
        if isinstance(val[0], str):
            # Translate page keys to Chinese labels
            items = [PAGE_LABELS.get(v, v) for v in val] if field_name in ("pages", "permissions") else val
            # Resolve UUID-looking strings to customer names
            items = [_resolve_customer_name_if_uuid(v) for v in items]
            return "、".join(items)
        return f"{len(val)}人"
    # Resolve single UUID-looking value to customer name
    if isinstance(val, str) and len(val) >= 8 and all(c in "0123456789abcdef-" for c in val.lower()):
        resolved = _resolve_customer_name_if_uuid(val)
        if resolved != val:
            return resolved
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
    return "，".join(changes)


def _diff_groups(before: list, after: list) -> str:
    """逐项比较 groups 变更，输出具体调整内容。"""
    parts = []
    max_len = max(len(before), len(after))
    for i in range(max_len):
        old_g = before[i] if i < len(before) else None
        new_g = after[i] if i < len(after) else None
        gname = (new_g or old_g).get("name", f"小组{i+1}")

        if old_g is None:
            parts.append(f"新增{gname}")
            continue
        if new_g is None:
            parts.append(f"删除{gname}")
            continue

        # 比较成员
        old_members = set(old_g.get("member_ids") or [])
        new_members = set(new_g.get("member_ids") or [])
        added = new_members - old_members
        removed = old_members - new_members

        member_changes = []
        if added:
            names = _resolve_customer_names(list(added))
            member_changes.append(f"+{len(added)}人（{'、'.join(names)}）")
        if removed:
            names = _resolve_customer_names(list(removed))
            member_changes.append(f"-{len(removed)}人（{'、'.join(names)}）")

        # 比较组长
        old_leader = old_g.get("leader_id") or ""
        new_leader = new_g.get("leader_id") or ""
        if old_leader != new_leader:
            old_name = _resolve_customer_names([old_leader])[0] if old_leader else "无"
            new_name = _resolve_customer_names([new_leader])[0] if new_leader else "无"
            member_changes.append(f"组长（{old_name}→{new_name}）")

        # 比较副组长
        old_deputy = old_g.get("deputy_id") or ""
        new_deputy = new_g.get("deputy_id") or ""
        if old_deputy != new_deputy:
            old_name = _resolve_customer_names([old_deputy])[0] if old_deputy else "无"
            new_name = _resolve_customer_names([new_deputy])[0] if new_deputy else "无"
            member_changes.append(f"副组长（{old_name}→{new_name}）")

        if member_changes:
            parts.append(f"{gname}：{'，'.join(member_changes)}")

    return "；".join(parts)


def _format_activity_perms(val: dict) -> str:
    """将 {activity_type: {view, participate}} 格式化为可读中文"""
    if not isinstance(val, dict):
        return str(val)[:30]
    parts = []
    for at, perms in val.items():
        if isinstance(perms, dict):
            v = "✓" if perms.get("view") else "✗"
            p = "✓" if perms.get("participate") else "✗"
            parts.append(f"{at}(浏览{v}参与{p})")
        else:
            parts.append(str(at))
    return "、".join(parts)


def _build_set_summary(after: dict) -> str:
    """当没有 before 数据时，描述 after 中主要设置了哪些字段。"""
    parts = []
    for key, new_val in after.items():
        if key in ("id", "created_at", "updated_at"):
            continue
        field_name = FIELD_NAMES.get(key, key)
        if isinstance(new_val, dict) and any(isinstance(v, dict) for v in new_val.values()):
            # 活动权限格式：{member_type: {activity_type: {view, participate}}}
            for mt, perms in new_val.items():
                parts.append(f"{mt}：{_format_activity_perms(perms)}")
        else:
            formatted = _format_value(new_val, key)
            if not formatted:
                continue
            parts.append(f"{field_name}设为{formatted}")
    return "，".join(parts)


def build_change_description(before: dict, after: dict) -> str:
    if not after:
        return ""
    if not before:
        return _build_set_summary(after)
    # ID/Name pairs: when both are changing, skip the ID (show only the name)
    id_name_pairs = {
        "host_id": "host_name", "owner_id": "owner_name",
        "closer_id": "closer_name",
        "space_id": "space_name", "room_id": "room_name",
    }
    skip_keys = set()
    for id_key, name_key in id_name_pairs.items():
        if id_key in after and name_key in after:
            skip_keys.add(id_key)

    changes = []
    for key, new_val in after.items():
        if key in ("id", "created_at", "updated_at") or key in skip_keys:
            continue
        old_val = before.get(key)
        if old_val == new_val:
            continue
        if key == "activity_participation" and isinstance(old_val, list) and isinstance(new_val, list):
            diff = _diff_activity_participation(old_val, new_val)
            if diff:
                changes.append(f"活动参与：{diff}")
            continue
        if key == "groups" and isinstance(old_val, list) and isinstance(new_val, list):
            diff = _diff_groups(old_val, new_val)
            if diff:
                changes.append(f"分组调整：{diff}")
            continue
        # 列表类型字段：显示增减项而非全量
        if isinstance(old_val, list) and isinstance(new_val, list):
            old_set = set(old_val)
            new_set = set(new_val)
            added = new_set - old_set
            removed = old_set - new_set
            field_name = FIELD_NAMES.get(key, key)
            parts = []
            if added:
                parts.append(f"+{_format_value(list(added), key)}")
            if removed:
                parts.append(f"-{_format_value(list(removed), key)}")
            if parts:
                changes.append(f"{field_name}：{'，'.join(parts)}")
            continue
        if isinstance(new_val, dict) and any(isinstance(v, list) for v in new_val.values()):
            # page_permissions 格式：{page_key: [member_types]}
            label = FIELD_NAMES.get(key, key)
            old_dict = old_val if isinstance(old_val, dict) else {}
            page_changes = []
            for pk, new_list in new_val.items():
                old_list = old_dict.get(pk, [])
                if set(new_list) != set(old_list):
                    added = set(new_list) - set(old_list)
                    removed = set(old_list) - set(new_list)
                    page_label = PAGE_LABELS.get(pk, pk)
                    parts = []
                    if added:
                        parts.append(f"+{'、'.join(added)}")
                    if removed:
                        parts.append(f"-{'、'.join(removed)}")
                    if parts:
                        page_changes.append(f"{page_label}：{'，'.join(parts)}")
            if page_changes:
                changes.append(f"{label}：{'；'.join(page_changes)}")
            continue
        if isinstance(new_val, dict) and any(isinstance(v, dict) for v in new_val.values()):
            # 活动权限格式：{activity_type: {view, participate}}
            label = FIELD_NAMES.get(key, key)
            if not isinstance(old_val, dict):
                # 新增的身份：展示全部权限设置
                items = [_format_activity_perms(new_val)]
                changes.append(f"{label}设为{items[0]}")
            else:
                all_ats = set(old_val.keys()) | set(new_val.keys())
                diffs = []
                for at in sorted(all_ats):
                    old_p = old_val.get(at, {}) if isinstance(old_val.get(at), dict) else {}
                    new_p = new_val.get(at, {}) if isinstance(new_val.get(at), dict) else {}
                    if old_p == new_p:
                        continue
                    parts = []
                    if old_p.get("view") != new_p.get("view"):
                        ov = "✓" if old_p.get("view") else "✗"
                        nv = "✓" if new_p.get("view") else "✗"
                        parts.append(f"浏览{ov}→{nv}")
                    if old_p.get("participate") != new_p.get("participate"):
                        op = "✓" if old_p.get("participate") else "✗"
                        np = "✓" if new_p.get("participate") else "✗"
                        parts.append(f"参与{op}→{np}")
                    if parts:
                        diffs.append(f"{at}：{'，'.join(parts)}")
                if diffs:
                    changes.append(f"{label}：{'；'.join(diffs)}")
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
    return "，".join(changes)


def _build_create_summary(body: dict) -> str:
    """为 POST 请求生成简洁描述"""
    parts = []
    for key in ["member_type", "card_type", "course_type", "purchase_count", "amount", "price", "closer_name", "role", "username", "referrer", "positions"]:
        val = body.get(key)
        if val is not None and val != "" and val != []:
            label = FIELD_NAMES.get(key, key)
            formatted = _format_value(val, key)
            if formatted:
                parts.append(f"{label}：{formatted}")
    return "，".join(parts)


def build_log_content(method: str, path: str, body: dict, before: dict = None) -> str:
    entity_name = get_entity_name(body) if body else ""
    if not entity_name and before:
        entity_name = get_entity_name(before)

    # 业务提醒切换状态
    if "/api/business-reminders/" in path and path.rstrip("/").endswith("/toggle"):
        item_id_match = re.search(r"/api/business-reminders/([^/]+)/toggle", path)
        item_id = item_id_match.group(1) if item_id_match else ""
        desc = body.get("description", "")
        if desc:
            return f"切换提醒状态：{desc}"
        # 尝试从 service 获取提醒描述
        try:
            from app.services import business_reminder_service
            items = business_reminder_service._load()
            for item in items:
                if item.get("id") == item_id or f"{item.get('user_id', '')}:{item.get('id', '')}" == item_id:
                    desc = item.get("description", "")
                    if desc:
                        return f"切换提醒状态：{desc}"
        except Exception:
            pass
        return "切换提醒状态"

    # 其他项目扣减：生成"用户名 · 项目名 扣减N次"格式
    if path.rstrip("/") == "/api/other-projects/deductions" and method == "POST":
        customer_id = body.get("customer_id", "")
        project_id = body.get("other_project_id", "")
        count = body.get("count", 1)
        customer_name = ""
        project_name = ""
        try:
            from app.services import customer_service, other_project_service
            c = customer_service.get_customer(customer_id)
            if c:
                customer_name = c.nickname or c.name
            p = other_project_service.get_project(project_id)
            if p:
                project_name = p.project_name
        except Exception:
            pass
        parts = []
        if customer_name:
            parts.append(customer_name)
        if project_name:
            parts.append(project_name)
        parts.append(f"扣减{count}次")
        return " · ".join(parts) if len(parts) > 1 else parts[0]

    # 项目销卡：生成"用户名 · 项目类型 扣减N次"格式
    if path.rstrip("/") == "/api/project-deductions" and method == "POST":
        customer_id = body.get("customer_id", "")
        project_type = body.get("project_type", "")
        count = body.get("count", 1)
        customer_name = ""
        try:
            from app.services import customer_service
            c = customer_service.get_customer(customer_id)
            if c:
                customer_name = c.nickname or c.name
        except Exception:
            pass
        type_labels = {
            "membership-cards": "会员活动", "group-cases": "觉醒游戏",
            "emotional-releases": "情绪释放", "oh-card-readings": "OH卡梳理", "energy-knots": "能量结",
        }
        type_label = type_labels.get(project_type, project_type)
        parts = []
        if customer_name:
            parts.append(customer_name)
        parts.append(type_label)
        parts.append(f"扣减{count}次")
        return " · ".join(parts)

    # 其他项目新增：生成"客户 · 项目名（¥金额，N次）"格式
    if path.rstrip("/") == "/api/other-projects" and method == "POST":
        project_name = body.get("project_name", "")
        nickname = (body.get("nickname") or "").strip()
        fee = body.get("fee")
        remaining = body.get("remaining_count")
        parts = []
        if nickname:
            parts.append(nickname)
        if project_name:
            parts.append(project_name)
        detail_parts = []
        if fee is not None:
            detail_parts.append(f"¥{fee}")
        if remaining is not None:
            detail_parts.append(f"{remaining}次")
        if detail_parts:
            return f"{' · '.join(parts)}（{'，'.join(detail_parts)}）" if parts else f"新增其他项目（{'，'.join(detail_parts)}）"
        return f"新增其他项目：{' · '.join(parts)}" if parts else "新增其他项目"

    # 活动主题批量：显示日期范围、周主题和每日主题
    if "/api/activity-themes/batch" in path and method == "POST":
        themes = body.get("themes", [])
        if themes:
            dates = sorted(set(t.get("date", "") for t in themes if t.get("date")))
            week_theme = themes[0].get("week_theme", "")
            date_range = f"{dates[0]}~{dates[-1]}" if len(dates) > 1 else (dates[0] if dates else "")
            # 收集有 day_theme 的日期
            day_parts = []
            for t in themes:
                dt = t.get("day_theme", "")
                if dt:
                    date_str = t.get("date", "")
                    # 只取月/日
                    md = date_str[5:] if len(date_str) >= 10 else date_str
                    day_parts.append(f"{md}：{dt}")
            parts = []
            if week_theme:
                parts.append(f"周主题：{week_theme}")
            if day_parts:
                parts.append("，".join(day_parts))
            if parts:
                return f"设置活动主题：{date_range}（{'；'.join(parts)}）"
            return f"设置活动主题：{date_range}"
        return "设置活动主题"

    # 活动主题：显示日期和主题内容
    if path.rstrip("/") == "/api/activity-themes" and method == "POST":
        date = body.get("date", "")
        week_theme = body.get("week_theme", "")
        day_theme = body.get("day_theme", "")
        theme = day_theme or week_theme
        if theme:
            return f"设置活动主题：{date}（{theme}）"
        return f"设置活动主题：{date}"

    # 活动权限配置：通过 diff 描述具体变更
    if path.rstrip("/") == "/api/activity-permissions":
        perms = body.get("permissions", body)
        if isinstance(perms, dict) and any(isinstance(v, dict) for v in perms.values()):
            desc = build_change_description(before or {}, perms)
            if desc:
                return f"活动权限：{desc}"
        return "更新活动权限配置"

    # 角色完整权限：合并页面权限和用户信息权限
    if "/api/position-permissions/full" in path:
        position = body.get("position", "")
        desc = build_change_description(before or {}, body)
        if desc:
            return f"{position}：{desc}"
        return f"保存{position}（无变更）"

    # 批量操作
    if "/batch/" in path:
        if "reorder" in path:
            return "排序调整"
        return "批量操作"

    name = entity_name or get_entity_id(path) or "记录"

    section = get_section(path)
    entity_type = section.replace("配置", "").replace("管理", "")
    # 嵌套资源：/api/spaces/{id}/rooms → 房间
    if "/rooms" in path and section == "空间配置":
        entity_type = "房间"

    if method == "POST":
        summary = _build_create_summary(body)
        if summary:
            return f"新增{entity_type} {name}：{summary}"
        return f"新增{entity_type} {name}"
    elif method in ("PUT", "PATCH"):
        desc = build_change_description(before or {}, body)
        if desc:
            return f"{name}：{desc}"
        return f"保存{name}（无变更）"
    elif method == "DELETE":
        return f"删除{entity_type} {name}"
    return f"操作 {name}"


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
        if method in ("PUT", "PATCH", "DELETE"):
            entity_id = get_entity_id(path)
            before_data = get_before_data(path, entity_id, body)

        response = await call_next(request)

        # 只记录成功的写操作（跳过 4xx/5xx）
        if response.status_code >= 400:
            return response

        # 过滤掉前端可能回传的计算字段（不应记录为变更）
        for computed_key in ("total_payment", "visit_count", "activity_count", "welfare_count"):
            body.pop(computed_key, None)

        try:
            section = get_section(path)
            content = build_log_content(method, path, body, before_data)
            entity_id = get_entity_id(path)

            # 特殊处理：position-permissions/full 端点使用 body 中的 position 作为 entity_id
            if "/api/position-permissions/full" in path:
                entity_id = body.get("position", "")

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
                "after_data": body.get("permissions", body) if body else None,
            })
        except Exception:
            pass

        return response
