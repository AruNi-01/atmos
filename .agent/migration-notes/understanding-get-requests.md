# Understanding GET Requests in Development Console

## What You're Seeing

When switching workspaces, you might see logs like this in your development console:

```
GET /?workspaceId=5beaad08-0ef3-4e50-940d-20697fd68f66 200 in 176ms
GET /?workspaceId=7f5c86cb-c7a5-4659-977a-578a20019cd7 200 in 172ms
```

## ❓ What Are These Requests?

These are **Next.js page navigation requests**, NOT data API requests.

### What's Happening:

1. **User clicks on a workspace** in the Left Sidebar
2. **React Router updates the URL** via `router.push(\`?workspaceId=${workspace.id}\`)`
3. **Next.js re-renders the page** (Server-Side Rendering / React Server Components)
4. **Browser makes a GET request** to fetch the new page HTML

### What's NOT Happening:

- ❌ NOT fetching workspace data via HTTP API
- ❌ NOT calling backend REST endpoints
- ❌ NOT duplicating data that's already in the store

## ✅ How Data Actually Flows

### Initial Page Load
```
Browser → Next.js Page Request (GET /)
  ↓
Page renders with LeftSidebar component
  ↓
useProjectStore.fetchProjects() is called
  ↓
WebSocket: wsProjectApi.list() + wsWorkspaceApi.listByProject()
  ↓
Data stored in Zustand store
  ↓
UI renders with data
```

### Switching Workspaces
```
User clicks workspace
  ↓
router.push(?workspaceId=xxx)
  ↓
Next.js page navigation (GET request) ← YOU SEE THIS
  ↓
Page re-renders
  ↓
Data is read from Zustand store (NO NEW API CALL)
  ↓
UI updates
```

## 🔍 How to Verify WebSocket Usage

### In Browser DevTools:

1. **Open Network Tab**
2. **Filter by "WS" (WebSocket)**
3. **You should see**:
   - WebSocket connection to `ws://localhost:8080` (or your backend URL)
   - Messages with actions like `project_list`, `workspace_list`, etc.

4. **Filter by "Fetch/XHR"**
5. **You should NOT see**:
   - Requests to `/api/project`
   - Requests to `/api/workspace`
   - Any data-fetching API calls when switching workspaces

### In Console:

Look for WebSocket-related logs:
```
[Req #1] Fetching files for Project: xxx, Workspace: yyy, Path: zzz
[Req #1] Fetch success. Updating state.
```

## 📊 Request Breakdown

### Page Navigation Request (What you're seeing)
```
GET /?workspaceId=xxx
├─ compile: 112ms     ← Next.js compiles React components
├─ proxy.ts: 11ms     ← Next.js middleware processing
├─ generate-params: 3ms ← Route parameter generation
└─ render: 52ms       ← Server-side rendering
```

This is **normal Next.js behavior** and is NOT related to data fetching.

### Data Fetching (via WebSocket)
```
WebSocket Message: { action: "workspace_list", data: { project_guid: "xxx" } }
  ↓
Backend processes request
  ↓
WebSocket Response: { data: [...workspaces] }
  ↓
Zustand store updates
  ↓
React components re-render
```

## 🎯 Key Takeaways

1. **GET requests are page navigations**, not data fetches
2. **All data is fetched via WebSocket** and cached in Zustand store
3. **Switching workspaces only updates the URL** and re-renders with cached data
4. **No duplicate data fetching** occurs when switching workspaces

## 🚀 Performance Benefits

Because we use WebSocket + Zustand:
- ✅ Data is fetched once and cached
- ✅ Switching workspaces is instant (no API calls)
- ✅ Real-time updates possible (server can push changes)
- ✅ Reduced server load (fewer HTTP requests)

The GET requests you see are just Next.js doing its job of rendering pages efficiently!
