import math


def paginate(items: list, page: int = 1, page_size: int = 10) -> dict:
    """通用分页函数

    Args:
        items: 待分页的列表
        page: 页码（从 1 开始）
        page_size: 每页条数

    Returns:
        {
            "items": [...],
            "total": int,
            "page": int,
            "page_size": int,
            "total_pages": int,
        }
    """
    total = len(items)
    total_pages = max(1, math.ceil(total / page_size))
    page = max(1, min(page, total_pages))
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
