from fastapi import APIRouter

router = APIRouter(prefix="/api/business", tags=["business"])


@router.get("/tables")
async def list_tables():
    return []


@router.post("/tables/{table_id}/sync")
async def sync_table(table_id: str):
    return {"message": "同步已触发", "table_id": table_id}
