# Deer Edu（雅思教育小程序）完整技术方案实现文档

> 项目根目录：`ielts-edu-main/ielts-edu-main/`
> 本文档基于当前代码库完整梳理，涵盖架构、功能、数据、UI 设计全部细节。

---

## 一、项目概述

Deer Edu 是一款基于**微信云开发**（Serverless）的雅思教育小程序，面向学生提供课程学习、作业管理、学习打卡、成绩追踪、番茄专注计时、雅思水平测评等功能；面向教师（管理员）提供排课管理、全量数据查看、作业布置、课程删除等能力。

### 核心特点
- 纯原生微信小程序 + 云开发，无自建服务器
- 学生/管理员双角色权限体系（`users.isAdmin` 标识）
- 管理员通过云函数获取全量数据（绕过客户端数据库权限限制）
- 番茄时钟采用全局状态机，支持跨页面持续计时与精确写库
- UI 采用卡片式设计 + 柔和渐变色系 + 丰富的情绪价值文案

---

## 二、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生框架（WXML / WXSS / JS） |
| 后端 | 微信云开发（云函数 / 云数据库 / 云存储） |
| 云环境 | `cloud1-d7g66xvli7bb6bcc6` |
| 图表 | Canvas 2D 手绘（成绩折线图、海报生成） |
| 组件 | 自定义组件（pomodoro 番茄时钟） |

---

## 三、项目结构

```
ielts-edu-main/ielts-edu-main/
├── app.js                 # 全局逻辑：云初始化、登录守卫、黑名单校验、番茄时钟状态机
├── app.json               # 页面路由、tabBar、全局窗口配置
├── app.wxss               # 全局样式（卡片、按钮、标题、文字色）
├── config/
│   └── images.js          # 云存储/本地图片资源路径映射
├── utils/
│   ├── cloudDB.js         # 云数据库操作封装（增删改查/当前用户数据）
│   ├── cloudStorage.js    # 云存储工具（临时URL缓存、上传、批量获取）
│   ├── dateUtil.js        # 日期工具（格式化/中文/月天数/今天判断）
│   └── checkinUtil.js     # 打卡统计（连续打卡/周/月统计）
├── components/
│   └── pomodoro/          # 番茄时钟组件
├── cloudfunctions/        # 云函数（10个）
└── pages/                 # 16 个页面
    ├── home/              # 首页（tab）
    ├── login/             # 登录
    ├── agreement/         # 用户协议/隐私政策
    ├── courses/           # 学习页（tab）
    ├── homework/          # 作业页（tab）
    ├── profile/           # 我的（tab）
    ├── checkin/           # 打卡记录
    ├── learning-report/   # 学习报告
    ├── homework-detail/   # 作业详情
    ├── schedule-manage/   # 排课管理（管理员）
    └── assessment/        # 测评模块（intro/vocab/listening/speaking/reading/writing/result）
```

---

## 四、全局配置

### 4.1 app.json

- **页面路由**：16 个页面，首页为 `pages/home/home`
- **tabBar**：4 个 tab（首页/学习/作业/我的），选中色 `#12B7A8`（主品牌色）
- **导航栏**：背景 `#F6F8FB`，黑字，标题 "Deer Edu"
- **优化项**：`lazyCodeLoading: "requiredComponents"`（按需注入代码，减少启动耗时）

### 4.2 app.js — 全局能力

#### 登录状态管理
| 方法 | 说明 |
|------|------|
| `requireLogin()` | 登录守卫：未登录则 `reLaunch` 到登录页，返回 false；各 tab 页 `onShow` 调用 |
| `setLoginStatus(userInfo)` | 写入 `globalData` 并缓存到本地 `loginInfo` |
| `logout()` | 清空登录态与本地缓存 |
| `checkLoginStatus()` | 启动时从本地缓存恢复登录态 |

#### 黑名单机制
- `onShow` 时调用 `verifyNotBlocked()`：通过云函数 `getOpenId` 服务端判定 `users.blocked`
- 被拉黑用户 → 强制登出 + `reLaunch` 登录页 + 弹窗提示"账号已被禁用"
- 标志位 `_blockHandling` 防止弹窗重复触发

