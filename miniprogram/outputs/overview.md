# 课表课程分割线修复

## 已完成

- 保留同一时间段（上午、下午、晚上）内的课程分组结构，课程仍在同一个 `group-card` 容器内，不拆开。
- 在 `pages/activities/index.wxss` 中将课程样式限定为 `.group-card .card`，覆盖全局 `.card` 继承的 `margin-bottom` 和 `box-shadow`，避免最后一门课程底部出现伪分割线。
- 使用 `.group-card .card + .card` 仅给非首门课程添加 `1rpx solid #f1f2f4` 顶部分割线，因此只有相邻课程之间有线。
- 明确设置 `.group-card .card:last-child { border-bottom: none; }`，最后一门课程底部不画课程分割线。
- 同段白卡及课程行高、内边距保持不变；未修改 WXML 和业务逻辑。

## 验证

- `pages/activities/index.js` 语法检查通过。
- `git diff --check` 通过。
- 已确认课表页不存在课程 `border-bottom`，相邻课程线仅来自 `.group-card .card + .card`。

## 备注

请在微信开发者工具或真机刷新课表页确认视觉效果：同段课程保持一组，中间课程之间有一条细线，最后一门课程本身不再产生底部阴影或底部间距线。

## 公益读书会标签

- 对课程类型为“读书会”且公益字段为真的活动，在名称左侧显示“公益”小标签。
- 该记录不再在名称右侧重复显示“公益”；普通读书会和其他公益活动保持原有显示逻辑。
- 涉及文件：`pages/activities/index.js`、`pages/activities/index.wxml`、`pages/activities/index.wxss`。
- 已通过 JS 语法检查和 `git diff --check`。
- 标签视觉已调整为清亮黄色：底色 `#f4dc84` 与时段黄色圆点一致，边框 `#e5c45e`，文字 `#62530e`；高度 `30rpx`、字号 `20rpx`、内边距 `8rpx`、圆角 `5rpx`，整体更轻、更清楚。