from app.models.base import SafeBaseModel


class PaymentCourseFields(SafeBaseModel):
    """成交归因与实际扣卡课程独立；空值表示与课程无关。"""

    deal_course_key: str = ""
    deal_course_name: str = ""
