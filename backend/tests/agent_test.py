"""
6 角色 Agent 真实业务流程测试
每个 Agent 模拟一个员工的日常工作，验证功能正确性
"""
import json
import sys
import os
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.middleware.jwt_auth import create_access_token, decode_token
from app.models.account import AccountCreate, AccountUpdate
from app.services import account_service, session_service

client = TestClient(app)

# ─── 种子账号：不存在则自动创建（测试专用，密码统一） ──────────────────────────

TEST_PASSWORD = "Test@12345"

# agent 名 -> (username, owner, role)；角色按各 Agent 职责设定
ROLE_MAP = {
    "A1_管理者": ("test_mgr", "测试管理者", "超级管理员"),
    "A2_课程老师": ("test_teacher", "测试课程老师", "课程部"),
    "A3_数据统计": ("test_stats", "测试数据统计", "数据部"),
    "A4_邀约人员": ("test_invite", "测试邀约专员", "邀约部"),
    "A5_付费销卡": ("test_payment", "测试付费销卡", "销售部"),
    "A6_配置提醒": ("test_config", "测试配置提醒", "运营部"),
}

TOKENS = {}
for agent_name, (username, owner, role) in ROLE_MAP.items():
    acc = account_service.get_by_username(username)
    if not acc:
        acc = account_service.create_account(
            AccountCreate(owner=owner, role=role, username=username,
                          password=TEST_PASSWORD, enabled=True)
        )
    elif not acc.enabled:
        account_service.update_account(acc.id, AccountUpdate(enabled=True))
    # 种子账号密码必须可知：若已有账号密码不是测试密码，则重置为测试密码
    if account_service.login(username, TEST_PASSWORD) is None:
        account_service.admin_reset_password(acc.id, TEST_PASSWORD)
        acc = account_service.get_by_username(username)
    token = create_access_token(
        account_id=acc.id,
        username=acc.username,
        owner=acc.owner,
        role=acc.role,
    )
    # 登记 session：账号一旦有活跃 session，中间件会校验 jti，不登记会被当作「已踢出」返回 401
    jti = decode_token(token).get("jti", "")
    if jti:
        session_service.create_session(jti, account_id=acc.id, device_info="pytest-agent-test")
    TOKENS[agent_name] = token

today = date.today().isoformat()
results = {}  # {agent_name: [{status, desc, detail}]}


def report(agent, status, desc, detail=""):
    results.setdefault(agent, []).append({"status": status, "desc": desc, "detail": detail})
    icon = {"ok": "✅", "fail": "❌", "warn": "⚠️"}[status]
    print(f"  {icon} [{agent}] {desc}" + (f" — {detail}" if detail else ""))


def api(agent, method, path, **kwargs):
    """统一请求封装"""
    headers = {"Authorization": f"Bearer {TOKENS[agent]}"}
    resp = getattr(client, method)(path, headers=headers, **kwargs)
    return resp


