import os
import uuid
from datetime import datetime, timezone

from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from PyPDF2 import PdfReader

from app.config.settings import settings

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../data/uploads")
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "../../data/chroma")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(CHROMA_DIR, exist_ok=True)

_embeddings = OpenAIEmbeddings(
    model="embedding-3",
    api_key=settings.llm_api_key,
    base_url=settings.llm_base_url,
)

_vectorstore = Chroma(
    collection_name="knowledge",
    embedding_function=_embeddings,
    persist_directory=CHROMA_DIR,
)

_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=100,
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
)

# 文档元数据存储
_documents: list[dict] = []


def upload_document(filename: str, content: bytes) -> dict:
    doc_id = str(uuid.uuid4())[:8]
    filepath = os.path.join(UPLOAD_DIR, f"{doc_id}_{filename}")

    with open(filepath, "wb") as f:
        f.write(content)

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
    text = _extract_text(filepath, ext)

    chunks = _text_splitter.split_text(text)
    docs = [
        Document(page_content=chunk, metadata={"doc_id": doc_id, "filename": filename, "chunk": i})
        for i, chunk in enumerate(chunks)
    ]

    if docs:
        _vectorstore.add_documents(docs)

    doc_meta = {
        "id": doc_id,
        "name": filename,
        "type": ext.upper(),
        "size": f"{len(content) / 1024:.1f} KB",
        "status": "indexed",
        "chunk_count": len(chunks),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _documents.append(doc_meta)
    return doc_meta


def _extract_text(filepath: str, ext: str) -> str:
    if ext == "pdf":
        reader = PdfReader(filepath)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()


def list_documents() -> list[dict]:
    return _documents


def search(query: str, top_k: int = 5) -> list[dict]:
    results = _vectorstore.similarity_search_with_score(query, k=top_k)
    return [
        {"content": doc.page_content, "metadata": doc.metadata, "score": float(score)}
        for doc, score in results
    ]


def delete_document(doc_id: str) -> bool:
    global _documents
    before = len(_documents)
    _documents = [d for d in _documents if d["id"] != doc_id]
    if len(_documents) < before:
        _vectorstore._collection.delete(where={"doc_id": doc_id})
        return True
    return False
