"""复用同一账号、权限、条件和数据版本的短期分析，翻页只切片。

仅保存脱敏后的查询结果；业务写入改变版本即失效。缓存有容量及时间上限，
不缓存导出、不缓存失败，不替代持久化记录或服务端权限判断。
"""

import json
import threading
import time
from collections import OrderedDict
from copy import deepcopy
from datetime import datetime
from math import ceil
from zoneinfo import ZoneInfo

from app.services import (
    customer_access_service,
    position_edit_permission_service,
    principal_mobile_service,
    principal_response_service,
    principal_service,
)
from app.services.storage import data_revision
from app.utils.request_roles import get_request_roles

_entries = OrderedDict()
_inflight: dict[str, threading.Event] = {}
_lock = threading.Lock()
_TTL = 15
_MAX_ENTRIES = 8
_MAX_ROWS = 10000


def query_result(request, query):
    # 两端复用同一安全机制；mobile_group 在条件键中，手机裁剪仍由原入口完成。
    version = data_revision()
    roles = get_request_roles(request)
    permissions = position_edit_permission_service.get_permissions(roles)
    criteria = query.model_dump(mode="json", exclude={
        "page", "page_size", "log_analysis", "compact_overview", "overview_detail", "overview_detail_key",
        "participant_layout",
        "detail_picks", "detail_quick_filter", "detail_sort_by", "detail_sort_order", "arrival_view",
    })
    day = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    key = json.dumps([getattr(request.state, "user_id", ""), getattr(request.state, "user_owner", ""), roles, permissions, criteria, version, day], ensure_ascii=False, sort_keys=True)
    while True:
        with _lock:
            cached = _entries.get(key)
            result = cached[1] if cached and time.monotonic() - cached[0] < _TTL else None
            if result is not None:
                break
            pending = _inflight.get(key)
            owner = pending is None
            if owner:
                pending = _inflight[key] = threading.Event()
        if not owner:
            pending.wait()
            continue
        try:
            result = principal_service.analyze(request, query, export=True, defer_participant_feedback=True)
            # 课程卡片只在本次分析时整理一次，后续翻页直接切片。
            if query.course_view == "participant" and not query.participant_history_organization_id:
                result = {**result, "_participant_cards": principal_service.participant_course_cards(result["items"])}
            # 计算期间如有写入，不复用可能跨版本的结果。
            if version == data_revision() and len(result["items"]) <= _MAX_ROWS:
                isolated = deepcopy(result)
                with _lock:
                    if version == data_revision():
                        _entries[key] = (time.monotonic(), isolated)
                        _entries.move_to_end(key)
                        while len(_entries) > _MAX_ENTRIES:
                            _entries.popitem(last=False)
        finally:
            with _lock:
                _inflight.pop(key, None)
                pending.set()
        break
    items = result["items"]
    total = result["total"]
    # 新视图按课程成卡，分页单位是课；导出和未传布局参数的旧端仍按人展示。
    if not query.overview_detail and query.course_view == "participant" and query.participant_layout == "courses":
        items = result.get("_participant_cards", [])
        total = len(items)
    pages = max(1, ceil(total / query.page_size))
    page = min(query.page, pages)
    # 先切当前页再隔离返回值，不为20条明细复制整段历史反馈正文。
    response = {**{key: value for key, value in result.items() if key != "_participant_cards"},
                "items": items[(page - 1) * query.page_size:page * query.page_size], "total": total}
    if query.overview_detail:
        # 明细独立响应，不连带返回其他板块的列表和卡片。
        return customer_access_service.protect_note_payload(
            {"overview_detail": deepcopy(principal_response_service.detail_page(result.get("breakdown", {}), query))},
            permissions=permissions.get("customer_access", {}))
    if query.compact_overview and not query.mobile_group:
        breakdown = result.get("breakdown", {})
        response["breakdown"] = principal_mobile_service.compact_breakdown(breakdown)
        response["overview_metrics"] = principal_mobile_service.overview_metrics(breakdown, query.detail_picks)
    result = deepcopy(response)
    if query.tab in {"courses", "overview"} and query.course_view == "participant" and not query.participant_history_organization_id and customer_access_service.can_view_any_note(permissions=permissions["customer_access"]):
        result["items"] = principal_service.participant_feedback(result["items"], course_cards=query.participant_layout == "courses")
    result.update(page=page, page_size=query.page_size, total_pages=pages)
    return customer_access_service.protect_note_payload(result, permissions=permissions.get("customer_access", {}))