#### 番茄时钟全局状态机（重点设计）
番茄计时放在 `globalData.pomodoro`，保证**跨页面切换计时不中断**：

**状态流转**：`idle → working → paused ⇄ working → work_done → resting → rest_done → idle`

**精确计时字段**：
| 字段 | 用途 |
|------|------|
| `status` | 状态机标识 |
| `phase` | work / rest 阶段 |
| `remaining / total` | 剩余/总秒数 |
| `startAt` | 当前段开始时间戳（后台切回时重算，防漂移） |
| `originalStartAt` | 用户真实点击"开始"的时间（写库用） |
| `segmentStartAt` | 当前工作段起点（暂停/重置时计算已专注时长） |
| `accumulatedSecs` | 待写库专注秒数（暂停/完成累加，余数保留不丢秒） |
| `savedMinutes` | 已写库分钟数（防止完成时多写） |
| `_pendingSave` | 写库快照（reset 后仍可正确写库） |
| `_pendingSaveId / _pendingSaveHandled` | 快照去重 ID（多组件只允许一个写库） |

**核心方法**：`pomodoroStart / pomodoroPause / pomodoroReset / pomodoroStartRest / pomodoroSetHomework / pomodoroSetConfig`

**后台处理**：`onAppHide` 停止 interval 节电；`onAppShow` 按 `startAt` 重算剩余时间，若已归零则直接触发完成逻辑。

**监听机制**：组件 `attached` 时 `addPomodoroListener(cb)`，`detached` 时移除；全局状态变更通过 `_notifyPomodoroListeners` 广播。

---

## 五、云数据库设计

> 由云函数 `initDatabase` 自动创建以下集合（管理员可调用）

### 5.1 集合清单

| 集合 | 用途 | 关键字段 |
|------|------|---------|
| `users` | 用户信息 | `nickName`, `avatarUrl`, `isAdmin`, `blocked`, `studyDays`, `vocabulary`, `loginCount`, `loginAttempts`, `lastLoginAt` |
| `courses` | 课程/排课 | `title`, `teacher`, `date`(YYYY-MM-DD), `startTime`, `endTime`, `subject`(听力/口语/阅读/写作), `location`, `studentId`, `studentName`, `scheduleMode`(single/循环), `repeatGroupId`, `weekNumber`, `weekday`, `createdBy` |
| `homework` | 作业 + 任务 | `title`, `subject`, `description`/`content`, `courseId`, `courseName`, `status`(pending/completed), `submitted`, `completion`(0-100), `estimatedTime`, `timeSpent`, `recordType`(task=任务), `assignedAt` |
| `checkins` | 打卡记录 | `date`, `types`([listening/speaking/reading/writing/homework]), `content`, `duration`(分钟), `createdAt` |
| `exam_scores` | 雅思成绩 | `date`, `listening`, `speaking`, `reading`, `writing`, `total`（均 0-9 分） |
| `assessment_results` | 测评结果（type=ability_model） | `vocab`(词汇估值), `selfAssess.{listening/reading/writing/speaking}`(`ratings` 12 条 0-5 + `level` 平均), `production.{writing/speaking}`(产出题作答), `status`(in_progress/completed) |
| `speaking_answers` | 口语测评答题 | 语音答案记录，产出题 `part: production` |
| `vocab_test_sessions` | 词汇量 CAT 测评会话 | `status`(active/completed), `responses`(作答数组，含 rtMs/timeout/suspicious), `currentTheta`, `currentSe`, `finalTheta`, `vocabEstimate`, `cefrLevel`, `breakdown`(分词频段正确率), `lowConfidence` |
| `pomodoro_sessions` | 番茄专注会话 | `homeworkId`, `subject`, `totalFocusMinutes`, `completedPomodoros`(0/1), `isPartial`, `startedAt`, `endedAt`, `date` |

### 5.2 数据关联设计

- **课程→学生**：`courses.studentId` 关联 `users._id`
- **作业→学生**：云数据库自动注入 `_openid`（私有隔离），教师端通过 `getAllUsers` 返回的 `_openid` 反查昵称
- **作业→课程**：`homework.courseId` 关联 `courses._id`
- **任务与作业同表**：用 `recordType === 'task'` 区分，作业列表过滤掉任务记录

