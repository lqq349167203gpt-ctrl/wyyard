from pydantic import BaseModel
from datetime import datetime, timezone


class WechatSession(BaseModel):
    token: str
    openid: str
    account_id: str
    created_at: datetime = datetime.now(timezone.utc)
