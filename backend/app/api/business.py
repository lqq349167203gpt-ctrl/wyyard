from fastapi import APIRouter, HTTPException

from app.models.business import FeishuTableCreate
from app.services.feishu import feishu_service

router = APIRouter(prefix="/api/business", tags=["business"])

# 已关联的表格（内存存储，后续换数据库）
_linked_tables: list[dict] = []


@router.get("/tables")
async def list_tables():
    return _linked_tables


@router.post("/tables")
async def link_table(data: FeishuTableCreate):
    try:
        tables = feishu_service.list_tables(data.app_token)
        matched = [t for t in tables if t.get("table_id") == data.table_id]
        table_name = matched[0].get("name", data.name) if matched else data.name

        entry = {
            "id": data.table_id,
            "name": table_name,
            "app_token": data.app_token,
            "table_id": data.table_id,
            "record_count": 0,
            "sync_status": "pending",
            "last_synced_at": None,
        }
        _linked_tables.append(entry)
        return entry
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tables/{table_id}/records")
async def get_records(table_id: str, app_token: str):
    try:
        records = feishu_service.list_records(app_token, table_id)
        for t in _linked_tables:
            if t["table_id"] == table_id and t["app_token"] == app_token:
                t["record_count"] = len(records)
                t["sync_status"] = "synced"
                from datetime import datetime, timezone
                t["last_synced_at"] = datetime.now(timezone.utc).isoformat()
                break
        return {"records": records, "total": len(records)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tables/{table_id}/sync")
async def sync_table(table_id: str, app_token: str):
    try:
        records = feishu_service.list_records(app_token, table_id)
        for t in _linked_tables:
            if t["table_id"] == table_id and t["app_token"] == app_token:
                t["record_count"] = len(records)
                t["sync_status"] = "synced"
                from datetime import datetime, timezone
                t["last_synced_at"] = datetime.now(timezone.utc).isoformat()
                break
        return {"message": "同步完成", "table_id": table_id, "record_count": len(records)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/tables/{table_id}")
async def unlink_table(table_id: str, app_token: str):
    global _linked_tables
    _linked_tables = [
        t for t in _linked_tables
        if not (t["table_id"] == table_id and t["app_token"] == app_token)
    ]
    return {"message": "已移除"}
