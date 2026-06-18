from pydantic import BaseModel
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict


class PaidItem(str, Enum):
    CARD_399 = "399次卡"
    MEMBER_3999 = "3999会员"
    HALF_YEAR = "半年卡"
    HEALER_2W = "2w疗愈师"


class SelfTag(str, Enum):
    SELF_GROWTH = "自我成长"
    CO_CREATE = "共创"
    MONETIZE = "变现"


class Position(str, Enum):
    TEACHER = "课程部"
    TRAFFIC = "流量部"
    SERVICE = "承接部"
    AFTERSALES = "售后部"
    ACHIEVER = "成就君"
    MANAGEMENT = "信息管理"
    ENERGY_HOST = "能量结老师"
    COURSE_TEACHER = "课程老师"


class PaidContentItem(BaseModel):
    type: PaidItem
    usage_count: int = 0
    salesperson: str = ""


class CustomerBase(BaseModel):
    nickname: str = ""
    name: str = ""
    gender: str = ""
    phone: str = ""
    wechat: str = ""
    age: str = ""
    referrer: str = ""
    referrer_handler: str = ""
    member_type: str = ""
    paid_content: List[PaidContentItem] = []
    visit_count: int = 0
    core_situation: str = ""
    need_tags: str = ""
    follow_up_node: str = ""
    follow_up_action: str = ""
    positions: List[Position] = []
    self_tags: List[SelfTag] = []
    work_status: str = ""
    work_description: str = ""
    basic_info: str = ""
    assessment: str = ""
    tags: str = ""
    other_info: str = ""  # 其他信息
    traffic_source: str = ""
    traffic_source_detail: str = ""
    tracking_plan: str = ""
    position_sort_orders: Dict[str, int] = {}
    space_id: str = ""


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    nickname: Optional[str] = None
    name: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    wechat: Optional[str] = None
    age: Optional[str] = None
    referrer: Optional[str] = None
    referrer_handler: Optional[str] = None
    member_type: Optional[str] = None
    paid_content: Optional[List[PaidContentItem]] = None
    visit_count: Optional[int] = None
    core_situation: Optional[str] = None
    need_tags: Optional[str] = None
    follow_up_node: Optional[str] = None
    follow_up_action: Optional[str] = None
    positions: Optional[List[Position]] = None
    self_tags: Optional[List[SelfTag]] = None
    work_status: Optional[str] = None
    work_description: Optional[str] = None
    basic_info: Optional[str] = None
    assessment: Optional[str] = None
    tags: Optional[str] = None
    traffic_source: Optional[str] = None
    traffic_source_detail: Optional[str] = None
    tracking_plan: Optional[str] = None
    position_sort_orders: Optional[Dict[str, int]] = None
    space_id: Optional[str] = None


class Customer(CustomerBase):
    id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class ChatLogParseRequest(BaseModel):
    chat_log: str
