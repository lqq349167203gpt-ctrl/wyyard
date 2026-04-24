from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import settings
from app.api.agents import router as agents_router
from app.api.knowledge import router as knowledge_router
from app.api.business import router as business_router

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(knowledge_router)
app.include_router(business_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
