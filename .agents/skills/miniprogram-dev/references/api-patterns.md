# API 对接参考

新增 API、修改封装或排查登录时使用。以目标端当前 utils/api.js、app.js 和后端路由为准，不根据本文件推断现行 BASE_URL、token 刷新时间或项目类型数量。

## 定位请求链路

1. 查看目标端 request 的实际签名、环境选择、token 注入、错误处理和导出。
2. 对照 backend/app/api/ 路由及 main.py 注册，确认 HTTP 方法、权限、参数与响应。
3. 按现有命名空间增加封装；页面只调用封装。query 值编码，空值按接口契约处理。
4. 付费项目如果使用工厂分发，核对类型常量、工厂映射和后端路由；不要照旧的“7 种类型”数量补删项目。

管理端常用对象方法结构示例：

```js
const customerApi = {
  detail: (id) => request(`/api/customer-detail/${encodeURIComponent(id)}`),
  update: (id, data) => request(`/api/customers/${encodeURIComponent(id)}`, {
    method: 'PATCH', data,
  }),
}
```

示例 PATCH 不是所有资源的统一规则；实际使用后端声明的方法。分页响应按真实契约处理，不凭空补造 total。

## 登录与安全

- 两端发布身份、登录 token 和权限独立，沿用目标端封装，不复制另一端的 request。
- 401 的处理核对现有刷新/续期机制；不能将超时、403 或网络错误都清登录态。页面不要重复处理封装已提示的错误。
- 客户端允许游客访问的页面保留游客流程，不能套用管理端强制登录。
- 操作人以服务端认证身份为准，前端 created_by 不能作为授权证据。
- 开发地址、正式地址及真机连通性遵循 AGENTS.md 与 SKILL.md；环境切换不是每次对接接口的必需步骤。
