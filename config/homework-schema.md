# Homework 集合数据结构规范

## 统一字段设计

### 基础字段
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 系统自动生成 |
| _openid | string | 是 | 用户标识，自动添加 |
| _createTime | Date | 是 | 创建时间，自动添加 |
| _updateTime | Date | 是 | 更新时间，自动添加 |

### 作业信息字段
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| title | string | 是 | 作业标题 |
| description | string | 否 | 作业详细描述/要求 |
| subject | string | 是 | 科目：listening/reading/writing/speaking |
| type | string | 否 | 作业类型（兼容旧字段，映射到 subject）|

### 状态字段
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| status | string | 是 | 状态：pending/assigned/in_progress/completed/overdue |
| submitted | boolean | 否 | 是否已提交（兼容旧数据）|
| completedAt | Date | 否 | 完成时间 |
| submittedAt | Date | 否 | 提交时间 |

### 时间字段
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| deadline | string/Date | 否 | 截止日期（ISO 格式）|
| assignedAt | Date | 否 | 布置时间 |

### 课程关联
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| courseId | string | 否 | 关联课程ID |
| courseName | string | 否 | 课程名称 |
| lessonId | string | 否 | 课时ID |

### 内容和附件
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| content | string | 否 | 作业内容/学生作答 |
| attachments | array | 否 | 附件列表 [{name, url, type}] |
| referenceMaterials | array | 否 | 参考资料 |

### 评分字段
| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| score | number | 否 | 得分 |
| totalScore | number | 否 | 总分 |
| feedback | string | 否 | 老师评语 |
| gradedAt | Date | 否 | 评分时间 |
| gradedBy | string | 否 | 评分人 |

## 状态流转

```
assigned (已布置) → pending (待完成) → in_progress (进行中) → completed (已完成)
                          ↓
                      overdue (已逾期)
```

## 查询条件

### 未完成作业
```javascript
status: ['pending', 'assigned', 'in_progress']
// 或
submitted: false
```

### 已完成作业
```javascript
status: 'completed'
// 或
submitted: true
```

## 数据迁移说明

### 旧数据兼容处理
1. `type` → `subject` 字段映射
2. `submitted: false` → `status: 'pending'`
3. `submitted: true` → `status: 'completed'`
4. `date` → `assignedAt`
