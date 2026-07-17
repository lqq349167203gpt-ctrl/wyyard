"""中文日期/时间表达的确定性解析（AI 助手工具层专用）。

原则：不让 LLM 做日期/时间算术。LLM 只负责把用户的原始表达传给工具，
换算与校验全部在这里完成；解析失败返回 None，由工具引导用户澄清。
"""

import re
from datetime import date, datetime, timedelta, timezone

TZ = timezone(timedelta(hours=8))

_WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

_CN_DIGITS = {
    "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
}

_WEEKDAY_CHARS = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}

# 相对日偏移
_RELATIVE_DAYS = {
    "今天": 0, "今日": 0, "当天": 0,
    "明天": 1, "明日": 1,
    "后天": 2,
    "大后天": 3,
    "昨天": -1, "昨日": -1,
    "前天": -2,
    "大前天": -3,
}


def today() -> date:
    """服务器当前日期（东八区）。"""
    return datetime.now(TZ).date()


def weekday_cn(d: date) -> str:
    return _WEEKDAY_NAMES[d.weekday()]


def parse_anchor(s: str | None) -> date:
    """解析前端传来的锚点日期（YYYY-MM-DD），无效或为空则退回服务器今天。"""
    if s:
        m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s.strip())
        if m:
            try:
                return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                pass
    return today()


def _cn_num(text: str) -> int | None:
    """解析 0-99 的中文或阿拉伯数字。"""
    text = text.strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)
    if text in _CN_DIGITS:
        return _CN_DIGITS[text]
    if text == "十":
        return 10
    m = re.fullmatch(r"十([一二两三四五六七八九])", text)
    if m:
        return 10 + _CN_DIGITS[m.group(1)]
    m = re.fullmatch(r"([一二两三四五六七八九])十([一二两三四五六七八九]?)", text)
    if m:
        return _CN_DIGITS[m.group(1)] * 10 + (_CN_DIGITS[m.group(2)] if m.group(2) else 0)
    return None


def _nearest_year(month: int, day: int, anchor: date) -> date | None:
    """无年份的月日：取离锚点最近的一次（跨年时向前后各探一年）。"""
    candidates = []
    for y in (anchor.year - 1, anchor.year, anchor.year + 1):
        try:
            candidates.append(date(y, month, day))
        except ValueError:
            return None
    return min(candidates, key=lambda d: abs((d - anchor).days))