---

## 六、云函数清单（10 个）

| 云函数 | 职责 | 权限校验 |
|--------|------|---------|
| `getOpenId` | 返回 openid + 黑名单判定 + 登录尝试计数 | 无 |
| `getAllUsers` | 获取全部用户（`field` 白名单排除敏感字段） | 仅管理员 |
| `getCourses` | 按日期范围+分页获取课程，返回 total | 仅管理员 |
| `getAllHomework` | 分页获取所有作业 | 仅管理员 |
| `deleteCourse` | 按 ID 删除课程 | 仅管理员 |
| `getPomodoroStats` | 番茄统计（今日+累计，聚合服务端汇总） | 按当前用户 OPENID 过滤 |
| `initDatabase` | 自动创建 8 个集合 | 仅管理员 |
| `migrateHomework` | 历史作业数据迁移（type→subject 等，支持 dryRun 预览） | 仅管理员 |
| `asrSpeechToText` | 口语测评语音转文字 | — |
| `vocabCatTest` | 词汇量 CAT 自适应测评（IRT 3PL + EAP + 最大信息量选题，actions: start/answer/result） | 按当前用户 OPENID 隔离会话 |
| `sendCheckinReminder` | 打卡提醒（空目录，未实现） | — |

### 管理员身份校验统一模式
```js
async function verifyAdmin() {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) return false;
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  return !!(res.data && res.data[0] && res.data[0].isAdmin === true);
}
```

### 分页模式（管理员拉取全量数据）
客户端以 `pageSize=100/500` 循环调用云函数，直至 `list.length < pageSize` 或 `skip >= total`。

---

## 七、工具类库

### 7.1 utils/cloudDB.js
封装云数据库常用操作：
- `getDB()` / `collection(name)`：实例与集合引用（懒加载单例）
- `add(collName, data)`：自动补 `_createTime` / `_updateTime`
- `get(collName, query)`：支持函数式 query 或 where 对象
- `update(collName, id, data)`：自动更新 `_updateTime`
- `remove(collName, id)`：按 ID 删除
- `getMy(collName, query)`：获取当前用户数据（依赖云开发安全规则自动过滤）
- `addMy(collName, data)`：写入当前用户数据
- `getByDateRange(...)`：按日期范围查询

### 7.2 utils/cloudStorage.js
- `getTempUrl(fileID)`：单文件获取临时 URL
- `getTempUrls(fileIDs)`：批量获取 + **50 分钟本地缓存**（`cloudTempUrlCache`）+ 内存缓存双层缓存
- `uploadFile(filePath, cloudPath)`：上传文件到云存储

### 7.3 utils/dateUtil.js
- `formatDate` → `YYYY-MM-DD`；`formatDateCN` → `M月D日`
- `getDateString`、`getDaysInMonth`、`getFirstDayOfMonth`、`isToday`

### 7.4 utils/checkinUtil.js
- `calculateStreak(dates)`：连续打卡天数（去重+倒序+逐日回推）
- `calculateWeekCheckins(dates)`：本周打卡天数（周一起算）
- `calculateMonthCheckins(dates)`：本月打卡天数

### 7.5 config/images.js
- `CLOUD_IMAGES`：云存储大图（logo、默认头像、12 个功能图标），cloud:// 协议
- `LOCAL_IMAGES`：本地 tabBar 小图标（8 个）

---

## 八、页面功能与 UI 细节

### 8.1 首页 `/pages/home`（tab）

**功能**：
1. 顶部问候 + 日期（`你好，{{userName}}`）
2. 每日鼓励寄语（12 条文案随机展示，`pickDailyQuote`）
3. 今日任务卡片：今日课程数、作业进度（已完成/总数），"去学习"按钮
4. 能力概览：学习天数、连续打卡天数
5. 听说读写打卡宫格（4 模块），点击弹出打卡内容输入框 → 写入 `checkins` → 展示**激励动效弹窗**

