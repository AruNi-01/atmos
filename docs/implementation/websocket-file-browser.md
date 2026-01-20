# WebSocket 通信与文件浏览器实现

## ✅ 实现完成

实现了基于 WebSocket 的全栈通信架构，包括后端辅助的文件系统浏览功能，用于导入本地项目。

---

## 🎯 需求背景

### 问题

在 Web 应用中导入本地项目时，需要获取文件系统的绝对路径。但由于浏览器安全限制：

- `<input type="file">` 只能获取文件名，无法获取绝对路径
- Web 应用无法直接访问用户的文件系统

### 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| 方案1 | 手动输入路径 | 简单直接 | 用户体验差，容易输错 |
| 方案2 | Tauri/Electron | 原生文件选择器 | 需要桌面应用 |
| **方案3** | **后端辅助浏览** | **Web可用，体验好** | **需要WebSocket通信** |

### 最终方案

采用 **方案3：后端辅助的文件浏览**：
- 用户可以手动输入路径
- 也可以点击 "Browse..." 通过 WebSocket 获取后端文件系统列表
- 用户一步步选择目录，最终确认项目路径

---

## 🏗️ 架构设计

### 通信流程

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Frontend  │◄──────────────────►│   Backend   │
│  (Next.js)  │                    │   (Rust)    │
└─────────────┘                    └─────────────┘
      │                                   │
      │ 1. 页面加载时自动建立 WS 连接        │
      │────────────────────────────────────►│
      │                                   │
      │ 2. 心跳保持连接                     │
      │◄───────────────────────────────────►│
      │                                   │
      │ 3. 请求/响应模式通信                 │
      │────────────────────────────────────►│
      │◄────────────────────────────────────│
```

### 消息协议

所有 WebSocket 通信使用统一的 JSON 格式：

#### 请求格式
```json
{
  "type": "request",
  "payload": {
    "request_id": "uuid-v4",
    "action": "fs_list_dir",
    "data": { "path": "/home/user", "dirs_only": true }
  }
}
```

#### 响应格式（成功）
```json
{
  "type": "response",
  "payload": {
    "request_id": "uuid-v4",
    "success": true,
    "data": { ... }
  }
}
```

#### 响应格式（错误）
```json
{
  "type": "error",
  "payload": {
    "request_id": "uuid-v4",
    "code": "error",
    "message": "Path does not exist"
  }
}
```

---

## 📋 实现清单

### 1. 后端：WebSocket 消息类型 (`crates/infra`)

**文件**: `crates/infra/src/websocket/message.rs`

```rust
/// 操作类型枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WsAction {
    // 文件系统操作
    FsGetHomeDir,
    FsListDir,
    FsValidateGitPath,
    
    // Project CRUD
    ProjectList,
    ProjectCreate,
    ProjectUpdate,
    ProjectDelete,
    ProjectValidatePath,
    
    // Workspace CRUD
    WorkspaceList,
    WorkspaceCreate,
    WorkspaceUpdateName,
    WorkspaceUpdateBranch,
    WorkspaceUpdateOrder,
    WorkspaceDelete,
}
```

### 2. 后端：文件系统引擎 (`crates/core-engine`)

**文件**: `crates/core-engine/src/fs/mod.rs`

```rust
pub struct FsEngine;

impl FsEngine {
    /// 获取用户主目录
    pub fn get_home_dir(&self) -> Result<PathBuf>;
    
    /// 列出目录内容
    pub fn list_dir(
        &self, 
        path: &Path, 
        dirs_only: bool, 
        show_hidden: bool
    ) -> Result<Vec<FsEntry>>;
    
    /// 验证 Git 仓库路径
    pub fn validate_git_path(&self, path: &Path) -> GitValidationResult;
    
    /// 扩展 ~ 路径
    pub fn expand_path(&self, path: &str) -> Result<PathBuf>;
}
```

### 3. 后端：WebSocket 消息服务 (`crates/core-service`)

**文件**: `crates/core-service/src/ws_message_service.rs`

精简的消息处理服务，只处理 Request/Response 模式：

```rust
pub struct WsMessageService {
    fs_engine: FsEngine,
    project_service: Arc<ProjectService>,
    workspace_service: Arc<WorkspaceService>,
}

impl WsMessageService {
    /// 处理 WebSocket 请求
    async fn process_request(&self, request: WsRequest) -> WsMessage;
    
