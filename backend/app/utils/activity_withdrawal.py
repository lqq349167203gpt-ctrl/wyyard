"""课表各活动类型共用的退课名单约束。"""


def ensure_withdrawn_customers_retained(
    record,
    participant_ids: list[str],
    *,
    owner_id: str = "",
) -> None:
    """已退课人员只能通过恢复退课解锁，不能从活动人员字段直接移除。"""
    withdrawn_ids = set(getattr(record, "withdrawn_participant_ids", []) or [])
    if not withdrawn_ids:
        return

    registered_ids = set(participant_ids or [])
    if owner_id:
        registered_ids.add(owner_id)
    if not withdrawn_ids.issubset(registered_ids):
        raise ValueError("已退课人员必须保留在活动名单中，请先恢复退课")
