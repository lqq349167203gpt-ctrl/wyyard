"""付费子类型的统一口径；历史卡仅归类名称，不重算权益。"""

from app.utils.business_catalog_data import MEMBERSHIP_CATALOG
from app.utils.business_catalog_data import OFFLINE_COURSE_TYPES as _OFFLINE_COURSE_TYPES
from app.utils.business_catalog_data import OH_READING_TYPES as _OH_READING_TYPES

MEMBERSHIP_CARD_TYPES = tuple(item["name"] for item in MEMBERSHIP_CATALOG)
OFFLINE_COURSE_TYPES = tuple(_OFFLINE_COURSE_TYPES)
OH_READING_TYPES = tuple(_OH_READING_TYPES)


def normalize_card_type(value: str) -> str:
    value = str(value or "").strip()
    if value in (*MEMBERSHIP_CARD_TYPES, "粗门次卡"):
        return value
    return "定制化"
