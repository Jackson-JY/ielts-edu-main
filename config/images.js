/**
 * 图片资源管理配置
 * 
 * 大图片已上传到云存储，小程序包内只保留小图标
 * 云存储路径：cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1324778859/images/
 */

// 云存储中的大图片资源
// 使用 cloud:// 协议路径，通过 getTempFileURL 获取临时访问链接
const CLOUD_IMAGES = {
  // Logo
  logo: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/logo.jpg',
  // 默认头像
  defaultAvatar: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/default-avatar.png',
  // 课程封面
  trialCourse: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/trial-course.png',
  // 图标资源
  iconBook: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-book.png',
  iconCalendar: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-calendar.png',
  iconChart: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-chart.png',
  iconCheck: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-check.png',
  iconDocument: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-document.png',
  iconFire: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-fire.png',
  iconHeadphones: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-headphones.png',
  iconMic: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-mic.png',
  iconPause: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-pause.png',
  iconPen: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-pen.png',
  iconPlay: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-play.png',
  iconPlus: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-plus.png',
  iconRefresh: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-refresh.png',
  iconSettings: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-settings.png',
  iconSupport: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-support.png',
  iconTarget: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-target.png',
  iconUser: 'cloud://cloud1-d7g66xvli7bb6bcc6.636c-cloud1-d7g66xvli7bb6bcc6-1428001663/images/icon-user.png',
};

// 本地小图标（保留在小程序包内）
const LOCAL_IMAGES = {
  // Tab 栏图标
  tabHome: '/images/tab-home.png',
  tabHomeActive: '/images/tab-home-active.png',
  tabCourse: '/images/tab-course.png',
  tabCourseActive: '/images/tab-course-active.png',
  tabHomework: '/images/tab-homework.png',
  tabHomeworkActive: '/images/tab-homework-active.png',
  tabProfile: '/images/tab-profile.png',
  tabProfileActive: '/images/tab-profile-active.png',
};

module.exports = {
  CLOUD_IMAGES,
  LOCAL_IMAGES,
};
