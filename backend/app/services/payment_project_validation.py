"""销卡与退费共用的项目归属校验，不信任前端提供的客户和项目组合。"""


def require_project(project_type: str, project_id: str, customer_id: str):
    from app.services import (
        emotional_release_service,
        energy_knot_service,
        group_case_service,
        internal_course_service,
        membership_card_service,
        offline_course_service,
        oh_card_reading_service,
        other_project_service,
        tea_seat_fee_service,
    )

    getters = {
        "membership-cards": membership_card_service.get_card,
        "group-cases": group_case_service.get_case,
        "emotional-releases": emotional_release_service.get_release,
        "energy-knots": energy_knot_service.get_knot,
        "internal-courses": internal_course_service.get_course,
        "oh-card-readings": oh_card_reading_service.get_reading,
        "other-projects": other_project_service.get_project,
        "tea-seat-fees": tea_seat_fee_service.get_fee,
        "offline-courses": offline_course_service.get_course,
    }
    if project_type not in getters:
        raise ValueError("不支持的项目类型")
    item = getters[project_type](project_id)
    if not item or item.is_deleted:
        raise ValueError("项目不存在或已删除")
    if item.customer_id != customer_id:
        raise ValueError("该项目不属于该客户")
    return item


def require_deductible_project(project_type: str, project_id: str, customer_id: str):
    from app.services import project_refund_service

    item = require_project(project_type, project_id, customer_id)
    if getattr(item, "voided", False) or project_refund_service.is_project_refunded(project_type, project_id):
        raise ValueError("该项目已退费或作废，无法销卡")
    return item


def available_count(project_type: str, project_id: str):
    from app.services import (
        emotional_release_session_service,
        energy_knot_session_service,
        group_case_session_service,
        membership_card_service,
        oh_card_reading_session_service,
        other_project_service,
    )

    getters = {
        "membership-cards": membership_card_service.get_card_effective_remaining,
        "group-cases": group_case_session_service.get_purchase_remaining,
        "emotional-releases": emotional_release_session_service.get_purchase_remaining,
        "energy-knots": energy_knot_session_service.get_purchase_remaining,
        "oh-card-readings": oh_card_reading_session_service.get_purchase_remaining,
        "other-projects": other_project_service.get_effective_remaining,
    }
    if project_type not in getters:
        raise ValueError("该项目类型不支持销卡")
    return getters[project_type](project_id)
