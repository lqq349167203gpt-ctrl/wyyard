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

from app.services import position_edit_permission_service, principal_service
from app.services.storage import data_revision
from app.utils.request_roles import get_request_roles

_entries = OrderedDict()
_lock = threading.Lock()
_TTL = 15
_MAX_ENTRIES = 8
_MAX_ROWS = 10000


def query_result(request, query):
    # 两端复用同一安全机制；mobile_group 在条件键中，手机裁剪仍由原入口完成。
    version = data_revision()
    roles = get_request_roles(request)
    permissions = position_edit_permission_service.get_permissions(roles)
    criteria = query.model_dump(mode="json", exclude={"page", "page_size", "log_analysis"})
    day = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    key = json.dumps([getattr(request.state, "user_id", ""), getattr(request.state, "user_owner", ""), roles, permissions, criteria, version, day], ensure_ascii=False, sort_keys=True)
    now = time.monotonic()
    with _lock:
        cached = _entries.get(key)
        result = cached[1] if cached and now - cached[0] < _TTL else None
    if result is None:
        result = principal_service.analyze(request, query, export=True)
        # 计算期间如有写入，不复用可能跨版本的结果。
        if version == data_revision() and len(result["items"]) <= _MAX_ROWS:
            with _lock:
                _entries[key] = (now, deepcopy(result))
                _entries.move_to_end(key)
                while len(_entries) > _MAX_ENTRIES:
                    _entries.popitem(last=False)
    result = deepcopy(result)
    pages = max(1, ceil(result["total"] / query.page_size))
    page = min(query.page, pages)
    result["items"] = result["items"][(page - 1) * query.page_size:page * query.page_size]
    result.update(page=page, page_size=query.page_size, total_pages=pages)
    return result
