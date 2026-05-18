import json
import os
from pathlib import Path
from typing import Any, Dict

# 数据存储目录
DATA_DIR = Path(__file__).parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)


def load_data(filename: str) -> Dict[str, Any]:
    """从 JSON 文件加载数据"""
    filepath = DATA_DIR / filename
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_data(filename: str, data: Dict[str, Any]):
    """保存数据到 JSON 文件"""
    filepath = DATA_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
