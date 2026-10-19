import uuid
from datetime import datetime, timezone
from typing import Dict, Iterable

from app.models.visit_note import VisitNote, VisitNoteCategory
from app.services.daily_customer_note_service import note_lock
from app.services.storage import load_data, save_item

FILENAME = "visit_notes.json"
_notes: Dict[str, VisitNote] = {}
_note_lock = note_lock


def _load() -> None:
    global _notes
    data = load_data(FILENAME)
    _notes = {key: VisitNote(**value) for key, value in data.items()}


_load()


def _save(note: VisitNote) -> None:
    save_item(FILENAME, note.id, note.model_dump(mode="json"))


def _active_notes(visit_id: str, category: VisitNoteCategory) -> list[VisitNote]:
    return sorted(
        (
            note
            for note in _notes.values()
            if note.visit_id == visit_id
            and note.category == category
            and not note.is_deleted
        ),
        key=lambda note: (note.created_at, note.id),
    )


def _legacy_field(category: VisitNoteCategory) -> str:
    return {
        "visit_need": "needs",
        "customer_info": "feedback",
        "follow_up": "healing_notes",
        "customer_feedback": "experience",
    }[category]


def display_author(note: VisitNote) -> str:
    """旧版文本汇总也能区分代填记录；本人填写时沿用原展示。"""
    creator = note.created_by or "历史记录"
    person = note.feedback_person or creator
    return f"{person}（{creator}创建）" if person != creator else creator


def display_content(note: VisitNote) -> str:
    labels = "、".join(tag.get("name", "") for tag in getattr(note, "need_tags", []) if tag.get("name"))
    return "\n".join(value for value in (labels, note.content) if value)


def display_content_dict(note: dict) -> str:
    labels = "、".join(tag.get("name", "") for tag in note.get("need_tags", []) if tag.get("name"))
    return "\n".join(value for value in (labels, note.get("content", "")) if value)


def _resolve_need_tags(category, tag_ids, previous=()):
    from app.services import customer_tag_service

    if tag_ids is None:
        return list(previous)
    if category != "visit_need" and tag_ids:
        raise ValueError("只有来访需求可以选择需求标签")
    saved = {item["id"]: item for item in previous}
    result = []
    for tag_id in dict.fromkeys(tag_ids):
        tag = customer_tag_service.get_tag(tag_id)
        if tag and tag.category == "visit_need" and tag.scope == "public" and tag.enabled:
            result.append({"id": tag.id, "name": tag.name})
        elif tag_id in saved:
            result.append(saved[tag_id])
        else:
            raise ValueError("包含无效或已停用的来访需求标签，请重新选择")
    return result


def _sync_visit_cache(visit_id: str, category: VisitNoteCategory) -> None:
    """把多人记录汇总回旧字段，兼容统计、详情和导出等既有读取入口。"""
    from app.services import visit_service

    record = visit_service.get_visit_without_metrics(visit_id)
    if not record:
        return
    lines = []
    for note in _active_notes(visit_id, category):
        lines.append(f"{display_author(note)}：{display_content(note)}")
    field = _legacy_field(category)
    value = "\n".join(lines)
    if str(getattr(record, field, "") or "") != value:
        visit_service.update_collaboration_summary(visit_id, field, value)


def ensure_legacy_entries(visit_ids: Iterable[str]) -> None:
    """首次读取时，把旧的单字段内容转换成可追溯的独立记录。"""
    from app.services import visit_service

    ids = {value for value in visit_ids if value}
    if not ids:
        return
    with _note_lock:
        existing_categories = {
            (note.visit_id, note.category)
            for note in _notes.values()
            if note.visit_id in ids and not note.is_deleted
        }
        for visit_id in ids:
            visit = visit_service.get_visit_without_metrics(visit_id)
            if not visit:
                continue
            for category in ("visit_need", "customer_info", "follow_up", "customer_feedback"):
                typed_category: VisitNoteCategory = category
                if (visit_id, typed_category) in existing_categories:
                    continue
                content = str(getattr(visit, _legacy_field(typed_category), "") or "").strip()
                if not content:
                    continue
                note = VisitNote(
                    id=f"legacy-{visit_id}-{category}",
                    visit_id=visit_id,
                    category=typed_category,
                    content=content,
                    created_by_id=visit.created_by_id,
                    created_by=visit.created_by or "历史记录",
                    feedback_person=visit.created_by or "历史记录",
                    created_at=visit.created_at,
                    updated_at=visit.updated_at,
                )
                _notes[note.id] = note
                _save(note)
                existing_categories.add((visit_id, typed_category))
                if typed_category == "visit_need":
                    _sync_visit_cache(visit_id, typed_category)


def list_notes(visit_ids: Iterable[str], ensure_legacy: bool = True) -> list[VisitNote]:
    ids = {visit_id for visit_id in visit_ids if visit_id}
    if not ids:
        return []
    if ensure_legacy:
        ensure_legacy_entries(ids)
    from app.services import daily_customer_note_service

    return sorted(
        [
            note
            for note in _notes.values()
            if note.visit_id in ids and not note.is_deleted
        ] + daily_customer_note_service.for_visits(ids),
        key=lambda note: (note.created_at, note.id),
        reverse=True,
    )


