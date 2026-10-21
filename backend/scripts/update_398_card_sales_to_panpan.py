"""一次性数据修正：把 398 卡客户中 Sales 不是庄庄的人员统一改为潘潘。

业务口径：
- 只处理未停用、会员身份为「398卡」的客户；
- 保留 Sales=「庄庄」的客户不变；
- 空 Sales、其他 Sales 以及原本就是「潘潘」的客户全部统一为「潘潘」。

脚本先备份目标客户的完整资料，再在单事务内更新并复核；任何数量异常都会
自动回滚。重复执行时不会再次写入相同字段。

用法：
    .venv/bin/python scripts/update_398_card_sales_to_panpan.py --dry-run \
        --expected-total 307 --expected-zhuang 154 --expected-targets 153

    .venv/bin/python scripts/update_398_card_sales_to_panpan.py \
        --backup /root/wyyard_398_sales_before.json \
        --expected-total 307 --expected-zhuang 154 --expected-targets 153
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2  # noqa: E402

from app.services.storage import DB_URL  # noqa: E402

MEMBER_TYPE = "398卡"
UNCHANGED_SALES = "庄庄"
TARGET_SALES = "潘潘"
LOG_SECTION = "客户资料"


def _sales_label(value: str) -> str:
    return (value or "").strip() or "<未填写>"


def _load_targets(cur, *, lock: bool):
    suffix = " FOR UPDATE" if lock else ""
    cur.execute(
        f"""
        SELECT id, data::jsonb, data
        FROM customers
        WHERE COALESCE((data::jsonb->>'is_deleted')::boolean, false) = false
          AND data::jsonb->>'member_type' = %s
          AND COALESCE(trim(data::jsonb->>'service_teacher'), '') <> %s
        ORDER BY id{suffix}
        """,
        (MEMBER_TYPE, UNCHANGED_SALES),
    )
    rows = []
    for item_id, payload, raw_data in cur.fetchall():
        rows.append({"id": item_id, "payload": payload, "raw_data": raw_data})
    return rows


def _identity_counts(cur) -> tuple[int, int]:
    cur.execute(
        """
        SELECT
            count(*) AS total,
            count(*) FILTER (
                WHERE trim(data::jsonb->>'service_teacher') = %s
            ) AS unchanged
        FROM customers
        WHERE COALESCE((data::jsonb->>'is_deleted')::boolean, false) = false
          AND data::jsonb->>'member_type' = %s
        """,
        (UNCHANGED_SALES, MEMBER_TYPE),
    )
    return cur.fetchone()


def _post_update_counts(cur) -> tuple[int, int, int, int, int]:
    cur.execute(
        """
        SELECT
            count(*) AS total,
            count(*) FILTER (
                WHERE trim(data::jsonb->>'service_teacher') = %s
            ) AS unchanged,
            count(*) FILTER (
                WHERE trim(data::jsonb->>'service_teacher') = %s
            ) AS target,
            count(*) FILTER (
                WHERE COALESCE(trim(data::jsonb->>'service_teacher'), '')
                    NOT IN ('', %s, %s)
            ) AS other,
            count(*) FILTER (
                WHERE COALESCE(trim(data::jsonb->>'service_teacher'), '') = ''
            ) AS blank
        FROM customers
        WHERE COALESCE((data::jsonb->>'is_deleted')::boolean, false) = false
          AND data::jsonb->>'member_type' = %s
        """,
        (UNCHANGED_SALES, TARGET_SALES, UNCHANGED_SALES, TARGET_SALES, MEMBER_TYPE),
    )
    return cur.fetchone()


def _write_backup(path: Path, rows: list[dict], distribution: Counter) -> None:
    path = path.expanduser().resolve()
    if path.exists():
        raise FileExistsError(f"备份文件已存在，拒绝覆盖：{path}")
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "member_type": MEMBER_TYPE,
        "unchanged_sales": UNCHANGED_SALES,
        "target_sales": TARGET_SALES,
        "target_count": len(rows),
        "service_teacher_before": dict(sorted(distribution.items())),
        "records": [{"id": row["id"], "data": row["payload"]} for row in rows],
    }
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    with temporary_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary_path, path)

    with path.open("r", encoding="utf-8") as file:
        verified = json.load(file)
    if verified.get("target_count") != len(rows) or len(verified.get("records", [])) != len(rows):
        raise RuntimeError("备份文件校验失败")


def _create_operation_log(
    cur,
    *,
    target_count: int,
    changed_count: int,
    before_distribution: Counter,
    now: str,
) -> None:
    content = (
        f"一次性修正398卡客户Sales：目标{target_count}位，"
        f"实际修改{changed_count}位，统一为「{TARGET_SALES}」；"
        f"Sales=「{UNCHANGED_SALES}」的客户保持不变"
    )
    log = {
        "section": LOG_SECTION,
        "content": content,
        "operator": "系统任务",
        "operator_role": "system",
        "source": "system",
        "method": "SCRIPT",
        "path": "backend/scripts/update_398_card_sales_to_panpan.py",
        "entity_id": "",
        "ip": "",
        "before_data": {
            "会员身份": MEMBER_TYPE,
            "目标客户数": target_count,
            "Sales分布": dict(sorted(before_distribution.items())),
        },
        "after_data": {
            "会员身份": MEMBER_TYPE,
            "Sales": TARGET_SALES,
            "修改客户数": changed_count,
        },
        "created_at": now,
    }
    cur.execute(
        'INSERT INTO operation_logs (id, data) VALUES (%s, %s)',
        (str(uuid.uuid4())[:12], json.dumps(log, ensure_ascii=False)),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="只校验并展示变更，不写入数据库")
    parser.add_argument("--backup", type=Path, help="写入前备份目标客户完整资料；实际写入时必填")
    parser.add_argument("--expected-total", type=int, help="保护校验：当前398卡客户总数")
    parser.add_argument("--expected-zhuang", type=int, help="保护校验：Sales为庄庄的客户数")
    parser.add_argument("--expected-targets", type=int, help="保护校验：Sales不是庄庄的客户数")
    args = parser.parse_args()

    if not args.dry_run and args.backup is None:
        parser.error("实际写入必须通过 --backup 指定备份文件")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database()")
            database_name = cur.fetchone()[0]
            if not args.dry_run:
                cur.execute("LOCK TABLE customers IN SHARE ROW EXCLUSIVE MODE")

            total, unchanged = _identity_counts(cur)
            rows = _load_targets(cur, lock=not args.dry_run)
            distribution = Counter(
                _sales_label(row["payload"].get("service_teacher", "")) for row in rows
            )
            to_change = [
                row
                for row in rows
                if (row["payload"].get("service_teacher", "") or "").strip() != TARGET_SALES
            ]

            print(f"目标库：{database_name}")
            print(f"398卡客户：{total}")
            print(f"Sales=庄庄：{unchanged}")
            print(f"Sales不是庄庄：{len(rows)}")
            print(f"修改前分布：{dict(sorted(distribution.items()))}")
            print(f"预计实际修改：{len(to_change)}")

            checks = (
                ("398卡客户总数", args.expected_total, total),
                ("Sales=庄庄人数", args.expected_zhuang, unchanged),
                ("Sales不是庄庄人数", args.expected_targets, len(rows)),
            )
            for label, expected, actual in checks:
                if expected is not None and expected != actual:
                    raise RuntimeError(f"{label}异常：预期{expected}，实际{actual}")

            if args.dry_run:
                conn.rollback()
                print("\nDRY-RUN：未写入任何数据")
                return 0

            if not to_change:
                conn.rollback()
                print("\n无需修改：目标客户的Sales已经是潘潘")
                return 0

            _write_backup(args.backup, rows, distribution)
            now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            for row in to_change:
                payload = dict(row["payload"])
                payload["service_teacher"] = TARGET_SALES
                payload["updated_at"] = now
                cur.execute(
                    "UPDATE customers SET data = %s WHERE id = %s AND data = %s",
                    (json.dumps(payload, ensure_ascii=False), row["id"], row["raw_data"]),
                )
                if cur.rowcount != 1:
                    raise RuntimeError(f"客户 {row['id']} 更新失败，记录可能已被并发修改")

            after = _post_update_counts(cur)
            expected_after = (total, unchanged, len(rows), 0, 0)
            if after != expected_after:
                raise RuntimeError(f"更新后校验失败：预期{expected_after}，实际{after}")

            _create_operation_log(
                cur,
                target_count=len(rows),
                changed_count=len(to_change),
                before_distribution=distribution,
                now=now,
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(f"\n已备份：{args.backup.expanduser().resolve()}")
    print(f"已完成：{len(to_change)} 位客户的Sales更新为「{TARGET_SALES}」")
    print(
        f"最终状态：398卡客户{total}位，庄庄{unchanged}位，"
        f"潘潘{len(rows)}位，其他0位，未填写0位"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
