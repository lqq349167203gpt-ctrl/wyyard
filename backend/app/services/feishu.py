import json
import lark_oapi as lark
from lark_oapi.api.bitable.v1 import (
    ListAppTableRequest,
    ListAppTableRecordRequest,
    GetAppTableRecordRequest,
    CreateAppTableRecordRequest,
)

from app.config.settings import settings


def _to_dict(obj) -> dict:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "__dict__"):
        return {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
    return json.loads(json.dumps(obj, default=str))


class FeishuService:
    def __init__(self):
        self.client = lark.Client.builder() \
            .app_id(settings.feishu_app_id) \
            .app_secret(settings.feishu_app_secret) \
            .log_level(lark.LogLevel.WARNING) \
            .build()

    def list_tables(self, app_token: str) -> list[dict]:
        req = ListAppTableRequest.builder().app_token(app_token).build()
        resp = self.client.bitable.v1.app_table.list(req)
        if not resp.success():
            raise Exception(f"获取表格列表失败: {resp.code} - {resp.msg}")
        return [_to_dict(item) for item in resp.data.items] if resp.data.items else []

    def list_records(self, app_token: str, table_id: str, page_size: int = 20) -> list[dict]:
        req = ListAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .page_size(page_size) \
            .build()
        resp = self.client.bitable.v1.app_table_record.list(req)
        if not resp.success():
            raise Exception(f"获取记录失败: {resp.code} - {resp.msg}")
        return [_to_dict(item) for item in resp.data.items] if resp.data.items else []

    def get_record(self, app_token: str, table_id: str, record_id: str) -> dict:
        req = GetAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .record_id(record_id) \
            .build()
        resp = self.client.bitable.v1.app_table_record.get(req)
        if not resp.success():
            raise Exception(f"获取记录失败: {resp.code} - {resp.msg}")
        return _to_dict(resp.data.record)

    def create_record(self, app_token: str, table_id: str, fields: dict) -> dict:
        from lark_oapi.api.bitable.v1 import AppTableRecord
        record = AppTableRecord.builder().fields(fields).build()
        req = CreateAppTableRecordRequest.builder() \
            .app_token(app_token) \
            .table_id(table_id) \
            .request_body(record) \
            .build()
        resp = self.client.bitable.v1.app_table_record.create(req)
        if not resp.success():
            raise Exception(f"创建记录失败: {resp.code} - {resp.msg}")
        return _to_dict(resp.data.record)


feishu_service = FeishuService()
