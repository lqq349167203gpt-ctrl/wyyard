"""AI 助手修复的单元自测：日期/时间解析、字段归一化、客户名模糊匹配。"""
from datetime import date
from types import SimpleNamespace

from app.services import voice_parser
from app.utils.cn_datetime import date_context_block, normalize_time, parse_anchor, resolve_date, weekday_cn
from app.utils.normalize import (
    normalize_gender,
    normalize_phone,
    normalize_traffic_source,
    normalize_work_status,
)

ANCHOR = date(2026, 7, 17)  # 星期五


# ── 日期解析 ──────────────────────────────────────────────

def test_resolve_iso_and_cn_full():
    assert resolve_date("2026-07-20", ANCHOR) == "2026-07-20"
    assert resolve_date("2026年7月20日", ANCHOR) == "2026-07-20"
    assert resolve_date("2026/7/20", ANCHOR) == "2026-07-20"


def test_resolve_relative_days():
    assert resolve_date("今天", ANCHOR) == "2026-07-17"
    assert resolve_date("明天", ANCHOR) == "2026-07-18"
    assert resolve_date("后天", ANCHOR) == "2026-07-19"
    assert resolve_date("昨天", ANCHOR) == "2026-07-16"
    assert resolve_date("大后天", ANCHOR) == "2026-07-20"


def test_resolve_weekdays():
    # 2026-07-17 是周五，本周一 = 07-13
    assert resolve_date("本周一", ANCHOR) == "2026-07-13"
    assert resolve_date("周五", ANCHOR) == "2026-07-17"
    assert resolve_date("上周五", ANCHOR) == "2026-07-10"
    assert resolve_date("上周日", ANCHOR) == "2026-07-12"
    assert resolve_date("下周一", ANCHOR) == "2026-07-20"
    assert resolve_date("下周三", ANCHOR) == "2026-07-22"


def test_resolve_month_day():
    assert resolve_date("7月20号", ANCHOR) == "2026-07-20"
    assert resolve_date("7月20日", ANCHOR) == "2026-07-20"
    assert resolve_date("7-20", ANCHOR) == "2026-07-20"
    # 跨年：锚点 1 月说「12月25号」应取刚过去的 12 月
    assert resolve_date("12月25号", date(2026, 1, 10)) == "2025-12-25"


def test_resolve_invalid():
    assert resolve_date("2026-13-45", ANCHOR) is None
    assert resolve_date("大后年", ANCHOR) is None
    assert resolve_date("", ANCHOR) is None
    assert resolve_date(None, ANCHOR) is None


def test_parse_anchor_fallback():
    assert parse_anchor("2026-07-01") == date(2026, 7, 1)
    assert parse_anchor("垃圾") is not None  # 回退到今天，不抛异常
    assert parse_anchor("") is not None
    assert parse_anchor(None) is not None


def test_context_block_contains_weekday():
    block = date_context_block(ANCHOR)
    assert "2026-07-17(周五)" in block
    assert "周五=2026-07-10" in block  # 上周换算表里包含上周五


# ── 时间归一化 ──────────────────────────────────────────────

def test_normalize_time_basic():
    assert normalize_time("9:00") == "09:00"
    assert normalize_time("15：30") == "15:30"
    assert normalize_time("15点") == "15:00"


def test_normalize_time_cn():
    assert normalize_time("下午3点") == "15:00"
    assert normalize_time("下午3点半") == "15:30"
    assert normalize_time("晚上8点") == "20:00"
    assert normalize_time("中午12点") == "12:00"
    assert normalize_time("中午1点") == "13:00"
    assert normalize_time("上午十点") == "10:00"
    assert normalize_time("三点二十") == "03:20"
    assert normalize_time("凌晨12点") == "00:00"


def test_normalize_time_invalid():
    assert normalize_time("25:00") is None
    assert normalize_time("猴年马月") is None
    assert normalize_time("") is None


# ── 客户字段归一化 ──────────────────────────────────────────

def test_normalize_gender():
    assert normalize_gender("女生") == ("女", None)
    assert normalize_gender("男") == ("男", None)
    assert normalize_gender("") == ("", None)
    val, err = normalize_gender("直升机")
    assert val is None and err


def test_normalize_phone():
    assert normalize_phone("138-0013-8000") == ("13800138000", None)
    assert normalize_phone("+86 13800138000") == ("8613800138000", None)
    val, err = normalize_phone("123")
    assert val is None and err


def test_normalize_traffic_source():
    assert normalize_traffic_source("小红书来的") == "小红书"
    assert normalize_traffic_source("朋友介绍") == "好友推荐"
    assert normalize_traffic_source("发传单") == ""  # 不在白名单 → 留空


def test_normalize_work_status():
    assert normalize_work_status("自由") == "自由职业"
    assert normalize_work_status("辞职了") == "离职"
    assert normalize_work_status("在上班") == "在职"


# ── 客户名模糊匹配 ──────────────────────────────────────────

def _fake_customers():
    def make(**kw):
        base = dict(
            id="", nickname="", name="", gender="", phone="", wechat="", age="",
            service_teacher="", referrer="", referrer_handler="",
            traffic_source="", traffic_source_detail="",
            work_status="", work_description="",
            basic_info="", core_situation="", tags="", other_info="",
            is_deleted=False,
        )
        base.update(kw)
        return SimpleNamespace(**base)

    return [
        make(id="aaa111bbb222", nickname="余墨"),
        make(id="ccc333ddd444", nickname="薇薇"),
        make(id="eee555fff666", nickname="娟娟", name="李娟", phone="13800000000"),
    ]


def _patch_customers(monkeypatch):
    from app.services import customer_service
    monkeypatch.setattr(customer_service, "list_customers", lambda: _fake_customers())


def test_fuzzy_exact(monkeypatch):
    _patch_customers(monkeypatch)
    found, candidates = voice_parser._find_customer_with_candidates("余墨")
    assert found and found["nickname"] == "余墨" and not candidates


def test_fuzzy_homophone(monkeypatch):
    """同音字：于墨 → 余墨；微微 → 薇薇"""
    _patch_customers(monkeypatch)
    found, _ = voice_parser._find_customer_with_candidates("于墨")
    assert found and found["nickname"] == "余墨"
    found, _ = voice_parser._find_customer_with_candidates("微微")
    assert found and found["nickname"] == "薇薇"


def test_fuzzy_by_real_name_and_phone(monkeypatch):
    _patch_customers(monkeypatch)
    found, _ = voice_parser._find_customer_with_candidates("李娟")
    assert found and found["nickname"] == "娟娟"
    found, _ = voice_parser._find_customer_with_candidates("13800000000")
    assert found and found["nickname"] == "娟娟"


def test_fuzzy_not_found_returns_candidates(monkeypatch):
    _patch_customers(monkeypatch)
    found, candidates = voice_parser._find_customer_with_candidates("娟")
    assert found is None
    assert "娟娟" in candidates


def test_search_customer_candidates(monkeypatch):
    _patch_customers(monkeypatch)
    results = voice_parser.search_customer_candidates("于墨")
    assert results and results[0] == "余墨"


def test_render_prompt_safe():
    tpl = "今天是 {date}。JSON 示例：{\"a\": 1}"
    out = voice_parser.render_prompt(tpl, {"date": "2026-07-17"})
    assert "2026-07-17" in out and '{"a": 1}' in out


def test_weekday_cn():
    assert weekday_cn(ANCHOR) == "周五"