# ═════════════════════════════════════════════════════════════════════════════
# Agent 1：管理者（超级管理员）
# ═════════════════════════════════════════════════════════════════════════════
def test_a1_manager():
    A = "A1_管理者"
    print(f"\n{'='*60}\n  Agent 1：管理者\n{'='*60}")

    # 1. 登录验证（使用种子账号，不使用真实凭据）
    resp = client.post("/api/accounts/login", json={"username": "test_mgr", "password": TEST_PASSWORD})
    if resp.status_code == 200 and resp.json().get("success"):
        report(A, "ok", "登录成功", f"权限页面 {len(resp.json().get('permissions', []))} 个")
    else:
        report(A, "fail", "登录失败", resp.text[:100])

    # 2. 查看客户列表
    resp = api(A, "get", "/api/customers?page=1&page_size=5")
    if resp.status_code == 200:
        data = resp.json()
        report(A, "ok", "客户列表", f"总数 {data.get('total', 0)}，返回 {len(data.get('items', []))} 条")
    else:
        report(A, "fail", "客户列表失败", f"{resp.status_code}")

    # 3. 查看客户详情
    resp = api(A, "get", "/api/customers?page=1&page_size=1")
    if resp.status_code == 200 and resp.json().get("items"):
        cid = resp.json()["items"][0]["id"]
        resp2 = api(A, "get", f"/api/customers/{cid}")
        if resp2.status_code == 200:
            report(A, "ok", "客户详情", f"id={cid}")
        else:
            report(A, "fail", "客户详情失败", f"{resp2.status_code}")

    # 4. 查看消费记录
    resp = api(A, "get", "/api/consumption-records/payments?page=1&page_size=5")
    if resp.status_code == 200:
        data = resp.json()
        report(A, "ok", "付费记录", f"总数 {data.get('total', 0)}")
    else:
        report(A, "fail", "付费记录失败", f"{resp.status_code}")

    # 5. 查看销卡记录
    resp = api(A, "get", "/api/consumption-records/deductions?page=1&page_size=5")
    if resp.status_code == 200:
        data = resp.json()
        report(A, "ok", "销卡记录", f"总数 {data.get('total', 0)}")
    else:
        report(A, "fail", "销卡记录失败", f"{resp.status_code}")

    # 6. 查看活动日历
    resp = api(A, "get", f"/api/class-records?date={today}")
    if resp.status_code == 200:
        report(A, "ok", "活动日历", f"今日 {len(resp.json())} 条")
    else:
        report(A, "fail", "活动日历失败", f"{resp.status_code}")

    # 7. 查看业务提醒
    resp = api(A, "get", "/api/business-reminders")
    if resp.status_code == 200:
        report(A, "ok", "业务提醒", f"{len(resp.json())} 条")
    else:
        report(A, "fail", "业务提醒失败", f"{resp.status_code}")

    # 8. 查看操作日志
    resp = api(A, "get", "/api/operation-logs?page=1&page_size=5")
    if resp.status_code == 200:
        report(A, "ok", "操作日志", f"总数 {resp.json().get('total', 0)}")
    else:
        report(A, "fail", "操作日志失败", f"{resp.status_code}")

    # 9. 查看账号列表
    resp = api(A, "get", "/api/accounts")
    if resp.status_code == 200:
        report(A, "ok", "账号列表", f"{len(resp.json())} 个账号")
    else:
        report(A, "fail", "账号列表失败", f"{resp.status_code}")

    # 10. 查看岗位列表
    resp = api(A, "get", "/api/positions")
    if resp.status_code == 200:
        report(A, "ok", "岗位列表", f"{len(resp.json())} 个岗位")
    else:
        report(A, "fail", "岗位列表失败", f"{resp.status_code}")