**打卡细节**：
- 内容输入弹窗：textarea 最多 200 字，可留空，提交中禁止关闭（防重复）
- 激励弹窗：6 条随机鼓励文案 + 6 个爆点光效 + ✓ 徽章 + 分享按钮（转发好友/朋友圈引导）
- 分享：打卡后 `onShareAppMessage` 动态拼接标题"我刚完成了X打卡"
- 打卡成功 `wx.vibrateShort` 轻震动反馈

**UI 细节**：
- 每日寄语横幅：浅色渐变 + 左侧装饰光晕 + 引号" + ✨ 装饰
- 卡片：白色圆角 24rpx + 细边框 `rgba(23,33,43,0.06)` + 阴影 `0 10rpx 28rpx rgba(23,33,43,0.05)`
- 打卡模块图标：圆底 `bgColor` 各不相同（见 8.7 设计系统），已打卡显示 ✓ 角标
- 未登录可浏览（合规：不强制登录），点击打卡等操作 `ensureLogin()` 弹窗引导登录

### 8.2 登录页 `/pages/login`

**流程**（两步）：
1. **勾选协议 → 微信登录**：云函数 `getOpenId` 获取 openid（服务端判定黑名单）→ 查 `users` 集合 → 老用户直接登录，新用户进入注册步骤
2. **新用户注册**：选择头像（上传云存储 `avatars/xxx.jpg`）+ 输入昵称 → 写入 `users`（初始化 `studyDays=0` 等字段 + `loginCount: 1`）

**细节**：
- 协议勾选必须（`_ensureAgreed`），未勾选提示"请先阅读并勾选同意协议"
- 老用户登录次数 `loginCount` 原子自增（`db.command.inc(1)`），失败不影响主流程
- 登录成功：新用户跳测评 `redirectTo /pages/assessment/intro`，老用户 `switchTab` 首页
- 已登录进入本页直接跳转首页

### 8.3 协议页 `/pages/agreement`

- 通过 `?type=user|privacy` 区分用户协议/隐私政策两种内容

### 8.4 学习页 `/pages/courses`（tab）

**核心能力**：课程日历（日/周/月三视图）+ 课程卡片 + 作业布置

**视图逻辑**：
- 日视图：显示选中日期的课程列表
- 周视图：7 天横向日历，每天显示课程数角标
- 月视图：日历网格，每天显示课程数角标
- `changeDate` 按视图类型增减（天 ±1 / 周 ±7 / 月 ±1 月）

**权限逻辑**：
- 普通学生：`cloudDB.get('courses', q.where({ studentId: userId }))` 查询自己的课程
- 管理员：云函数 `getCourses` 全量拉取（2020-01-01 ~ 2099-12-31），并通过 `getAllUsers` 构建 `studentId → 昵称` 映射

**课程卡片**：
- 展示：标题、日期时间、时长、状态徽章（已完成/待上课）、科目图标
- 状态判断：`isCourseCompleted(date, endTime)` 课程结束时间 < 当前时间
- 管理员视角额外显示学生昵称（粉红色 `#E91E63`）

**作业布置**（展开课程卡片）：
- 一个课程可添加**多条作业项**，每条 = { 作业内容, 预估完成时间(分钟) }
- 科目沿用课程科目，无需单独填截止时间
- 保存时逐条写入 `homework` 表（标题自动生成"X作业"，`status: pending`）
- 全部成功 → 自定义成功 Toast"已布置 N 条作业"（1600ms 自动消失）

**UI 细节**：
- 视图切换 Tab（日/周/月）、日期区间标题（如"8月30日 - 9月5日"）
- 周/月日历"今天"高亮、有课程的日期显示数量角标
- 展开/收起箭头（∧/∨）切换

### 8.5 作业页 `/pages/homework`（tab）

**核心能力**：听说读写模块宫格 + 模块明细 + 任务管理 + 番茄时钟入口

**模块宫格**：
- 4 个科目模块（听力/口语/阅读/写作），各自独立统计 `total / completed / progress%`
- `resolveModuleId(hw)` 将作业按 subject 归类到对应模块
- 完成判定：`status === 'completed' || submitted === true`

