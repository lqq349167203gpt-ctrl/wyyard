import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from app.middleware.jwt_auth import require_admin

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "materials")
UPLOAD_DIR = os.path.normpath(UPLOAD_DIR)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/materials")
async def upload_material(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="文件大小不能超过 10MB")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    file_id = str(uuid.uuid4())[:12]
    saved_name = f"{file_id}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_name)

    with open(saved_path, "wb") as f:
        f.write(content)

    return {
        "id": file_id,
        "name": file.filename or saved_name,
        "url": f"/api/uploads/materials/{saved_name}",
        "size": len(content),
    }


def _safe_path(filename: str) -> str:
    file_path = os.path.normpath(os.path.join(UPLOAD_DIR, filename))
    if not file_path.startswith(os.path.normpath(UPLOAD_DIR) + os.sep) and file_path != os.path.normpath(UPLOAD_DIR):
        raise HTTPException(status_code=400, detail="非法文件名")
    return file_path


@router.get("/materials/{filename}")
async def get_material(filename: str):
    file_path = _safe_path(filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(file_path)


@router.delete("/materials/{filename}")
async def delete_material(filename: str, _admin: str = Depends(require_admin)):
    file_path = _safe_path(filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    os.remove(file_path)
    return {"message": "删除成功"}
