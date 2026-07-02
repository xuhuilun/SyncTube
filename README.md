# SyncTube - 异地同步观影网站

让远方的朋友在同一房间同步观看在线视频，实时聊天。支持 MP4 / HLS / YouTube（完整同步）与 B站（内嵌播放，受限同步）。

## 技术栈

- Next.js 15 (App Router) + TypeScript (strict)
- TailwindCSS 3 + 自定义 shadcn 风格组件
- framer-motion 动画
- react-player 视频播放
- 暗色玻璃拟态 (Glassmorphism) 主题，霓虹蓝强调色
- Socket.IO 接口层（当前为内存 mock，可一键替换为真实 Socket.IO）

## 项目结构

```
app/
  layout.tsx              # 根布局，字体 + 主题 + Providers
  page.tsx                # 首页：创建 / 加入房间
  providers.tsx           # Toast Provider
  globals.css             # 全局样式 + .glass 原语
  room/[id]/page.tsx      # 房间页：视频 + 聊天 + 用户列表
components/
  ui/                     # Button, Input, Card, Badge, ScrollArea, Toast
  room/                   # VideoPlayer, VideoControls, ChatPanel, UserList, NicknameGate
hooks/
  useSocket.ts            # Socket 连接
  useRoom.ts              # 房间状态（用户、视频、消息）
  useVideoSync.ts         # 视频同步（播放/暂停/进度，含循环避免）
  useChat.ts              # 聊天（发送 + 消息列表，上限 200 条）
lib/
  mockSocket.ts           # Mock Socket.IO（BroadcastChannel 跨标签页同步）
  video.ts                # B站识别 / 时间格式化
  utils.ts                # cn()
types/
  index.ts                # Room / OnlineUser / ChatMessage / VideoState + 事件类型
```

## 安装与本地启动

```bash
npm install
npm run dev
```

打开 http://localhost:3000。开两个浏览器标签，创建同一房间即可验证同步。

### 环境变量

当前 mock 模式无需环境变量。接入真实 Socket.IO 时需配置服务地址（见下）。

## 功能说明

- **首页**：创建房间（随机 6 位 ID）或输入房间号加入。
- **房间页**：
  - 输入视频链接加载播放器，自动同步到房间内所有人。
  - 播放 / 暂停同步，拖动进度条同步。
  - 新用户加入自动同步当前状态。
  - 实时文字聊天（昵称、时间、内容），消息保留最近 200 条。
  - 在线用户列表，进出实时更新。
- **B站**：识别 bilibili.com / b23.tv 链接，内嵌 iframe 播放。受平台限制，B站视频无法精确同步播放/暂停/进度，两端加载同一视频即可。

## 从 Mock 切换到真实 Socket.IO

当前 `lib/mockSocket.ts` 用 BroadcastChannel 在同浏览器多标签间同步，便于本地验证。
接入真实后端时：

1. `npm install socket.io-client`
2. 在 `hooks/useSocket.ts` / `useRoom.ts` / `useVideoSync.ts` / `useChat.ts` 中把 `getSocket()` 替换为 `io(SERVER_URL)`。
3. 服务端用 `socket.io` 附着到 Next.js 自定义 server（见部署）。
4. Hook 与事件名已对齐 `types/index.ts` 中的 `ServerToClientEvents` / `ClientToServerEvents`，无需改动业务逻辑。

## 部署说明

### Vercel 限制

Vercel 默认不支持持久 WebSocket 连接，Socket.IO 无法直接在 Vercel Serverless Functions 上运行。三种可行方案：

1. **改用第三方实时服务**（推荐）：Pusher / Ably / LiveKit，用其 SDK 替换 Socket.IO 客户端，服务端改为发布到这些服务。前端改动最小。
2. **部署到支持 WebSocket 的平台**：Render / Fly.io / Railway / 自建 VPS，用 Next.js 自定义 server（`server.ts`）把 Socket.IO 附着到 `http.Server`。
3. **Vercel + 外部 Socket 服务**：前端部署 Vercel，Socket.IO 服务单独部署到上述平台，前端通过环境变量指向该服务地址。

### 自定义 Server 示例（用于 Render / Fly.io）

```ts
// server.ts
import { createServer } from "http";
import { Server } from "socket.io";
import next from "next";

const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();
app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const io = new Server(server, { cors: { origin: "*" } });
  // 在此实现 rooms Map + 事件处理，对齐 types/index.ts
  server.listen(3000);
});
```

启动：`npx tsx server.ts`，`package.json` 的 `start` 脚本改为 `tsx server.ts`。

## 开发命令

```bash
npm run dev        # 开发
npm run build      # 构建
npm run typecheck  # 类型检查
npm run lint       # ESLint
```
