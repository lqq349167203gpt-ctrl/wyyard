from fastapi import APIRouter

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("")
async def list_knowledge_bases():
    return []


@router.get("/{kb_id}/documents")
async def list_documents(kb_id: str):
    return []
