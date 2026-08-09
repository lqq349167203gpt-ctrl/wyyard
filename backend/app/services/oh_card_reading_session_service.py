from typing import Dict, Optional

from app.models.oh_card_reading_session import OhCardReadingSession
from app.services import oh_card_reading_service
from app.services.storage import load_data

FILENAME = "oh_card_reading_sessions.json"
_sessions: Dict[str, OhCardReadingSession] = {}


def _load():
    global _sessions
    data = load_data(FILENAME)
    _sessions = {}
    for k, v in data.items():
        _sessions[k] = OhCardReadingSession(**v)


_load()


def get_session(session_id: str) -> Optional[OhCardReadingSession]:
    session = _sessions.get(session_id)
    if session and session.is_deleted:
        return None
    return session


def get_remaining_count(customer_id: str) -> int:
    """计算某用户的OH卡诊断剩余次数（总池子，供 customer_detail 汇总使用）。"""
    readings = oh_card_reading_service.list_readings()
    total_purchased = sum(r.purchase_count for r in readings if r.customer_id == customer_id)
    from app.services import project_deduction_service
    manual_deductions = project_deduction_service.get_deduction_total(customer_id, "oh-card-readings")
    return total_purchased - manual_deductions


def get_purchase_remaining(purchase_id: str) -> int:
    """返回单次OH卡诊断购买的剩余次数（purchase_count - 该卡手动销卡次数）。"""
    reading = oh_card_reading_service.get_reading(purchase_id)
    if not reading:
        return 0
    from app.services import project_deduction_service
    deducted = project_deduction_service.get_deduction_total_for_project(purchase_id)
    return max(0, reading.purchase_count - deducted)
