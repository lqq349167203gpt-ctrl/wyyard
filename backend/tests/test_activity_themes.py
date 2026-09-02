import pytest
from fastapi import HTTPException

from app.services import activity_lock_service, activity_theme_service


def test_save_theme_persists_theme_details(monkeypatch):
    monkeypatch.setattr(activity_theme_service, "_themes", {})
    monkeypatch.setattr(activity_theme_service, "_save", lambda _item_id="": None)

    created = activity_theme_service.save_theme(
        date="2099-07-21",
        week_theme="  本周主题第一行\n 本周主题第二行",
        day_theme=" 当天主题第一行\n  当天主题第二行",
        space_id="space-test",
        week_theme_detail=" 本周主题详情第一行\n第二行",
        day_theme_detail="  当天主题详情第一行\n第二行",
    )

    assert created.week_theme == "  本周主题第一行\n 本周主题第二行"
    assert created.day_theme == " 当天主题第一行\n  当天主题第二行"
    assert created.week_theme_detail == " 本周主题详情第一行\n第二行"
    assert created.day_theme_detail == "  当天主题详情第一行\n第二行"

    updated = activity_theme_service.save_theme(
        date="2099-07-21",
        week_theme="更新后的周主题",
        day_theme="更新后的当天主题",
        space_id="space-test",
        week_theme_detail="更新后的周详情",
        day_theme_detail="更新后的当天详情",
    )

    assert updated.id == created.id
    assert updated.week_theme_detail == "更新后的周详情"
    assert updated.day_theme_detail == "更新后的当天详情"


def test_schedule_lock_is_scoped_and_preserves_theme(monkeypatch):
    monkeypatch.setattr(activity_theme_service, "_themes", {})
    monkeypatch.setattr(activity_theme_service, "_save", lambda _item_id="": None)

    activity_theme_service.save_theme(
        date="2099-07-22",
        week_theme="本周主题",
        day_theme="当天主题",
        space_id="space-a",
    )
    locked = activity_theme_service.set_lock(
        "2099-07-22",
        "space-a",
        locked=True,
        operator_id="account-1",
        operator="核对人",
    )

    assert locked.is_locked is True
    assert locked.locked_by == "核对人"
    assert locked.day_theme == "当天主题"
    assert activity_theme_service.is_locked("2099-07-22", "space-a") is True
    assert activity_theme_service.is_locked("2099-07-22", "space-b") is False

    with pytest.raises(HTTPException) as error:
        activity_lock_service.ensure_scope_unlocked("2099-07-22", "space-a")
    assert error.value.status_code == 423

    unlocked = activity_theme_service.set_lock("2099-07-22", "space-a", locked=False)
    assert unlocked.is_locked is False
    assert unlocked.locked_by == ""
    assert unlocked.day_theme == "当天主题"


def test_schedule_lock_blocks_all_schedule_writes_until_unlocked(client):
    date = "2099-07-23"
    space_id = "space-lock-api"
    created = client.post("/api/class-records", json={
        "date": date,
        "course_id": "course-lock-api",
        "course_name": "核对锁测试课",
        "space_id": space_id,
    })
    assert created.status_code == 200
    record_id = created.json()["id"]

    locked = client.post("/api/activity-themes/lock", json={"date": date, "space_id": space_id})
    assert locked.status_code == 200
    assert locked.json()["is_locked"] is True
    assert locked.json()["locked_by"] == "不闹"

    update = client.patch(f"/api/class-records/{record_id}", json={"activity_name": "不应保存"})
    assert update.status_code == 423
    reorder = client.post("/api/activity-orders", json={"date": date, "space_id": space_id, "order": []})
    assert reorder.status_code == 423
    theme = client.post("/api/activity-themes", json={"date": date, "space_id": space_id, "day_theme": "不应保存"})
    assert theme.status_code == 423

    unlocked = client.post("/api/activity-themes/unlock", json={"date": date, "space_id": space_id})
    assert unlocked.status_code == 200
    assert unlocked.json()["is_locked"] is False
    update = client.patch(f"/api/class-records/{record_id}", json={"activity_name": "解锁后可保存"})
    assert update.status_code == 200
    assert update.json()["activity_name"] == "解锁后可保存"
    assert client.delete(f"/api/class-records/{record_id}").status_code == 200