# ═════════════════════════════════════════════════════════════════════════════
# Agent 2：课程老师
# ═════════════════════════════════════════════════════════════════════════════
def test_a2_teacher():
    A = "A2_课程老师"
    print(f"\n{'='*60}\n  Agent 2：课程老师\n{'='*60}")

    # 1. 查看今日活动
    resp = api(A, "get", f"/api/class-records?date={today}")
    if resp.status_code == 200:
        report(A, "ok", "查看今日活动", f"{len(resp.json())} 条")
    else:
        report(A, "fail", "查看今日活动失败", f"{resp.status_code}")

    # 2. 查看活动配置（课程类型）
    resp = api(A, "get", "/api/course-types")
    if resp.status_code == 200:
        report(A, "ok", "查看课程类型", f"{len(resp.json())} 个")
    else:
        report(A, "fail", "查看课程类型失败", f"{resp.status_code}")

    # 3. 查看疗愈空间
    resp = api(A, "get", "/api/spaces")
    if resp.status_code == 200:
        report(A, "ok", "查看疗愈空间", f"{len(resp.json())} 个")
    else:
        report(A, "fail", "查看疗愈空间失败", f"{resp.status_code}")

    # 4. 查看客户列表（老师需要选参与者）
    resp = api(A, "get", "/api/customers?page=1&page_size=5")
    if resp.status_code == 200:
        data = resp.json()
        report(A, "ok", "查看客户列表", f"总数 {data.get('total', 0)}")
    else:
        report(A, "fail", "查看客户列表失败", f"{resp.status_code}")

    # 5. 创建一场觉醒游戏活动
    resp = api(A, "get", "/api/customers?page=1&page_size=2")
    customer_ids = []
    if resp.status_code == 200 and resp.json().get("items"):
        customer_ids = [c["id"] for c in resp.json()["items"][:2]]

    activity_data = {
        "activity_type": "觉醒游戏",
        "date": today,
        "space_id": "",
        "room_id": "",
        "owner_id": "",
        "owner_name": "",
        "host_id": "",
        "host_name": "",
        "teacher_ids": [],
        "notes": "课程老师Agent自动测试",
    }
    resp = api(A, "post", "/api/group-case-sessions", json=activity_data)
    if resp.status_code == 200:
        session_id = resp.json().get("id")
        report(A, "ok", "创建觉醒游戏活动", f"id={session_id}")

        # 6. 添加参与者
        if session_id and customer_ids:
            resp2 = api(A, "patch", f"/api/group-case-sessions/{session_id}", json={"participant_ids": customer_ids})
            if resp2.status_code == 200:
                report(A, "ok", "添加参与者", f"{len(customer_ids)} 人")
            else:
                report(A, "fail", "添加参与者失败", f"{resp2.status_code}: {resp2.text[:100]}")

        # 7. 删除测试活动
        resp3 = api(A, "delete", f"/api/group-case-sessions/{session_id}")
        if resp3.status_code == 200:
            report(A, "ok", "删除测试活动")
        else:
            report(A, "warn", "删除测试活动失败", f"{resp3.status_code}")
    else:
        report(A, "fail", "创建觉醒游戏活动失败", f"{resp.status_code}: {resp.text[:100]}")

    # 8. 查看历史活动
    resp = api(A, "get", "/api/group-case-sessions")
    if resp.status_code == 200:
        report(A, "ok", "查看历史活动", f"{len(resp.json())} 条")
    else:
        report(A, "fail", "查看历史活动失败", f"{resp.status_code}")

    # 9. 查看情绪释放活动
    resp = api(A, "get", "/api/emotional-release-sessions")
    if resp.status_code == 200:
        report(A, "ok", "查看情绪释放活动", f"{len(resp.json())} 条")
    else:
        report(A, "fail", "查看情绪释放活动失败", f"{resp.status_code}")