def resolve_date(expr: str, anchor: date) -> str | None:
    """把用户说的日期表达解析成 YYYY-MM-DD；解析不了返回 None。

    支持：YYYY-MM-DD / YYYY年M月D日 / M月D号(日) / M-D / M/D / M.D /
    今天、明天、后天、大后天、昨天、前天、大前天 /
    (上|下|本|这)(上|下)?(周|星期)X / 周X / 星期X /
    (这个|本|下个|下|上个|上)月X号
    """
    if not expr:
        return None
    s = expr.strip()

    # 完整日期：2026-07-17 / 2026/7/17 / 2026.7.17 / 2026年7月17日
    m = re.fullmatch(r"(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            return None

    # 相对日
    if s in _RELATIVE_DAYS:
        return (anchor + timedelta(days=_RELATIVE_DAYS[s])).isoformat()

    # 周X 系列：上上/上/本/这/下/下下 + 周/星期 + X
    m = re.fullmatch(r"(上上|上|下下|下|本|这|最近)?个?\s*(?:周|星期)\s*([一二三四五六日天])", s)
    if m:
        prefix = m.group(1) or ""
        target = _WEEKDAY_CHARS[m.group(2)]
        week_offset = {"上上": -2, "上": -1, "本": 0, "这": 0, "最近": 0, "": 0, "下": 1, "下下": 2}[prefix]
        monday = anchor - timedelta(days=anchor.weekday())
        return (monday + timedelta(days=week_offset * 7 + target)).isoformat()

    # M月D号 / M月D日
    m = re.fullmatch(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?", s)
    if m:
        d = _nearest_year(int(m.group(1)), int(m.group(2)), anchor)
        return d.isoformat() if d else None

    # M-D / M/D / M.D（无年份）
    m = re.fullmatch(r"(\d{1,2})\s*[-/.]\s*(\d{1,2})", s)
    if m:
        d = _nearest_year(int(m.group(1)), int(m.group(2)), anchor)
        return d.isoformat() if d else None

    # (这个/本/下个/下/上个/上)月X号
    m = re.fullmatch(r"(这个|本|下个|下|上个|上)?个?月\s*(\d{1,2})\s*[日号]", s)
    if m:
        prefix = m.group(1) or ""
        day = int(m.group(2))
        month_offset = {"": 0, "这个": 0, "本": 0, "下个": 1, "下": 1, "上个": -1, "上": -1}[prefix]
        y, mo = anchor.year, anchor.month + month_offset
        while mo > 12:
            y, mo = y + 1, mo - 12
        while mo < 1:
            y, mo = y - 1, mo + 12
        try:
            return date(y, mo, day).isoformat()
        except ValueError:
            return None

    return None


def normalize_time(expr: str) -> str | None:
    """把时间表达归一成 HH:MM（24 小时制）；无法识别返回 None。

    支持：9:00 / 09:00 / 15：30 / 下午3点 / 晚上8点半 / 中午12点 /
    上午十点 / 三点二十 / 14点05分
    """
    if not expr:
        return None
    s = expr.strip().replace("：", ":")

    # 纯 HH:MM
    m = re.fullmatch(r"(\d{1,2}):(\d{1,2})", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mi <= 59:
            return f"{h:02d}:{mi:02d}"
        return None

    # 中文/口语时间
    num = r"(\d{1,2}|十[一二两三四五六七八九]?|[一二两三四五六七八九]十[一二两三四五六七八九]?|[一二两三四五六七八九])"
    m = re.fullmatch(
        r"(凌晨|清晨|早上|上午|中午|下午|晚上|晚间)?\s*" + num + r"\s*点\s*(半|" + num + r"\s*分?)?",
        s,
    )
    if not m:
        return None
    period, hour_s, minute_part, minute_s = m.group(1), m.group(2), m.group(3), m.group(4)
    h = _cn_num(hour_s)
    if h is None:
        return None
    if minute_part == "半":
        mi = 30
    elif minute_s:
        mi = _cn_num(minute_s)
        if mi is None:
            return None
    else:
        mi = 0

    if period in ("下午", "晚上", "晚间"):
        if h < 12:
            h += 12
    elif period == "中午":
        if h < 12:
            h += 12  # 中午1点 = 13:00
    elif period == "凌晨":
        if h == 12:
            h = 0
    # 上午/早上/清晨/无修饰：保持原样（用户说"15点"即为 15:00）

    if not (0 <= h <= 23 and 0 <= mi <= 59):
        return None
    return f"{h:02d}:{mi:02d}"


def date_context_block(anchor: date) -> str:
    """生成注入系统提示词的日期基准 + 换算表，让 LLM 查表而不是心算。"""
    actual = today()

    def fmt(d: date) -> str:
        return f"{d.isoformat()}({weekday_cn(d)})"

    def week_line(monday: date) -> str:
        return " ".join(f"{_WEEKDAY_NAMES[i]}={(monday + timedelta(days=i)).isoformat()}" for i in range(7))

    monday = anchor - timedelta(days=anchor.weekday())
    lines = [
        f"【日期基准】服务器实际今天：{fmt(actual)}。用户界面选中的日期：{fmt(anchor)}——用户说「今天」一律指选中日期。",
        "常用日期换算（直接查表使用，禁止自己推算）：",
        f"今天={anchor.isoformat()} 明天={(anchor + timedelta(days=1)).isoformat()} "
        f"后天={(anchor + timedelta(days=2)).isoformat()} 昨天={(anchor - timedelta(days=1)).isoformat()} "
        f"前天={(anchor - timedelta(days=2)).isoformat()}",
        f"本周：{week_line(monday)}",
        f"上周：{week_line(monday - timedelta(days=7))}",
        f"下周：{week_line(monday + timedelta(days=7))}",
        "换算表里没有的日期（如「7月25号」），把用户原话作为日期参数传给工具即可，工具会自动换算；禁止自己推算 YYYY-MM-DD。",
    ]
    return "\n".join(lines)
