# Apps Landing

Landing 页面应用，用于介绍 Vibe Habitat 项目。

## 特性

- 使用与 `apps/web` 相同的配置和组件库
- 完整的国际化支持（中英文）
- 响应式设计，适配各种屏幕尺寸
- 深色/浅色主题切换
- 现代化的 UI 设计，包含动画效果

## 技术栈

与主应用保持一致：
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- next-intl
- next-themes

## 共享依赖

- `@vibe-habitat/ui` - 共享 UI 组件库
- `@vibe-habitat/i18n` - 共享国际化配置
- `@vibe-habitat/shared` - 其他共享工具

## 开发

```bash
# 从项目根目录启动
bun dev:landing

# 从当前目录启动
cd apps/landing
bun dev
```

访问 `http://localhost:3001`

## 构建

```bash
bun build
```

## 部署

构建完成后运行：

```bash
bun start
```

## 页面结构

Landing 页面包含以下部分：

1. **导航栏** - 固定在顶部，包含 Logo、导航链接、语言切换和主题切换
2. **Hero 区域** - 主标题、描述和 CTA 按钮，配有终端预览效果
3. **Features** - 展示项目的 6 大核心特性
4. **Tech Stack** - 展示使用的技术栈
5. **CTA** - 号召用户开始使用
6. **Footer** - 版权信息和相关链接

## 自定义

所有文案内容都在 `messages/` 目录下：
- `en.json` - 英文翻译
- `zh.json` - 中文翻译

样式使用相同的设计系统，确保与主应用视觉一致。
