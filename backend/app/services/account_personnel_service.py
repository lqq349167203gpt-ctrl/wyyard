"""账号归属人的统一解析；旧人员绑定仅作为迁移核对依据。"""

LEGACY_BINDINGS = "course_personnel_bindings.json"


def resolve(account, *, people=None, accounts=None, bindings=None):
    if people is None:
        from app.services import customer_service
        people = customer_service.list_customers()
    if accounts is None:
        from app.services import account_service
        accounts = account_service.list_accounts()
    if bindings is None:
        from app.services import storage
        bindings = {} if getattr(account, "owner_customer_id", "") else storage.load_data(LEGACY_BINDINGS)
    active = [p for p in people if not getattr(p, "is_deleted", False)]
    by_id = {p.id: p for p in active}
    by_name = {}
    for person in active:
        for name in {person.nickname.strip(), person.name.strip()} - {""}:
            by_name.setdefault(name, []).append(person.id)
    aid = getattr(account, "id", "")
    owner = (getattr(account, "owner", "") or "").strip()
    explicit = getattr(account, "owner_customer_id", "") or ""
    matches = by_name.get(owner, [])
    legacy = (bindings.get(aid) or {}).get("customer_id", "")
    cid, message = explicit, ""
    if explicit:
        if explicit not in by_id:
            message = "归属人员已停用或不存在，请重新选择"
    elif len(matches) != 1:
        message = "归属人重名，请选择具体人员" if matches else "归属人未找到，请选择对应人员"
    elif legacy and legacy != matches[0]:
        message = "归属人与旧人员绑定不一致，请确认归属人"
    else:
        cid = matches[0]
    if cid and not message:
        for other in accounts:
            if getattr(other, "is_deleted", False) or not getattr(other, "enabled", True) or getattr(other, "id", "") == aid:
                continue
            other_id = getattr(other, "owner_customer_id", "") or ""
            if not other_id:
                other_owner = (getattr(other, "owner", "") or "").strip()
                other_matches = by_name.get(other_owner, [])
                other_id = other_matches[0] if len(other_matches) == 1 else ""
            if other_id == cid:
                message = "该归属人员对应多个账号，请核对"
                break
    person = by_id.get(cid) if not message else None
    return {
        "customer_id": person.id if person else "",
        "name": (person.nickname or person.name) if person else owner,
        "status": "linked" if person else "review",
        "message": message,
    }


def personnel_id(account_id):
    from app.services import account_service

    account = account_service.get_account(account_id)
    if not account or not account.enabled or account.is_deleted:
        return ""
    return resolve(account)["customer_id"]


def display_name(account):
    return resolve(account)["name"]


def public_account(account):
    resolved = resolve(account)
    return {
        **account.model_dump(exclude={"password", "owner_aliases"}),
        "owner": resolved["name"], "owner_customer_id": resolved["customer_id"],
        "owner_status": resolved["status"], "owner_message": resolved["message"],
    }


def selected_person(customer_id, account_id=""):
    from app.services import account_service, customer_service

    customer = customer_service.get_customer(customer_id)
    if not customer or customer.is_deleted:
        raise ValueError("归属人不存在或已停用，请重新选择")
    for other in account_service.list_accounts():
        if other.id != account_id and resolve(other)["customer_id"] == customer_id:
            raise ValueError("归属人已存在，请选择其他人员")
        if other.id != account_id and getattr(other, "owner_customer_id", "") == customer_id:
            raise ValueError("归属人已存在，请选择其他人员")
    return customer


def names_for_account(account):
    """兼容尚以姓名保存的引流/Sales字段；遇到同名人员时不扩展范围。"""
    from app.services import customer_service

    people = customer_service.list_customers()
    resolved = resolve(account, people=people)
    if not resolved["customer_id"]:
        return set()
    person = next(p for p in people if p.id == resolved["customer_id"])
    names = {account.owner.strip(), person.nickname.strip(), person.name.strip(), *getattr(account, "owner_aliases", [])} - {""}
    return {name for name in names if not any(
        p.id != person.id and name in {p.nickname.strip(), p.name.strip()} for p in people
    )}
