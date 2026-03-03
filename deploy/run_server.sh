#!/bin/bash

# 国能南宁 AI 智能体平台 - 自动化启动与维护脚本
# 该脚本由 GitHub Actions 或手动执行，用于独立冷启动或热更新服务。

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
# 注意：不使用 set -e，防止网络超时误杀脚本
AGENT_COUNT=$(node -e "
const { pool } = require('./config/database');
pool.connect().then(c => {
  c.query('SELECT COUNT(*) FROM ai_agents.agents')
    .then(r => { console.log(r.rows[0].count); c.release(); pool.end(); })
    .catch(() => { console.log('0'); c.release(); pool.end(); });
}).catch(() => { console.log('0'); pool.end(); });
" 2>/dev/null) || AGENT_COUNT="0"
AGENT_COUNT="${AGENT_COUNT:-0}"

if [ "$AGENT_COUNT" -eq "0" ] 2>/dev/null; then
    log "${YELLOW}数据库为空，正在填充种子数据 (db:seed)...${NC}"
    npm run db:seed || log "${YELLOW}种子数据填充失败（可能已存在），继续部署...${NC}"
    log "${GREEN}种子数据填充完成${NC}"
else
    log "检测到 ${AGENT_COUNT} 个智能体，跳过种子数据填充"
fi

# 6. 将当前环境变量写入 .env.production 文件，供 PM2 加载（解决 restart 时变量失效问题）
log "正在写入生产环境变量配置..."
cat > "$ROOT_DIR/.env.production" << EOF
PORT=${PORT:-8016}
NODE_ENV=production
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
LLM_API_URL=${LLM_API_URL}
LLM_API_KEY=${LLM_API_KEY}
LLM_MODEL_NAME=${LLM_MODEL_NAME}
EOF
chmod 600 "$ROOT_DIR/.env.production"  # 仅 dlv 用户可读

# 7. 使用 PM2 启动或重启进程（通过 --env-file 注入最新变量，确保每次 CD 都生效）
log "正在 (重新) 启动服务..."
if npx --yes pm2 list 2>/dev/null | grep -q 'nanning-agents-mvp'; then
    # 服务已存在：停止旧进程，用最新环境文件重启，确保变量注入
    npx --yes pm2 stop nanning-agents-mvp 2>/dev/null || true
    npx --yes pm2 delete nanning-agents-mvp 2>/dev/null || true
fi
# 统一用 start 指令，保证每次 CD 都能加载到最新的 Secret 变量
npx --yes pm2 start server.js \
    --name nanning-agents-mvp \
    --env-file "$ROOT_DIR/.env.production" \
    --time

# 保存 PM2 进程列表，用于开机自动恢复
npx --yes pm2 save
log "${GREEN}服务已在后台持久运行 (PM2 托管，异常自动拉起)${NC}"

echo -e "\n=========================================="
log "${GREEN}部署流程执行完毕!${NC}"
log "后端地址: http://127.0.0.1:8016"
log "Nginx 路径: /nanning_agents_mvp/"
echo ""
log "服务管理命令 (需 cd ~/nanning_agents_mvp 后执行):"
log "  查看状态: npx pm2 status"
log "  查看日志: npx pm2 logs nanning-agents-mvp"
log "  停止服务: npx pm2 stop nanning-agents-mvp"
log "  重启服务: npx pm2 restart nanning-agents-mvp"
echo "=========================================="