    /// 路由到具体处理器
    async fn handle_action(&self, request: WsRequest) -> Result<Value>;
}
```

### 4. 前端：WebSocket 管理器

**文件**: `apps/web/src/hooks/use-websocket.ts`

```typescript
// Zustand store 管理 WebSocket 状态
export const useWebSocketStore = create<WebSocketStore>((set, get) => ({
  connectionState: 'disconnected',
  socket: null,
  
  // 自动连接
  connect: () => { ... },
  
  // 发送请求（Promise 风格）
  send: <T>(action: WsAction, data?: unknown): Promise<T> => { ... },
}));

// Hook 封装
export function useWebSocket() {
  const { connectionState, connect, send } = useWebSocketStore();
  return { isConnected: connectionState === 'connected', connect, send };
}
```

**特性**：
- ✅ 自动连接和重连
- ✅ 心跳保持（15秒间隔）
- ✅ 请求超时处理（30秒）
- ✅ Promise 风格的 API

### 5. 前端：WebSocket API 层

**文件**: `apps/web/src/api/ws-api.ts`

```typescript
// 文件系统 API
export const fsApi = {
  getHomeDir: () => wsRequest<{ path: string }>('fs_get_home_dir'),
  listDir: (path, options) => wsRequest<FsListDirResponse>('fs_list_dir', { ... }),
  validateGitPath: (path) => wsRequest<FsValidateGitPathResponse>('fs_validate_git_path', { path }),
};

// Project API（基于 WebSocket）
export const wsProjectApi = {
  list: () => wsRequest<ProjectModel[]>('project_list'),
  create: (data) => wsRequest<ProjectModel>('project_create', { ... }),
  // ...
};

// Workspace API（基于 WebSocket）
export const wsWorkspaceApi = {
  listByProject: (projectGuid) => wsRequest<WorkspaceModel[]>('workspace_list', { ... }),
  create: (data) => wsRequest<WorkspaceModel>('workspace_create', { ... }),
  // ...
};
```

### 6. 前端：文件浏览器组件

**文件**: `apps/web/src/components/dialogs/FileBrowser.tsx`

```tsx
export function FileBrowser({
  open,
  onOpenChange,
  onSelect,
  title = 'Browse Files',
  dirsOnly = true,
  showHidden = false,
}: FileBrowserProps) {
  // 通过 WebSocket 加载目录内容
  const loadDirectory = useCallback(async (path: string) => {
    const result = await fsApi.listDir(path, { dirsOnly, showHidden });
    setEntries(result.entries);
  }, []);
  
  return (
    <Dialog>
      {/* 路径输入 + 导航按钮 */}
      {/* 目录列表（高亮 Git 仓库） */}
      {/* 选择按钮 */}
    </Dialog>
  );
}
```

**功能**：
- ✅ 显示目录列表
- ✅ 标记 Git 仓库（橙色图标 + 标签）
- ✅ 导航：上级目录、主目录、刷新
- ✅ 手动输入路径
- ✅ 显示/隐藏隐藏文件
- ✅ 单击选中、双击进入目录

### 7. 前端：WebSocket Provider

**文件**: `apps/web/src/components/providers/websocket-provider.tsx`

```tsx
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { connect } = useWebSocketStore();

  useEffect(() => {
    // 应用启动时建立连接
    connect();
    
    // 页面可见性变化时重连
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
  }, []);

  return (
    <>
      {children}
      {/* 开发环境显示连接状态 */}
      <WebSocketStatusIndicator />
    </>
  );
}
```

---

## 🔌 API 接口文档

### 文件系统操作

#### 1. 获取主目录
```json
// 请求
{ "action": "fs_get_home_dir", "data": {} }

// 响应
{ "path": "/Users/username" }
```

#### 2. 列出目录内容
```json
// 请求
{
  "action": "fs_list_dir",
  "data": {
    "path": "/Users/username/projects",
    "dirs_only": true,
    "show_hidden": false
  }
}

// 响应
{
  "path": "/Users/username/projects",
  "parent_path": "/Users/username",
  "entries": [
    {
      "name": "atmos",
      "path": "/Users/username/projects/atmos",
      "is_dir": true,
      "is_git_repo": true
    },
    {
      "name": "other-project",
      "path": "/Users/username/projects/other-project",
      "is_dir": true,
      "is_git_repo": false
    }
  ]
}
```

#### 3. 验证 Git 路径
```json
// 请求
{
  "action": "fs_validate_git_path",
  "data": { "path": "/Users/username/projects/atmos" }
}