def note_entry(note) -> dict:
    """下游列表共用的备注投影，跟进安排不能在整理正文时丢失。"""
    creator = getattr(note, "created_by", "") or "历史记录"
    timestamp = getattr(note, "updated_at", None) or getattr(note, "created_at", None)
    entry = {
        "id": getattr(note, "id", ""),
        "created_by_id": getattr(note, "created_by_id", "") or "",
        "author": getattr(note, "feedback_person", "") or creator,
        "created_by": creator,
        "content": display_content(note),
        "at": timestamp.isoformat() if timestamp else "",
    }
    if note.category == "visit_need":
        entry.update(detail_content=note.content, need_tags=getattr(note, "need_tags", []))
    if note.category == "follow_up":
        entry.update({key: getattr(note, key, "") or "" for key in (
            "next_follow_up_person_id", "next_follow_up_person", "next_follow_up_date",
        )})
    return entry


def group_notes_by_visit(visit_ids: Iterable[str]) -> Dict[str, Dict[str, list[dict]]]:
    """按「邀约 → 分类」分组，每条带上填写人；课表「参与者」页签据此按人换行展示。

    列表页不触发历史内容回填，避免一次查询产生大量写入；没有独立记录的内容由前端回退展示。
    """
    grouped: Dict[str, Dict[str, list[dict]]] = {}
    for note in sorted(list_notes(visit_ids, ensure_legacy=False), key=lambda item: (item.created_at, item.id)):
        entries = grouped.setdefault(note.visit_id, {}).setdefault(note.category, [])
        entries.append(note_entry(note))
    return grouped


def list_notes_by_creator(
    account_id: str = "",
    owner_name: str = "",
    username: str = "",
) -> list[VisitNote]:
    """「客户跟进」页用：只看这个人自己填过的来访需求 / 客户信息 / 跟进点。"""
    if not account_id and not owner_name and not username:
        return []
    return sorted(
        (
            note
            for note in _notes.values()
            if not note.is_deleted and can_manage_note(note, account_id, owner_name, username)
        ),
        key=lambda note: (note.updated_at, note.id),
        reverse=True,
    )


def list_notes_for_follow_up(
    account_id: str = "",
    owner_name: str = "",
    username: str = "",
    feedback_person_ids: set[str] | None = None,
) -> list[VisitNote]:
    """本人创建，或由别人填写但明确指定本人为反馈人的记录。"""
    if not account_id and not owner_name and not username and not feedback_person_ids:
        return []
    names = {name for name in (owner_name, username) if name}
    person_ids = feedback_person_ids or set()
    return sorted(
        (
            note for note in _notes.values()
            if not note.is_deleted and (
                can_manage_note(note, account_id, owner_name, username)
                or (note.feedback_person_id and note.feedback_person_id in person_ids)
                or (not note.feedback_person_id and note.feedback_person in names)
            )
        ),
        key=lambda note: (note.updated_at, note.id),
        reverse=True,
    )


def list_visible_notes(
    visit_ids: Iterable[str],
    account_id: str = "",
    owner_name: str = "",
    username: str = "",
) -> list[VisitNote]:
    """共享记录按分类查看权限过滤；来访需求的标签和详情分别保护。"""
    return filter_visible_notes(list_notes(visit_ids), account_id, owner_name, username)


def filter_visible_notes(
    notes: Iterable[VisitNote],
    account_id: str = "",
    owner_name: str = "",
    username: str = "",
) -> list[VisitNote]:
    """复用本次请求已读取的备注，权限口径与独立备注接口一致。"""
    from app.services import account_service, customer_access_service

    account = account_service.get_account(account_id) if account_id else None
    roles = (account.roles or [account.role]) if account else []
    return [visible for note in notes if (visible := customer_access_service.protect_note(note, roles)) is not None]


def get_previous_visit_need(
    customer_id: str,
    before_date: str = "",
    exclude_visit_id: str = "",
    account_id: str = "",
    owner_name: str = "",
    username: str = "",
) -> tuple[VisitNote, str] | None:
    """返回当前账号可见的最近一次来访需求及其邀约日期。"""
    from app.services import visit_service

    visits = [
        visit
        for visit in visit_service.list_basic_visits({customer_id})
        if not visit.cancelled
        and visit.id != exclude_visit_id
        and (not before_date or visit.visit_date < before_date)
    ]
    visits.sort(
        key=lambda visit: (visit.visit_date, visit.created_at, visit.id),
        reverse=True,
    )
    for visit in visits:
        notes = list_visible_notes(
            [visit.id],
            account_id=account_id,
            owner_name=owner_name,
            username=username,
        )
        previous_note = next(
            (
                note
                for note in notes
                if note.category == "visit_need"
            ),
            None,
        )
        if previous_note:
            return previous_note, visit.visit_date
    return None


def get_note(note_id: str) -> VisitNote | None:
    if note_id.startswith("course-note|"):
        from app.services import daily_customer_note_service

        return daily_customer_note_service.resolve_visit_note(note_id)
    note = _notes.get(note_id)
    return note if note and not note.is_deleted else None


