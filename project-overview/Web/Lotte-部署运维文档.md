# Lotte 部署运维文档

## 环境要求

### 硬件要求

| 资源  | 最低配置               | 推荐配置              |
| --- | ------------------ | ----------------- |
| CPU | 2 核                | 4 核+              |
| 内存  | 2 GB               | 4 GB+             |
| 磁盘  | 1 GB               | 10 GB+（含 RAG 知识库） |
| 网络  | 稳定互联网连接（调用 AI API） | 低延迟网络             |

### 软件要求

| 软件      | 版本        | 说明               |
| ------- | --------- | ---------------- |
| Node.js | >= 22.0.0 | 运行时环境            |
| npm     | >= 10.0.0 | 包管理器             |
| Git     | 最新        | 版本控制（可选）         |
| ffmpeg  | 最新        | 视频处理（可选，多模态功能需要） |

### 操作系统支持

| 系统                    | 状态     | 说明     |
| --------------------- | ------ | ------ |
| Windows 10/11         | ✅ 完全支持 | 主要开发平台 |
| macOS 12+             | ✅ 完全支持 | <br /> |
| Linux (Ubuntu 20.04+) | ✅ 完全支持 | 推荐生产部署 |

***

## 安装部署

### 方式一：源码部署

#### 1. 获取源码

```bash
git clone <repo-url> lotte-agent
cd lotte-agent
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 构建项目

```bash
npm run build
```

#### 4. 初始化配置

首次运行时，系统会自动在 `~/.lotte/` 目录下创建默认配置文件：

```bash
npm run start
```

或手动创建配置目录：

```bash
mkdir -p ~/.lotte/config
mkdir -p ~/.lotte/data
mkdir -p ~/.lotte/soul
mkdir -p ~/.lotte/skills
mkdir -p ~/.lotte/rag/documents
mkdir -p ~/.lotte/logs
```

#### 5. 配置 AI 模型

编辑 `~/.lotte/config/ai.json`，填入 AI API 信息：

```json
{
  "default_provider": "openai",
  "default_model": "gpt-4o",
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "sk-your-api-key",
      "models": {
        "gpt-4o": {
          "context_window": 128000,
          "max_output": 16384
        }
      }
    }
  }
}
```

> **安全提示**：API Key 属于敏感信息，请勿提交到版本控制系统。建议设置文件权限为仅当前用户可读。

#### 6. 启动服务

```bash
# 生产模式
npm run start

# 开发模式（热重载）
npm run dev
```

### 方式二：前端部署

#### 1. 安装前端依赖

```bash
cd Web
npm install
```

#### 2. 配置环境变量

创建 `Web/.env.local` 文件：

```
NEXT_PUBLIC_API_BASE=http://127.0.0.1:10623
NEXT_PUBLIC_WS_BASE=ws://127.0.0.1:10623
```

#### 3. 构建前端

```bash
npm run build
```

#### 4. 启动前端

```bash
npm run start
```

前端默认运行在 `http://localhost:3000`。

***

## 配置详解

### 配置文件位置

所有配置文件位于 `~/.lotte/config/` 目录，可通过环境变量 `LOTTE_STATE_DIR` 自定义根目录：

```bash
export LOTTE_STATE_DIR=/custom/path
```

### 配置文件清单

| 文件                  | 必需 | 说明                    |
| ------------------- | -- | --------------------- |
| `lotte.json`        | 是  | 主配置（应用名、版本、模块开关）      |
| `ai.json`           | 是  | AI 模型配置（API Key、模型参数） |
| `gateway.json`      | 否  | 网关配置（端口、认证、WebSocket） |
| `channels.json`     | 否  | 通道配置（微信/QQ/飞书）        |
| `mcp.json`          | 否  | MCP 客户端配置             |
| `skills.json`       | 否  | 技能配置                  |
| `tools.json`        | 否  | 工具配置（审批、沙箱）           |
| `automation.json`   | 否  | 自动化配置                 |
| `notification.json` | 否  | 通知配置                  |
| `rag.json`          | 否  | RAG 知识库配置             |
| `multimodal.json`   | 否  | 多模态配置                 |

