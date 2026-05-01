// pages/assessment/writing/writing.js
Page({
  data: {
    currentTask: 'task1',
    currentStep: 'outline',
    outline: '',
    content: '',
    task1: {
      title: 'Task 1 - 图表描述',
      description: 'The chart below shows the percentage of households in different countries that owned a smartphone in 2020.',
      wordCount: '150+ 字'
    },
    task2: {
      title: 'Task 2 - 观点论述',
      description: 'Some people believe that technology has made our lives easier, while others think it has created new problems. Discuss both views and give your own opinion.',
      wordCount: '250+ 字'
    },
    currentTaskData: {}
  },

  onLoad() {
    this.updateTaskData();
  },

  // 更新当前任务数据
  updateTaskData() {
    const { currentTask, task1, task2 } = this.data;
    const currentTaskData = currentTask === 'task1' ? task1 : task2;
    this.setData({ currentTaskData });
  },

  // 切换 Task
  switchTask(e) {
    const task = e.currentTarget.dataset.task;
    this.setData({
      currentTask: task,
      currentStep: 'outline',
      outline: '',
      content: ''
    });
    this.updateTaskData();
  },

  // 切换 Step
  switchStep(e) {
    const step = e.currentTarget.dataset.step;
    this.setData({ currentStep: step });
  },

  // 输入思路
  onOutlineInput(e) {
    this.setData({ outline: e.detail.value });
  },

  // 输入正文
  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  // 下一步/提交
  handleNext() {
    const { currentStep, currentTask, outline, content } = this.data;

    if (currentStep === 'outline') {
      // 验证思路字数
      if (outline.length < 10) {
        wx.showToast({
          title: '思路至少10个字',
          icon: 'none'
        });
        return;
      }
      this.setData({ currentStep: 'content' });
    } else {
      // 验证正文字数
      if (content.length < 50) {
        wx.showToast({
          title: '正文至少50个字',
          icon: 'none'
        });
        return;
      }

      // 保存当前 Task 的答案
      const writingData = wx.getStorageSync('writingData') || {};
      writingData[currentTask] = { outline, content };
      wx.setStorageSync('writingData', writingData);

      if (currentTask === 'task1') {
        // 进入 Task 2
        this.setData({
          currentTask: 'task2',
          currentStep: 'outline',
          outline: '',
          content: ''
        });
        this.updateTaskData();
      } else {
        // 完成所有测评，跳转到结果页
        wx.redirectTo({
          url: '/pages/assessment/result/result'
        });
      }
    }
  }
});
