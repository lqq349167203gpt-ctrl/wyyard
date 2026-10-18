"""技能学习的当前类型及历史类型；分组只用于展示，不改历史课程名称。"""

from app.utils.business_catalog_data import LEARNING_CATALOG

LEARNING_COURSE_TYPES = tuple(item["activity_name"] for item in LEARNING_CATALOG if not item["legacy"])
LEGACY_PAYMENT_COURSE_TYPES = tuple(item["payment_name"] for item in LEARNING_CATALOG if item["legacy"])
PAYMENT_COURSE_TYPES = tuple(item["payment_name"] for item in LEARNING_CATALOG)
ACTIVITY_COURSE_TYPES = tuple(item["activity_name"] for item in LEARNING_CATALOG)