# ═════════════════════════════════════════════════════════════════════════════
# Agent 3：数据统计人员
# ═════════════════════════════════════════════════════════════════════════════
def test_a3_stats():
    A = "A3_数据统计"
    print(f"\n{'='*60}\n  Agent 3：数据统计\n{'='*60}")

    # 1. 客户总数
    resp = api(A, "get", "/api/customers?page=1&page_size=1")
    if resp.status_code == 200:
        total = resp.json().get("total", 0)
        report(A, "ok", "客户总数", f"{total}")
    else:
        report(A, "fail", "客户总数失败", f"{resp.status_code}")

    # 2. 按来源筛选
    resp = api(A, "get", "/api/customers?page=1&page_size=5&traffic_source=小红书")
    if resp.status_code == 200:
        report(A, "ok", "按来源筛选(小红书)", f"{resp.json().get('total', 0)} 条")
    else:
        report(A, "fail", "按来源筛选失败", f"{resp.status_code}")

    # 3. 按会员身份筛选
    resp = api(A, "get", "/api/customers?page=1&page_size=5&member_identity=月卡")
    if resp.status_code == 200:
        report(A, "ok", "按会员身份筛选(月卡)", f"{resp.json().get('total', 0)} 条")
    else:
        report(A, "fail", "按会员身份筛选失败", f"{resp.status_code}")

    # 4. 按性别筛选
    resp = api(A, "get", "/api/customers?page=1&page_size=5&gender=女")
    if resp.status_code == 200:
        report(A, "ok", "按性别筛选(女)", f"{resp.json().get('total', 0)} 条")
    else:
        report(A, "fail", "按性别筛选失败", f"{resp.status_code}")

    # 5. 付费记录
    resp = api(A, "get", "/api/consumption-records/payments?page=1&page_size=10")
    if resp.status_code == 200:
        data = resp.json()
        report(A, "ok", "付费记录", f"总数 {data.get('total', 0)}")
    else:
        report(A, "fail", "付费记录失败", f"{resp.status_code}")

    # 6. 销卡记录
    resp = api(A, "get", "/api/consumption-records/deductions?page=1&page_size=10")
    if resp.status_code == 200:
        data = resp.json()
        report(A, "ok", "销卡记录", f"总数 {data.get('total', 0)}")
    else:
        report(A, "fail", "销卡记录失败", f"{resp.status_code}")

    # 7. 日期范围筛选付费记录
    resp = api(A, "get", f"/api/consumption-records/payments?date_from=2025-01-01&date_to={today}&page=1&page_size=5")
    if resp.status_code == 200:
        report(A, "ok", "日期范围筛选付费", f"{resp.json().get('total', 0)} 条")
    else:
        report(A, "fail", "日期范围筛选失败", f"{resp.status_code}")

    # 8. 每日成交总额
    resp = api(A, "get", f"/api/consumption-records/daily-totals?date={today}")
    if resp.status_code == 200:
        report(A, "ok", "每日成交总额", f"{resp.json()}")
    else:
        report(A, "fail", "每日成交总额失败", f"{resp.status_code}")

    # 9. 活动记录统计
    resp = api(A, "get", "/api/class-records")
    if resp.status_code == 200:
        report(A, "ok", "活动记录", f"{len(resp.json())} 条")
    else:
        report(A, "fail", "活动记录失败", f"{resp.status_code}")

    # 10. 会员卡列表
    resp = api(A, "get", "/api/membership-cards?page=1&page_size=5")
    if resp.status_code == 200:
        report(A, "ok", "会员卡列表", f"总数 {resp.json().get('total', 0)}")
    else:
        report(A, "fail", "会员卡列表失败", f"{resp.status_code}")

    # 11. 分页边界测试（paginate 会将超出范围的页码钳制到最后一页）
    resp = api(A, "get", "/api/customers?page=9999&page_size=100")
    if resp.status_code == 200:
        data = resp.json()
        if data.get("page") == data.get("total_pages"):
            report(A, "ok", "分页边界(超大页码)", f"钳制到第 {data.get('page')}/{data.get('total_pages')} 页，返回 {len(data.get('items', []))} 条")
        else:
            report(A, "fail", "分页边界", f"页码未钳制: page={data.get('page')}, total_pages={data.get('total_pages')}")
    else:
        report(A, "fail", "分页边界失败", f"{resp.status_code}")