### 网关安全配置

#### Token 认证

```json
{
  "host": "127.0.0.1",
  "port": 10623,
  "auth": {
    "mode": "token",
    "token": "your-secure-random-token"
  }
}
```

生成安全 Token：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 密码认证

```json
{
  "auth": {
    "mode": "password",
    "password": "your-secure-password"
  }
}
```

#### 外部访问

如需允许外部访问，将 `host` 改为 `0.0.0.0`：

```json
{
  "host": "0.0.0.0",
  "port": 10623
}
```

> **安全警告**：外部访问时务必启用认证模式。

***

## 进程管理

### 使用 PM2（推荐生产环境）

#### 安装 PM2

```bash
npm install -g pm2
```

#### 启动后端

```bash
pm2 start dist/entry.js --name lotte-agent
```

#### 启动前端

```bash
cd Web
pm2 start npm --name lotte-web -- start
```

#### 常用 PM2 命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs lotte-agent

# 重启
pm2 restart lotte-agent

# 停止
pm2 stop lotte-agent

# 删除
pm2 delete lotte-agent

# 设置开机自启
pm2 startup
pm2 save
```

#### PM2 配置文件

创建 `ecosystem.config.cjs`：

```javascript
module.exports = {
  apps: [
    {
      name: "lotte-agent",
      script: "dist/entry.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "lotte-web",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "./Web",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
```

启动：

```bash
pm2 start ecosystem.config.cjs
```

### 使用 systemd（Linux）

创建 `/etc/systemd/system/lotte-agent.service`：

```ini
[Unit]
Description=Lotte Agent Service
After=network.target

[Service]
Type=simple
User=lotte
WorkingDirectory=/opt/lotte-agent
ExecStart=/usr/bin/node dist/entry.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl enable lotte-agent
sudo systemctl start lotte-agent
sudo systemctl status lotte-agent
```

### 使用 NSSM（Windows）

```bash
# 安装 NSSM
choco install nssm

# 注册服务
nssm install LotteAgent "C:\Program Files\nodejs\node.exe" "D:\Trae项目\lotte-agent\dist\entry.js"
nssm set LotteAgent AppDirectory "D:\Trae项目\lotte-agent"
nssm set LotteAgent StartServiceName LotteAgent

# 启动服务
nssm start LotteAgent
```

***

## 监控与日志

### 健康检查

```bash
# HTTP 健康检查
curl http://127.0.0.1:10623/health

# 响应示例
{
  "ok": true,
  "data": {
    "status": "running",
    "version": "0.1.0",
    "uptime": 3600.123,
    "timestamp": 1713523200000
  }
}
```

### 日志管理

#### 日志级别

| 级别      | 说明             |
| ------- | -------------- |
| `debug` | 调试信息，包含请求/响应详情 |
| `info`  | 常规运行信息         |
| `warn`  | 警告信息，不影响运行     |
| `error` | 错误信息，需要关注      |

在 `lotte.json` 中配置日志级别：

```json
{
  "log_level": "info"
}
```

#### 审计日志

通过 API 查询审计日志：

```bash
# 查询最近的审计日志
curl http://127.0.0.1:10623/api/v1/logs?limit=20

# 按工具名称过滤
curl http://127.0.0.1:10623/api/v1/logs?toolName=exec&limit=10

# 按结果过滤
curl http://127.0.0.1:10623/api/v1/logs?result=denied
```

### 数据库维护

#### 数据库位置

```
~/.lotte/data/lotte.db
```

#### 备份数据库

```bash
# SQLite 安全备份
sqlite3 ~/.lotte/data/lotte.db ".backup ~/.lotte/data/lotte-backup-$(date +%Y%m%d).db"
```

#### 数据库统计

```bash
sqlite3 ~/.lotte/data/lotte.db "
  SELECT 'sessions' as table_name, COUNT(*) as count FROM sessions
  UNION ALL
  SELECT 'messages', COUNT(*) FROM messages
  UNION ALL
  SELECT 'audit_logs', COUNT(*) FROM audit_logs;
"
```

#### 清理旧数据

```bash
# 清理 30 天前的审计日志
sqlite3 ~/.lotte/data/lotte.db "
  DELETE FROM audit_logs WHERE timestamp < $(date -d '30 days ago' +%s)000;
"
```

***

## 安全加固

### 1. 启用认证

生产环境必须启用认证：

```json
{
  "auth": {
    "mode": "token",
    "token": "your-secure-random-token-here"
  }
}
```

### 2. 限制监听地址

默认监听 `127.0.0.1`（仅本地访问），如需外部访问请配合防火墙：

```json
{
  "host": "127.0.0.1",
  "port": 10623
}
```

### 3. API Key 保护

- API Key 存储在 `~/.lotte/config/ai.json` 中
- 设置文件权限：`chmod 600 ~/.lotte/config/ai.json`
- MCP 客户端的环境变量同样需要保护

### 4. 工具安全配置

根据安全需求调整工具审批策略：

```json
{
  "bash": {
    "enabled": true,
    "require_approval": true,
    "timeout": 30000
  },
  "sandbox": {
    "enabled": true,
    "timeout": 60000,
    "max_memory": 256
  }
}
```

### 5. 防火墙配置

```bash
# Linux (ufw)
sudo ufw allow 10623/tcp
sudo ufw allow 3000/tcp

# Windows
netsh advfirewall firewall add rule name="Lotte Gateway" dir=in action=allow protocol=TCP localport=10623
netsh advfirewall firewall add rule name="Lotte Web" dir=in action=allow protocol=TCP localport=3000
```

***

## 常见问题排查

### 服务无法启动

| 现象          | 可能原因         | 解决方案                                               |
| ----------- | ------------ | -------------------------------------------------- |
| 端口被占用       | 其他进程占用 10623 | `lsof -i :10623` 或 `netstat -ano \| findstr 10623` |
| 配置文件错误      | JSON 格式错误    | 使用 JSON 验证器检查配置文件                                  |
| Node.js 版本低 | 版本 < 22      | 升级 Node.js                                         |
| 权限不足        | 数据目录无写权限     | `chmod 755 ~/.lotte/`                              |

### 前端无法连接后端

1. 确认后端服务已启动：`curl http://127.0.0.1:10623/health`
2. 检查 `gateway.json` 中的 `host` 和 `port`
3. 检查前端 `.env.local` 中的 API 地址
4. 检查浏览器控制台的网络请求错误

### AI 调用失败

1. 检查 `ai.json` 中的 `api_key` 是否正确
2. 检查 `api_url` 是否可访问
3. 检查网络代理设置
4. 查看后端日志中的错误信息

### MCP 客户端连接失败

1. 检查 `mcp.json` 中的配置
2. stdio 传输：确认 `command` 可执行
3. HTTP/SSE 传输：确认 `url` 可访问
4. 查看后端日志中的 MCP 错误信息

### 数据库锁定

SQLite 在高并发下可能出现锁定：

1. 确认使用 WAL 模式（默认启用）
2. 减少并发写入
3. 重启服务释放锁定

***

## 版本升级

### 升级步骤

```bash
# 1. 备份数据
cp -r ~/.lotte ~/.lotte-backup

# 2. 拉取最新代码
git pull origin main

# 3. 安装依赖
npm install

# 4. 构建项目
npm run build

# 5. 重启服务
pm2 restart lotte-agent
```

### 数据库迁移

数据库迁移在启动时自动执行，无需手动操作。如遇问题，检查后端日志中的迁移错误信息。

***

## 卸载

```bash
# 1. 停止服务
pm2 stop lotte-agent
pm2 delete lotte-agent

# 2. 删除数据（可选）
rm -rf ~/.lotte

# 3. 删除项目
rm -rf /path/to/lotte-agent
```

