from pydantic import BaseModel, ConfigDict


class SafeBaseModel(BaseModel):
    """默认安全基类：字符串字段自动加 max_length 上限"""
    model_config = ConfigDict(str_max_length=10000)


class StrictBaseModel(SafeBaseModel):
    """严格模式：用于 API 接收端的 Create/Update 模型，拒绝多余字段"""
    model_config = ConfigDict(extra="forbid", str_max_length=10000)