**模块明细**（点击模块进入）：
- 每条作业显示：内容、课程名、学生昵称（管理员）、预估时长/已专注时长、完成度、完成打卡入口
- 时长显示逻辑：`timeSpent > 0 ? 已专注:timeSpent : 预估:estimatedTime`
- "已完成 ✅" 打卡选项仅学员可点（`if (this.data.isAdmin) return`），切换 `status/completed` 并刷新

**任务管理**（我的任务）：
- 任务存于 `homework` 表，`recordType: 'task'`
- 添加任务弹窗（内容 + 预估分钟）→ 写入数据库
- 勾选完成：**乐观更新**本地状态，失败自动回滚
- 删除任务：`wx.showModal` 确认（确认色 `#E25C5C`）

**番茄入口**：点击 🍅 打开番茄组件并预置关联作业/任务，完成后 `onPomodoroSessionSaved` 刷新列表

**权限逻辑**：
- 学生：`cloudDB.getMy('homework')`（私有隔离）
- 管理员：云函数 `getAllHomework` 全量拉取，按 `_openid` 映射学生昵称

**UI 细节**：
- 模块卡片：科目色 `bgColor` + 图标 + 总数/完成数 + 进度条
- 作业条目：左侧内容、右侧时长/完成度/打卡按钮
- 学生昵称粉红色 `#E91E63` 显示

### 8.6 作业详情页 `/pages/homework-detail`

- 通过 `?id=` 加载单条作业
- 展示：标题、科目徽章（颜色+图标）、内容、关联课程、创建日期
- **完成度编辑**：输入 0-100（自动钳制），累计时长输入
- 保存时同步 `status`（完成度≥100 → completed）、`completion`、`timeSpent`；完成时写入 `completedAt/submittedAt`
- 返回上级自动刷新列表（`getCurrentPages()` 取上一页调用 `loadAllHomework`）

### 8.7 打卡记录页 `/pages/checkin`

**功能**：月历打卡视图 + 统计（当前连续、总天数、成就数）+ 打卡动态

- 月历：当月打卡日期高亮 ✓，支持上月/下月切换
- 统计：`calculateStreak` 连续天数；成就数 = `floor(streak / 7)`（每 7 天 1 成就）
- 动态流：全量 `checkins`（`get`）最近 10 条，显示头像、昵称、内容、相对时间（刚刚/N小时前/N天前/N周前）
- `doCheckin` 快捷打卡（`types: ['checkin']`）

### 8.8 学习报告页 `/pages/learning-report`

**功能**：月度学习数据 + 成绩趋势图 + 海报生成分享

**学习数据**：
- 学习时长：打卡数 × 1.5 小时（`toFixed(1)`）
- 平均每日：`总时长 / 30`
- 完成课程：`courses` 中 status=已完成 的数量
- 掌握词汇：`users.vocabulary`

**成绩趋势**：
- 7 天趋势数据（每天打卡 × 1.5h 柱状）
- 总成绩趋势 Canvas 折线图（0-9 分，金色 `#FFC107`，渐变填充+数据点+分数标注）
- 四科迷你折线图（听力绿 `#4CAF50` / 阅读蓝 `#2196F3` / 写作橙 `#FF9800` / 口语粉 `#E91E63`）

**成绩对比**：计算每次考试相对首次的提升分（`improvement`），`actualCount` 显示"第 8 次考试"等

**海报生成**（`drawShareCanvas`）：
- 750px 宽 Canvas，动态高度（有无成绩/趋势分段叠加）
- 顶部紫色渐变（`#6C5CE7 → #A29BFE`）+ 白色圆角卡片
- 内容：标题、日期、最新总分（金色大字）、四科分数、学习数据 2×2 卡片、成绩趋势图、底部二维码占位区
- 生成后 `previewImage` → 保存相册（含授权引导 `openSetting`）/ 分享朋友圈（`showShareImageMenu`）

**分享**：`onShareTimeline` 标题动态拼接"雅思成绩X分 | 学习X小时 | X天打卡"

### 8.9 个人中心 `/pages/profile`（tab）

**核心能力**：用户信息 + 成绩管理 + 打卡热力图 + 番茄统计 + 功能菜单