# ═════════════════════════════════════════════════════════════════════════════
# Agent 4：邀约人员
# ═════════════════════════════════════════════════════════════════════════════
def test_a4_invite():
    A = "A4_邀约人员"
    print(f"\n{'='*60}\n  Agent 4：邀约人员\n{'='*60}")

    # 1. 新建客户
    unique = datetime.now().strftime("%H%M%S%f")
    customer_data = {
        "nickname": f"邀约测试_{unique}",
        "phone": f"1390000{unique[:4]}",
        "gender": "女",
        "traffic_source": "小红书",
        "traffic_source_detail": "https://test.com",
    }
    resp = api(A, "post", "/api/customers", json=customer_data)
    if resp.status_code == 200:
        customer_id = resp.json().get("id")
        report(A, "ok", "新建客户", f"id={customer_id}, 昵称={customer_data['nickname']}")
    else:
        report(A, "fail", "新建客户失败", f"{resp.status_code}: {resp.text[:100]}")
        customer_id = None

    if not customer_id:
        report(A, "fail", "后续测试跳过", "无客户ID")
        return

    # 2. 修改客户信息
    resp = api(A, "patch", f"/api/customers/{customer_id}", json={"wechat": f"test_wx_{unique}"})
    if resp.status_code == 200:
        report(A, "ok", "修改客户信息", "补充微信")
    else:
        report(A, "fail", "修改客户信息失败", f"{resp.status_code}: {resp.text[:100]}")

    # 3. 查看客户详情
    resp = api(A, "get", f"/api/customers/{customer_id}")
    if resp.status_code == 200:
        data = resp.json()
        report(A, "ok", "查看客户详情", f"昵称={data.get('nickname')}, 微信={data.get('wechat')}")
    else:
        report(A, "fail", "查看客户详情失败", f"{resp.status_code}")

    # 4. 创建拜访记录（到店）
    visit_data = {
        "customer_id": customer_id,
        "nickname": customer_data["nickname"],
        "visit_date": today,
        "arrived": True,
        "is_leader": False,
    }
    resp = api(A, "post", "/api/visits", json=visit_data)
    if resp.status_code == 200:
        visit_id = resp.json().get("id")
        report(A, "ok", "创建拜访记录(到店)", f"id={visit_id}")
    else:
        report(A, "fail", "创建拜访记录失败", f"{resp.status_code}: {resp.text[:100]}")
        visit_id = None

    # 5. 创建拜访记录（未到店）
    visit_data2 = {
        "customer_id": customer_id,
        "nickname": customer_data["nickname"],
        "visit_date": "2025-06-01",
        "arrived": False,
        "is_leader": False,
    }
    resp = api(A, "post", "/api/visits", json=visit_data2)
    if resp.status_code == 200:
        report(A, "ok", "创建拜访记录(未到店)", f"id={resp.json().get('id')}")
    else:
        report(A, "fail", "创建拜访记录(未到店)失败", f"{resp.status_code}: {resp.text[:100]}")

    # 6. 修改拜访记录
    if visit_id:
        resp = api(A, "patch", f"/api/visits/{visit_id}", json={"notes": "邀约Agent补充备注"})
        if resp.status_code == 200:
            report(A, "ok", "修改拜访记录", "添加备注")
        else:
            report(A, "fail", "修改拜访记录失败", f"{resp.status_code}: {resp.text[:100]}")

    # 7. 查看客户疗愈记录（接口已迁移至 /api/customer-detail/{id}）
    resp = api(A, "get", f"/api/customer-detail/{customer_id}")
    if resp.status_code == 200:
        report(A, "ok", "查看客户疗愈记录详情")
    else:
        report(A, "fail", "查看客户疗愈记录详情失败", f"{resp.status_code}")

    # 8. 查看拜访列表
    resp = api(A, "get", f"/api/visits?date={today}")
    if resp.status_code == 200:
        report(A, "ok", "查看今日拜访", f"{len(resp.json())} 条")
    else:
        report(A, "fail", "查看今日拜访失败", f"{resp.status_code}")

    # 9. 清理：删除测试客户
    resp = api(A, "delete", f"/api/customers/{customer_id}")
    if resp.status_code == 200:
        report(A, "ok", "清理测试客户")
    elif resp.status_code == 403:
        report(A, "warn", "清理测试客户被拒绝", "403 — 需管理员删除")
    else:
        report(A, "warn", "清理测试客户", f"{resp.status_code}")


