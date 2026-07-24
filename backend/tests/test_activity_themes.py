from app.services import activity_theme_service


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
