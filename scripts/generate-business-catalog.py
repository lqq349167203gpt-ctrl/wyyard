#!/usr/bin/env python3
"""从唯一业务目录生成各端静态配置；--check 仅检查，不写文件。"""

import argparse
import json
from pathlib import Path
from pprint import pformat

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "shared/business-catalog.json"
NOTICE = "由 shared/business-catalog.json 生成，请修改源文件后运行 python3 scripts/generate-business-catalog.py。"


def validate_catalog(data):
    def unique(values, label):
        if not values or any(not isinstance(value, str) or not value.strip() for value in values) or len(set(values)) != len(values):
            raise ValueError(f"{label}不能为空或重复")

    unique([item["name"] for item in data["membership_cards"]], "会员卡名称")
    for field in ("activity_name", "payment_name"):
        unique([item[field] for item in data["learning_courses"]], f"课程{field}")
    for key in ("offline_course_types", "oh_reading_types"):
        unique(data[key], key)
    for item in data["membership_cards"] + data["learning_courses"]:
        if not isinstance(item["price"], (int, float)) or item["price"] < 0:
            raise ValueError("默认价格必须为非负数")
        months = item["duration_months"]
        if months is not None and (type(months) is not int or months <= 0):
            raise ValueError("默认有效期必须为正整数月或空")
    for item in data["membership_cards"]:
        if item["count"] is not None and (type(item["count"]) is not int or item["count"] <= 0):
            raise ValueError("固定卡默认次数必须为正整数；人工填写时使用空值")
    for item in data["learning_courses"]:
        if type(item["legacy"]) is not bool or item["duration_months"] is None:
            raise ValueError("课程必须明确历史分组和默认有效期")


def render_outputs(data):
    validate_catalog(data)
    values = {
        "BUSINESS_LABELS": data["labels"],
        "MEMBERSHIP_CATALOG": data["membership_cards"],
        "LEARNING_CATALOG": data["learning_courses"],
        "OFFLINE_COURSE_TYPES": data["offline_course_types"],
        "OH_READING_TYPES": data["oh_reading_types"],
    }
    python = f'"""{NOTICE}"""\n\n' + "\n\n".join(
        f"{key} = {pformat(value, width=110, sort_dicts=False)}" for key, value in values.items()
    ) + "\n"
    typescript = f"// {NOTICE}\n\n" + "\n\n".join(
        f"export const {key} = {json.dumps(value, ensure_ascii=False, indent=2)} as const" for key, value in values.items()
    ) + "\n"
    javascript = f"// {NOTICE}\n\n" + "\n\n".join(
        f"const {key} = {json.dumps(value, ensure_ascii=False, indent=2)}" for key, value in values.items()
    ) + "\n\nmodule.exports = { " + ", ".join(values) + " }\n"
    return {
        ROOT / "backend/app/utils/business_catalog_data.py": python,
        ROOT / "frontend/src/lib/business-catalog-data.ts": typescript,
        ROOT / "miniprogram/utils/business-catalog-data.js": javascript,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="检查各端配置是否与唯一目录一致")
    args = parser.parse_args()
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    stale = []
    for path, content in render_outputs(data).items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.write_text(content, encoding="utf-8")
    if stale:
        parser.exit(1, "业务目录未同步：\n" + "\n".join(stale) + "\n请运行 python3 scripts/generate-business-catalog.py\n")
    print("业务目录三端同步检查通过" if args.check else "已生成业务目录三端配置")


if __name__ == "__main__":
    main()
