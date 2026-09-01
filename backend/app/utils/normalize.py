"""客户字段的确定性归一化与校验（AI 工具层专用）。

规范不再只依赖提示词：所有取值在写库前在这里强制归一化，
无法识别的值返回错误说明，由工具层引导用户澄清，保证入库数据干净。
"""

import re

GENDER_MAP = {
    "男": "男", "男生": "男", "男人": "男", "男性": "男", "先生": "男", "帅哥": "男",
    "女": "女", "女生": "女", "女人": "女", "女性": "女", "女士": "女", "小姐": "女",
    "其他": "其他",
}

TRAFFIC_SOURCES = ["小红书", "抖音", "公众号", "视频号", "朋友圈", "美团", "大众点评", "好友推荐"]

WORK_STATUSES = ["在职", "离职", "自由职业", "全职带孩子"]


def normalize_gender(value: str) -> tuple[str | None, str | None]:
    """返回 (归一化值, 错误说明)。空输入 → ("", None)。"""
    v = (value or "").strip()
    if not v:
        return "", None
    if v in GENDER_MAP:
        return GENDER_MAP[v], None
    return None, f"性别只能是「男/女/其他」，无法识别「{v}」"


def normalize_traffic_source(value: str) -> str:
    """流量来源：命中白名单则归一化，否则按提示词规则留空。"""
    v = (value or "").strip()
    if not v:
        return ""
    if v in TRAFFIC_SOURCES:
        return v
    for s in TRAFFIC_SOURCES:
        if s in v or v in s:
            return s
    if "推荐" in v or "介绍" in v:
        return "好友推荐"
    return ""


def normalize_work_status(value: str) -> str:
    """工作情况：命中白名单则归一化，否则留空。"""
    v = (value or "").strip()
    if not v:
        return ""
    if v in WORK_STATUSES:
        return v
    if "自由" in v:
        return "自由职业"
    if "离" in v or "辞职" in v:
        return "离职"
    if "在职" in v or "上班" in v or "工作" in v:
        return "在职"
    return ""


def normalize_phone(value: str) -> tuple[str | None, str | None]:
    """手机号：只保留数字。返回 (归一化值, 错误说明)。"""
    v = re.sub(r"\D", "", value or "")
    if not v:
        return "", None
    if not (5 <= len(v) <= 15):
        return None, f"手机号位数不对（{len(v)}位），请确认"
    return v, None