def can_manage_note(
    note: VisitNote,
    account_id: str,
    owner_name: str = "",
    username: str = "",
) -> bool:
    if note.created_by_id:
        return bool(account_id) and note.created_by_id == account_id
    actor_names = {name for name in (owner_name, username) if name}
    return bool(note.created_by) and note.created_by in actor_names


def _find_creator_note(
    visit_id: str,
    category: VisitNoteCategory,
    creator_id: str,
    creator: str,
) -> VisitNote | None:
    for note in sorted(list_notes([visit_id]), key=lambda n: (n.updated_at, n.id), reverse=True):
        if note.category != category:
            continue
        if creator_id and note.created_by_id == creator_id:
            return note
        if not creator_id and not note.created_by_id and creator and note.created_by == creator:
            return note
    return None


def create_note(
    visit_id: str,
    category: VisitNoteCategory,
    content: str,
    creator_id: str = "",
    creator: str = "",
    feedback_person_id: str = "",
    feedback_person: str = "",
    follow_up_plan: dict | None = None,
    need_tag_ids: list[str] | None = None,
) -> VisitNote:
    from app.services import visit_service

    if not visit_service.get_visit(visit_id):
        raise ValueError("邀约记录不存在")
    normalized = content.strip()
    ensure_legacy_entries([visit_id])
    with _note_lock:
        now = datetime.now(timezone.utc)
        existing = _find_creator_note(visit_id, category, creator_id, creator)
        need_tags = _resolve_need_tags(category, need_tag_ids, getattr(existing, "need_tags", []))
        if not normalized and not need_tags:
            raise ValueError("请选择来访需求标签或填写内容" if category == "visit_need" else "记录内容不能为空")
        if existing:
            if existing.id.startswith("course-note|"):
                return update_note(existing.id, normalized, feedback_person_id or None, feedback_person or None, follow_up_plan)
            existing.content = normalized
            existing.need_tags = need_tags
            for key, value in (follow_up_plan or {}).items():
                setattr(existing, key, value)
            if feedback_person_id or feedback_person:
                existing.feedback_person_id = feedback_person_id.strip()
                existing.feedback_person = feedback_person.strip() or creator.strip()
            existing.updated_at = now
            _notes[existing.id] = existing
            _save(existing)
            _sync_visit_cache(visit_id, category)
            return existing
        note = VisitNote(
            id=str(uuid.uuid4())[:12],
            visit_id=visit_id,
            category=category,
            content=normalized,
            need_tags=need_tags,
            created_by_id=creator_id,
            created_by=creator,
            feedback_person_id=feedback_person_id.strip(),
            feedback_person=feedback_person.strip() or creator.strip(),
            **(follow_up_plan or {}),
            created_at=now,
            updated_at=now,
        )
        _notes[note.id] = note
        _save(note)
        _sync_visit_cache(visit_id, category)
        return note


def update_note(
    note_id: str,
    content: str,
    feedback_person_id: str | None = None,
    feedback_person: str | None = None,
    follow_up_plan: dict | None = None,
    need_tag_ids: list[str] | None = None,
) -> VisitNote | None:
    normalized = content.strip()
    existing = get_note(note_id)
    if not existing:
        return None
    need_tags = _resolve_need_tags(existing.category, need_tag_ids, getattr(existing, "need_tags", []))
    if not normalized and not need_tags:
        raise ValueError("请选择来访需求标签或填写内容" if existing.category == "visit_need" else "记录内容不能为空")
    if note_id.startswith("course-note|"):
        from app.services import activity_participant_note_service

        shared = get_note(note_id)
        if not shared:
            return None
        original = activity_participant_note_service.get_note(note_id.split("|")[-1])
        activity_participant_note_service.update_note_content(
            note_id=original.id, content=normalized,
            actor_id=original.created_by_id, actor_name=original.created_by,
            feedback_person_id=feedback_person_id, feedback_person=feedback_person,
            follow_up_plan=follow_up_plan,
        )
        return get_note(note_id)
    with _note_lock:
        note = get_note(note_id)
        if not note:
            return None
        note.content = normalized
        note.need_tags = need_tags
        for key, value in (follow_up_plan or {}).items():
            setattr(note, key, value)
        if feedback_person_id is not None or feedback_person is not None:
            note.feedback_person_id = (feedback_person_id or "").strip()
            note.feedback_person = (feedback_person or "").strip() or note.created_by
        note.updated_at = datetime.now(timezone.utc)
        _notes[note.id] = note
        _save(note)
        _sync_visit_cache(note.visit_id, note.category)
        return note


def delete_note(note_id: str) -> bool:
    if note_id.startswith("course-note|"):
        from app.services import activity_participant_note_service

        if not get_note(note_id):
            return False
        return activity_participant_note_service.delete_note(note_id.split("|")[-1])
    with _note_lock:
        note = get_note(note_id)
        if not note:
            return False
        note.is_deleted = True
        note.deleted_at = datetime.now(timezone.utc)
        note.updated_at = note.deleted_at
        _notes[note.id] = note
        _save(note)
        _sync_visit_cache(note.visit_id, note.category)
        return True
