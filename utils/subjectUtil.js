/**
 * 科目工具函数库（收敛 homework / homework-detail / courses 页的重复实现）
 * @module subjectUtil
 */

const TYPE_TO_SUBJECT = {
  listening: '听力',
  reading: '阅读',
  writing: '写作',
  speaking: '口语',
};

/**
 * 将旧 type 字段映射为中文科目（未知值原样返回，兼容自定义标签）
 */
const mapTypeToSubject = (type) => TYPE_TO_SUBJECT[type] || type;

/**
 * 获取科目显示标签（英文 key → 中文；中文/自定义标签原样返回）
 */
const getSubjectLabel = (subject) => TYPE_TO_SUBJECT[subject] || subject;

module.exports = { mapTypeToSubject, getSubjectLabel };