# ═════════════════════════════════════════════════════════════════════════════
# Agent 5：付费/销卡/退费人员
# ═════════════════════════════════════════════════════════════════════════════
def test_a5_payment():
    A = "A5_付费销卡"
    print(f"\n{'='*60}\n  Agent 5：付费/销卡/退费\n{'='*60}")

    # 获取一个真实客户
    resp = api(A, "get", "/api/customers?page=1&page_size=1")
    if not resp.status_code == 200 or not resp.json().get("items"):
        report(A, "fail", "无可用客户", "跳过全部测试")
        return
    customer_id = resp.json()["items"][0]["id"]
    customer_name = resp.json()["items"][0].get("nickname", "")
    report(A, "ok", "获取测试客户", f"{customer_name} ({customer_id})")

    # 1. 购买会员活动套餐
    unique = datetime.now().strftime("%H%M%S%f")
    card_type = f"Agent测试卡_{unique}"
    card_data = {
        "customer_id": customer_id,
        "nickname": customer_name,
        "card_type": card_type,
        "price": 1000,
        "total_count": 10,
        "remaining_count": 10,
        "effective_date": today,
        "expiry_date": "2027-12-31",
        "deal_date": today,
        "closers": [{"name": "测试付费", "id": "test_payment"}],
    }
    resp = api(A, "post", "/api/membership-cards", json=card_data)
    if resp.status_code == 200:
        card_id = resp.json().get("id")
        report(A, "ok", "购买会员卡", f"id={card_id}, 次数=10, 金额=1000")
    else:
        report(A, "fail", "购买会员卡失败", f"{resp.status_code}: {resp.text[:100]}")
        card_id = None

    # 2. 查看付费记录（应出现新记录）
    resp = api(A, "get", "/api/consumption-records/payments?page=1&page_size=5")
    if resp.status_code == 200:
        records = resp.json().get("items", [])
        found = any(r.get("name") == card_type for r in records)
        if found:
            report(A, "ok", "付费记录同步", "新购买记录已出现")
        else:
            report(A, "warn", "付费记录同步", "未找到新记录（可能是分页问题）")

    # 3. 销卡（扣减 2 次）
    if card_id:
        deduct_data = {
            "customer_id": customer_id,
            "project_type": "membership-cards",
            "project_id": card_id,
            "count": 2,
            "reason": "自动化测试销卡",
        }
        resp = api(A, "post", "/api/project-deductions", json=deduct_data)
        if resp.status_code == 200:
            report(A, "ok", "销卡(扣2次)", f"剩余应为8")
        else:
            report(A, "fail", "销卡失败", f"{resp.status_code}: {resp.text[:100]}")

        # 4. 验证剩余次数（销卡只写流水，真实剩余看接口派生的 effective_remaining）
        resp = api(A, "get", f"/api/membership-cards/{card_id}")
        if resp.status_code == 200:
            remaining = resp.json().get("effective_remaining")
            if remaining == 8:
                report(A, "ok", "剩余次数验证", f"effective_remaining={remaining}")
            else:
                report(A, "fail", "剩余次数不对", f"预期8, 实际{remaining}")

    # 5. 负数销卡测试
    if card_id:
        deduct_data = {
            "customer_id": customer_id,
            "project_type": "membership-cards",
            "project_id": card_id,
            "count": -1,
            "reason": "自动化测试负数校验",
        }
        resp = api(A, "post", "/api/project-deductions", json=deduct_data)
        if resp.status_code in (400, 422):
            report(A, "ok", "负数销卡拒绝", f"{resp.status_code}")
        elif resp.status_code == 200:
            report(A, "fail", "负数销卡未拒绝", "应返回400/422")
        else:
            report(A, "warn", "负数销卡", f"{resp.status_code}")

    # 6. 超额销卡测试
    if card_id:
        deduct_data = {
            "customer_id": customer_id,
            "project_type": "membership-cards",
            "project_id": card_id,
            "count": 9999,
            "reason": "自动化测试超额校验",
        }
        resp = api(A, "post", "/api/project-deductions", json=deduct_data)
        if resp.status_code in (400, 422):
            report(A, "ok", "超额销卡拒绝", f"{resp.status_code}")
        elif resp.status_code == 200:
            report(A, "fail", "超额销卡未拒绝", "应返回400/422")
        else:
            report(A, "warn", "超额销卡", f"{resp.status_code}")

    # 7. 退费
    if card_id:
        refund_data = {
            "customer_id": customer_id,
            "project_type": "membership-cards",
            "project_id": card_id,
            "refund_amount": 200,
            "created_by": "test_payment",
        }
        resp = api(A, "post", "/api/project-refunds", json=refund_data)
        if resp.status_code == 200:
            report(A, "ok", "退费", f"金额=200")
        else:
            report(A, "fail", "退费失败", f"{resp.status_code}: {resp.text[:100]}")

    # 8. 查看销卡记录
    resp = api(A, "get", "/api/consumption-records/deductions?page=1&page_size=5")
    if resp.status_code == 200:
        report(A, "ok", "查看销卡记录", f"总数 {resp.json().get('total', 0)}")
    else:
        report(A, "fail", "查看销卡记录失败", f"{resp.status_code}")

    # 9. 清理：删除测试会员卡
    if card_id:
        resp = api(A, "delete", f"/api/membership-cards/{card_id}")
        if resp.status_code == 200:
            report(A, "ok", "清理测试会员卡")
        elif resp.status_code == 403:
            report(A, "warn", "清理测试会员卡被拒绝", "403 — 需管理员删除")
        else:
            report(A, "warn", "清理测试会员卡", f"{resp.status_code}")


