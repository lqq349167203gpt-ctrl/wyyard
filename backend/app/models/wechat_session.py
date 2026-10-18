from datetime import datetime, timezone

from app.models.base import SafeBaseModel


class WechatSession(SafeBaseModel):
    token: str
    openid: str
    account_id: str
    customer_id: str = ""
    created_at: datetime = datetime.now(timezone.utc)
