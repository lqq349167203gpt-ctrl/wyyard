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
        return [{"id": rule.key, "name": PURCHASE_RULE_LABELS[rule.key], "products": list(dict.fromkeys(condition.product for condition in rule.conditions))} for rule in _rules]
    return [level.model_dump(mode="json") for level in _levels]


def rules_configured() -> bool:
    return _rules is not None


def list_rules() -> list[dict]:
    by_key = {rule.key: rule for rule in (_rules or [])}
    return [by_key.get(key, PurchaseRule(key=key)).model_dump(mode="json") for key in PURCHASE_RULE_LABELS]


def replace_rules(rules: list[PurchaseRule]) -> list[dict]:
    """先持久化再切换内存，不改写或删除旧档位备份。"""
    global _rules
    with _lock:
        by_key = {rule.key: rule for rule in rules}
        normalized = [by_key[key].model_copy(deep=True) for key in PURCHASE_RULE_LABELS]
        save_data(UPSELL_FILE, {"order": {
            "levels": [level.model_dump(mode="json") for level in _levels],
            "rules": [rule.model_dump(mode="json") for rule in normalized],
        }})
        _rules = normalized
    return list_rules()


def classify_purchases(events: list[dict], rules: list[dict] | None = None) -> None:
    """按全历史的具体子类型计第几笔，再由调用方按成交日期筛选周期。"""
    from collections import defaultdict

    counts: dict[tuple[str, str, str], int] = defaultdict(int)
    configured = list_rules() if rules is None else rules
    timeline = sorted(events, key=lambda item: (
        (item.get("deal_date") or "") if item.get("kind") == "coarse_usage" else item.get("date", ""),
        item.get("recorded_at", ""), item.get("id", ""),
    ))
    for event in timeline:
        product, subtype = event["product"], event.get("subtype") or ""
        counter_key = (event["customer_id"], product, subtype)
        counts[counter_key] += 1
        occurrence = counts[counter_key]
        matches = []
        for rule in configured:
            for condition in rule["conditions"]:
                selected_product, selected_subtype = parse_item(condition["product"])
                if selected_product != product or (selected_subtype and selected_subtype != subtype):
                    continue
                if occurrence == condition["count"] or (condition["operator"] == "gte" and occurrence >= condition["count"]):
                    matches.append(rule["key"])
                    break
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
