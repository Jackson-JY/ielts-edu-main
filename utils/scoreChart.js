/**
 * 个人页成绩趋势折线图（Canvas 2D，从 profile 页抽取）
 * 注意：wx.createSelectorQuery() 未带 .in()，仅适用于 Page 上下文
 */

/**
 * 绘制 #scoreTrendCanvas 成绩总分趋势
 * @param {Array} examScores - 成绩数组（时间正序），每条含 total（0-9）
 */
function drawScoreTrendChart(examScores) {
  if (!examScores || examScores.length === 0) return;

  const query = wx.createSelectorQuery();
  query.select('#scoreTrendCanvas')
    .fields({ node: true, size: true })
    .exec((res) => {
      if (!res[0]) return;

      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const width = res[0].width;
      const height = res[0].height;
      const dpr = wx.getWindowInfo().pixelRatio;

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
      ctx.strokeStyle = '#E5E5EA';
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
        // 创建渐变
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, 'rgba(18, 183, 168, 0.20)');
        gradient.addColorStop(1, 'rgba(18, 183, 168, 0.02)');

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
      }

      // 绘制数据点
      points.forEach(p => {
        // 外圈
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#12B7A8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 内圈
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#12B7A8';
        ctx.fill();
      });
    });
}

module.exports = { drawScoreTrendChart };
