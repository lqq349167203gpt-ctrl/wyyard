from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.models.customer import CustomerCreate, CustomerUpdate, ChatLogParseRequest
from app.services import customer_service
from app.services.visit_service import count_customer_visits
from app.services.chat_parser import parse_chat_log, generate_tags
from app.services.excel_parser import parse_excel

router = APIRouter(prefix="/api/customers", tags=["customers"])


class TagsGenerateRequest(BaseModel):
    tags: str


def _fill_visit_count(customer):
    """填充历史到场次数"""
    data = customer.model_dump(mode="json")
    data["visit_count"] = count_customer_visits(customer.id)
    return data


@router.get("")
async def list_customers():
    customers = customer_service.list_customers()
    return [_fill_visit_count(c) for c in customers]


@router.post("")
async def create_customer(data: CustomerCreate):
    customer = customer_service.create_customer(data)
    return _fill_visit_count(customer)


@router.get("/{customer_id}")
async def get_customer(customer_id: str):
    customer = customer_service.get_customer(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    return _fill_visit_count(customer)


@router.patch("/{customer_id}")
async def update_customer(customer_id: str, data: CustomerUpdate):
    customer = customer_service.update_customer(customer_id, data)
    if not customer:
        raise HTTPException(status_code=404, detail="客户不存在")
    return _fill_visit_count(customer)


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str):
    if not customer_service.delete_customer(customer_id):
        raise HTTPException(status_code=404, detail="客户不存在")
    return {"message": "已删除"}


@router.post("/parse-chat")
async def parse_chat(data: ChatLogParseRequest):
    try:
        result = parse_chat_log(data.chat_log)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


@router.post("/parse-excel")
async def parse_excel_file(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="请上传 Excel 文件（.xlsx 或 .xls）")
    try:
        content = await file.read()
        results = parse_excel(content)
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


@router.post("/generate-tags")
async def generate_tags_endpoint(data: TagsGenerateRequest):
    try:
        result = generate_tags(data.tags)
        return {"tags": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")
