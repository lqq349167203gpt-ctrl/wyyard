from app.services import debt_review_service


def _record(customer_id: str, nickname: str, activities: list[tuple[str, str, int]]):
    return {
        "customer_id": customer_id,
        "nickname": nickname,
        "member_type": "年度会员",
        "debt_activities": [
            {
                "label": course_name,
                "date": "2026-09-01",
                "count": count,
                "source_key": source_key,
            }
            for source_key, course_name, count in activities
        ],
    }


def _reset(monkeypatch):
    monkeypatch.setattr(debt_review_service, "_states", {})
    monkeypatch.setattr(debt_review_service, "save_data", lambda *_args, **_kwargs: None)


def test_one_person_can_confirm_each_course_separately(monkeypatch):
    _reset(monkeypatch)
    records = [_record("customer-1", "安然", [
        ("class:a", "公益课 A", 1),
        ("class:b", "公益课 B", 1),
    ])]
    courses = debt_review_service.sync("membership_card", records)
    course_a = next(item for item in courses if item["source_key"] == "class:a")
    course_b = next(item for item in courses if item["source_key"] == "class:b")

    debt_review_service.review(course_a["id"], "confirm", "A 合理欠卡", "管理员")
    synced = {item["source_key"]: item for item in debt_review_service.sync("membership_card", records)}

    assert synced["class:a"]["status"] == "ok"
    assert synced["class:a"]["note"] == "A 合理欠卡"
    assert synced["class:b"]["status"] == "new"
    assert course_a["id"] != course_b["id"]


def test_new_course_for_same_person_does_not_reopen_old_course(monkeypatch):
    _reset(monkeypatch)
    first_records = [_record("customer-1", "安然", [("class:a", "公益课 A", 1)])]
    course_a = debt_review_service.sync("membership_card", first_records)[0]
    debt_review_service.review(course_a["id"], "confirm", "", "管理员")

    synced = debt_review_service.sync("membership_card", [_record("customer-1", "安然", [
        ("class:a", "公益课 A", 1),
        ("class:b", "公益课 B", 1),
    ])])
    courses = {item["source_key"]: item for item in synced}

    assert courses["class:a"]["status"] == "ok"
    assert courses["class:b"]["status"] == "new"


def test_same_person_course_only_marks_increased_count_as_new(monkeypatch):
    _reset(monkeypatch)
    course = debt_review_service.sync("energy_knot", [
        _record("customer-1", "安然", [("session:a", "能量结", 1)]),
    ])[0]
    debt_review_service.review(course["id"], "confirm", "", "管理员")

    changed = debt_review_service.sync("energy_knot", [
        _record("customer-1", "安然", [("session:a", "能量结", 2)]),
    ])[0]

    assert changed["status"] == "changed"
    assert changed["approved_count"] == 1
    assert changed["new_count"] == 1


def test_removed_count_is_new_if_it_returns(monkeypatch):
    _reset(monkeypatch)
    two_debts = [_record("customer-1", "安然", [("class:a", "公益课 A", 2)])]
    course = debt_review_service.sync("membership_card", two_debts)[0]
    debt_review_service.review(course["id"], "confirm", "", "管理员")

    debt_review_service.sync("membership_card", [
        _record("customer-1", "安然", [("class:a", "公益课 A", 1)]),
    ])
    returned = debt_review_service.sync("membership_card", two_debts)[0]

    assert returned["status"] == "changed"
    assert returned["approved_count"] == 1
    assert returned["new_count"] == 1


def test_person_course_is_new_after_resolved_and_reappearing(monkeypatch):
    _reset(monkeypatch)
    record = _record("customer-1", "安然", [("session:a", "觉醒游戏", 1)])
    course = debt_review_service.sync("group_case", [record])[0]
    debt_review_service.review(course["id"], "confirm", "合理", "管理员")
    assert debt_review_service.sync("group_case", [])[0]["status"] == "resolved"

    reappeared = debt_review_service.sync("group_case", [record])[0]
    assert reappeared["status"] == "new"
    assert reappeared["new_count"] == 1


def test_establish_baseline_confirms_each_person_course(monkeypatch):
    _reset(monkeypatch)
    records = [
        _record("customer-1", "安然", [("session:a", "情绪释放 A", 1)]),
        _record("customer-2", "清和", [("session:b", "情绪释放 B", 1)]),
    ]
    courses = debt_review_service.sync("emotional_release", records)
    changed = debt_review_service.establish_baseline([item["id"] for item in courses], "管理员")
    synced = debt_review_service.sync("emotional_release", records)

    assert changed == 2
    assert {item["status"] for item in synced} == {"ok"}
