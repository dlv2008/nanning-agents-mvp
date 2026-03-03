#!/bin/bash

# 国能南宁 AI 智能体平台 - 自动化启动与维护脚本
# 该脚本由 GitHub Actions 或手动执行，用于独立冷启动或热更新服务。

set -e  # 任何步骤报错则立即终止

# 1. 颜色与打印函数
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

function log() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# 2. 进入项目目录
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log "进入工作目录: $ROOT_DIR"
cd "$ROOT_DIR"

# 3. 检查并安装生产依赖
log "正在进行生产依赖检查与更新..."
npm install --omit=dev --no-audit --no-fund

# 4. 执行数据库自愈初始化 (CREATE IF NOT EXISTS，安全幂等)
log "正在执行数据库表结构初始化 (db:init)..."
npm run db:init

# 5. 检查是否需要填充种子数据 (仅在 agents 表为空时执行，避免覆盖线上数据)
log "检测智能体数据是否存在..."
AGENT_COUNT=$(node -e "
const { pool } = require('./config/database');
pool.connect().then(c => {
  c.query('SELECT COUNT(*) FROM ai_agents.agents')
    .then(r => { console.log(r.rows[0].count); c.release(); pool.end(); })
    .catch(() => { console.log('0'); c.release(); pool.end(); });
})" 2>/dev/null || echo "0")

if [ "$AGENT_COUNT" -eq "0" ]; then
    log "${YELLOW}数据库为空，正在填充种子数据 (db:seed)...${NC}"
    npm run db:seed
    log "${GREEN}种子数据填充完成${NC}"
else
    log "检测到 ${AGENT_COUNT} 个智能体，跳过种子数据填充"
fi

# 6. 配置 PM2 开机自启 (仅首次执行一次)
log "配置 PM2 开机自启动..."
npx --yes pm2 startup 2>/dev/null || true

# 7. 使用 PM2 启动或重启进程
log "正在 (重新) 启动服务 (注入环境变量)..."
if npx --yes pm2 list | grep -q 'nanning-agents-mvp'; then
    npx --yes pm2 restart nanning-agents-mvp --update-env
else
    npx --yes pm2 start server.js --name nanning-agents-mvp
fi

# 保存 PM2 进程列表，用于开机自动恢复
npx --yes pm2 save
log "${GREEN}服务已在后台持久运行 (PM2 托管，异常自动拉起)${NC}"

echo -e "\n=========================================="
log "${GREEN}部署流程执行完毕!${NC}"
log "后端地址: http://127.0.0.1:8016"
log "Nginx 路径: /nanning_agents_mvp/"
echo ""
log "服务管理命令:"
log "  查看状态: npx pm2 status"
log "  查看日志: npx pm2 logs nanning-agents-mvp"
log "  停止服务: npx pm2 stop nanning-agents-mvp"
log "  重启服务: npx pm2 restart nanning-agents-mvp"
echo "=========================================="
