from app.models.base import SafeBaseModel
from datetime import datetime


class ClientNotification(SafeBaseModel):
    id: str
    customer_id: str
    type: str  # signup_cancelled / activity_cancelled
    title: str
    content: str
    activity_name: str = ""
    activity_date: str = ""
    operator: str = ""
    is_read: bool = False
    created_at: datetime
