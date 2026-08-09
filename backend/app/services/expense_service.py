import threading
import uuid
from datetime import datetime, timezone

from app.models.expense import Expense, ExpenseCreate, ExpenseUpdate
from app.services.storage import load_data, save_item

FILENAME = "expenses.json"

_expenses: dict[str, Expense] = {}
_expense_lock = threading.Lock()


def _load() -> None:
    global _expenses
    data = load_data(FILENAME)
    _expenses = {item_id: Expense(**item) for item_id, item in data.items()}


_load()


def list_expenses(date_from: str = "", date_to: str = "") -> list[Expense]:
    items = [item for item in _expenses.values() if not item.is_deleted]
    if date_from:
        items = [item for item in items if (item.expense_time or "")[:10] >= date_from]
    if date_to:
        items = [item for item in items if (item.expense_time or "")[:10] <= date_to]
    return sorted(items, key=lambda item: (item.expense_time, item.created_at), reverse=True)


def get_expense(expense_id: str) -> Expense | None:
    item = _expenses.get(expense_id)
    if not item or item.is_deleted:
        return None
    return item


def create_expense(data: ExpenseCreate, created_by: str = "") -> Expense:
    with _expense_lock:
        now = datetime.now(timezone.utc)
        item = Expense(
            id=str(uuid.uuid4()),
            **data.model_dump(),
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        _expenses[item.id] = item
        save_item(FILENAME, item.id, item.model_dump(mode="json"))
        return item


def update_expense(expense_id: str, data: ExpenseUpdate, updated_by: str = "") -> Expense:
    with _expense_lock:
        item = get_expense(expense_id)
        if not item:
            raise ValueError("支出记录不存在")
        updated = item.model_copy(update={
            **data.model_dump(),
            "updated_by": updated_by,
            "updated_at": datetime.now(timezone.utc),
        })
        _expenses[expense_id] = updated
        save_item(FILENAME, expense_id, updated.model_dump(mode="json"))
        return updated


def delete_expense(expense_id: str, updated_by: str = "") -> None:
    with _expense_lock:
        item = get_expense(expense_id)
        if not item:
            raise ValueError("支出记录不存在")
        now = datetime.now(timezone.utc)
        deleted = item.model_copy(update={
            "is_deleted": True,
            "deleted_at": now,
            "updated_by": updated_by,
            "updated_at": now,
        })
        _expenses[expense_id] = deleted
        save_item(FILENAME, expense_id, deleted.model_dump(mode="json"))
