from datetime import datetime

from app.models.base import SafeBaseModel


class VisitVerification(SafeBaseModel):
    id: str
    date: str
    space_id: str = ""
    is_verified: bool = False
    verified_by_id: str = ""
    verified_by: str = ""
    verified_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
