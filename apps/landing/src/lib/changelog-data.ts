export interface ChangelogItem {
  id: string;
  title: {
    zh: string;
    en: string;
  };
  description: {
    zh: string;
    en: string;
  };
  date: string;
  version?: string;
  tags?: {
    zh: string;
    en: string;
  }[];
  image?: string;
  content: {
    zh: {
      features?: string[];
      improvements?: string[];
      fixes?: string[];
      others?: string[];
    };
    en: {
      features?: string[];
      improvements?: string[];
      fixes?: string[];
      others?: string[];
    };
  };
}

export const changelogData: ChangelogItem[] = [
  {
    id: "2025-06-30",
    title: {
      zh: "AI 功能增强",
      en: "AI Feature Enhancement",
    },
    description: {
      zh: "增强 AI 交易能力和性能，集成最新的 **[Gemini 2.5 Flash](https://gemini.google.com/)** 模型",
      en: "Enhanced AI trading capabilities and performance with the latest **[Gemini 2.5 Flash](https://gemini.google.com/)** model",
    },
    date: "2025-06-30",
    version: "1.1",
    tags: [
      { zh: "AI", en: "AI" },
      { zh: "性能", en: "Performance" },
    ],
    image:
      "https://plus.unsplash.com/premium_photo-1678565202049-9e37b2da8060?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    content: {
      zh: {
        features: [
          "新增 **[Gemini 2.5 Flash](https://gemini.google.com/)** 模型支持",
          "优化推理速度，响应时间减少 **40%**",
          "增强风险分析算法，详见 [技术文档](https://docs.simreal.ai)",
          "支持 *多币种并行分析*",
        ],
        improvements: [
          "改进信号准确度（提升 **15%**）",
          "优化 AI 模型加载时间",
          "增强用户界面响应速度",
        ],
        fixes: [
          "修复 AI 分析偶尔超时的问题",
          "解决多并发请求时的 **内存泄漏**",
          "修正信心分数计算错误",
        ],
        others: [
          "更新发布说明分组，新增 Others 分类以对齐 GitHub Release 结构",
        ],
      },
      en: {
        features: [
          "Added **[Gemini 2.5 Flash](https://gemini.google.com/)** model support",
          "Optimized inference speed, reduced response time by **40%**",
          "Enhanced risk analysis algorithm, see [technical docs](https://docs.simreal.ai)",
          "Support for *multi-currency parallel analysis*",
        ],
        improvements: [
          "Improved signal accuracy (**15%** increase)",
          "Optimized AI model loading time",
          "Enhanced UI responsiveness",
        ],
        fixes: [
          "Fixed occasional AI analysis timeout issue",
          "Resolved **memory leak** during concurrent requests",
          "Corrected confidence score calculation error",
        ],
        others: [
          "Updated release note grouping with a new Others section aligned to GitHub Releases",
        ],
      },
    },
  },
  {
    id: "2025-06-15",
    title: {
      zh: "性能优化",
      en: "Performance Optimization",
    },
    description: {
      zh: "全面提升系统性能和稳定性",
      en: "Comprehensive system performance and stability improvements",
    },
    date: "2025-06-15",
    version: "1.0",
    tags: [
      { zh: "性能", en: "Performance" },
      { zh: "优化", en: "Optimization" },
    ],
    image:
      "https://images.unsplash.com/photo-1607706189992-eae578626c86?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    content: {
      zh: {
        improvements: [
          "数据库查询优化，速度提升 60%",
          "前端资源压缩，加载时间减少 35%",
          "WebSocket 连接优化，减少延迟",
          "缓存机制改进，减少服务器负载",
        ],
        fixes: [
          "修复高频交易时的卡顿问题",
          "解决长时间运行后的内存增长",
          "修正数据同步延迟问题",
        ],
        others: [
          "补充基础设施稳定性说明，便于后续按 GitHub Release 分类维护",
        ],
      },
      en: {
        improvements: [
          "Database query optimization, 60% speed improvement",
          "Frontend resource compression, 35% load time reduction",
          "WebSocket connection optimization, reduced latency",
          "Improved caching mechanism, reduced server load",
        ],
        fixes: [
          "Fixed stuttering during high-frequency trading",
          "Resolved memory growth after prolonged operation",
          "Corrected data synchronization delay issue",
        ],
        others: [
          "Added infrastructure stability notes to keep future updates aligned with GitHub Release categories",
        ],
      },
    },
  },
  {
    id: "2025-05-23",
    title: {
      zh: "用户体验改进",
      en: "UX Improvements",
    },
    description: {
      zh: "UI/UX 的重大改进",
      en: "Major improvements to UI/UX",
    },
    date: "2025-05-23",
    version: "0.9",
    tags: [
      { zh: "界面", en: "UI" },
      { zh: "体验", en: "UX" },
    ],
    image:
      "https://plus.unsplash.com/premium_photo-1720287601920-ee8c503af775?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    content: {
      zh: {
        features: [
          "全新界面设计，更清晰直观的导航",
          "增强无障碍功能，支持键盘导航和屏幕阅读器",
          "优化工作流程，加快任务完成速度",
          "响应式设计，适配所有设备尺寸",
        ],
        fixes: [
          "修复不同屏幕尺寸下按钮位置不一致的问题",
          "解决颜色对比度影响可读性的问题",
          "修正表单导航中的 tab 顺序问题",
          "改进移动设备方向变化的处理",
          "提高 ARIA 标签与屏幕阅读器的兼容性",
        ],
        others: [
          "整理设计系统细节，方便后续发布说明中的杂项变更归类",
        ],
      },
      en: {
        features: [
          "Redesigned interface with cleaner, more intuitive navigation",
          "Enhanced accessibility with improved keyboard navigation and screen reader support",
          "Streamlined workflows for faster task completion",
          "Responsive design optimized for all device sizes",
        ],
        fixes: [
          "Fixed inconsistent button placement across different screen sizes",
          "Resolved color contrast issues affecting readability",
          "Corrected tab order problems in form navigation",
          "Improved device orientation change handling on mobile devices",
          "Enhanced ARIA label compatibility with screen readers",
        ],
        others: [
          "Documented design system cleanup so miscellaneous updates have a dedicated release-note bucket",
        ],
      },
    },
  },
];