**用户信息**：
- 从数据库 `users` 刷新最新 `isAdmin`（同步回 `globalData`）
- 未登录通过 `requireLogin()` 统一守卫跳登录页

**成绩管理**：
- `exam_scores` 列表，倒序展示
- 添加成绩弹窗：日期 + 听说读写 + 总分，**0-9 分严格验证**（`validateScore`：数字 + 范围 + 正则）
- Canvas 折线图：紫色系（`#D4A5E8`），网格线虚线、渐变填充、双圈数据点、Y 轴 0-8 标签

**打卡热力图**（重点）：
- 月历显示，每月可切换（`prevMonth/nextMonth`，限制不超过当前月）
- **颜色映射**：0 次 → `#FFF9F5`；1 次 → `rgba(167,251,245,0.2)`；2 次 → 0.5；3 次 → 0.75；4+ 次 → `#A7FBF5`
- 点击日期弹出打卡明细（时间、类型色块、内容、时长）
- 打卡类型 5 种：听力/口语/阅读/写作/作业（各自颜色）
- 今日打卡入口：多选类型 + 备注内容 + 时长（分钟，纯数字过滤）

**番茄统计**：云函数 `getPomodoroStats` 获取今日番茄数/专注分钟

**功能菜单**：测评结果、学习报告、重新测评、排课管理（管理员）、联系客服、我的订单（开发中）

**UI 细节**：
- 打卡统计 3 卡片（连续/本周/本月）
- 热力图背景 `#FFF9F5`，配色与整体设计语言一致

### 8.10 排课管理 `/pages/schedule-manage`（管理员专属）

**入口**：个人中心"排课管理"；无管理员权限访问则弹窗提示并返回

**核心能力**：课程增删改查 + 单节/循环排课 + 日/周/月视图 + 学生筛选

**排课模式**：
1. **单节课**：填课程名/老师/日期/时间/科目/地点/描述/学生
2. **循环排课**：选择重复星期（多选）+ 重复周数 → `generateRecurringSchedules` 按周推算所有日期批量写入，同批共享 `repeatGroupId`

**表单细节**：
- 学生选择：弹窗搜索列表（`getAllUsers` 云函数获取，本地过滤），选中回填 `studentName` + `studentId`
- 日期上限 `maxDate` = 今天
- 编辑课程回填表单（`editingSchedule` 区分新增/编辑）
- 校验：课程名必填、日期必选、时间必填；循环模式需选星期 + 周数≥1

**数据加载**：
- 通过云函数 `getCourses` 按当前视图日期范围分页拉取（绕过客户端权限限制）
- 视图切换（日/周/月）与日期导航触发重新加载
- 学生筛选：前端过滤 `filteredScheduleList`（不重新查库）

**删除课程**：`deleteSchedule` → 确认弹窗 → 云函数 `deleteCourse`（服务端校验管理员）→ 成功后刷新列表

**UI 细节**：
- 课程卡片：科目色块 `subjectColors`（听力 `#A7FBF5` / 阅读 `#FFD4B8` / 写作 `#FFE8F0` / 口语 `#E8D4F8`）+ 科目图标 + 循环标识"🔄 循环课程"
- 已过期课程 `isPast` 置灰
- 删除按钮红底红字（`#FFE8E8` / `#FF6B6B`）
- 周/月视图日期显示课程数量角标

### 8.11 测评模块 `/pages/assessment`

> 基于《入学测评（全）》测试文档：第一步词汇测试 → 第二步听说读写 48 项能力模型自评 → 第三步产出题

#### intro 介绍页
- 5 个测评模块卡片：词汇量（CAT 自适应测试/约 3-5 分钟）、听力（12 条自评/约 3 分钟）、口语（12 条自评+2 道产出题/约 8 分钟）、阅读（12 条自评/约 3 分钟）、写作（12 条自评+2 道产出题/约 8 分钟）
- 支持单项测评 / 完整测评（词汇量→听力→口语→阅读→写作）/ 跳过 / 查看结果

