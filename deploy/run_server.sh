#!/bin/bash

# 国能南宁 AI 智能体平台 - 自动化启动与维护脚本
# 该脚本由 GitHub Actions 或手动执行，用于独立冷启动或热更新服务。

# 1. 颜色与打印函数
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function log() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# 2. 进入项目目录
# 取当前脚本所在目录的上一级作为根目录
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log "进入工作目录: $ROOT_DIR"
cd "$ROOT_DIR"

# 3. 检查并安装依赖 (精简版)
log "正在进行生产依赖检查与更新..."
npm install --production --no-audit --no-fund

# 4. 执行数据库自愈初始化
log "正在执行数据库初始化 (npm run db:init)..."
# 注意：DB_* 和 SUPABASE_* 环境变量由外部注入 (GitHub Actions)
npm run db:init

# 5. 端口检查 (8016)
PORT=8016
if lsof -i :$PORT >/dev/null 2>&1; then
    log "端口 $PORT 已被占用，准备重启进程..."
else
    log "端口 $PORT 当前空闲，准备启动新进程..."
fi

# 6. 使用 PM2 启动或重启进程
# 优先使用 PM2，如果服务器未安装则使用原生 node 运行并退出以示失败
if command -v pm2 &> /dev/null; then
    log "检测到 PM2，正在 (重新) 启动服务..."
    # --update-env 确保最新的环境变量被注入到进程中
    pm2 restart nanning-agents-mvp --update-env || pm2 start server.js --name nanning-agents-mvp --env production
    pm2 save
    log "${GREEN}服务已在后台运行 (PM2)${NC}"
else
    log "警告: 未检测到 PM2！将尝试前台启动 (不推荐)"
    # 这里建议在生产环境预装 pm2
    exit 1
fi

echo -e "\n=========================================="
log "${GREEN}部署流程执行完毕!${NC}"
log "后端地址: http://127.0.0.1:8016"
log "Nginx 路径: /nanning_agents_mvp/"
echo "==========================================\n"
