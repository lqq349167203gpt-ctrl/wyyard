from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class ActivityInfo(BaseModel):
    name: str = ""
    role: str = ""  # 组长 / 副组长 / 组员 / 空
    type: str = ""  # 沙龙 / 觉醒 / 情绪 / 能量结 / 内部课
    owner_name: str = ""  # 案主 / 课程老师 名称
    extra_badge: str = ""  # 附加标签，如 "成就君：xxx"
    is_welfare: bool = False  # 是否公益活动


class VisitRecordBase(BaseModel):
    visit_date: str  # YYYY-MM-DD
    visit_time: str = "09:00"  # HH:MM
    customer_id: str
    nickname: str
    member_type: str = ""
    daily_card_usage: int = 0
    needs: str = ""
    referrer_handler: str = ""  # 承接人
    activity_id: str = ""
    activity_type: str = ""
    space_id: str = ""  # 所属空间
    is_leader: bool = False  # 是否组长
    arrived: bool = False  # 是否到店
    arrival_time: str = ""  # 实际到场时间 HH:MM
    activity_participation: list = []  # [{name, role, participated}]
    experience: str = ""  # 活动参与体验
    feedback: str = ""  # 客户反馈
    healing_notes: str = ""  # 跟进记录
    group_leader_feedback: str = ""  # 组长反馈


class VisitRecordCreate(VisitRecordBase):
    pass


class VisitRecord(VisitRecordBase):
    id: str
    visit_count: int = 0  # 自动统计：该客户历史到访总次数
    activity_count: int = 0  # 自动统计：参与活动总次数
    welfare_count: int = 0  # 自动统计：其中公益活动次数
    remaining_count: Optional[int] = None  # 会员活动剩余次数（null 表示不限次或无卡）
    activities: List[ActivityInfo] = []  # 当日参与的活动列表
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class CustomerSearchResult(BaseModel):
    id: str
    nickname: str
    name: str = ""
    member_type: str = ""
    visit_count: int = 0  # 自动统计：该客户历史到访总次数
