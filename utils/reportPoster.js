/**
 * 学习报告分享海报绘制（从 learning-report 页抽取，纯 Canvas 逻辑）
 * 注意：wx.createSelectorQuery() 未带 .in()，仅适用于 Page 上下文；组件内使用需自行 .in(component)
 */

/** 在画布上绘制圆角矩形路径（调用方自行 fill/stroke） */
function roundRect(ctx, x, y, width, height, radius) {
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
}

/** 在画布上绘制成绩趋势折线图 */
function drawTrendOnCanvas(ctx, examScores, x, y, width, height) {
  const padding = { top: 30, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxScore = 9;

  // 绘制背景
  ctx.fillStyle = '#F2F2F7';
  roundRect(ctx, x, y, width, height, 15);
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
    ctx.strokeStyle = '#12B7A8';
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
    ctx.strokeStyle = '#12B7A8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#12B7A8';
    ctx.fill();

    // 显示分数
    ctx.fillStyle = '#1D1D1F';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.score.toFixed(1), p.x, p.y - 15);
  });
}

/**
 * 绘制分享海报并导出临时图片
 * @param {Object} data
 * @param {Object} data.studyData - 学习统计
 * @param {Array}  data.examScoresReverse - 成绩（时间正序，最后一条最新）
 * @param {string} data.currentDateRange - 日期范围文案
 * @returns {Promise<string>} tempFilePath
 */
function drawShareCanvas({ studyData, examScoresReverse, currentDateRange }) {
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
        gradient.addColorStop(0, '#F5F5F7');
        gradient.addColorStop(1, '#FFFFFF');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // 绘制顶部装饰：薄荷绿
        const headerGradient = ctx.createLinearGradient(0, 0, width, 200);
        headerGradient.addColorStop(0, '#12B7A8');
        headerGradient.addColorStop(1, '#0E8C81');
        ctx.fillStyle = headerGradient;
        ctx.fillRect(0, 0, width, 280);

        // 计算白色卡片高度
        const cardHeight = height - 200 - 40;

        // 绘制白色圆角卡片背景
        ctx.fillStyle = '#FFFFFF';
        roundRect(ctx, 30, 180, 690, cardHeight, 30);
        ctx.fill();

        // 绘制标题
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('雅思学习报告', width / 2, 80);

        // 绘制日期
        ctx.font = '28px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(currentDateRange, width / 2, 130);

        // 绘制总分（如果有）
        let currentY = 260;
        if (latestScore) {
          ctx.fillStyle = '#1D1D1F';
          ctx.font = '28px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('最新成绩', 70, currentY);

          currentY += 80;
          ctx.fillStyle = '#12B7A8';
          ctx.font = 'bold 120px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(latestScore.total.toFixed(1), width / 2, currentY);

          currentY += 40;
          ctx.fillStyle = '#8E8E93';
          ctx.font = '28px sans-serif';
          ctx.fillText('总分', width / 2, currentY);

          // 绘制四科分数：单色化
          currentY += 80;
          const subjects = [
            { name: '听力', score: latestScore.listening },
            { name: '阅读', score: latestScore.reading },
            { name: '写作', score: latestScore.writing },
            { name: '口语', score: latestScore.speaking }
          ];

          const startX = 80;
          const gap = 160;
          subjects.forEach((sub, index) => {
            const x = startX + gap * index;

            // 科目名
            ctx.fillStyle = '#8E8E93';
            ctx.font = '22px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sub.name, x + 30, currentY + 20);

            // 分数
            ctx.fillStyle = '#1D1D1F';
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText((sub.score || 0).toFixed(1), x + 30, currentY + 85);
          });

          currentY += 140;
        }

        // 绘制学习数据
        ctx.fillStyle = '#1D1D1F';
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
            ctx.fillStyle = '#F2F2F7';
            roundRect(ctx, x, y - 50, 300, 120, 20);
            ctx.fill();

            // 数值
            ctx.fillStyle = '#12B7A8';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(stat.value, x + 30, y + 10);

            // 标签
            ctx.fillStyle = '#8E8E93';
            ctx.font = '22px sans-serif';
            ctx.fillText(stat.label, x + 30, y + 45);
          });
        });

        currentY += 320;

        // 绘制成绩趋势图（如果有数据）
        if (examScoresReverse.length > 1) {
          ctx.fillStyle = '#1D1D1F';
          ctx.font = '28px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('成绩趋势', 70, currentY);

          // 绘制趋势图
          currentY += 40;
          drawTrendOnCanvas(ctx, examScoresReverse, 70, currentY, 610, 200);

          currentY += 240;
        }

        // 绘制底部二维码区域
        ctx.fillStyle = '#F2F2F7';
        roundRect(ctx, 70, currentY, 610, 140, 20);
        ctx.fill();

        // 绘制小程序码占位
        ctx.fillStyle = '#E5E5EA';
        roundRect(ctx, 100, currentY + 20, 100, 100, 10);
        ctx.fill();

        ctx.strokeStyle = '#8E8E93';
        ctx.lineWidth = 4;
        ctx.strokeRect(124, currentY + 44, 52, 52);

        // 扫码提示
        ctx.fillStyle = '#1D1D1F';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('扫码查看完整报告', 230, currentY + 60);

        ctx.fillStyle = '#8E8E93';
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
}

/** 保存图片到相册（含授权拒绝引导） */
function saveImageToAlbum(filePath) {
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
}

/** 调起图片分享菜单（朋友圈等） */
function shareToTimeline(filePath, studyData, examScoresReverse) {
  const latestScore = examScoresReverse.length > 0 ? examScoresReverse[examScoresReverse.length - 1].total : 0;

  let title = '雅思学习报告 - 学习总结';
  if (latestScore > 0) {
    title = `雅思成绩${latestScore}分 | 学习${studyData.totalHours}小时 | ${studyData.totalDays}天打卡`;
  }

  wx.showShareImageMenu({
    path: filePath,
    title: title
  });
}

module.exports = { roundRect, drawTrendOnCanvas, drawShareCanvas, saveImageToAlbum, shareToTimeline };