# ═════════════════════════════════════════════════════════════════════════════
# Agent 6：配置与提醒人员
# ═════════════════════════════════════════════════════════════════════════════
def test_a6_config():
    A = "A6_配置提醒"
    print(f"\n{'='*60}\n  Agent 6：配置与提醒\n{'='*60}")

    # 1. 查看活动配置
    resp = api(A, "get", "/api/course-types")
    if resp.status_code == 200:
        report(A, "ok", "查看活动配置", f"{len(resp.json())} 个课程类型")
    else:
        report(A, "fail", "查看活动配置失败", f"{resp.status_code}")

    # 2. 新增课程类型
    unique = datetime.now().strftime("%H%M%S")
    course_data = {"name": f"Agent测试课程_{unique}"}
    resp = api(A, "post", "/api/course-types", json=course_data)
    if resp.status_code == 200:
        course_id = resp.json().get("id")
        report(A, "ok", "新增课程类型", f"id={course_id}")
    else:
        report(A, "fail", "新增课程类型失败", f"{resp.status_code}: {resp.text[:100]}")
        course_id = None

    # 3. 查看疗愈空间
    resp = api(A, "get", "/api/spaces")
    if resp.status_code == 200:
        report(A, "ok", "查看疗愈空间", f"{len(resp.json())} 个")
    else:
        report(A, "fail", "查看疗愈空间失败", f"{resp.status_code}")

    # 4. 新增疗愈空间
    space_data = {"name": f"Agent测试空间_{unique}", "rooms": [{"name": "测试房间A"}]}
    resp = api(A, "post", "/api/spaces", json=space_data)
    if resp.status_code == 200:
        space_id = resp.json().get("id")
        report(A, "ok", "新增疗愈空间", f"id={space_id}")
    else:
        report(A, "fail", "新增疗愈空间失败", f"{resp.status_code}: {resp.text[:100]}")
        space_id = None

    # 5. 查看会员身份
    resp = api(A, "get", "/api/member-identities")
    if resp.status_code == 200:
        report(A, "ok", "查看会员身份", f"{len(resp.json())} 个")
    else:
        report(A, "fail", "查看会员身份失败", f"{resp.status_code}")

    # 6. 新增会员身份
    identity_data = {"name": f"Agent测试身份_{unique}"}
    resp = api(A, "post", "/api/member-identities", json=identity_data)
    if resp.status_code == 200:
        identity_id = resp.json().get("id")
        report(A, "ok", "新增会员身份", f"id={identity_id}")
    else:
        report(A, "fail", "新增会员身份失败", f"{resp.status_code}: {resp.text[:100]}")
        identity_id = None

    # 7. 查看提醒规则
    resp = api(A, "get", "/api/reminders")
    if resp.status_code == 200:
        report(A, "ok", "查看提醒规则", f"{len(resp.json())} 条")
    else:
        report(A, "fail", "查看提醒规则失败", f"{resp.status_code}")

    # 8. 创建提醒规则
    reminder_data = {
        "name": f"Agent测试提醒_{unique}",
        "account_role": "全部",
        "account_id": "全部",
        "condition_logic": "all",
        "conditions": [
            {"type": "visit_count", "mode": "relative", "operator": "gt", "value": 3}
        ],
    }
    resp = api(A, "post", "/api/reminders", json=reminder_data)
    if resp.status_code == 200:
        reminder_id = resp.json().get("id")
        report(A, "ok", "创建提醒规则", f"id={reminder_id}")
    else:
        report(A, "fail", "创建提醒规则失败", f"{resp.status_code}: {resp.text[:100]}")
        reminder_id = None

    # 9. 查看业务提醒
    resp = api(A, "get", "/api/business-reminders")
    if resp.status_code == 200:
        report(A, "ok", "查看业务提醒", f"{len(resp.json())} 条触发")
    else:
        report(A, "fail", "查看业务提醒失败", f"{resp.status_code}")

    # 10. 修改提醒规则
    if reminder_id:
        resp = api(A, "patch", f"/api/reminders/{reminder_id}", json={"name": f"Agent测试提醒_已修改_{unique}"})
        if resp.status_code == 200:
            report(A, "ok", "修改提醒规则")
        else:
            report(A, "fail", "修改提醒规则失败", f"{resp.status_code}: {resp.text[:100]}")

    # 11. 清理测试数据
    if course_id:
        resp = api(A, "delete", f"/api/course-types/{course_id}")
        report(A, "ok" if resp.status_code == 200 else "warn", "清理课程类型", f"{resp.status_code}")
    if space_id:
        resp = api(A, "delete", f"/api/spaces/{space_id}")
        report(A, "ok" if resp.status_code == 200 else "warn", "清理疗愈空间", f"{resp.status_code}")
    if identity_id:
        resp = api(A, "delete", f"/api/member-identities/{identity_id}")
        report(A, "ok" if resp.status_code == 200 else "warn", "清理会员身份", f"{resp.status_code}")
    if reminder_id:
        resp = api(A, "delete", f"/api/reminders/{reminder_id}")
        report(A, "ok" if resp.status_code == 200 else "warn", "清理提醒规则", f"{resp.status_code}")


