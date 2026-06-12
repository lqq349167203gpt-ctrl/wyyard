import json
from pathlib import Path
from typing import Any, Dict

import psycopg2
import psycopg2.extras
import psycopg2.pool

DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

from app.config.settings import settings

DB_URL = settings.database_url

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_pool():
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=DB_URL,
        )
    return _pool


def _get_conn():
    return _get_pool().getconn()


def _put_conn(conn):
    _get_pool().putconn(conn)


def _table_name(filename: str) -> str:
    return filename.replace(".json", "")


def _ensure_table(table: str):
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f'CREATE TABLE IF NOT EXISTS "{table}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)'
            )
        conn.commit()
    finally:
        _put_conn(conn)


def load_data(filename: str) -> Dict[str, Any]:
    table = _table_name(filename)
    conn = _get_conn()
    try:
        _ensure_table(table)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f'SELECT id, data FROM "{table}"')
            rows = cur.fetchall()
        result = {}
        for row in rows:
            result[row["id"]] = json.loads(row["data"])

        if filename == "customer_ai_config.json" and "default" in result:
            return result["default"]

        return result
    finally:
        _put_conn(conn)


def save_data(filename: str, data: Dict[str, Any]):
    table = _table_name(filename)
    conn = _get_conn()
    try:
        _ensure_table(table)

        if filename == "customer_ai_config.json" and not any(
            isinstance(v, dict) for v in data.values()
        ):
            data = {"default": data}

        with conn.cursor() as cur:
            cur.execute(f'DELETE FROM "{table}"')
            for key, value in data.items():
                cur.execute(
                    f'INSERT INTO "{table}" (id, data) VALUES (%s, %s)',
                    (key, json.dumps(value, ensure_ascii=False)),
                )
        conn.commit()
    finally:
        _put_conn(conn)


def save_item(filename: str, item_id: str, item_data: Dict[str, Any]):
    """Upsert 单条记录，避免全表重写"""
    table = _table_name(filename)
    conn = _get_conn()
    try:
        _ensure_table(table)
        with conn.cursor() as cur:
            cur.execute(
                f'INSERT INTO "{table}" (id, data) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
                (item_id, json.dumps(item_data, ensure_ascii=False)),
            )
        conn.commit()
    finally:
        _put_conn(conn)


def delete_item(filename: str, item_id: str):
    """删除单条记录"""
    table = _table_name(filename)
    conn = _get_conn()
    try:
        _ensure_table(table)
        with conn.cursor() as cur:
            cur.execute(f'DELETE FROM "{table}" WHERE id = %s', (item_id,))
        conn.commit()
    finally:
        _put_conn(conn)
