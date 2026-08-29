import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, Iterable

from app.models.visit_note import VisitNote, VisitNoteCategory
from app.services.storage import load_data, save_item

FILENAME = "visit_notes.json"
_notes: Dict[str, VisitNote] = {}
_note_lock = threading.RLock()


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
    }[category]


def _sync_visit_cache(visit_id: str, category: VisitNoteCategory) -> None:
    """把多人记录汇总回旧字段，兼容统计、详情和导出等既有读取入口。"""
    from app.services import visit_service

    record = visit_service.get_visit(visit_id)
    if not record:
        return
    if category == "visit_need":
        # 来访需求属于账号私有信息，不能汇总回所有人都能读取的旧字段。
        visit_service.update_collaboration_summary(visit_id, "needs", "")
        return
    lines = []
    for note in _active_notes(visit_id, category):
        creator = note.created_by or "历史记录"
        lines.append(f"{creator}：{note.content}")
    visit_service.update_collaboration_summary(
        visit_id, _legacy_field(category), "\n".join(lines)
    )


def ensure_legacy_entries(visit_ids: Iterable[str]) -> None:
    """首次读取时，把旧的单字段内容转换成可追溯的独立记录。"""
    from app.services import visit_service

    with _note_lock:
        for visit_id in {value for value in visit_ids if value}:
            visit = visit_service.get_visit(visit_id)
            if not visit:
                continue
            for category in ("visit_need", "customer_info", "follow_up"):
                typed_category: VisitNoteCategory = category
                if _active_notes(visit_id, typed_category):
                    if typed_category == "visit_need" and visit.needs:
                        _sync_visit_cache(visit_id, typed_category)
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
                    created_at=visit.created_at,
                    updated_at=visit.updated_at,
                )
                _notes[note.id] = note
                _save(note)
                if typed_category == "visit_need":
                    _sync_visit_cache(visit_id, typed_category)


def list_notes(visit_ids: Iterable[str]) -> list[VisitNote]:
    ids = {visit_id for visit_id in visit_ids if visit_id}
    ensure_legacy_entries(ids)
    return sorted(
        (
            note
            for note in _notes.values()
            if note.visit_id in ids and not note.is_deleted
        ),
        key=lambda note: (note.created_at, note.id),
        reverse=True,
    )


def list_visible_notes(
    visit_ids: Iterable[str],
    account_id: str,
    owner_name: str = "",
    username: str = "",
) -> list[VisitNote]:
    """来访需求仅返回当前账号自己的记录，其余协作内容保持原有可见规则。"""
    return [
        note
        for note in list_notes(visit_ids)
        if note.category != "visit_need"
        or can_manage_note(note, account_id, owner_name, username)
    ]


def get_note(note_id: str) -> VisitNote | None:
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
    for note in _active_notes(visit_id, category):
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
) -> VisitNote:
    from app.services import visit_service

    if not visit_service.get_visit(visit_id):
        raise ValueError("邀约记录不存在")
    normalized = content.strip()
    if not normalized:
        raise ValueError("记录内容不能为空")
    ensure_legacy_entries([visit_id])
    with _note_lock:
        now = datetime.now(timezone.utc)
        existing = _find_creator_note(visit_id, category, creator_id, creator)
        if existing:
            existing.content = normalized
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
            created_by_id=creator_id,
            created_by=creator,
            created_at=now,
            updated_at=now,
        )
        _notes[note.id] = note
        _save(note)
        _sync_visit_cache(visit_id, category)
        return note


def update_note(note_id: str, content: str) -> VisitNote | None:
    normalized = content.strip()
    if not normalized:
        raise ValueError("记录内容不能为空")
    with _note_lock:
        note = get_note(note_id)
        if not note:
            return None
        note.content = normalized
        note.updated_at = datetime.now(timezone.utc)
        _notes[note.id] = note
        _save(note)
        _sync_visit_cache(note.visit_id, note.category)
        return note


def delete_note(note_id: str) -> bool:
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
