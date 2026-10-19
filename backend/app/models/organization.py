from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import Field

from app.models.base import SafeBaseModel


class OrganizationBase(SafeBaseModel):
    name: str
    member_ids: List[str] = []
    # 引流归属：member＝按组织成员（默认）、all＝所有人、selected＝指定人员。
    # 只影响主理人页的引流统计口径，不影响课程/交易归属，也不影响查看范围。
    referrer_mode: Literal["member", "all", "selected"] = "member"
    referrer_ids: List[str] = []
    # 没填引流人的客户是否算这个组织带来的（默认算，保持原有口径）
    include_unassigned_referrers: bool = True
    sort_order: int = 0


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationDataViewersUpdate(SafeBaseModel):
    """全局整体数据查阅人配置：配置后默认属于每个组织。"""

    data_viewer_ids: List[str] = []


class OrganizationArchive(SafeBaseModel):
    stopped_on: date
    reason: str = Field(default="", max_length=500)


class Organization(OrganizationBase):
    id: str
    created_at: datetime
    updated_at: datetime
    status: Literal["active", "archived"] = "active"
    stopped_on: Optional[date] = None
    archive_reason: str = ""
    archived_at: Optional[datetime] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
