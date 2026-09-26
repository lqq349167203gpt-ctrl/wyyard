"""一次性数据迁移：把名称「45次卡」改成「60次卡」。

第一性原理：卡种/会员类型只是名称变了，直接把存储里的名称改掉，代码里就只需要
一个名字，不必再做别名匹配或展示映射。

只替换名称标记「45次卡」→「60次卡」，次数、金额、日期、ID 等一律不动。
可重复执行：库里没有「45次卡」时不会写入任何数据。

用法：
    .venv/bin/python scripts/rename_45_card_to_60.py --dry-run
    .venv/bin/python scripts/rename_45_card_to_60.py
    .venv/bin/python scripts/rename_45_card_to_60.py --include-logs
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2  # noqa: E402

from app.services.storage import DB_URL  # noqa: E402

OLD_NAME = "45次卡"
NEW_NAME = "60次卡"
# 操作日志/系统日志记录的是历史事实（当时确实叫 45次卡），默认不改
LOG_TABLES = {"operation_logs", "system_logs"}


def _replace_names(value):
    """递归替换 JSON 中的名称标记，返回 (新值, 替换处数)。"""
    if isinstance(value, str):
        if OLD_NAME in value:
            return value.replace(OLD_NAME, NEW_NAME), value.count(OLD_NAME)
        return value, 0
    if isinstance(value, list):
        count = 0
        result = []
        for item in value:
            new_item, hits = _replace_names(item)
            count += hits
            result.append(new_item)
        return result, count
    if isinstance(value, dict):
        count = 0
        result = {}
        for key, item in value.items():
            new_item, hits = _replace_names(item)
            count += hits
            result[key] = new_item
        return result, count
    return value, 0


def _name_tables(cur) -> list[str]:
    cur.execute(
        """select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'data'
           order by table_name"""
    )
    return [row[0] for row in cur.fetchall()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="只列出将改动的记录，不写入")
    parser.add_argument("--include-logs", action="store_true", help="连同操作日志/系统日志一起改")
    parser.add_argument("--sample", type=int, default=3, help="每个表打印的样例条数")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    total_rows = 0
    total_hits = 0
    try:
        with conn.cursor() as cur:
            cur.execute("select current_database()")
            print(f"目标库：{cur.fetchone()[0]}")
            if args.include_logs:
                print("范围：全表（含操作日志）")
            else:
                print(f"范围：全表，排除 {'、'.join(sorted(LOG_TABLES))}")
            print()

            for table in _name_tables(cur):
                if not args.include_logs and table in LOG_TABLES:
                    continue
                cur.execute(f'select id, data from "{table}" where data like %s', (f"%{OLD_NAME}%",))
                rows = cur.fetchall()
                if not rows:
                    continue
                changed, hits, samples = 0, 0, []
                for row_id, raw in rows:
                    try:
                        payload = json.loads(raw)
                    except json.JSONDecodeError:
                        print(f"  ! {table}/{row_id} 不是合法 JSON，已跳过")
                        continue
                    new_payload, row_hits = _replace_names(payload)
                    if not row_hits:
                        continue
                    changed += 1
                    hits += row_hits
                    if len(samples) < args.sample:
                        samples.append(row_id)
                    if not args.dry_run:
                        cur.execute(
                            f'update "{table}" set data = %s where id = %s',
                            (json.dumps(new_payload, ensure_ascii=False), row_id),
                        )
                total_rows += changed
                total_hits += hits
                print(f"■ {table}: {changed} 条记录，{hits} 处名称")
                if samples:
                    print(f"    样例 id: {', '.join(samples[:args.sample])}")
    finally:
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
        conn.close()

    action = "将改动" if args.dry_run else "已改动"
    print(f"\n{action} {total_rows} 条记录，共 {total_hits} 处「{OLD_NAME}」→「{NEW_NAME}」")
    if args.dry_run:
        print("（dry-run，未写入任何数据）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
