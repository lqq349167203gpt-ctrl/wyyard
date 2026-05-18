from pydantic import BaseModel
from datetime import datetime
from enum import Enum
from typing import Optional


class DocStatus(str, Enum):
    INDEXED = "indexed"
    INDEXING = "indexing"
    FAILED = "failed"


class KnowledgeBase(BaseModel):
    id: str
    name: str
    description: str = ""
    doc_count: int = 0
    created_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class Document(BaseModel):
    id: str
    name: str
    type: str
    size: str
    status: DocStatus
    knowledge_base_id: str
    created_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None


class DocumentUpload(BaseModel):
    knowledge_base_id: str
    filename: str
