# Tab 图标文件清单

请在 `images/` 目录下放置以下8个图标文件（81x81px, PNG, <40KB）。

> 配色已与全局主题对齐（见 `app.json` tabBar 配置 / `app.wxss` 全局色板）：
> - 未选中色：`#9AA5B1`（中性灰蓝，呼应页面次要文字色 `#7A8794`）
> - 选中色：`#12B7A8`（品牌主色，与按钮、强调色保持一致）
>
> 制作新图标时，请直接按以下两色绘制，不要再使用旧版 `#9A97AA` / `#4A4A4A` 配色，
> 以免与统一后的视觉体系产生割裂。

| 文件名 | 说明 | 颜色 |
|--------|------|------|
| tab-home.png | 首页（未选中） | 灰蓝 #9AA5B1 |
| tab-home-active.png | 首页（选中） | 主色 #12B7A8 |
| tab-course.png | 学习（未选中） | 灰蓝 #9AA5B1 |
| tab-course-active.png | 学习（选中） | 主色 #12B7A8 |
| tab-homework.png | 作业（未选中） | 灰蓝 #9AA5B1 |
| tab-homework-active.png | 作业（选中） | 主色 #12B7A8 |
| tab-profile.png | 我的（未选中） | 灰蓝 #9AA5B1 |
| tab-profile-active.png | 我的（选中） | 主色 #12B7A8 |

## 推荐图标库
统一选用同一套线性图标库（描边粗细、圆角风格保持一致），避免不同来源图标混用造成风格割裂：
- iconfont: https://www.iconfont.cn/
- Heroicons: https://heroicons.com/
- Feather Icons: https://feathericons.com/
- Tabler Icons: https://tabler.io/icons

搜索关键词：home, book, pencil, user

## 关于历史生成脚本
此前 `images/` 目录下曾存放多版基于 PIL/emoji 临时拼凑图标的生成脚本
（`gen_icons_v2/v3/v4.py`、`generate_beautiful_icons.py`、`remove_bg*.py` 等），
因效果不理想、依赖本机字体路径（不可移植）且未在代码中被引用，已统一清理，
仅保留最终采用的图标产物。后续如需新图标，请直接从上方图标库选型导出，
不再用脚本现场生成。