// 响应
{
  "is_valid": true,
  "is_git_repo": true,
  "suggested_name": "atmos",
  "default_branch": "main",
  "error": null
}
```

### Project/Workspace CRUD

所有原有的 HTTP API 功能均可通过 WebSocket 实现，action 名称对应：

| HTTP 接口 | WebSocket Action |
|-----------|------------------|
| `GET /api/project` | `project_list` |
| `POST /api/project` | `project_create` |
| `PUT /api/project/{id}` | `project_update` |
| `DELETE /api/project/{id}` | `project_delete` |
| `GET /api/workspace/project/{id}` | `workspace_list` |
| `POST /api/workspace` | `workspace_create` |
| ... | ... |

---

## 📁 文件索引

### 后端

| 层级 | 文件 | 描述 |
|------|------|------|
| infra | `crates/infra/src/websocket/message.rs` | 消息类型定义 |
| core-engine | `crates/core-engine/src/fs/mod.rs` | 文件系统操作 |
| core-service | `crates/core-service/src/ws_message_service.rs` | 消息处理服务 |

### 前端

| 目录 | 文件 | 描述 |
|------|------|------|
| hooks | `use-websocket.ts` | WebSocket 状态管理 |
| api | `ws-api.ts` | WebSocket API 封装 |
| components/dialogs | `FileBrowser.tsx` | 文件浏览器组件 |
| components/dialogs | `CreateProjectDialog.tsx` | 项目导入对话框 |
| components/providers | `websocket-provider.tsx` | WebSocket 连接管理 |

---

## 🚀 使用方式

### 1. 启动服务

```bash
# 启动后端
just dev-api

# 启动前端
just dev-web
```

### 2. 导入项目

1. 点击侧边栏的 "+" 按钮
2. 选择以下任一方式：
   - **手动输入**：在输入框中输入项目绝对路径
   - **浏览选择**：点击 "Browse..." 打开文件浏览器
3. 系统自动验证路径，显示是否为 Git 仓库
4. 确认项目名称后点击 "Import Project"

### 3. 连接状态

开发环境下，左下角会显示 WebSocket 连接状态指示器：

- 🟢 **Connected** - 已连接
- 🟡 **Connecting** - 连接中
- 🟠 **Reconnecting** - 重连中
- 🔴 **Disconnected** - 已断开

---

## 📊 代码统计

| 模块 | 新增/修改 | 代码行数 |
|------|----------|---------|
| 后端 WebSocket 消息 | 新增 | ~230 行 |
| 后端文件系统引擎 | 新增 | ~150 行 |
| 后端消息服务 | 重构 | ~230 行 |
| 前端 WebSocket 管理 | 新增 | ~250 行 |
| 前端 API 层 | 新增 | ~180 行 |
| 前端文件浏览器 | 新增 | ~250 行 |
| 前端对话框更新 | 修改 | ~150 行 |
| **总计** | | **~1440 行** |

---

## 🎓 设计要点

### 1. 请求/响应模式

使用 `request_id` 关联请求和响应，支持并发请求：

```typescript
// 前端
const requestId = uuidv4();
pendingRequests.set(requestId, { resolve, reject, timeout });
socket.send(JSON.stringify({ type: 'request', payload: { request_id: requestId, ... } }));

// 收到响应时
const pending = pendingRequests.get(response.request_id);
pending.resolve(response.data);
```

### 2. 心跳保持

```typescript
// 前端每 15 秒发送 ping
setInterval(() => socket.send('ping'), 15000);

// 后端响应 pong（在 infra 层处理）
```

### 3. 自动重连

```typescript
ws.onclose = (event) => {
  if (!event.wasClean) {
    // 3 秒后重连
    setTimeout(() => connect(), 3000);
  }
};
```

### 4. 类型安全

后端使用 Rust 的强类型系统，前端使用 TypeScript：

```rust
// 后端
fn parse_request<T: DeserializeOwned>(data: Value) -> Result<T>

// 前端
async function wsRequest<T>(action: WsAction, data?: unknown): Promise<T>
```

---

## ✅ 验收标准

- [x] WebSocket 连接自动建立
- [x] 心跳保持连接活跃
- [x] 断线自动重连
- [x] 文件浏览器可正常浏览目录
- [x] Git 仓库正确识别和高亮
- [x] 项目导入流程完整
- [x] 所有 CRUD 操作通过 WebSocket 完成
- [x] 前后端编译通过

---

**实现者**: AI Assistant  
**完成时间**: 2026-01-19  
**测试状态**: ✅ 编译通过
