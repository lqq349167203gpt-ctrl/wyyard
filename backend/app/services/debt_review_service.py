"""按“客户 + 课程”维护欠卡监管基线；只记录判断，不改变真实欠卡与卡次。"""

import hashlib
import threading
from datetime import datetime, timezone

from app.services.storage import load_data, save_data

FILENAME = "debt_person_course_reviews.json"

_lock = threading.Lock()
_states: dict[str, dict] = load_data(FILENAME) or {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _review_id(debt_type: str, customer_id: str, source_key: str) -> str:
    return _hash(f"{debt_type}|{customer_id}|{source_key}")


def _unit_id(debt_type: str, customer_id: str, source_key: str, unit: int) -> str:
    return _hash(f"{debt_type}|{customer_id}|{source_key}|{unit}")


def _activity_metadata(debt_type: str, source_key: str, activity: dict) -> dict:
    """补齐课程时间与老师；历史异常数据取不到源课程时保留空值。"""
    course = None
    try:
        if debt_type == "membership_card" and ":" in source_key:
            prefix, activity_id = source_key.split(":", 1)
            if prefix == "class":
                from app.services import class_record_service
                course = class_record_service.get_record(activity_id)
            elif prefix == "gcs":
                from app.services import group_case_session_service
                course = group_case_session_service.get_session(activity_id)
            elif prefix == "ers":
                from app.services import emotional_release_session_service
                course = emotional_release_session_service.get_session(activity_id)
        elif debt_type == "group_case":
            from app.services import group_case_session_service
            course = group_case_session_service.get_session(source_key)
        elif debt_type == "emotional_release":
            from app.services import emotional_release_session_service
            course = emotional_release_session_service.get_session(source_key)
        elif debt_type == "energy_knot":
            from app.services import energy_knot_session_service
            course = energy_knot_session_service.get_session(source_key)
    except (ImportError, ValueError):
        course = None

    teacher_names = list(activity.get("teacher_names") or [])
    if course:
        from app.services import customer_service

        teacher_ids = list(getattr(course, "teacher_ids", []) or [])
        achiever_id = getattr(course, "achiever_id", "") or ""
        if achiever_id and achiever_id not in teacher_ids:
            teacher_ids.append(achiever_id)
        teacher_names = []
        for teacher_id in teacher_ids:
            teacher = customer_service.get_customer(teacher_id)
            name = (
                getattr(teacher, "nickname", "")
                or getattr(teacher, "name", "")
                or (getattr(course, "achiever_name", "") if teacher_id == achiever_id else "")
                or teacher_id
            )
            if name not in teacher_names:
                teacher_names.append(name)

    return {
        "start_time": (getattr(course, "start_time", "") if course else activity.get("start_time")) or "",
        "end_time": (getattr(course, "end_time", "") if course else activity.get("end_time")) or "",
        "teacher_names": teacher_names,
    }


def _group_person_courses(debt_type: str, records: list[dict]) -> dict[str, dict]:
    grouped: dict[str, dict] = {}
    for record in records:
        customer_id = str(record.get("customer_id") or "")
        if not customer_id:
            continue
        for activity_index, activity in enumerate(record.get("debt_activities") or []):
            source_key = str(
                activity.get("source_key")
                or f"{activity.get('date') or ''}|{activity.get('label') or ''}|{activity_index}"
            )
            review_id = _review_id(debt_type, customer_id, source_key)
            count = max(1, int(activity.get("count") or 1))
            grouped[review_id] = {
                "id": review_id,
                "debt_type": debt_type,
                "customer_id": customer_id,
                "nickname": record.get("nickname") or "",
                "member_type": record.get("member_type") or "",
                "source_key": source_key,
                "course_name": activity.get("label") or "欠卡课程",
                "course_date": activity.get("date") or "",
                **_activity_metadata(debt_type, source_key, activity),
                "current_unit_ids": [
                    _unit_id(debt_type, customer_id, source_key, unit)
                    for unit in range(1, count + 1)
                ],
            }
    return grouped


def _result(state: dict) -> dict:
    current_ids = set(state.get("current_unit_ids") or [])
    baseline_ids = set(state.get("baseline_ids") or [])
    new_ids = current_ids - baseline_ids if state.get("confirmed") else current_ids
    if state.get("resolved"):
        status = "resolved"
        new_ids = set()
    elif not state.get("confirmed"):
        status = "new"
    elif new_ids:
        status = "changed"
    else:
        status = "ok"

    return {
        key: state.get(key) for key in (
            "id", "debt_type", "customer_id", "nickname", "member_type", "source_key",
            "course_name", "course_date", "start_time", "end_time", "teacher_names",
            "note", "first_seen_at", "reviewed_at",
            "reviewed_by", "resolved_at",
        )
    } | {
        "status": status,
        "debt_count": len(current_ids),
        "approved_count": len(current_ids - new_ids),
        "new_count": len(new_ids),
    }


def sync(debt_type: str, records: list[dict]) -> list[dict]:
    """同步欠卡；同一客户的每门课程独立判断，已确认课程只提示新增次数。"""
    now = _now()
    current = _group_person_courses(debt_type, records)
    changed = False
    with _lock:
        for review_id, state in _states.items():
            if state.get("debt_type") != debt_type or state.get("resolved"):
                continue
            if review_id not in current:
                state["resolved"] = True
                state["resolved_at"] = now
                changed = True

        for review_id, person_course in current.items():
            state = _states.get(review_id)
            if state is None:
                state = {
                    **person_course,
                    "confirmed": False,
                    "baseline_ids": [],
                    "note": "",
                    "first_seen_at": now,
                    "reviewed_at": "",
                    "reviewed_by": "",
                    "resolved": False,
                    "resolved_at": "",
                }
                _states[review_id] = state
                changed = True
            else:
                if state.get("resolved"):
                    state.update({
                        "confirmed": False,
                        "baseline_ids": [],
                        "note": "",
                        "first_seen_at": now,
                        "reviewed_at": "",
                        "reviewed_by": "",
                        "resolved": False,
                        "resolved_at": "",
                    })
                    changed = True
                if state.get("confirmed"):
                    current_ids = set(person_course.get("current_unit_ids") or [])
                    baseline_ids = [item_id for item_id in state.get("baseline_ids") or [] if item_id in current_ids]
                    if baseline_ids != state.get("baseline_ids"):
                        state["baseline_ids"] = baseline_ids
                        changed = True
                for key, value in person_course.items():
                    if state.get(key) != value:
                        state[key] = value
                        changed = True

        if changed:
            save_data(FILENAME, _states)
        return [_result(state) for state in _states.values() if state.get("debt_type") == debt_type]


def get(review_id: str) -> dict | None:
    state = _states.get(review_id)
    return _result(state) if state else None


def review(review_id: str, action: str, note: str, reviewer: str) -> dict | None:
    if action not in ("confirm", "reset"):
        return None
    with _lock:
        state = _states.get(review_id)
        if not state or state.get("resolved"):
            return None
        if action == "confirm":
            state["confirmed"] = True
            state["baseline_ids"] = list(state.get("current_unit_ids") or [])
        else:
            state["confirmed"] = False
            state["baseline_ids"] = []
        state["note"] = note.strip()
        state["reviewed_by"] = reviewer
        state["reviewed_at"] = _now()
        save_data(FILENAME, _states)
        return _result(state)


def establish_baseline(review_ids: list[str], reviewer: str) -> int:
    changed = 0
    now = _now()
    with _lock:
        for review_id in review_ids:
            state = _states.get(review_id)
            if not state or state.get("resolved"):
                continue
            if _result(state)["status"] not in ("new", "changed"):
                continue
            state.update({
                "confirmed": True,
                "baseline_ids": list(state.get("current_unit_ids") or []),
                "note": state.get("note") or "确认该客户本课程欠卡",
                "reviewed_by": reviewer,
                "reviewed_at": now,
            })
            changed += 1
        if changed:
            save_data(FILENAME, _states)
    return changed
