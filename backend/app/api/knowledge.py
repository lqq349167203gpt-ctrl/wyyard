from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services import knowledge
from app.graphs.rag_graph import build_rag_graph

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/documents")
async def list_documents():
    return knowledge.list_documents()


@router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件不能超过 10MB")
    return knowledge.upload_document(file.filename, content)


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    if not knowledge.delete_document(doc_id):
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"message": "已删除"}


@router.get("/search")
async def search_documents(query: str, top_k: int = 5):
    return knowledge.search(query, top_k=top_k)


@router.post("/chat")
async def chat_with_knowledge(query: str):
    graph = build_rag_graph()
    result = graph.invoke({
        "messages": [HumanMessage(content=query)],
        "system_prompt": "你是一个知识库助手，基于检索到的内容准确回答问题。",
        "model": settings.llm_model,
        "context": "",
    })
    ai_message = result["messages"][-1]
    return {"answer": ai_message.content, "context": result.get("context", "")}


# 需要的导入
from langchain_core.messages import HumanMessage
from app.config.settings import settings
