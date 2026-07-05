/**
 * PM2 进程配置 — SyncTube
 *
 * 关键约束：
 *   - 房间状态存内存（server.mjs 的 rooms Map），必须 fork 模式 + 单实例。
 *     切勿改 exec_mode 为 cluster 或增加 instances，否则多进程房间状态不一致。
 *   - server.mjs 是 ESM (.mjs)，PM2 直接用 node 解释器运行即可。
 *
 * 常用命令：
 *   pm2 start ecosystem.config.cjs           # 启动
 *   pm2 restart synctube                     # 重启
 *   pm2 reload synctube                      # 零停机重启（此处等同 restart）
 *   pm2 logs synctube                        # 查看日志
 *   pm2 status                               # 查看进程状态
 *   pm2 stop synctube                        # 停止
 *   pm2 delete synctube                      # 从 PM2 列表移除
 *   pm2 save                                 # 保存当前进程列表
 *   pm2 startup                              # 生成开机自启脚本
 */
module.exports = {
  apps: [
    {
      name: "synctube",
      script: "server.mjs",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      // 异常自动重启
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      // 内存超 300MB 重启（按需调整）
      max_memory_restart: "300M",
      // 日志
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      time: true,
      // 等待优雅退出
      kill_timeout: 3000,
    },
  ],
};
