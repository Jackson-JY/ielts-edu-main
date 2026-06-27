# 云数据库索引建议

以下索引用于支撑当前小程序里的高频查询。微信云开发索引需要在云开发控制台的数据库集合中配置。

## courses

- `studentId` 升序、`date` 升序、`startTime` 升序
  - 用途：普通学生课程页按学生和日期/时间读取课程。
- `date` 升序、`startTime` 升序
  - 用途：管理员排课页、课程云函数按日期范围读取课程。

## homework

作业与「我的任务」同表存储，用 `recordType` 区分：

- `recordType` 缺省 / `'homework'`：老师布置的作业（听说读写四模块）。
- `recordType: 'task'`：用户在作业页自建的任务，或番茄时钟内新建的任务。含 `description`(任务信息)、`estimatedTime`(预估分钟)、`status`、`completion`、`timeSpent`。

**推荐索引：**

- `_openid` 升序、`_updateTime` 降序
  - 用途：普通学生作业页读取自己的作业/任务列表。
- `_openid` 升序、`recordType` 升序、`_updateTime` 降序
  - 用途：作业页按 `recordType='task'` 单独读取任务列表。
- `courseId` 升序、`assignedAt` 降序
  - 用途：课程页展开课程时读取关联作业。
- `_updateTime` 降序
  - 用途：管理员作业列表按更新时间分页读取。

## checkins

- `_openid` 升序、`date` 升序
  - 用途：打卡日历、个人中心热力图、连续打卡统计。
- `_createTime` 降序
  - 用途：打卡动态流读取最新记录。

## users

**关键字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `_openid` | String | 用户 openid（自动写入） |
| `nickName` / `avatarUrl` | String | 昵称 / 头像 |
| `isAdmin` | Boolean | 是否管理员 |
| `blocked` | Boolean | 黑名单标记。`true`=禁止登录。登录时由 `getOpenId` 云函数服务端判定并拦截；已登录用户冷启动时 `app.verifyNotBlocked` 会校验并强制登出。在云开发控制台手动设置/删除此字段即可拉黑/恢复用户。 |
| `loginCount` | Number | 累计**成功**登录次数。每次登录成功（老用户登录 / 新用户注册）自增。 |
| `lastLoginAt` | Date | 最近一次成功登录时间。 |
| `loginAttempts` | Number | 累计登录**尝试**次数（含被黑名单拒绝的尝试）。由 `getOpenId` 云函数在 `countAttempt` 参数为 true 时服务端自增；app 启动的黑名单校验不计入。`loginAttempts ≥ loginCount`，差值即被拒次数。 |
| `lastAttemptAt` | Date | 最近一次登录尝试时间。 |

**推荐索引：**

- `_openid` 升序
  - 用途：云函数管理员身份校验、黑名单状态查询。
- `_createTime` 降序
  - 用途：管理员读取用户列表。

## exam_scores

- `_openid` 升序、`_createTime` 降序
  - 用途：个人中心读取历史成绩和绘制趋势图。

## assessment_results

- `_openid` 升序、`_createTime` 降序
  - 用途：测评结果页读取最新测评结果。

## speaking_answers

- `_openid` 升序、`assessmentId` 升序
  - 用途：口语测评读取和更新同一次测评的答题记录。


## pomodoro_sessions

记录番茄专注会话。**两种来源**：倒计时自然完成（整轮番茄）写一条；专注中途暂停/重置且累计满 1 分钟也写一条（部分专注）。

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `_openid` | String | 用户 openid（自动写入） |
| `homeworkId` | String | 关联作业 `_id`，可为空字符串（自由学习） |
| `homeworkContent` | String | 作业内容快照（避免作业删除后失去上下文） |
| `subject` | String | 科目：听力/阅读/写作/口语 |
| `startedAt` | Date | 专注开始时间 |
| `endedAt` | Date | 专注结束时间 |
| `totalFocusMinutes` | Number | 本次实际专注分钟数（部分专注可能 < workMinutes） |
| `completedPomodoros` | Number | 完整番茄计 1，部分专注计 0（统计「累计番茄数」时 sum 此字段） |
| `isPartial` | Boolean | true=暂停/重置产生的部分专注；false=整轮完成 |
| `date` | String | 日期字符串 `YYYY-MM-DD`，用于按天统计 |
| `note` | String | 备注（预留） |

**统计读取方式：**

今日 / 累计统计均由云函数 `getPomodoroStats` 读取，**不在客户端直接查询**。原因：

1. 服务端用 `getWXContext().OPENID` 强制按当前用户过滤，杜绝越权读他人数据；
2. 服务端用聚合（aggregate `$.sum`）汇总，绕过客户端 `.get()` 单次最多 20 条的限制，保证累计统计覆盖全部历史记录。

**推荐索引：**

- `_openid` 升序、`date` 降序
  - 用途：`getPomodoroStats` 今日聚合 `match({ _openid, date })`；累计聚合 `match({ _openid })` 也可复用该复合索引前缀。
- `_openid` 升序、`homeworkId` 升序
  - 用途：按作业维度查询番茄记录（未来可用于作业详情页展示专注历史）。
