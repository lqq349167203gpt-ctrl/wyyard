from types import SimpleNamespace

from app.api import statistics


def test_product_statistics_filters_healing_teacher_and_keeps_teacher_options(monkeypatch):
    teacher = SimpleNamespace(
        id="teacher-1",
        nickname="老师甲",
        name="",
        positions=["课程老师"],
        referrer="",
    )
    other_teacher = SimpleNamespace(
        id="teacher-2",
        nickname="老师乙",
        name="",
        positions=["成就君"],
        referrer="",
    )
    customer = SimpleNamespace(
        id="customer-1",
        nickname="客户甲",
        name="",
        positions=[],
        referrer="耀凯",
    )
    deleted_referrer = SimpleNamespace(
        id="deleted-referrer",
        nickname="耀凯",
        name="",
        positions=[],
        referrer="",
    )
    customers = [teacher, other_teacher, customer, deleted_referrer]
    matching_record = SimpleNamespace(
        customer_id="customer-1",
        deal_date="2026-08-01",
        created_at=None,
        voided=False,
        fee=100,
        price=None,
        amount=None,
        closers=[{"id": "teacher-1", "name": "老师甲", "amount": 100}],
        closer_id=None,
        closer_name=None,
        card_type="45次卡",
    )
    hidden_record = SimpleNamespace(
        customer_id="customer-1",
        deal_date="2026-08-01",
        created_at=None,
        voided=False,
        fee=200,
        price=None,
        amount=None,
        closers=[{"id": "teacher-2", "name": "老师乙", "amount": 200}],
        closer_id=None,
        closer_name=None,
        card_type="月卡",
    )
    teacher_1_course = SimpleNamespace(
        membership_deduction_count=3,
        teacher_ids=["teacher-1"],
        achiever_id="",
    )
    teacher_2_course = SimpleNamespace(
        membership_deduction_count=1,
        teacher_ids=["teacher-2"],
        achiever_id="",
    )

    # 产品销售为保留停用人员的历史成交筛选，读取的是包含停用客户的全量数据源。
    monkeypatch.setattr(statistics.customer_service, "list_all_customers", lambda: customers)
    monkeypatch.setattr(
        statistics.customer_service,
        "list_customers",
        lambda: [teacher, other_teacher, customer],
    )
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", (
        ("class", "沙龙活动", lambda **_kwargs: [teacher_1_course, teacher_2_course]),
    ))
    monkeypatch.setattr(statistics.membership_card_service, "list_cards", lambda: [matching_record, hidden_record])
    for service, method in (
        (statistics.group_case_service, "list_cases"),
        (statistics.emotional_release_service, "list_releases"),
        (statistics.oh_card_reading_service, "list_readings"),
        (statistics.energy_knot_service, "list_knots"),
        (statistics.internal_course_service, "list_courses"),
        (statistics.offline_course_service, "list_courses"),
        (statistics.other_project_service, "list_projects"),
        (statistics.visit_service, "list_visits"),
    ):
        monkeypatch.setattr(service, method, lambda: [])

    result = statistics.get_products(
        date_from="2026-08-01",
        date_to="2026-08-01",
        product_type="全部",
        name_filter=None,
        granularity="day",
        referrer=None,
        teacher_id="teacher-1",
    )

    assert result["total_amount"] == 100
    assert result["total_count"] == 1
    assert result["daily_table"][0]["converted_amount"] == 100
    assert "45次卡" in result["card_type_names"]
    assert result["card_type_amounts"]["45次卡"] == 100
    assert result["card_type_counts"]["45次卡"] == 1
    assert result["card_type_persons"]["45次卡"] == 1
    assert result["teachers"] == [
        {"id": "teacher-1", "name": "老师甲"},
        {"id": "teacher-2", "name": "老师乙"},
    ]
    assert "耀凯" not in result["referrer_names"]


def test_record_teacher_filter_supports_legacy_closer_name():
    record = SimpleNamespace(
        closers=[],
        closer_id=None,
        closer_name="老师甲",
    )

    assert statistics._record_matches_teacher(record, "teacher-1", {"老师甲"})
    assert not statistics._record_matches_teacher(record, "teacher-2", {"老师乙"})


def test_product_statistics_includes_offline_courses(monkeypatch):
    customer = SimpleNamespace(
        id="customer-1",
        nickname="客户甲",
        name="",
        positions=[],
        referrer="",
    )
    offline_course = SimpleNamespace(
        customer_id="customer-1",
        deal_date="2026-08-01",
        created_at=None,
        voided=False,
        amount=3600,
        fee=None,
        price=None,
        closers=[],
        closer_id=None,
        closer_name=None,
    )

    monkeypatch.setattr(statistics.customer_service, "list_all_customers", lambda: [customer])
    monkeypatch.setattr(statistics.customer_service, "list_customers", lambda: [customer])
    monkeypatch.setattr(statistics, "COURSE_ACTIVITY_TYPES", ())
    for service, method in (
        (statistics.membership_card_service, "list_cards"),
        (statistics.group_case_service, "list_cases"),
        (statistics.emotional_release_service, "list_releases"),
        (statistics.oh_card_reading_service, "list_readings"),
        (statistics.energy_knot_service, "list_knots"),
        (statistics.internal_course_service, "list_courses"),
        (statistics.other_project_service, "list_projects"),
        (statistics.visit_service, "list_visits"),
    ):
        monkeypatch.setattr(service, method, lambda: [])
    monkeypatch.setattr(statistics.offline_course_service, "list_courses", lambda: [offline_course])

    result = statistics.get_products(
        date_from="2026-08-01",
        date_to="2026-08-01",
        product_type="落地课程",
        name_filter=None,
        granularity="day",
        referrer=None,
        teacher_id=None,
    )

    assert result["total_amount"] == 3600
    assert result["total_count"] == 1
    assert result["total_persons"] == 1
    assert result["type_amounts"]["落地课程"] == 3600
    assert result["type_counts"]["落地课程"] == 1
    assert result["type_persons"]["落地课程"] == 1
    assert result["daily_table"][0]["converted_amount"] == 3600
