# 旷野淘金：2D 金币路径规划校园测试

这是一个可部署到单台服务器、供约 40 名学生同时使用的全栈项目。它包含同一套地图的 **20 个键盘任务（K01—K20）** 和 **20 个 Python 填空任务（P01—P20）**，金币数量由 1 枚逐步增加到 6 枚。

## 已实现

- 首次进入自动创建 UUID、随机玩家名，并记录学生的 Python/C++ 学习经历。
- 键盘方向键、WASD、屏幕方向按钮使用同一移动规则。
- Python 只能填写 `up/down/left/right` 和 0—20 的循环次数，不能执行任意源码。
- 障碍、边界碰撞、指定金币顺序、自动拾取、命令上限和“捡完即结束”规则。
- 客户端动画与服务端权威重放；最终成绩由服务端计算。
- 20 张地图、40 个任务、最多 6 枚金币，教师最优步数不通过学生接口下发。
- 点击、按下、输入、聚焦、模式切换、选关、移动、拾取、开始、停止、运行和判分均带时间节点上报。
- 埋点断网时暂存在 `localStorage`，恢复后每 1.5 秒分批补传；SQLite 开启 WAL，适合课堂规模并发。
- 教师汇总接口和 attempts/events 的 CSV、JSONL 导出。
- DEMO 提取的车、金币、沙地和障碍贴图已用于界面。

## 本地运行

需要 Node.js 22 或更高版本。服务端使用 Node 内置 SQLite，不需要额外数据库驱动。

```bash
npm ci
npm run build
npm start
```

浏览器打开 `http://localhost:3001`。开发时可运行 `npm run dev`，前端为 `http://localhost:5173`。

## 验证

```bash
npm test
npm run build
```

启动服务后，可模拟 40 名学生同时建立身份、开始任务、提交移动和批量上报埋点：

```bash
npm run loadtest
```

## 服务器部署

复制环境变量模板并设置真实域名和教师密钥：

```bash
cp .env.example .env
docker compose up -d --build
```

`data/` 必须放在持久化磁盘并定期备份。Nginx 示例位于 `deploy/nginx.coin-competition.conf`；把域名替换后启用，再配置 HTTPS。`PUBLIC_ORIGIN` 必须与学生访问的 HTTPS 地址完全一致。

40 名学生无需分别启动进程。一个 Node 进程与一个 SQLite 数据库即可；客户端埋点已经合批，SQLite 使用 WAL、`busy_timeout=5000` 和 `synchronous=NORMAL`。若后续扩大到数百人或多台应用服务器，再迁移 PostgreSQL。

## 教师数据接口

请求头统一携带 `x-teacher-key: <TEACHER_KEY>`：

- `GET /api/teacher/summary`
- `GET /api/teacher/export?kind=attempts&format=csv`
- `GET /api/teacher/export?kind=attempts&format=jsonl`
- `GET /api/teacher/export?kind=events&format=jsonl`

开发环境未设置密钥时临时使用 `demo-teacher-key`；生产环境必须显式设置 `TEACHER_KEY`。

## 目录

- `client/`：React 学生端与全量交互埋点。
- `server/`：Express API、SQLite、权威回放、教师导出。
- `shared/`：客户端和服务端共用的规则引擎、BFS 求解器、受限 Python 校验器。
- `levels.teacher.json`：20 关教师内容包，含最优步数。
- `solutions.teacher.json`：教师参考路线，不由服务端公开接口提供。
- `docs/`：开发规范、关卡说明、埋点字典和 DEMO 复用说明。
- `scripts/`：内容校验和 40 用户并发测试。

学生隐私数据和 SQLite 文件不会提交到 Git。正式采集前，请在学校许可范围内确定保存周期、访问权限和数据清理流程。
