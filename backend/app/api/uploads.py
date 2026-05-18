import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "materials")
UPLOAD_DIR = os.path.normpath(UPLOAD_DIR)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("/materials")
async def upload_material(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    file_id = str(uuid.uuid4())[:8]
    saved_name = f"{file_id}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_name)

    content = await file.read()
    with open(saved_path, "wb") as f:
        f.write(content)

    return {
        "id": file_id,
        "name": file.filename or saved_name,
        "url": f"/api/uploads/materials/{saved_name}",
        "size": len(content),
    }


@router.get("/materials/{filename}")
async def get_material(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(file_path)


@router.delete("/materials/{filename}")
async def delete_material(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    os.remove(file_path)
    return {"message": "删除成功"}
