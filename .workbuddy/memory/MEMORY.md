# wyyard 项目长期备忘

## 用户工作习惯
- 不要跑高强度验证（全量 pytest、npm build、tsc 全量类型检查在这台机器上容易被 OOM kill 且用户嫌重）。验证以轻量为主：针对性单测 + ruff + 语法检查即可，重型验证留给用户本地跑。
- 后端测试需在 backend/ 目录下运行（.env 加载 JWT_SECRET）；直接调用 endpoint 函数的测试要注意 FastAPI Query 默认值是 Query 对象，需用 isinstance 归一化。
- shell 的 cd 前缀会被环境剥离，切目录用 `pushd ... && ... ; popd`。

## 统计页筛选架构（2026-07-30 确立）
- 服务数据(/statistics)、引流统计(/referral-statistics) 的会员类型（多选）/引流人筛选在后端完成，前端不再做列表级过滤
- 筛选项必须由后端返回全量列表（member_type_names / referrer_names），在过滤前收集，防止选中后选项塌缩
- 语义约定：邀约/到访记录的"引流人"= visit.referrer_handler（邀约人）；成交记录= customer.referrer（客户资料引流人）；会员类型都看 customer.member_type
- 会员类型选项排序按 member_identity_service 身份配置倒序（与会员情况页一致）
