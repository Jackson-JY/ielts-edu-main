// pages/learning-report/learning-report.js
const cloudDB = require('../../utils/cloudDB');
const { formatDate } = require('../../utils/dateUtil');
const reportPoster = require('../../utils/reportPoster');
const { drawMiniChart, drawTotalChart } = require('../../utils/miniChart');

Page({
  data: {
    currentDateRange: '',
    studyData: {
      totalHours: 0,
      avgDaily: 0,
      completedCourses: 0,
      vocabLearned: 0,
    },
    trendData: [],
    examScores: [],
    examScoresReverse: [],
    // 听说读写四项打卡次数统计
    subjectCheckinStats: [
      { id: 'listening', label: '听力', iconName: 'headphones', count: 0 },
      { id: 'speaking', label: '口语', iconName: 'mic', count: 0 },
      { id: 'reading', label: '阅读', iconName: 'book', count: 0 },
      { id: 'writing', label: '写作', iconName: 'pen', count: 0 },
    ],
  },

  async onLoad() {
    this.loadLearningData();
  },

  onReady() {
    this.drawAllSubjectCharts();
  },

  /**
   * 生成分享图片
   */
  async generateShareImage() {
    wx.showLoading({ title: '生成中...' });

    try {
      const { studyData, examScoresReverse, currentDateRange } = this.data;
      const shareImagePath = await reportPoster.drawShareCanvas({
        studyData,
        examScoresReverse,
        currentDateRange,
      });

      wx.hideLoading();

      // 预览并分享
      wx.previewImage({
        urls: [shareImagePath],
        success: () => {
          // 显示分享菜单
          wx.showActionSheet({
            itemList: ['保存到相册', '分享到朋友圈'],
            success: (res) => {
              if (res.tapIndex === 0) {
                reportPoster.saveImageToAlbum(shareImagePath);
              } else if (res.tapIndex === 1) {
                reportPoster.shareToTimeline(shareImagePath, studyData, examScoresReverse);
              }
            }
          });
        }
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
      console.error('生成分享图片失败:', error);
    }
  },

  onPullDownRefresh() {
    this.loadLearningData();
    wx.stopPullDownRefresh();
  },

  /**
   * 从云数据库加载学习报告数据
   */
  async loadLearningData() {
    try {
      const [userRes, checkinRes, courseRes, examRes] = await Promise.all([
        cloudDB.getMy('users'),
        cloudDB.getMy('checkins'),
        cloudDB.getMy('courses', (q) => q.where({ status: '已完成' }).limit(200)),
        cloudDB.getMy('exam_scores'),
      ]);

      // 计算统计数据
      let studyData = {
        totalHours: 0,
        avgDaily: 0,
        completedCourses: 0,
        vocabLearned: 0,
      };

      if (userRes.success && userRes.data.length > 0) {
        const user = userRes.data[0];
        studyData.vocabLearned = user.vocabulary || 0;
        studyData.studyDays = user.studyDays || 0;
      }

      if (checkinRes.success) {
        studyData.totalDays = checkinRes.data.length;
        // 每次打卡约1.5小时
        studyData.totalHours = (checkinRes.data.length * 1.5).toFixed(1);
        studyData.avgDaily = checkinRes.data.length > 0
          ? ((checkinRes.data.length * 1.5) / 30).toFixed(1)
          : 0;
      }

      if (courseRes.success) {
        studyData.completedCourses = courseRes.data.length;
      }

      // 生成7天趋势数据
      const trendData = this.generateTrendData(checkinRes.data || []);

      // 统计听说读写各项打卡次数
      const subjectCheckinStats = this.calcSubjectCheckinStats(checkinRes.data || []);

      // 处理考试成绩数据
      let examScores = [];
      let examScoresReverse = [];
      if (examRes.success && examRes.data.length > 0) {
        examScores = examRes.data;
        examScoresReverse = [...examScores].reverse();

        // 计算每条成绩的提高分数（相对于第一次考试）
        if (examScores.length > 1) {
          const firstScore = examScores[0];
          examScores = examScores.map((exam, index) => ({
            ...exam,
            isLatest: index === examScores.length - 1,
            examCount: examScores.length,
            actualCount: examScores.length - index, // 实际次数：8次考试则为8、7、6、5...
            improvement: exam.total - firstScore.total,
            listeningImprovement: (exam.listening || 0) - (firstScore.listening || 0),
            readingImprovement: (exam.reading || 0) - (firstScore.reading || 0),
            writingImprovement: (exam.writing || 0) - (firstScore.writing || 0),
            speakingImprovement: (exam.speaking || 0) - (firstScore.speaking || 0),
          }));
          // 倒序数组：第一个是最新考试
          examScoresReverse = [...examScores].reverse().map((exam, index) => ({
            ...exam,
            isLatest: index === 0, // 倒序后第一个是最新
            actualCount: examScores.length - index, // 8、7、6、5...
          }));
        } else if (examScores.length === 1) {
          examScores[0].isLatest = true;
          examScores[0].improvement = 0;
          examScores[0].examCount = 1;
          examScores[0].actualCount = 1;
          examScores[0].listeningImprovement = 0;
          examScores[0].readingImprovement = 0;
          examScores[0].writingImprovement = 0;
          examScores[0].speakingImprovement = 0;
          examScoresReverse = [...examScores];
        }
      }

      this.setData({
        studyData,
        trendData,
        examScores,
        examScoresReverse,
        subjectCheckinStats,
        currentDateRange: this.getCurrentRange(),
      }, () => {
        // 数据加载完成后绘制科目趋势图
        this.drawAllSubjectCharts();
      });
    } catch (e) {
      console.error('加载学习报告数据失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 统计听说读写四项各自的打卡次数
   * @param {Array} checkins - checkins 集合记录，每条含 types: ['listening', 'speaking', ...]
   * @returns {Array} [{ id, label, iconName, count }]
   */
  calcSubjectCheckinStats(checkins) {
    const counters = { listening: 0, speaking: 0, reading: 0, writing: 0 };

    (checkins || []).forEach(item => {
      (item.types || []).forEach(type => {
        if (Object.prototype.hasOwnProperty.call(counters, type)) {
          counters[type] += 1;
        }
      });
    });

    const labels = { listening: '听力', speaking: '口语', reading: '阅读', writing: '写作' };
    const iconNames = { listening: 'headphones', speaking: 'mic', reading: 'book', writing: 'pen' };

    return Object.keys(counters).map(id => ({
      id,
      label: labels[id],
      iconName: iconNames[id],
      count: counters[id],
    }));
  },

  generateTrendData(checkins) {
    const today = new Date();
    const trendData = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = formatDate(date);
      const dayCheckins = checkins.filter(c => c.date === dateStr);
      const hours = dayCheckins.length * 1.5;
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      trendData.push({
        label: `${month}-${day}`,
        hours: parseFloat(hours.toFixed(1)),
      });
    }

    return trendData;
  },

  /**
   * 绘制所有科目趋势图
   */
  drawAllSubjectCharts() {
    const examScores = this.data.examScoresReverse;
    if (!examScores || examScores.length === 0) return;

    // 绘制各科目趋势图：折线颜色统一为薄荷绿 #12B7A8
    drawMiniChart('listeningCanvas', examScores, 'listening', '#12B7A8');
    drawMiniChart('readingCanvas', examScores, 'reading', '#12B7A8');
    drawMiniChart('writingCanvas', examScores, 'writing', '#12B7A8');
    drawMiniChart('speakingCanvas', examScores, 'speaking', '#12B7A8');

    // 绘制总成绩趋势图
    drawTotalChart(examScores);
  },

  getCurrentRange() {
    const now = new Date();
    return `${now.getFullYear()}年${now.getMonth() + 1}月`;
  },

  previousPeriod() {
    wx.showToast({ title: '已切换到上一月', icon: 'none' });
    this.loadLearningData();
  },

  nextPeriod() {
    wx.showToast({ title: '已切换到下一月', icon: 'none' });
    this.loadLearningData();
  },

  shareReport() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onShareAppMessage() {
    const { studyData, examScoresReverse } = this.data;
    const latestScore = examScoresReverse.length > 0 ? examScoresReverse[examScoresReverse.length - 1].total : 0;

    let title = '我在雅思学习平台取得了进步！';
    if (latestScore > 0) {
      title = `我的雅思成绩${latestScore}分，已学习${studyData.totalHours}小时，一起来进步吧！`;
    } else if (studyData.totalDays > 0) {
      title = `我已坚持雅思学习${studyData.totalDays}天，一起来打卡吧！`;
    }

    return {
      title: title,
      path: '/pages/learning-report/learning-report',
    };
  },

  onShareTimeline() {
    const { studyData, examScoresReverse } = this.data;
    const latestScore = examScoresReverse.length > 0 ? examScoresReverse[examScoresReverse.length - 1].total : 0;

    let title = '雅思学习报告 - 学习总结';
    if (latestScore > 0) {
      title = `雅思成绩${latestScore}分 | 学习${studyData.totalHours}小时 | ${studyData.totalDays}天打卡`;
    }

    return {
      title: title,
      query: 'from=timeline'
    };
  },
});
