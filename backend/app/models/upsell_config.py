"""升单配置：先把若干付费项目归成「大类」并取名，再给这些大类排序，顺序就是升单方向。"""

from pydantic import Field

from app.models.base import StrictBaseModel


class UpsellLevel(StrictBaseModel):
    id: str = Field(default="", max_length=64)
    # 大类的名字，比如「体验」「正价」
    name: str = Field(min_length=1, max_length=20)
    # 这个大类里包含哪些付费项目（key），不区分先后
    products: list[str] = Field(min_length=1, max_length=20)


class UpsellConfigUpdate(StrictBaseModel):
    # 数组顺序＝升单先后顺序
    levels: list[UpsellLevel] = Field(default_factory=list, max_length=20)
