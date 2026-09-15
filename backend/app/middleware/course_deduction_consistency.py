"""课程名单变动与粗门交易取消：确认、权限检查、原子保存及缓存回滚。"""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from importlib import import_module

from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.services import storage

COURSE_PATHS = (
    "/api/class-records", "/api/group-case-sessions", "/api/emotional-release-sessions",
    "/api/energy-knot-sessions", "/api/internal-course-sessions", "/api/visits",
    "/api/project-deductions", "/api/activity-withdrawals", "/api/client/activities",
)
CACHE_MODULES = (
    "class_record_service", "group_case_session_service", "emotional_release_session_service",
    "energy_knot_session_service", "internal_course_session_service", "visit_service",
    "membership_card_service", "project_deduction_service", "customer_service", "client_notification_service",
)


def eligible_courses(customer_id):
    from app.services import project_deduction_service
    return {(row["record_type"], row["record_id"]): row["deduction_count"]
            for row in project_deduction_service._activity_rows(customer_id)}


class CourseDeductionConsistencyMiddleware:
    def __init__(self, app):
        self.app = app
        # 同一进程的写请求串行，避免回滚内存缓存时覆盖并发写入。
        self.lock = asyncio.Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT", "PATCH", "DELETE"}:
            return await self.app(scope, receive, send)
        async with self.lock:
            path = scope.get("path", "")
            if not any(path == prefix or path.startswith(prefix + "/") for prefix in COURSE_PATHS):
                return await self.app(scope, receive, send)
            from app.services import project_deduction_service as deductions

            active = [deepcopy(row) for row in deductions.list_deductions()
                      if row.project_name == deductions.COARSE_DOOR_CARD_TYPE and row.source_activity_id]
            if not active:
                return await self.app(scope, receive, send)
            before = {cid: eligible_courses(cid) for cid in {row.customer_id for row in active}}
            snapshots = []
            for name in CACHE_MODULES:
                module = import_module("app.services." + name)
                for key, value in vars(module).items():
                    if key in {"_records", "_sessions", "_visits", "_cards", "_deductions", "_debts", "_debt_activities", "_customers", "_notifications"}:
                        snapshots.append((module, key, deepcopy(value)))
            writes = []
            token = storage.pending_writes.set(writes)
            messages = []

            async def capture(message):
                messages.append(message)

            def rollback():
                for module, key, value in snapshots:
                    setattr(module, key, value)

            try:
                await self.app(scope, receive, capture)
                status = next((m["status"] for m in messages if m["type"] == "http.response.start"), 500)
                if status >= 400:
                    rollback()
                else:
                    request = Request(scope)
                    after = {cid: eligible_courses(cid) for cid in before}
                    removed = []
                    for row in active:
                        key = (row.source_activity_type, row.source_activity_id)
                        current = deductions._deductions.get(row.id)
                        if not current or current.is_deleted or current.cancelled or key not in before[row.customer_id]:
                            continue
                        if key not in after[row.customer_id]:
                            removed.append(current)
                        elif before[row.customer_id][key] != after[row.customer_id][key]:
                            raise HTTPException(409, "该课程已关联粗门抵扣，请先撤销抵扣后再修改扣卡次数")
                    if removed:
                        from app.services import customer_access_service, membership_card_service
                        from app.utils.record_ownership import ensure_payment_record_manager, get_request_actor
                        customer_access_service.require_transaction_access(request, detail=True)
                        for row in removed:
                            ensure_payment_record_manager(request, row)
                            customer_access_service.require_customer_scope(request, row.customer_id, action="取消抵扣")
                        if request.query_params.get("confirm_coarse_cancellation") != "1":
                            rollback()
                            # 写清楚是谁的抵扣：小程序直接用 detail 文案，PC 用 items 逐条渲染
                            items = [
                                {
                                    "nickname": row.nickname or "未命名客户",
                                    "activity": row.source_activity_name or "",
                                    "count": row.count,
                                }
                                for row in removed
                            ]
                            lines = "\n".join(
                                " · ".join(part for part in (item["nickname"], item["activity"], f'{item["count"]} 次') if part)
                                for item in items
                            )
                            response = JSONResponse({
                                "detail": (
                                    f"取消参与后，会同时撤销 {len(removed)} 笔粗门次卡支付记录"
                                    f"（共 {sum(r.count for r in removed)} 次）：\n"
                                    f"{lines}\n是否继续？"
                                ),
                                "coarse_cancellation_required": True,
                                "coarse_cancellation_items": items,
                            }, status_code=409)
                            return await response(scope, receive, send)
                        for row in removed:
                            # 取消参与不调用 release_coarse_card_assignment，避免重新扣普通会员卡。
                            prefix = f"{row.source_activity_type}:{row.source_activity_id}"
                            with membership_card_service._deduct_lock:
                                membership_card_service._do_sync_activity_count(row.customer_id, prefix, 0)
                                membership_card_service._save_customer_usages({row.customer_id})
                            row.cancelled = True
                            row.cancellation_reason = "已从课程移除或取消参与"
                            row.cancelled_at = datetime.now(timezone.utc)
                            row.cancelled_by = get_request_actor(request)[1]
                            deductions._save(row.id)
                        from app.services.member_identity_service import refresh_coarse_identity
                        for customer_id in {row.customer_id for row in removed}:
                            refresh_coarse_identity(customer_id)
                        request.state.operation_log_context = {
                            "content": "课程参与变更；同步取消粗门抵扣：" + "；".join(f"{r.nickname} · {r.source_activity_name} · {r.count}次 · 已从课程移除或取消参与" for r in removed),
                            "after_data": {"cancelled_deductions": [r.model_dump(mode="json") for r in removed]},
                        }
                    storage.commit_pending_writes(writes)
                for message in messages:
                    await send(message)
            except HTTPException as error:
                rollback()
                await JSONResponse({"detail": error.detail}, status_code=error.status_code)(scope, receive, send)
            except Exception:
                rollback()
                raise
            finally:
                storage.pending_writes.reset(token)
