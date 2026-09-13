"""升单配置接口：读取 / 保存升单路径。"""

from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.jwt_auth import require_page_permission
from app.models.operation_log import OperationLogCreate
from app.models.upsell_config import UpsellConfigUpdate
from app.services import (
    internal_course_service,
    membership_card_service,
    operation_log_service,
    other_project_service,
    upsell_config_service,
)
from app.utils.request_context import get_client_ip, get_client_source
from app.utils.request_roles import get_request_roles

router = APIRouter(prefix="/api/upsell-config", tags=["升单配置"],
                   dependencies=[Depends(require_page_permission("upsell-config"))])


# 可选的付费项目：顺序与「付费项目」页面的标签页一致；第三个参数表示这一项下面还能再挑哪些细分
PAYMENT_ITEMS = (
    ("membership", "会员卡", "membership"),
    ("coarse", "粗门次卡", ""),
    ("group_case", "觉醒游戏", ""),
    ("emotional", "情绪释放", ""),
    ("oh", "OH卡诊断", ""),
    ("energy", "能量结", ""),
    ("internal", "内部课程", "internal"),
    ("tea", "茶位费", ""),
    ("offline", "线下落地课程", ""),
    ("other", "其他项目", "other"),
)


# 课程类型的先后沿用付款页下拉里的顺序（多出来的排在后面）
INTERNAL_COURSE_TYPE_ORDER = ("疗愈师课程：自爱力构建", "商业框架陪跑：自觉力提升", "落地赋能班：自洽力整合")


def _ordered(values: set[str], preferred: tuple[str, ...]) -> list[str]:
    return [name for name in preferred if name in values] + sorted(values - set(preferred))


def _subtypes(source: str) -> list[str]:
    """能细分到具体卡种/课程/项目的付费项目，列出系统里已配置的那些。"""
    if source == "membership":
        values = {(getattr(card, "card_type", "") or "").strip() for card in membership_card_service.list_cards()}
        return _ordered(values - {""}, membership_card_service.MEMBERSHIP_CARD_TYPE_ORDER)
    elif source == "internal":
        values = {(getattr(course, "course_type", "") or "").strip() for course in internal_course_service.list_courses()}
        return _ordered(values - {""}, INTERNAL_COURSE_TYPE_ORDER)
    elif source == "other":
        values = {(getattr(project, "project_name", "") or "").strip() for project in other_project_service.list_projects()}
        return sorted(values - {""})
    return []


def _products() -> list[dict]:
    """付费项目（key 形如 membership:次卡 的表示只挑某个卡种/课程/项目）。"""
    items: list[dict] = []
    for key, label, source in PAYMENT_ITEMS:
        items.append({"key": key, "label": label, "parent": key})
        items.extend({"key": f"{key}:{name}", "label": f"{label} · {name}", "parent": key} for name in _subtypes(source))
    return items


def _parent_of(item: str, labels: dict[str, str]) -> str:
    return item.partition(":")[0]


def _describe(levels: list[dict], labels: dict[str, str]) -> str:
    if not levels:
        return "清空升单配置"
    return "更新升单配置：" + " → ".join(
        f"{level['name']}（{'、'.join(labels.get(item, item) for item in level['products'])}）" for level in levels
    )


@router.get("")
def get_config():
    return {"levels": upsell_config_service.list_levels(), "products": _products()}


@router.put("")
def save_config(data: UpsellConfigUpdate, request: Request):
    labels = {item["key"]: item["label"] for item in _products()}
    # 同一个项目只能放一档；「整个会员卡」和「某个卡种」不能同时出现在不同大类里，
    # 但不同卡种（体验会员 → 次卡）可以各占一档，这正是卡种级的升单。
    placed: dict[str, str] = {}
    placed_whole: dict[str, str] = {}
    for level in data.levels:
        unknown = [item for item in level.products if item not in labels]
        if unknown:
            raise HTTPException(status_code=400, detail=f"不认识的付费项目：{'、'.join(unknown)}")
        for item in level.products:
            product, _, subtype = item.partition(":")
            if item in placed:
                raise HTTPException(status_code=400, detail=f"「{labels[item]}」已经放进「{placed[item]}」了")
            if not subtype and any(key.partition(":")[0] == product for key in placed):
                raise HTTPException(status_code=400, detail=f"{labels.get(product, product)}的卡种已经分到别的大类了，不能再把整个{labels.get(product, product)}放进来")
            if subtype and product in placed_whole:
                raise HTTPException(status_code=400, detail=f"{labels.get(product, product)}（全部卡种）已经放进「{placed_whole[product]}」了")
            placed[item] = level.name
            if not subtype:
                placed_whole[product] = level.name
    levels = upsell_config_service.replace_levels(data.levels)
    request.state.skip_operation_log = True
    operation_log_service.create_log(OperationLogCreate(section="信息配置", content=_describe(levels, labels)), extra={
        "operator": getattr(request.state, "user_owner", "") or getattr(request.state, "user_name", ""),
        "operator_role": "、".join(get_request_roles(request)), "source": get_client_source(request),
        "method": "PUT", "path": request.url.path, "ip": get_client_ip(request),
    })
    return {"levels": levels, "products": _products()}
