"""购买规则；保留旧档位模型供兼容读取。"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.models.base import StrictBaseModel


class UpsellLevel(StrictBaseModel):
    id: str = Field(default="", max_length=64)
    # 大类的名字，比如「体验」「正价」
    name: str = Field(min_length=1, max_length=20)
    # 这个大类里包含哪些付费项目（key），不区分先后
    products: list[str] = Field(min_length=1, max_length=20)


class UpsellConfigUpdate(StrictBaseModel):
    # 数组顺序＝升单先后顺序
    levels: list[UpsellLevel] | None = Field(default=None, max_length=20)
    rules: list[PurchaseRule] | None = Field(default=None, max_length=4)

    @model_validator(mode="after")
    def validate_mode(self):
        if (self.levels is None) == (self.rules is None):
            raise ValueError("请提交四类规则；旧接口兼容模式仅接受档位配置")
        if self.rules is not None and {rule.key for rule in self.rules} != set(PURCHASE_RULE_LABELS):
            raise ValueError("规则必须完整包含体验、转化、升单、复购，且不能重复")
        return self


PURCHASE_RULE_LABELS = {"experience": "体验", "conversion": "转化", "upsell": "升单", "repurchase": "复购"}


class PurchaseCondition(StrictBaseModel):
    product: str = Field(default="", max_length=160)
    products: list[str] = Field(default_factory=list, max_length=100)
    count_scope: Literal["subtype", "group"] = "subtype"
    first_purchase: bool = False
    previous_products: list[str] = Field(default_factory=list, max_length=100)
    excluded_previous_products: list[str] = Field(default_factory=list, max_length=100)
    operator: Literal["eq", "gte"] = "eq"
    count: int = Field(default=1, ge=1, le=100000)


    @model_validator(mode="after")
    def validate_products(self):
        if self.first_purchase and self.previous_products:
            raise ValueError("首次购买不能同时要求此前已购买")
        if self.first_purchase and self.count != 1:
            raise ValueError("从未购买的客户只能匹配第 1 笔购买")
        if set(self.previous_products) & set(self.excluded_previous_products):
            raise ValueError("同一项目不能同时要求之前买过和之前没买过")
        if not self.product and not self.products:
            raise ValueError("请选择付费项目")
        if self.product and self.products:
            raise ValueError("单项目与项目组合不能同时配置")
        return self


class PurchaseRule(StrictBaseModel):
    key: Literal["experience", "conversion", "upsell", "repurchase"]
    previous_stage: Literal["", "experience", "conversion", "upsell"] = ""
    once: bool = False
    conditions: list[PurchaseCondition] = Field(default_factory=list, max_length=100)


    @model_validator(mode="after")
    def validate_stage(self):
        stages = list(PURCHASE_RULE_LABELS)
        if self.previous_stage and stages.index(self.previous_stage) >= stages.index(self.key):
            raise ValueError("前置阶段必须早于当前阶段")
        return self


UpsellConfigUpdate.model_rebuild()
