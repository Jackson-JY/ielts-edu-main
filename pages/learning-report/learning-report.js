// pages/learning-report/learning-report.js
const cloudDB = require('../../utils/cloudDB');
const cloudStorage = require('../../utils/cloudStorage');
const { CLOUD_IMAGES } = require('../../config/images');
const { formatDate } = require('../../utils/dateUtil');

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
      { id: 'listening', label: '听力', icon: '', count: 0 },
      { id: 'speaking', label: '口语', icon: '', count: 0 },
      { id: 'reading', label: '阅读', icon: '', count: 0 },
      { id: 'writing', label: '写作', icon: '', count: 0 },
    ],
    iconHeadphones: '',
    iconBook: '',
    iconPen: '',
    iconMic: '',
    iconChart: '',
    iconCalendar: '',
    iconCheck: '',
    iconTarget: '',
    iconDocument: '',
    iconFire: '',
  },

  async onLoad() {
    await this.loadIcons();
    this.loadLearningData();
  },

  async loadIcons() {
    try {
      const fileIDs = [
        CLOUD_IMAGES.iconHeadphones,
        CLOUD_IMAGES.iconBook,
        CLOUD_IMAGES.iconPen,
        CLOUD_IMAGES.iconMic,
        CLOUD_IMAGES.iconChart,
        CLOUD_IMAGES.iconCalendar,
        CLOUD_IMAGES.iconCheck,
        CLOUD_IMAGES.iconTarget,
        CLOUD_IMAGES.iconDocument,
        CLOUD_IMAGES.iconFire,
      ];
      const urlMap = await cloudStorage.getTempUrls(fileIDs);
      this.setData({
        iconHeadphones: urlMap[CLOUD_IMAGES.iconHeadphones] || '',
        iconBook: urlMap[CLOUD_IMAGES.iconBook] || '',
        iconPen: urlMap[CLOUD_IMAGES.iconPen] || '',
        iconMic: urlMap[CLOUD_IMAGES.iconMic] || '',
        iconChart: urlMap[CLOUD_IMAGES.iconChart] || '',
        iconCalendar: urlMap[CLOUD_IMAGES.iconCalendar] || '',
        iconCheck: urlMap[CLOUD_IMAGES.iconCheck] || '',
        iconTarget: urlMap[CLOUD_IMAGES.iconTarget] || '',
        iconDocument: urlMap[CLOUD_IMAGES.iconDocument] || '',
        iconFire: urlMap[CLOUD_IMAGES.iconFire] || '',
      });
    } catch (e) {
      console.error('[学习报告] 加载图标失败', e);
    }
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
      const shareImagePath = await this.drawShareCanvas();
      
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
                this.saveImageToAlbum(shareImagePath);
              } else if (res.tapIndex === 1) {
                this.shareToTimeline(shareImagePath);
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

  /**
   * 绘制分享海报
   */
  drawShareCanvas() {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select('#shareCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0]) {
            reject(new Error('Canvas not found'));
            return;
          }
          
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;
          
          const { studyData, examScoresReverse } = this.data;
          const latestScore = examScoresReverse.length > 0 ? examScoresReverse[examScoresReverse.length - 1] : null;
          
          // 计算内容高度
          let contentHeight = 1160; // 基础高度
          if (latestScore) {
            contentHeight += 280; // 成绩区域
          }
          if (examScoresReverse.length > 1) {
            contentHeight += 260; // 趋势图区域
          }
          
          // 设置画布尺寸
          const width = 750;
          const height = contentHeight;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
          
          // 绘制背景
          const gradient = ctx.createLinearGradient(0, 0, 0, height);
          gradient.addColorStop(0, '#F8F4FF');
          gradient.addColorStop(1, '#FFFFFF');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
          
          // 绘制顶部装饰
          const headerGradient = ctx.createLinearGradient(0, 0, width, 200);
          headerGradient.addColorStop(0, '#6C5CE7');
          headerGradient.addColorStop(1, '#A29BFE');
          ctx.fillStyle = headerGradient;
          ctx.fillRect(0, 0, width, 280);
          
          // 计算白色卡片高度
          const cardHeight = height - 200 - 40;
          
          // 绘制白色圆角卡片背景
          ctx.fillStyle = '#FFFFFF';
          this.roundRect(ctx, 30, 180, 690, cardHeight, 30);
          ctx.fill();
          
          // 绘制标题
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 48px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('雅思学习报告', width / 2, 80);
          
          // 绘制日期
          ctx.font = '28px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillText(this.data.currentDateRange, width / 2, 130);
          
          // 绘制总分（如果有）
          let currentY = 260;
          if (latestScore) {
            ctx.fillStyle = '#4A4A4A';
            ctx.font = '28px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('最新成绩', 70, currentY);
            
            currentY += 80;
            ctx.fillStyle = '#FFC107';
            ctx.font = 'bold 120px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(latestScore.total.toFixed(1), width / 2, currentY);
            
            currentY += 40;
            ctx.fillStyle = '#9A97AA';
            ctx.font = '28px sans-serif';
            ctx.fillText('总分', width / 2, currentY);
            
            // 绘制四科分数
            currentY += 80;
            const subjects = [
              { name: '听力', score: latestScore.listening, color: '#4CAF50' },
              { name: '阅读', score: latestScore.reading, color: '#2196F3' },
              { name: '写作', score: latestScore.writing, color: '#FF9800' },
              { name: '口语', score: latestScore.speaking, color: '#E91E63' }
            ];
            
            const startX = 80;
            const gap = 160;
            subjects.forEach((sub, index) => {
              const x = startX + gap * index;
              
              // 科目名
              ctx.fillStyle = '#9A97AA';
              ctx.font = '22px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(sub.name, x + 30, currentY + 20);
              
              // 分数
              ctx.fillStyle = sub.color;
              ctx.font = 'bold 36px sans-serif';
              ctx.fillText((sub.score || 0).toFixed(1), x + 30, currentY + 85);
            });
            
            currentY += 140;
          }
          
          // 绘制学习数据
          ctx.fillStyle = '#4A4A4A';
          ctx.font = '28px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('学习数据', 70, currentY);
          
          currentY += 80;
          const stats = [
            { label: '学习时长', value: (studyData.totalHours || 0) + 'h' },
            { label: '打卡天数', value: (studyData.totalDays || 0) + '天' },
            { label: '掌握词汇', value: (studyData.vocabLearned || 0) + '个' },
            { label: '完成课程', value: (studyData.completedCourses || 0) + '节' }
          ];
          
          // 两行显示
          const row1 = stats.slice(0, 2);
          const row2 = stats.slice(2, 4);
          
          [row1, row2].forEach((row, rowIndex) => {
            const y = currentY + rowIndex * 140;
            row.forEach((stat, index) => {
              const x = 80 + index * 330;
              
              // 背景卡片
              ctx.fillStyle = '#F8F4FF';
              this.roundRect(ctx, x, y - 50, 300, 120, 20);
              ctx.fill();
              
              // 数值
              ctx.fillStyle = '#6C5CE7';
              ctx.font = 'bold 40px sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText(stat.value, x + 30, y + 10);
              
              // 标签
              ctx.fillStyle = '#9A97AA';
              ctx.font = '22px sans-serif';
              ctx.fillText(stat.label, x + 30, y + 45);
            });
          });
          
          currentY += 320;
          
          // 绘制成绩趋势图（如果有数据）
          if (examScoresReverse.length > 1) {
            ctx.fillStyle = '#4A4A4A';
            ctx.font = '28px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('成绩趋势', 70, currentY);
            
            // 绘制趋势图
            currentY += 40;
            this.drawTrendOnCanvas(ctx, examScoresReverse, 70, currentY, 610, 200);
            
            currentY += 240;
          }
          
          // 绘制底部二维码区域
          ctx.fillStyle = '#F8F4FF';
          this.roundRect(ctx, 70, currentY, 610, 140, 20);
          ctx.fill();
          
          // 绘制小程序码占位
          ctx.fillStyle = '#E8E8E8';
          this.roundRect(ctx, 100, currentY + 20, 100, 100, 10);
          ctx.fill();
          
          ctx.strokeStyle = '#9A97AA';
          ctx.lineWidth = 4;
          ctx.strokeRect(124, currentY + 44, 52, 52);
          
          // 扫码提示
          ctx.fillStyle = '#4A4A4A';
          ctx.font = '28px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('扫码查看完整报告', 230, currentY + 60);
          
          ctx.fillStyle = '#9A97AA';
          ctx.font = '22px sans-serif';
          ctx.fillText('加入雅思学习平台，一起进步', 230, currentY + 95);
          
          // 导出图片 - 使用动态计算的宽高
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: width,
            height: height,
            destWidth: width,
            destHeight: height,
            fileType: 'png',
            quality: 1,
            success: (res) => {
              resolve(res.tempFilePath);
            },
            fail: reject
          });
        });
    });
  },

  /**
   * 在画布上绘制圆角矩形
   */
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  },

  /**
   * 在画布上绘制趋势图
   */
  drawTrendOnCanvas(ctx, examScores, x, y, width, height) {
    const padding = { top: 30, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxScore = 9;
    
    // 绘制背景
    ctx.fillStyle = '#FFF8E7';
    this.roundRect(ctx, x, y, width, height, 15);
    ctx.fill();
    
    // 计算数据点
    const points = examScores.map((item, index) => {
      const px = x + padding.left + (examScores.length === 1 ? chartWidth / 2 : (chartWidth / (examScores.length - 1)) * index);
      const py = y + padding.top + chartHeight - (item.total / maxScore) * chartHeight;
      return { x: px, y: py, score: item.total };
    });
    
    // 绘制折线
    if (points.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#FFC107';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      points.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();
    }
    
    // 绘制数据点
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#FFC107';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFC107';
      ctx.fill();
      
      // 显示分数
      ctx.fillStyle = '#4A4A4A';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.score.toFixed(1), p.x, p.y - 15);
    });
  },

  /**
   * 保存图片到相册
   */
  saveImageToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: (err) => {
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要授权',
            content: '请允许保存图片到相册',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  /**
   * 分享到朋友圈
   */
  shareToTimeline(filePath) {
    const { studyData, examScoresReverse } = this.data;
    const latestScore = examScoresReverse.length > 0 ? examScoresReverse[examScoresReverse.length - 1].total : 0;
    
    let title = '雅思学习报告 - 学习总结';
    if (latestScore > 0) {
      title = `雅思成绩${latestScore}分 | 学习${studyData.totalHours}小时 | ${studyData.totalDays}天打卡`;
    }
    
    // 使用 onShareTimeline 分享到朋友圈
    wx.showShareImageMenu({
      path: filePath,
      title: title
    });
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
        cloudDB.getMy('courses', (q) => q.where({ status: '已完成' })),
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

      // 绑定对应科目图标（图标已在 loadIcons 中提前加载）
      const iconMap = {
        listening: this.data.iconHeadphones,
        speaking: this.data.iconMic,
        reading: this.data.iconBook,
        writing: this.data.iconPen,
      };
      const subjectCheckinStatsWithIcon = subjectCheckinStats.map(item => ({
        ...item,
        icon: iconMap[item.id] || '',
      }));

      this.setData({
        studyData,
        trendData,
        examScores,
        examScoresReverse,
        subjectCheckinStats: subjectCheckinStatsWithIcon,
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
   * @returns {Array} [{ id, label, icon, count }]
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

    return Object.keys(counters).map(id => ({
      id,
      label: labels[id],
      icon: '',
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

    // 绘制各科目趋势图
    this.drawMiniChart('listeningCanvas', examScores, 'listening', '#4CAF50');
    this.drawMiniChart('readingCanvas', examScores, 'reading', '#2196F3');
    this.drawMiniChart('writingCanvas', examScores, 'writing', '#FF9800');
    this.drawMiniChart('speakingCanvas', examScores, 'speaking', '#E91E63');
    
    // 绘制总成绩趋势图
    this.drawTotalChart();
  },

  /**
   * 绘制迷你科目趋势图
   */
  drawMiniChart(canvasId, examScores, subjectKey, color) {
    const query = wx.createSelectorQuery();
    query.select('#' + canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const width = res[0].width;
        const height = res[0].height;
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 提取该科目的分数数据
        const scores = examScores.map(exam => exam[subjectKey] || 0).filter(s => s > 0);
        if (scores.length === 0) {
          // 无数据显示提示
          ctx.fillStyle = '#9A97AA';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('暂无数据', width / 2, height / 2);
          return;
        }

        // 图表边距
        const padding = { top: 10, right: 10, bottom: 10, left: 10 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // 分数范围 0-9
        const maxScore = 9;

        // 计算数据点坐标
        const points = scores.map((score, index) => {
          const x = scores.length === 1 
            ? padding.left + chartWidth / 2 
            : padding.left + (chartWidth / (scores.length - 1)) * index;
          const y = padding.top + chartHeight - (score / maxScore) * chartHeight;
          return { x, y, score };
        });

        // 绘制折线
        if (points.length > 0) {
          // 创建渐变填充
          const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
          gradient.addColorStop(0, color + '40'); // 25% 透明度
          gradient.addColorStop(1, color + '0D'); // 5% 透明度

          // 填充区域
          ctx.beginPath();
          ctx.moveTo(points[0].x, height - padding.bottom);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          // 绘制折线
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          
          points.forEach((p, i) => {
            if (i === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.stroke();

          // 绘制数据点
          points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
          });

          // 显示最新分数
          const latestScore = scores[scores.length - 1];
          ctx.fillStyle = color;
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText(latestScore.toFixed(1), width - 10, 5);
        }
      });
  },

  /**
   * 绘制总成绩趋势图
   */
  drawTotalChart() {
    const examScores = this.data.examScoresReverse;
    if (!examScores || examScores.length === 0) return;

    const query = wx.createSelectorQuery();
    query.select('#totalCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const width = res[0].width;
        const height = res[0].height;
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        // 图表边距
        const padding = { top: 30, right: 20, bottom: 30, left: 40 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // 成绩范围 0-9
        const maxScore = 9;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        // 绘制网格线
        ctx.strokeStyle = '#E8E8E8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        
        // 横向网格线（5条，对应分数 0, 2, 4, 6, 8）
        for (let i = 0; i <= 4; i++) {
          const y = padding.top + (chartHeight / 4) * i;
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(width - padding.right, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // 绘制Y轴标签
        ctx.fillStyle = '#9A97AA';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        for (let i = 0; i <= 4; i++) {
          const value = 8 - i * 2;
          const y = padding.top + (chartHeight / 4) * i;
          ctx.fillText(value.toString(), padding.left - 8, y);
        }

        // 计算数据点坐标
        const points = examScores.map((item, index) => {
          const x = examScores.length === 1 
            ? padding.left + chartWidth / 2 
            : padding.left + (chartWidth / (examScores.length - 1)) * index;
          const y = padding.top + chartHeight - (item.total / maxScore) * chartHeight;
          return { x, y, ...item };
        });

        // 绘制折线（带渐变填充）
        if (points.length > 0) {
          // 创建渐变
          const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
          gradient.addColorStop(0, 'rgba(255, 193, 7, 0.4)');
          gradient.addColorStop(1, 'rgba(255, 193, 7, 0.05)');

          // 填充区域
          ctx.beginPath();
          ctx.moveTo(points[0].x, height - padding.bottom);
          points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.fill();

          // 绘制折线
          ctx.beginPath();
          ctx.strokeStyle = '#FFC107';
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          
          points.forEach((p, i) => {
            if (i === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.stroke();
        }

        // 绘制数据点
        points.forEach(p => {
          // 外圈
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = '#FFC107';
          ctx.lineWidth = 2;
          ctx.stroke();

          // 内圈
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFC107';
          ctx.fill();

          // 显示分数
          ctx.fillStyle = '#4A4A4A';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(p.total.toFixed(1), p.x, p.y - 10);
        });
      });
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
