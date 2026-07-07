# ClipVault

> [English](README.md) · **简体中文**

低摩擦地收藏网页上的图片和文字。看到值得留存的东西——一张图、一段话、一个链接、整个页面——右键即可剪藏，它会落进一个完全存在你本机的私有库。自动打标签、按项目归类、随时搜索、随时导出。

无账号。无云端。无追踪。无服务器。

## 功能

- **万物可剪** —— 图片（缩略图 + 可达时保存原图）、选中文字、链接、整页。视频和推文会被识别并妥善处理。
- **保存前先成草稿** —— 剪藏时弹出小气泡，可设项目、标签、备注。**不点保存就不入库**；关闭即丢弃。
- **零负担归类** —— 自动推荐标签、项目、备注，并能跨标题/文本/标签/备注快速搜索。
- **瀑布流画廊** —— 干净的瀑布布局，图片一目了然；点击进入灯箱，用 `←` / `→` 翻页。
- **处处可撤销** —— 删除剪藏、项目、标签都通过 toast 撤销，而非吓人的确认弹窗。
- **数据归你掌控** —— 导出完整 JSON 备份或可读的 Markdown 清单，可导入还原。有备份提醒，本地存储将满时会预警。

## 键盘快捷键

| 快捷键 | 动作 |
|--------|------|
| `Alt+Shift+C` | 剪藏当前选中的文字（无选区时退化为剪整页） |
| `Alt+Shift+L` | 打开 ClipVault 库 |

右键菜单也提供 **剪藏此图片 / 选中文字 / 链接 / 页面**。快捷键可在 `chrome://extensions/shortcuts` 重新绑定。

## 界面语言

库页面顶栏的齿轮图标（设置）里可切换语言：**自动（跟随浏览器）/ English / 简体中文**。默认跟随浏览器语言，选择会记住。

## 安装（未打包，用于开发）

```bash
npm install
npm run build      # 打包到 dist/
```

然后在 Chrome 里：

1. 打开 `chrome://extensions`
2. 开启 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择 `dist/` 目录

工具栏图标打开库；在任意页面右键即可开始剪藏。

## 开发

```bash
npm run build       # 构建到 dist/（esbuild）
npm test            # 运行 vitest 测试
npm run test:watch  # 监听模式
```

- `src/background/` —— service worker：右键菜单、快捷键、按需注入、剪藏入库
- `src/content/` —— content script：构造剪藏、渲染保存气泡（按需注入，不常驻）
- `src/core/` —— 纯逻辑：clip key、媒体类型识别、标签推断、搜索、缩略图、i18n
- `src/db/` —— IndexedDB 存储
- `src/library/` —— 库页面（HTML/CSS/JS）
- `store/` —— Chrome Web Store 上架素材（不打包进扩展）

## 权限

ClipVault 刻意只申请最小权限。它**不使用**广域 `<all_urls>` host 权限，也没有常驻 content script——只在你剪藏那一刻通过临时的 `activeTab` 权限访问当前页。

| 权限 | 用途 |
|------|------|
| `contextMenus` | 右键「剪藏此…」菜单项 |
| `activeTab` | 仅在你触发 ClipVault 时临时访问当前标签页 |
| `scripting` | 按需把剪藏脚本注入当前标签页 |
| `storage`、`unlimitedStorage` | 本地存储剪藏；让库能超出默认配额 |

完整说明见 [`store/PRIVACY.md`](store/PRIVACY.md) 和 [`store/PERMISSIONS.md`](store/PERMISSIONS.md)。

## 隐私

所有内容都存在你浏览器的本地存储（IndexedDB）里。任何数据都不会上传——ClipVault 没有后端。它唯一的网络请求，是去抓取你选中剪藏的那张图片的原始字节，以便存到本地。见 [`store/PRIVACY.md`](store/PRIVACY.md)。

## 许可

暂未指定。
