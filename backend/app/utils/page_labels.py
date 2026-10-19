"""页面改名只改变展示，不改变路由、权限标识或历史数据。"""

DATA_STATISTICS_LABEL = "数据统计"
DATA_STATISTICS_ALIASES = frozenset({"主理人", "组织/俱乐部", "组织俱乐部", DATA_STATISTICS_LABEL})


def canonical_page_name(value: str) -> str:
    return DATA_STATISTICS_LABEL if value in DATA_STATISTICS_ALIASES else value
