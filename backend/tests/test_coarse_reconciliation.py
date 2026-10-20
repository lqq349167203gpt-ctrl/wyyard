"""粗门交易、欠卡重算及课程组织迁移的端到端回归。"""

import uuid

import pytest

from app.services import membership_card_service as cards
from app.services import project_deduction_service as deductions
from app.services import storage


@pytest.fixture
def offset_course(client, created_customer):
    customer_id = created_customer["id"]
    suffix = uuid.uuid4().hex[:8]

    def post(path, payload):
        response = client.post(path, json=payload)
        assert response.status_code == 200, response.text
        return response.json()

    old = post("/api/organizations", {"name": f"原组织{suffix}"})
    new = post("/api/organizations", {"name": f"新组织{suffix}"})
    kind = f"艺术疗愈{suffix}"
    post("/api/course-types", {"name": kind, "organization_id": old["id"]})
    course = post("/api/courses", {"name": f"潜意识绘画{suffix}", "type": kind, "organization_id": old["id"]})
    visit = post("/api/visits", {
        "visit_date": "2026-09-16", "customer_id": customer_id,
        "nickname": created_customer["nickname"], "arrived": True,
    })
    lesson = post("/api/class-records", {
        "date": "2026-09-16", "start_time": "09:00", "course_id": course["id"],
        "course_name": course["name"], "course_type": kind, "participant_ids": [customer_id],
        "membership_deduction_count": 2,
    })
    card = post("/api/membership-cards", {
        "customer_id": customer_id, "nickname": created_customer["nickname"],
        "card_type": "定制化", "price": 0, "effective_date": "2026-09-18",
        "duration_type": "month", "duration_value": 3, "agreement_status": "unsigned",
    })
    offset = post("/api/project-deductions/coarse-door-course", {
        "customer_id": customer_id, "record_type": "class", "record_id": lesson["id"],
        "course_organization_id": old["id"], "settlement_organization_id": old["id"],
        "deal_date": "2026-09-16",
    })
    yield {
        "customer": customer_id, "old": old, "new": new, "kind": kind,
        "course": course, "lesson": lesson, "offset": offset,
        "keys": [f'class:{lesson["id"]}', f'class:{lesson["id"]}#unit=2'],
    }
    client.delete(f'/api/class-records/{lesson["id"]}?confirm_coarse_cancellation=1')
    client.delete(f'/api/visits/{visit["id"]}?confirm_coarse_cancellation=1')
    client.delete(f'/api/membership-cards/{card["id"]}')
    client.delete(f'/api/courses/{course["id"]}')
    client.delete(f'/api/organizations/{old["id"]}')
    client.delete(f'/api/organizations/{new["id"]}')


@pytest.mark.parametrize("damage", ["stale_key", "missing_offset", "duplicate_debt"])
def test_rebuild_recovers_offsets_and_persists_without_recreating_transaction(client, offset_course, damage):
    row = offset_course
    cid, keys = row["customer"], row["keys"]
    before = storage.load_item("project_deductions.json", row["offset"]["id"])
    if damage == "stale_key":
        cards._deductions[cid].append({"key": "class:obsolete"})
    elif damage == "missing_offset":
        cards._deductions.pop(cid, None)
    if damage != "stale_key":
        cards._debt_activities[cid] = list(keys)
        cards._debts[cid] = len(keys)
    # 监管入口先读，覆盖恢复时欠卡字典缩小、旧欠卡状态消失。
    response = client.get("/api/debt-records", params={"type": "membership_card"})
    assert response.status_code == 200, response.text
    assert not any(item["customer_id"] == cid for item in response.json()["items"])
    assert cards.get_debt_record(cid)["debt_count"] == 0
    detail = client.get(f"/api/customer-detail/{cid}").json()
    activity = next(item for item in detail["activities"] if item["activity_key"] == keys[0])
    assert activity["deduction_summary"] == "粗门扣卡2次"
    assert storage.load_item("project_deductions.json", row["offset"]["id"]) == before
    # 模拟重新加载后再次计算，不能再次欠卡，也不能重复创建流水。
    cards._load()
    assert cards.reconcile_customer_card_usage(cid) is False
    usage = storage.load_item("membership_deductions.json", cid)
    assert {item["key"] for item in usage} == set(keys)
    assert all(item["benefit_type"] == "coarse_door_offset" for item in usage)
    assert cards.get_debt_record(cid)["debt_count"] == 0


