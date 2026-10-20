"""升单配置：若干「大类」（名字 + 一组付费项目），数组顺序即升单先后顺序。"""

import threading
import uuid

from app.models.upsell_config import PURCHASE_RULE_LABELS, PurchaseRule, UpsellLevel
from app.services.storage import load_data, save_data

UPSELL_FILE = "upsell_levels.json"

_lock = threading.RLock()
_levels: list[UpsellLevel] = []
_rules: list[PurchaseRule] | None = None


def _load() -> None:
    global _levels, _rules
    raw = load_data(UPSELL_FILE)
    # 一条整体配置：id 固定为 order，方便整体覆盖保存
    stored = raw.get("order") or {}
    _levels = [UpsellLevel(**item) for item in stored.get("levels", [])]
    _rules = [PurchaseRule(**item) for item in stored["rules"]] if "rules" in stored else None


_load()


def list_levels() -> list[dict]:
    if _rules is not None:
        return [{"id": rule.key, "name": PURCHASE_RULE_LABELS[rule.key], "products": list(dict.fromkeys(product for condition in rule.conditions for product in (condition.products or [condition.product])))} for rule in _rules]
    return [level.model_dump(mode="json") for level in _levels]


def rules_configured() -> bool:
    return _rules is not None


def _rule_dict(rule):
    result = rule.model_dump(mode="json")
    for condition in result["conditions"]:
        for key, default in (("products", []), ("count_scope", "subtype"), ("first_purchase", False), ("previous_products", [])):
            if condition[key] == default:
                condition.pop(key)
        if not condition.get("product"):
            condition.pop("product", None)
    return result


def list_rules() -> list[dict]:
    by_key = {rule.key: rule for rule in (_rules or [])}
    return [_rule_dict(by_key.get(key, PurchaseRule(key=key))) for key in PURCHASE_RULE_LABELS]


def replace_rules(rules: list[PurchaseRule]) -> list[dict]:
    """先持久化再切换内存，不改写或删除旧档位备份。"""
    global _rules
    with _lock:
        by_key = {rule.key: rule for rule in rules}
        normalized = [by_key[key].model_copy(deep=True) for key in PURCHASE_RULE_LABELS]
        save_data(UPSELL_FILE, {"order": {
            "levels": [level.model_dump(mode="json") for level in _levels],
            "rules": [_rule_dict(rule) for rule in normalized],
        }})
        _rules = normalized
    return list_rules()


def recommended_rules() -> list[dict]:
    """可预览、保存的业务方案，不自动覆盖数据库中的规则。"""
    from app.utils.payment_types import MEMBERSHIP_CARD_TYPES

    big = [f"membership:{name}" for name in MEMBERSHIP_CARD_TYPES if name not in {"次卡", "体验会员"}]
    big += ["group_case", "emotional", "online_tea", "energy", "internal", "offline"]
    return [
        {"key": "experience", "conditions": [{"products": ["membership:次卡", "coarse"], "operator": "gte", "count": 1, "count_scope": "group"}]},
        {"key": "conversion", "conditions": [
            {"product": "membership:体验会员", "operator": "gte", "count": 1},
            {"products": big, "operator": "gte", "count": 1, "count_scope": "group", "first_purchase": True},
        ]},
        {"key": "upsell", "conditions": [{"products": big, "operator": "gte", "count": 1, "count_scope": "group", "previous_products": ["membership:体验会员"]}]},
        {"key": "repurchase", "conditions": [{"products": big, "operator": "gte", "count": 2, "count_scope": "group"}]},
    ]


def classify_purchases(events: list[dict], rules: list[dict] | None = None) -> None:
    """先按完整成交历史分类，再由调用方筛选周期；组合计数允许跨项目累计。"""
    from collections import defaultdict

    counts = defaultdict(int)
    previous_counts = defaultdict(dict)
    group_counts = defaultdict(int)
    customer_counts = defaultdict(int)
    configured = list_rules() if rules is None else rules
    timeline = sorted(events, key=lambda item: (
        (item.get("deal_date") or "") if item.get("kind") == "coarse_usage" else item.get("date", ""),
        item.get("recorded_at", ""), item.get("id", ""),
    ))

    def matches_item(item, product, subtype):
        selected_product, selected_subtype = parse_item(item)
        return selected_product == product and (not selected_subtype or selected_subtype == subtype)

    for event in timeline:
        product, subtype, customer = event["product"], event.get("subtype") or "", event["customer_id"]
        occurrence = counts[(customer, product, subtype)] + 1
        matches = []
        for rule_index, rule in enumerate(configured):
            matched = False
            for index, condition in enumerate(rule["conditions"]):
                selected = condition.get("products") or [condition.get("product", "")]
                if not any(matches_item(item, product, subtype) for item in selected):
                    continue
                group_key = (customer, rule_index, index)
                group_counts[group_key] += 1
                count = group_counts[group_key] if condition.get("count_scope") == "group" else occurrence
                previous = condition.get("previous_products") or []
                prior_match = not previous or any(
                    times > 0 and any(matches_item(item, prior_product, prior_subtype) for item in previous)
                    for (prior_product, prior_subtype), times in previous_counts[customer].items()
                )
                if condition.get("first_purchase") and customer_counts[customer]:
                    continue
                if prior_match and (count == condition["count"] or (condition["operator"] == "gte" and count >= condition["count"])):
                    matched = True
            if matched:
                matches.append(rule["key"])
        counts[(customer, product, subtype)] += 1
        previous_counts[customer][(product, subtype)] = occurrence
        customer_counts[customer] += 1
        event["repeat_times"] = occurrence
        event["purchase_rule_keys"] = matches
        event["purchase_rule_labels"] = [PURCHASE_RULE_LABELS[key] for key in matches]
        event["classification"] = "、".join(event["purchase_rule_labels"]) or "未匹配"
        event["is_upsell"] = "upsell" in matches


def replace_levels(levels: list[UpsellLevel]) -> list[dict]:
    """整体保存：前端一次提交排好序的大类列表。"""
    with _lock:
        normalized: list[UpsellLevel] = []
        for level in levels:
            level_id = level.id or uuid.uuid4().hex[:12]
            normalized.append(level.model_copy(update={"id": level_id}))
        global _levels
        _levels = normalized
        save_data(UPSELL_FILE, {"order": {"levels": [level.model_dump(mode="json") for level in _levels]}})
    return list_levels()


def parse_item(item: str) -> tuple[str, str]:
    """把配置项拆成（付费项目, 卡种）；卡种为空表示这个大项下的所有卡种。"""
    product, _, subtype = item.partition(":")
    return product, subtype


def level_order() -> list[list[tuple[str, str]]]:
    """按升单顺序返回每一档包含的项目，每项是（付费项目, 卡种）。"""
    return [[parse_item(item) for item in level.products] for level in _levels]
