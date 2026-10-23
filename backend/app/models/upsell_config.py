"""购买规则；保留旧档位模型供兼容读取。"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, PrivateAttr, model_validator

from app.models.base import StrictBaseModel


class UpsellLevel(StrictBaseModel):
    id: str = Field(default="", max_length=64)
    # 大类的名字，比如「体验」「正价」
    name: str = Field(min_length=1, max_length=20)
    # 这个大类里包含哪些付费项目（key），不区分先后
    products: list[str] = Field(min_length=1, max_length=20)


class UpsellConfigUpdate(StrictBaseModel):
    _legacy_rules: bool = PrivateAttr(default=False)
    # 数组顺序＝升单先后顺序
    levels: list[UpsellLevel] | None = Field(default=None, max_length=20)
    rules: list[PurchaseRule] | None = Field(default=None, max_length=5)

    @model_validator(mode="after")
    def validate_mode(self):
        if (self.levels is None) == (self.rules is None):
            raise ValueError("请提交五类规则；旧接口兼容模式仅接受档位配置")
        if self.rules is not None:
            keys = [rule.key for rule in self.rules]
            if len(keys) != len(set(keys)):
                raise ValueError("规则不能重复")
            # 兼容已保存的四类规则及旧客户端；新增梳理默认为空，不改变旧统计。
            if set(keys) == set(PURCHASE_RULE_LABELS) - {"assessment"}:
                self._legacy_rules = True
                self.rules.append(PurchaseRule(key="assessment"))
            if {rule.key for rule in self.rules} != set(PURCHASE_RULE_LABELS):
                raise ValueError("规则必须完整包含体验、转化、梳理、升单、复购")
            problems = configuration_problems(self.rules)
            if problems:
                raise ValueError("；".join(problems))
        return self


PURCHASE_RULE_LABELS = {"experience": "体验", "conversion": "转化", "assessment": "梳理", "upsell": "升单", "repurchase": "复购"}


class PurchaseCondition(StrictBaseModel):
    event_kind: Literal["purchase", "attendance"] = "purchase"
    public_welfare_only: bool = False
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
        if self.event_kind == "purchase" and self.public_welfare_only:
            raise ValueError("仅公益场次只适用于参与课程条件")
        if self.event_kind == "attendance" and self.first_purchase:
            raise ValueError("参与课程不能使用首次购买条件")
        if self.first_purchase and self.previous_products:
            raise ValueError("首次购买不能同时要求此前已购买")
        if self.first_purchase and self.count != 1:
            raise ValueError("从未购买的客户只能匹配第 1 笔购买")
        if set(self.previous_products) & set(self.excluded_previous_products):
            raise ValueError("同一项目不能同时要求之前买过和之前没买过")
        if not self.product and not self.products:
            raise ValueError("请选择付费项目或参与课程")
        if self.product and self.products:
            raise ValueError("单项目与项目组合不能同时配置")
        return self


class PurchaseRule(StrictBaseModel):
    key: Literal["experience", "conversion", "assessment", "upsell", "repurchase"]
    previous_stage: Literal["", "experience", "conversion", "upsell"] = ""
    once: bool = False
    count_from: Literal["history", "previous_stage"] = "history"
    conditions: list[PurchaseCondition] = Field(default_factory=list, max_length=100)


    @model_validator(mode="after")
    def validate_stage(self):
        if self.count_from == "previous_stage" and not self.previous_stage:
            raise ValueError("阶段后累计必须选择前置阶段")
        if self.key != "experience" and any(c.event_kind == "attendance" for c in self.conditions):
            raise ValueError("参与课程条件仅用于体验统计")
        stages = list(PURCHASE_RULE_LABELS)
        if self.previous_stage and stages.index(self.previous_stage) >= stages.index(self.key):
            raise ValueError("前置阶段必须早于当前阶段")
        return self


def _covers(parent: str, child: str) -> bool:
    kind, _, subtype = parent.partition(":")
    child_kind, _, child_subtype = child.partition(":")
    return kind == child_kind and (not subtype or subtype == child_subtype)


def _selected(condition):
    return condition.products or [condition.product]


def configuration_problems(rules: list[PurchaseRule]) -> list[str]:
    """保存时防错，读取旧配置仅提示；不因历史错误导致服务无法启动。"""
    problems = []
    by_key = {r.key: r for r in rules}
    for rule in rules:
        label = PURCHASE_RULE_LABELS[rule.key]
        if rule.conditions and rule.previous_stage and not getattr(by_key.get(rule.previous_stage), "conditions", []):
            problems.append(f"{label}的前置阶段未配置条件")
        for i, condition in enumerate(rule.conditions, 1):
            if condition.previous_products and all(
                any(_covers(excluded, required) for excluded in condition.excluded_previous_products)
                for required in condition.previous_products
            ):
                problems.append(f"{label}条件{i}：之前买过的项目全部被之前没买排除（含大类与卡种）")

    def ancestors(rule):
        result = set()
        previous = rule.previous_stage
        while previous and previous not in result:
            result.add(previous)
            previous = by_key[previous].previous_stage if previous in by_key else ""
        return result

    def disjoint(a, b, x, y):
        if x.event_kind != y.event_kind or not any(_covers(p, q) or _covers(q, p) for p in _selected(x) for q in _selected(y)):
            return True
        # 前置阶段已完成时，“仅首次”阶段不可能再次命中。
        if (a.once and a.key in ancestors(b)) or (b.once and b.key in ancestors(a)):
            return True
        for left, right in ((x, y), (y, x)):
            if left.first_purchase and (right.previous_products or right.count > 1):
                return True
            if right.previous_products and all(any(_covers(ex, req) for ex in left.excluded_previous_products) for req in right.previous_products):
                return True
        same_origin = a.count_from == b.count_from and (a.count_from == "history" or a.previous_stage == b.previous_stage)
        same_counter = (x.count_scope == y.count_scope == "subtype" or
                        x.count_scope == y.count_scope == "group" and set(_selected(x)) == set(_selected(y)))
        if same_origin and same_counter:
            if x.operator == y.operator == "eq" and x.count != y.count:
                return True
            if x.operator == "eq" and y.operator == "gte" and x.count < y.count:
                return True
            if y.operator == "eq" and x.operator == "gte" and y.count < x.count:
                return True
        return False

    stages = [by_key[k] for k in ("conversion", "upsell", "repurchase") if k in by_key]
    for i, a in enumerate(stages):
        for b in stages[i + 1:]:
            if any(not disjoint(a, b, x, y) for x in a.conditions for y in b.conditions):
                problems.append(f"{PURCHASE_RULE_LABELS[a.key]}与{PURCHASE_RULE_LABELS[b.key]}条件可能重叠：请区分次数，或设置前置阶段并限制该阶段仅首次达成")
    return problems


UpsellConfigUpdate.model_rebuild()
