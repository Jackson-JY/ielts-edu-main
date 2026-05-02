/**
 * 云数据库工具库
 * 封装微信云开发数据库常用操作
 *
 * 使用方式：
 * const cloudDB = require('../../utils/cloudDB');
 * const db = cloudDB.getDB();
 * const users = await cloudDB.collection('users').get();
 */

/**
 * 获取数据库实例（单例）
 * @returns {wx.cloud.DB} 数据库实例
 */
const getDB = () => {
  const app = getApp();
  return app.globalData.db;
};

/**
 * 获取集合引用
 * @param {string} name - 集合名称
 * @returns {wx.cloud.CollectionReference} 集合引用
 */
const collection = (name) => {
  return getDB().collection(name);
};

/**
 * 添加文档
 * @param {string} collName - 集合名称
 * @param {Object} data - 文档数据
 * @returns {Promise<Object>} 包含 _id 的结果
 */
const add = async (collName, data) => {
  try {
    const res = await collection(collName).add({
      data: {
        ...data,
        _createTime: new Date(),
        _updateTime: new Date(),
      },
    });
    return { success: true, id: res._id };
  } catch (e) {
    console.error(`[cloudDB.add ${collName}] 失败`, e);
    return { success: false, error: e.message };
  }
};

/**
 * 查询文档（支持多种查询方式）
 * @param {string} collName - 集合名称
 * @param {Object|Function} query - 查询条件或回调
 * @returns {Promise<Array>} 文档数组
 */
const get = async (collName, query) => {
  try {
    let dbQuery = collection(collName);

    if (typeof query === 'function') {
      dbQuery = query(dbQuery);
    } else if (query && typeof query === 'object') {
      dbQuery = dbQuery.where(query);
    }

    const res = await dbQuery.orderBy('_createTime', 'desc').get();
    return { success: true, data: res.data };
  } catch (e) {
    console.error(`[cloudDB.get ${collName}] 失败`, e);
    return { success: false, error: e.message, data: [] };
  }
};

/**
 * 更新文档
 * @param {string} collName - 集合名称
 * @param {string} id - 文档 ID
 * @param {Object} data - 更新数据
 * @returns {Promise<Object>}
 */
const update = async (collName, id, data) => {
  try {
    await collection(collName).doc(id).update({
      data: {
        ...data,
        _updateTime: new Date(),
      },
    });
    return { success: true };
  } catch (e) {
    console.error(`[cloudDB.update ${collName}] 失败`, e);
    return { success: false, error: e.message };
  }
};

/**
 * 删除文档
 * @param {string} collName - 集合名称
 * @param {string} id - 文档 ID
 * @returns {Promise<Object>}
 */
const remove = async (collName, id) => {
  try {
    await collection(collName).doc(id).remove();
    return { success: true };
  } catch (e) {
    console.error(`[cloudDB.remove ${collName}] 失败`, e);
    return { success: false, error: e.message };
  }
};

/**
 * 获取当前用户的所有文档
 * @param {string} collName - 集合名称
 * @param {Function|Object} query - 查询条件（回调函数或 where 对象）
 * @returns {Promise<Object>}
 * @description 云开发会自动根据用户权限过滤数据，不需要手动指定 _openid
 */
const getMy = async (collName, query) => {
  const app = getApp();
  const userInfo = app.globalData.userInfo;
  
  // 检查用户是否登录
  if (!userInfo && !app.globalData.isLoggedIn) {
    console.log('[cloudDB.getMy] 用户未登录，返回空数据');
    return { success: true, data: [] };
  }
  
  // 直接查询，云开发安全规则会自动过滤当前用户的数据
  if (typeof query === 'function') {
    return get(collName, query);
  }
  
  return get(collName, query);
};

/**
 * 添加属于当前用户的文档
 * @param {string} collName - 集合名称
 * @param {Object} data - 文档数据
 * @returns {Promise<Object>}
 */
const addMy = async (collName, data) => {
  const app = getApp();
  const userInfo = app.globalData.userInfo;
  
  // 云开发会自动为每个记录添加 _openid 字段，不需要手动添加
  if (!userInfo) {
    return { success: false, error: '用户未登录' };
  }
  
  return add(collName, data);
};

/**
 * 按日期范围查询
 * @param {string} collName - 集合名称
 * @param {string} dateField - 日期字段名
 * @param {string} startDate - 开始日期 YYYY-MM-DD
 * @param {string} endDate - 结束日期 YYYY-MM-DD
 * @param {Object} extraQuery - 额外查询条件
 * @returns {Promise<Object>}
 */
const getByDateRange = async (collName, dateField, startDate, endDate, extraQuery) => {
  try {
    const res = await get(collName, (dbQuery) => {
      let q = dbQuery.where({
        [dateField]: getDB().command.gte(startDate),
      });
      if (endDate) {
        q = q.where({
          [dateField]: getDB().command.lte(endDate),
        });
      }
      if (extraQuery) {
        q = q.where(extraQuery);
      }
      return q.orderBy(dateField, 'asc');
    });
    return res;
  } catch (e) {
    console.error(`[cloudDB.getByDateRange ${collName}] 失败`, e);
    return { success: false, error: e.message, data: [] };
  }
};

module.exports = {
  getDB,
  collection,
  add,
  get,
  update,
  remove,
  getMy,
  addMy,
  getByDateRange,
};
