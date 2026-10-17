/**
 * 学习报告页迷你趋势图（Canvas 2D，从 learning-report 页抽取）
 * 注意：wx.createSelectorQuery() 未带 .in()，仅适用于 Page 上下文
 */

/**
 * 绘制单科迷你趋势图
 * @param {string} canvasId - 不带 # 的 canvas 节点 id
 * @param {Array} examScores - 成绩数组（时间正序）
 * @param {string} subjectKey - listening/reading/writing/speaking
 * @param {string} color - 折线颜色
 */
function drawMiniChart(canvasId, examScores, subjectKey, color) {
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
        ctx.fillStyle = '#8E8E93';
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
}

/**
 * 绘制总成绩趋势图
 * @param {Array} examScores - 成绩数组（时间正序），每条含 total
 */
function drawTotalChart(examScores) {
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

      // 绘制网格线：极浅 #F2F2F7
      ctx.strokeStyle = '#F2F2F7';
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
      ctx.fillStyle = '#8E8E93';
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
        // 创建渐变：薄荷绿衍生色
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, 'rgba(18, 183, 168, 0.4)');
        gradient.addColorStop(1, 'rgba(18, 183, 168, 0.05)');

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
        ctx.strokeStyle = '#12B7A8';
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
        ctx.strokeStyle = '#12B7A8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 内圈
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#12B7A8';
        ctx.fill();

        // 显示分数
        ctx.fillStyle = '#1D1D1F';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(p.total.toFixed(1), p.x, p.y - 10);
      });
    });
}

module.exports = { drawMiniChart, drawTotalChart };
