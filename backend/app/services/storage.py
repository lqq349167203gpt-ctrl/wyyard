import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = str(DATA_DIR / "wyyard.db")

# 每个线程独立连接，避免 FastAPI 多线程冲突
_local = threading.local()


def _get_conn():
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn


def _table_name(filename: str) -> str:
    return filename.replace(".json", "")


def _ensure_table(table: str):
    conn = _get_conn()
    conn.execute(
        f"CREATE TABLE IF NOT EXISTS [{table}] (id TEXT PRIMARY KEY, data TEXT NOT NULL)"
    )
    conn.commit()


def load_data(filename: str) -> Dict[str, Any]:
    table = _table_name(filename)
    conn = _get_conn()
    _ensure_table(table)
    rows = conn.execute(f"SELECT id, data FROM [{table}]").fetchall()
    result = {}
    for row in rows:
        result[row["id"]] = json.loads(row["data"])

    # customer_ai_config 是唯一不以 ID 为 key 的表：存储为单行，但 load 时返回平铺 dict
    if filename == "customer_ai_config.json" and "default" in result:
        return result["default"]

    return result


def save_data(filename: str, data: Dict[str, Any]):
    table = _table_name(filename)
    conn = _get_conn()
    _ensure_table(table)

    # customer_ai_config：平铺 dict 包装成 {"default": data}
    if filename == "customer_ai_config.json" and not any(
        isinstance(v, dict) for v in data.values()
    ):
        data = {"default": data}

    with conn:
        conn.execute(f"DELETE FROM [{table}]")
        for key, value in data.items():
            conn.execute(
                f"INSERT INTO [{table}] (id, data) VALUES (?, ?)",
                (key, json.dumps(value, ensure_ascii=False)),
            )