#### 能力自评（components/self-assess）
- 通用自评组件：48 条描述存于 `utils/assessmentData.js`（听/读/写/说 × 12 条），单题展示、0-5 分打分、自动进入下一条
- 完成后经 `utils/assessmentStore.js` 合并写入 `assessment_results.selfAssess.{skill}`（`ratings` 数组 + `level` 平均分 0-5）

#### vocab / listening / speaking / reading / writing
- vocab：词汇量 CAT 自适应测试（云函数 `vocabCatTest`，actions: start/answer/result），完成后词汇估值写入 `assessment_results.vocab`
- listening：12 条听力自评
- reading：12 条阅读自评
- speaking：12 条口语自评 → 2 道产出题（图片描述：60 秒准备+120 秒录音，配图 `images/assessment-speaking-picture.jpg`；观点表达：随机 1 题 30 秒录音），录音上传云存储 → `speaking_answers`（part=production）→ ASR 转写
- writing：12 条写作自评 → 2 道产出题（三种句式改写 / CER 论点论据论证），数据写入 `assessment_results.production.writing`
- 完整测评中写作是最后一环，完成后调 `finalize()` 标记记录 `status: completed`

#### result 结果页
- 词汇量估值（含 CEFR 徽标与置信度提示，兜底查 `vocab_test_sessions`）
- 四维能力等级条（0-5 级，来自自评平均分）+ 评语（≥4 / ≥2.5 / <2.5 三档）
- 综合 CEFR：四维平均映射，≥4.5→C2，≥3.5→C1，≥2.5→B2，≥1.5→B1，≥0.8→A2，<0.8→A1

---

## 九、番茄时钟组件 `/components/pomodoro`

### 9.1 组件职责
- 负责番茄时钟的 UI 渲染与用户交互，**计时逻辑全部在 app.js 全局层**（保证跨页持续）
- 通过 `addPomodoroListener` 订阅全局状态，`_syncFromGlobal` 同步展示

### 9.2 属性（properties）
| 属性 | 类型 | 说明 |
|------|------|------|
| `visible` | Boolean | 是否展示抽屉 |
| `linkedHomeworkId / linkedContent / linkedSubject` | String | 预置关联作业 |
| `homeworkOptions / taskOptions` | Array | 可选关联的作业/任务列表 |

### 9.3 交互细节
- **进度环**：`conic-gradient` 圆形进度条（progress 0-100）
- **状态文案**：准备开始 / 专注中 🎯 / 已暂停 / 专注完成 🎉 / 休息中 ☕ / 休息完毕！
- **时长配置**：专注 25/45/60 分钟，休息 5/10 分钟（仅 idle 生效）
- **重置**：`wx.showModal` 确认（防止误触清空进度）
- **关闭保护**：计时中（working/resting）点遮罩提示"专注中，请勿关闭"
- **任务内联创建**：在组件内可直接新建任务并立即关联

### 9.4 写库机制（精确性设计）
`_saveSegment(save)` 处理 app 挂出的写库快照：
1. 写 `pomodoro_sessions`：`completedPomodoros: isPartial ? 0 : 1`（完整番茄计 1）
2. 关联作业时原子回写 `homework.timeSpent += minutes`（`db.command.inc`）
3. 通知父页面 `triggerEvent('sessionSaved')`

**防重写设计**：
- `_lastSaveId`（组件实例）+ `_pendingSaveHandled`（全局）双重去重
- 新会话启动时 `_pendingSaveId` 置 0，组件同步重置 `_lastSaveId`
- 不足 1 分钟不写库；`accumulatedSecs % 60` 余数保留下次累加

---

## 十、权限与安全设计

| 场景 | 机制 |
|------|------|
| 登录守卫 | `requireLogin()` + 各 tab 页 onShow 校验 |
| 黑名单封禁 | `getOpenId` 服务端判定 `blocked`，客户端不可绕过 |
| 管理员操作 | 每个云函数服务端 `verifyAdmin()` 二次校验（排课/查全量/删除/初始化/迁移） |
| 数据越权 | 私有集合依赖云开发安全规则 `_openid` 隔离；番茄统计云函数按 OPENID 服务端过滤 |
| 敏感字段 | `getAllUsers` 使用 `field()` 白名单，仅返回昵称/头像/ID/openid/isAdmin |
| 作业打卡 | 学员仅能操作自己的作业（管理员不展示打卡入口） |

