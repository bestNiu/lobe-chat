# 有临 V2 本机部署

此 Compose 部署新分支源码构建的镜像，不复用旧企业分支的数据库、账号或 Keycloak。只监听本机回环地址；其他项目的数据库和 Redis 不受影响。

## 当前实例

- 页面：<http://localhost:33210>（使用此地址注册新账号，避免混用 `127.0.0.1` 导致认证 origin 不一致）
- S3：`http://localhost:33212`；管理页面：`http://localhost:33213`
- Agent / Device Gateway：`33217` / `33218`
- Compose project：`youlin-v2`
- 镜像：`youlin-v2:6c7a6fb033`，基于 `origin/main` 的 `6c7a6fb033`，另包含本分支的 Docker 构建 worker 限制（2 个）
- 私有配置：`~/.config/youlin/v2/.env`（目录 0700，文件 0600，不提交 Git）

配置已生成独立的数据库、认证、加密、S3 和 Gateway 密钥；Gateway 只收到公钥。数据库、Redis 和搜索服务不映射宿主机端口。数据库、Redis 和文件保存在本项目独立的 Docker volumes。

首次访问自行注册邮箱/密码账号。模型 API 凭据未从旧实例迁移，需要在产品设置里重新配置。未配置邮件发送、SSO、云沙箱或 QStash；邮件验证关闭，仅适合本机开发，不应直接对外暴露。持久化任务调度等需要 QStash 的能力不在本次部署验证范围内。

本机真实浏览器已验证注册、首次引导、密码登录、首页及刷新后保持登录。引导中的在线 Agent 模板请求被远端拒绝授权（缺少 Marketplace bearer token），可使用「暂时跳过」进入首页；未验证模型调用。验证用的非管理员账号为 `deployment-smoke@youlin.test`，独立随机密码保存在私有目录的 `uat-account.json` 中，不用于日常使用。

## 运维

在仓库根目录执行：

```bash
ENV_FILE="$HOME/.config/youlin/v2/.env"
docker compose --env-file "$ENV_FILE" -f docker-compose/local/compose.yml up -d
docker compose --env-file "$ENV_FILE" -f docker-compose/local/compose.yml ps -a
docker compose --env-file "$ENV_FILE" -f docker-compose/local/compose.yml logs --tail=100 lobe
docker compose --env-file "$ENV_FILE" -f docker-compose/local/compose.yml down
```

`down` 保留数据。只有确定要永久清空本项目账号和文件时才使用 `down -v`。不要使用全局 `docker system prune`。

## 从源码重建

首次部署使用 `git archive HEAD` 导出的纯源码上下文，并复制当前 `next.config.ts` 中的 Docker worker 限制，避免把宿主机的私有 `.env`、旧构建产物和旧分支残留传入镜像。下面的方式不包含其他未提交修改；后续二开代码需要提交后再按此方式构建：

```bash
CONTEXT=$(mktemp -d)
git archive HEAD | tar -x -C "$CONTEXT"
cp next.config.ts "$CONTEXT/next.config.ts"
REV=$(git rev-parse --short=10 HEAD)
docker build --memory=10g --memory-swap=10g -t "youlin-v2:$REV" "$CONTEXT"
rm -rf "$CONTEXT"
# 修改私有 .env 内的 YOULIN_IMAGE 为新镜像，然后执行 up -d。
```

构建沿用上游 `Dockerfile`。基础设施的 `latest` 镜像标签是上游默认配置；重建/拉取时可能更新版本，升级前应备份数据。本机可用内存不足时不要同时执行多个构建。