# ═════════════════════════════════════════════════════════════════════════════
# 主程序
# ═════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 60)
    print("  wyyard 真实业务流程测试 — 6 Agent")
    print("=" * 60)

    test_a1_manager()
    test_a2_teacher()
    test_a3_stats()
    test_a4_invite()
    test_a5_payment()
    test_a6_config()

    # 汇总
    print(f"\n{'='*60}")
    print("  测试汇总")
    print(f"{'='*60}")
    total_ok = total_fail = total_warn = 0
    for agent, items in results.items():
        ok = sum(1 for i in items if i["status"] == "ok")
        fail = sum(1 for i in items if i["status"] == "fail")
        warn = sum(1 for i in items if i["status"] == "warn")
        total_ok += ok
        total_fail += fail
        total_warn += warn
        status = "✅" if fail == 0 else "❌"
        print(f"  {status} {agent}: {ok} 通过, {fail} 失败, {warn} 警告")

    print(f"\n  总计: {total_ok} ✅  {total_fail} ❌  {total_warn} ⚠️")

    if total_fail > 0:
        print(f"\n{'='*60}")
        print("  失败详情")
        print(f"{'='*60}")
        for agent, items in results.items():
            for i in items:
                if i["status"] == "fail":
                    print(f"  ❌ [{agent}] {i['desc']} — {i['detail']}")