---

## 十一、设计系统

### 11.1 颜色

| 用途 | 色值 |
|------|------|
| 主品牌色 | `#12B7A8`（青绿色） |
| 页面背景 | `#F6F8FB` |
| 文字主色 | `#17212B` |
| 次要文字 | `#7A8794` |
| TabBar 未选中 | `#9AA5B1` |
| 科目-听力 | `#A7FBF5`（浅青） |
| 科目-口语 | `#E8D4F8`（浅紫） |
| 科目-阅读 | `#FFD4B8`（浅橙） |
| 科目-写作 | `#FFE8F0`（浅粉） |
| 作业完成度/学生名 | `#E91E63`（粉红） |
| 图表-成绩 | `#D4A5E8` / `#FFC107` |
| 海报-头部渐变 | `#6C5CE7 → #A29BFE` |
| 删除/危险 | `#FF6B6B` / `#E25C5C` |

### 11.2 模块图标底色（同色系层次设计）
| 模块 | bgColor |
|------|---------|
| 听力 | `rgba(18, 183, 168, 0.12)` |
| 口语 | `rgba(23, 33, 43, 0.08)` |
| 阅读 | `rgba(18, 183, 168, 0.20)` |
| 写作 | `rgba(122, 135, 148, 0.14)` |

### 11.3 卡片规范
```css
.section-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 32rpx;
  border: 1rpx solid rgba(23, 33, 43, 0.06);
  box-shadow: 0 10rpx 28rpx rgba(23, 33, 43, 0.05);
}
```

### 11.4 按钮规范
```css
.btn-primary {
  background: #12B7A8;
  border-radius: 18rpx;
  box-shadow: 0 10rpx 24rpx rgba(18, 183, 168, 0.22);
}
.btn-primary:active { transform: translateY(2rpx); }
```

### 11.5 图标资源
- **云存储图标**（大图，临时 URL + 50 分钟缓存）：logo、默认头像、12 个功能图标（书/日历/图表/勾选/文档/火/耳机/麦克风/暂停/笔/播放/加号/刷新/设置/支持/目标/用户）
- **本地图标**（小图）：4 组 tabBar 图标（8 个）

### 11.6 交互反馈规范
- 成功 → `wx.showToast icon:'success'` 或自定义成功 Toast（学习页）
- 失败 → `wx.showToast icon:'none'`
- 打卡成功 → 激励弹窗 + 震动（`vibrateShort type:'medium'/'heavy'`）
- 危险操作 → `wx.showModal` 二次确认
- 提交中 → `checkinSubmitting/taskSubmitting` 防重复点击

---

## 十二、分享能力

| 页面 | onShareAppMessage | onShareTimeline |
|------|-------------------|-----------------|
| 首页 | 打卡后"我刚完成了X打卡" | 打卡标题 |
| 学习页 | 雅思课程安排 | — |
| 作业页 | 默认 | — |
| 我的 | 个人中心 | — |
| 打卡记录 | 我已坚持打卡 | — |
| 学习报告 | 成绩+时长+天数动态文案 | 分数/时长/天数 |
| 测评介绍 | 雅思水平测评 | — |
| 测评结果 | 我的雅思测评结果 | — |

---

## 十三、已知注意事项 / 运维清单

1. **云函数部署**：新增云函数（`getCourses`、`getAllHomework`、`deleteCourse` 等）需在微信开发者工具中右键"上传并部署（云端安装依赖）"
2. **数据库索引**：`courses` 集合建议为 `date + startTime` 建立复合索引，提升日期范围查询性能
3. **云开发权限**：`courses`/`homework` 等集合的客户端安全规则需保证"仅创建者可读写"，管理员全量操作均走云函数
4. **`sendCheckinReminder`** 目录为空，定时打卡提醒功能尚未实现
5. **学习时长估算**：以"打卡数 × 1.5 小时"估算，非真实时长
6. **`getAllUsers` 返回 `_openid`**：教师端反查学生昵称的关联键，不可在 field 白名单中移除
