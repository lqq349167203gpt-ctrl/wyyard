import threading
import uuid
from datetime import datetime, timezone

from app.models.expense import Expense, ExpenseCreate, ExpenseType, ExpenseTypeCreate, ExpenseTypeUpdate, ExpenseUpdate
from app.services.storage import load_data, save_item

FILENAME = "expenses.json"
TYPE_FILENAME = "expense_types.json"

_expenses: dict[str, Expense] = {}
_expense_lock = threading.Lock()
_expense_types: dict[str, ExpenseType] = {}


def _load() -> None:
    global _expenses, _expense_types
    data = load_data(FILENAME)
    _expenses = {item_id: Expense(**item) for item_id, item in data.items()}
    _expense_types = {
        item_id: ExpenseType(**item)
        for item_id, item in load_data(TYPE_FILENAME).items()
    }


_load()


def list_expenses(date_from: str = "", date_to: str = "", cost_category: str = "") -> list[Expense]:
    items = [item for item in _expenses.values() if not item.is_deleted]
    if date_from:
        items = [item for item in items if (item.expense_time or "")[:10] >= date_from]
    if date_to:
        items = [item for item in items if (item.expense_time or "")[:10] <= date_to]
    if cost_category:
        items = [item for item in items if item.cost_category == cost_category]
    return sorted(items, key=lambda item: (item.expense_time, item.created_at), reverse=True)


def get_expense(expense_id: str) -> Expense | None:
    item = _expenses.get(expense_id)
    if not item or item.is_deleted:
        return None
    return item


def _prepare_expense_data(data: ExpenseCreate | ExpenseUpdate) -> dict:
    """按支出类型校验可选字段，并以客户主数据中的昵称为准。"""
    values = data.model_dump()
    expense_type = next(
        (
            item
            for item in _expense_types.values()
            if item.cost_category == data.cost_category and item.name == data.expense_type
        ),
        None,
    )

    if data.customer_id:
        from app.services import customer_service

        customer = customer_service.get_customer(data.customer_id)
        if not customer:
            raise ValueError("所选用户不存在")
        values["customer_nickname"] = customer.nickname or customer.name or ""
    elif expense_type and expense_type.requires_customer:
        raise ValueError("请选择用户昵称")
    else:
        values["customer_nickname"] = ""

    if expense_type and expense_type.requires_platform and not data.platform.strip():
        raise ValueError("请输入平台")
    return values


def create_expense(data: ExpenseCreate, created_by: str = "") -> Expense:
    with _expense_lock:
        now = datetime.now(timezone.utc)
        item = Expense(
            id=str(uuid.uuid4()),
            **_prepare_expense_data(data),
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
            **_prepare_expense_data(data),
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


def list_expense_types(cost_category: str = "") -> list[ExpenseType]:
    items = list(_expense_types.values())
    if cost_category:
        items = [item for item in items if item.cost_category == cost_category]
    return sorted(items, key=lambda item: (item.cost_category, item.created_at, item.name))


def get_expense_type(type_id: str) -> ExpenseType | None:
    return _expense_types.get(type_id)


def create_expense_type(data: ExpenseTypeCreate) -> ExpenseType:
    with _expense_lock:
        normalized_name = data.name.strip()
        if any(
            item.cost_category == data.cost_category and item.name == normalized_name
            for item in _expense_types.values()
        ):
            raise ValueError("该支出类型已存在")
        item = ExpenseType(
            id=str(uuid.uuid4()),
            cost_category=data.cost_category,
            name=normalized_name,
            requires_customer=data.requires_customer,
            requires_platform=data.requires_platform,
            created_at=datetime.now(timezone.utc),
        )
        _expense_types[item.id] = item
        save_item(TYPE_FILENAME, item.id, item.model_dump(mode="json"))
        return item


def update_expense_type(type_id: str, data: ExpenseTypeUpdate) -> ExpenseType:
    with _expense_lock:
        item = _expense_types.get(type_id)
        if not item:
            raise ValueError("支出类型不存在")
        updated = item.model_copy(update=data.model_dump())
        _expense_types[type_id] = updated
        save_item(TYPE_FILENAME, type_id, updated.model_dump(mode="json"))
        return updated


def delete_expense_type(type_id: str) -> None:
    from app.services.storage import delete_item

    with _expense_lock:
        item = _expense_types.get(type_id)
        if not item:
            raise ValueError("支出类型不存在")
        if any(expense.expense_type == item.name for expense in _expenses.values() if not expense.is_deleted):
            raise ValueError("该类型已有支出记录，不能删除")
        del _expense_types[type_id]
        delete_item(TYPE_FILENAME, type_id)
