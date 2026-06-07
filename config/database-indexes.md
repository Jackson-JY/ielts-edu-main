# 云数据库索引建议

以下索引用于支撑当前小程序里的高频查询。微信云开发索引需要在云开发控制台的数据库集合中配置。

## courses

- `studentId` 升序、`date` 升序、`startTime` 升序
  - 用途：普通学生课程页按学生和日期/时间读取课程。
- `date` 升序、`startTime` 升序
  - 用途：管理员排课页、课程云函数按日期范围读取课程。

## homework

- `_openid` 升序、`_updateTime` 降序
  - 用途：普通学生作业页读取自己的作业列表。
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

- `_openid` 升序
  - 用途：云函数管理员身份校验。
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