@pytest.mark.parametrize("invalid", ["deleted", "cancelled", "removed"])
def test_recovery_does_not_revive_invalid_offsets(client, offset_course, invalid):
    row = offset_course
    cid, keys = row["customer"], row["keys"]
    if invalid == "deleted":
        response = client.delete(f'/api/project-deductions/{row["offset"]["id"]}')
        assert response.status_code == 200, response.text
    elif invalid == "cancelled":
        deductions._deductions[row["offset"]["id"]].cancelled = True
    else:
        response = client.patch(
            f'/api/class-records/{row["lesson"]["id"]}/participants?confirm_coarse_cancellation=1',
            json={"participant_ids": []},
        )
        assert response.status_code == 200, response.text
        # 即使历史交易漏取消，不在当前有效名单也不能恢复抵扣。
        deductions._deductions[row["offset"]["id"]].cancelled = False
    cards._deductions.pop(cid, None)
    cards._debt_activities[cid] = list(keys)
    cards._debts[cid] = len(keys)
    debt = cards.get_debt_record(cid)
    assert debt["debt_count"] == (0 if invalid == "removed" else 2)
    assert not any(item.get("benefit_type") == "coarse_door_offset"
                   for item in cards._deductions.get(cid, []))


def test_course_move_updates_shared_views_but_preserves_settlement_and_audit(client, offset_course):
    from app.services import class_record_service, principal_service
    from app.services.course_organization_service import build_salon_organization_resolver
    from app.services.payment_course_service import fill_course_organizations

    row = offset_course
    cid = row["customer"]
    before = storage.load_item("project_deductions.json", row["offset"]["id"])
    response = client.patch(f'/api/course-types/{row["kind"]}', json={"organization_id": row["new"]["id"]})
    assert response.status_code == 200, response.text
    activity = class_record_service.get_record(row["lesson"]["id"])
    assert build_salon_organization_resolver()(activity) == row["new"]["id"]
    # PC 和小程序共用的支付列表与详情都读当前课程所属。
    listed = client.get("/api/project-deductions", params={"customer_id": cid}).json()
    item = next(item for item in listed if item["id"] == row["offset"]["id"])
    assert item["source_organization_id"] == row["new"]["id"]
    assert item["source_organization_name"] == row["new"]["name"]
    assert item["organization_id"] == row["old"]["id"]
    detail = client.get(f"/api/customer-detail/{cid}").json()
    payment = next(item for item in detail["payment_records"] if item["source_id"] == row["offset"]["id"])
    assert payment["course_organization_name"] == row["new"]["name"]
    assert payment["settlement_organization_name"] == row["old"]["name"]
    # 编辑选项和其他付费类型的成交课程同一口径。
    options = deductions.get_coarse_door_options(cid, row["offset"]["id"])
    assert next(item for item in options["courses"] if item["record_id"] == activity.id)["organization_ids"] == [row["new"]["id"]]
    linked = [{"deal_course_key": f"class_record:{activity.id}"}]
    fill_course_organizations(linked)
    assert linked[0]["deal_course_organization_name"] == row["new"]["name"]
    from starlette.requests import Request

    request = Request({"type": "http"})
    request.state.user_role = "超级管理员"
    request.state.user_roles = ["超级管理员"]
    _, _, events, courses = principal_service.collect_data(request)
    assert next(item for item in courses if item["id"] == f"class:{activity.id}")["organization_id"] == row["new"]["id"]
    coarse = next(item for item in events if item["kind"] == "coarse_usage"
                  and item["customer_id"] == cid and item["course_key"] == f"class:{activity.id}")
    assert coarse["organization_id"] == row["new"]["id"]
    assert coarse["settlement_id"] == row["old"]["id"]
    assert storage.load_item("project_deductions.json", row["offset"]["id"]) == before
    assert cards.get_debt_record(cid)["debt_count"] == 0
