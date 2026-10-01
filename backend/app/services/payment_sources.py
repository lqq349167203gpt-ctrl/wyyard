"""付费项目的数据读取入口，不负责日期、作废、退费或权限等统计口径。"""

from collections.abc import Callable, Iterable, Iterator
from importlib import import_module

_LOADERS = {
    "membership-cards": ("membership_card_service", "list_cards"),
    "group-cases": ("group_case_service", "list_cases"),
    "emotional-releases": ("emotional_release_service", "list_releases"),
    "energy-knots": ("energy_knot_service", "list_knots"),
    "internal-courses": ("internal_course_service", "list_courses"),
    "oh-card-readings": ("oh_card_reading_service", "list_readings"),
    "offline-courses": ("offline_course_service", "list_courses"),
    "tea-seat-fees": ("tea_seat_fee_service", "list_fees"),
    "other-projects": ("other_project_service", "list_projects"),
}
PAYMENT_TYPES = tuple(_LOADERS)


def list_payment_records(project_type: str) -> list:
    module, method = _LOADERS[project_type]
    # 按需导入，避免增加业务模块启动依赖；每次读取当前数据，不缓存业务记录。
    return getattr(import_module(f"app.services.{module}"), method)()


def payment_loader(project_type: str) -> Callable[[], list]:
    if project_type not in _LOADERS:
        raise ValueError(f"不支持的付费项目类型：{project_type}")
    return lambda: list_payment_records(project_type)


def payment_record_groups(project_types: Iterable[str] = PAYMENT_TYPES) -> Iterator[list]:
    for project_type in project_types:
        yield list_payment_records(project_type)


def fill_effective_remaining(item: dict, project_type: str) -> None:
    """仅为实际返回的记录补派生余量，不另建扣卡算法。"""
    calculators = {
        "membership_card": ("membership_card_service", "get_card_effective_remaining"),
        "group_case": ("group_case_session_service", "get_purchase_remaining"),
        "emotional_release": ("emotional_release_session_service", "get_purchase_remaining"),
        "energy_knot": ("energy_knot_session_service", "get_purchase_remaining"),
        "other": ("other_project_service", "get_effective_remaining"),
    }
    calculator = calculators.get(project_type)
    if calculator:
        module, method = calculator
        remaining = getattr(import_module(f"app.services.{module}"), method)(item["id"])
        item["remaining_count" if project_type == "other" else "effective_remaining"] = remaining
