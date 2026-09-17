"""信息核对页面：把课表 / 邀约里缺失的信息集中列出来，并带出核对（锁定）状态。"""

from fastapi import APIRouter, Depends, Query, Request

from app.middleware.jwt_auth import require_page_permission
from app.services import customer_access_service, customer_service, missing_check_service
from app.utils.request_roles import get_request_roles

router = APIRouter(
    prefix="/api/audit-check",
    tags=["audit-check"],
    dependencies=[Depends(require_page_permission("audit-check"))],
)

SCOPE_ALIASES: dict[str, tuple[str, ...]] = {
    "all": ("course", "visit"),
    "course": ("course",),
    "visit": ("visit",),
}


@router.get("/catalog")
def get_catalog(scope: str = Query("")):
    """可勾选的检查项与默认勾选项，页面首次打开时按这个渲染筛选。"""
    return {
        "items": missing_check_service.catalog(scope),
        "defaults": missing_check_service.default_kinds(scope),
    }


@router.get("")
def check_missing(
    start_date: str = Query(...),
    end_date: str = Query(...),
    space_id: str = Query(""),
    scope: str = Query("all"),
    # 不传 = 用默认口径；显式传空字符串 = 一项都不检查（只看核对状态）
    kinds: str | None = Query(None),
    # 按「天」分页：page_size <= 0 表示不分页（PC 一次性渲染，保持不变）
    page: int = Query(1, ge=1),
    page_size: int = Query(0),
    request: Request = None,
):
    """返回选中范围内的缺失清单、按天分组，并带上课表/邀约各自的核对状态。"""
    scopes = SCOPE_ALIASES.get(scope, SCOPE_ALIASES["all"])
    if kinds is None:
        # 没传检查项时按默认口径，保证直接调接口也有结果
        selected = set(missing_check_service.default_kinds_for(scopes))
    else:
        selected = {key.strip() for key in kinds.split(",") if key.strip()}
    visible_customer_ids = (
        customer_access_service.visible_customer_ids(request, customer_service.list_customers())
        if request is not None
        else None
    )
    # 来访需求按邀约页同一口径：没有「跟进点」查看权限的账号只核对是否填写，不看内容
    roles = get_request_roles(request) if request is not None else []
    can_view_visit_need = "超级管理员" in roles or customer_access_service.can_view_detail_tab(roles, "follow_up")
    result = missing_check_service.check(
        start_date=start_date,
        end_date=end_date,
        space_id=space_id,
        scopes=scopes,
        kinds=selected,
        visible_customer_ids=visible_customer_ids,
        can_view_visit_need=can_view_visit_need,
    )
    all_days = result.get("days") or []
    result["total_days"] = len(all_days)
    if page_size and page_size > 0:
        total_pages = max(1, (len(all_days) + page_size - 1) // page_size)
        current = min(page, total_pages)
        result["days"] = all_days[(current - 1) * page_size: current * page_size]
        result["page"] = current
        result["page_size"] = page_size
        result["total_pages"] = total_pages
    return result
