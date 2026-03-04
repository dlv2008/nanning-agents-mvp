const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
// 根据运行环境加载对应的配置文件
// 生产环境读 .env.production（由 CI/CD 的 run_server.sh 写入）
// 开发/测试环境读 .env（本地手动维护）
const dotenvFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: dotenvFile });

const llmClient = require('./services/llm-client');
const supabase = require('./services/supabase-client');

const app = express();
const PORT = process.env.PORT || 8016;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 认证中间件
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        // 如果是只读接口且是开发环境，可以放行或根据需求拦截
        return next();
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) throw error;
        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ success: false, error: '认证失败' });
    }
};

// 文件上传配置
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const uniqueName = Date.now() + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8');
            cb(null, uniqueName);
        }
    }),
    limits: { fileSize: 20 * 1024 * 1024 }
});

// ============ API 路由 ============

// 获取所有智能体
app.get('/api/agents', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('*')
            .eq('is_active', true)
            .order('id', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (err) {
        console.error('Fetch agents error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取单个智能体
app.get('/api/agents/:code', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('*')
            .eq('code', req.params.code)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ success: false, error: '智能体不存在' });
            throw error;
        }
        res.json({ success: true, data: data });
    } catch (err) {
        console.error('Fetch agent error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取会话列表
app.get('/api/sessions/:agentCode', authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        // 先获取智能体ID
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('code', req.params.agentCode)
            .single();

        if (!agent) return res.json({ success: true, data: [] });

        let query = supabase
            .from('sessions')
            .select('*')
            .eq('agent_id', agent.id);

        if (userId) query = query.eq('user_id', userId);

        const { data, error } = await query.order('updated_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (err) {
        console.error('Fetch sessions error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取消息列表
app.get('/api/messages/:sessionId', authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        // 校验该会话是否属于当前用户
        if (userId) {
            const { data: session } = await supabase.from('sessions').select('user_id').eq('id', req.params.sessionId).single();
            if (session && session.user_id !== userId) {
                return res.status(403).json({ success: false, error: '权限不足' });
            }
        }
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', req.params.sessionId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (err) {
        console.error('Fetch messages error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 对话接口
app.post('/api/chat/:agentCode', authenticateUser, async (req, res) => {
    try {
        const { agentCode } = req.params;
        const { sessionId, message } = req.body;
        const userId = req.user?.id;

        // 获取智能体信息
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('code', agentCode)
            .single();

        if (agentError || !agent) return res.status(404).json({ success: false, error: '智能体不存在' });

        // 0. 获取用户个人 LLM 配置 (如果有)
        let userLLMConfig = null;
        if (userId) {
            const { data: configs } = await supabase
                .from('system_configs')
                .select('*')
                .eq('user_id', userId);

            if (configs && configs.length > 0) {
                userLLMConfig = {};
                configs.forEach(c => {
                    const key = c.config_key.replace('llm_', '');
                    const map = { api_url: 'apiUrl', api_key: 'apiKey', model_name: 'modelName', temperature: 'temperature', max_tokens: 'maxTokens' };
                    userLLMConfig[map[key] || key] = c.config_value;
                });
            }
        }

        // 1. 获取或创建会话
        let sid = sessionId;
        if (!sid) {
            const title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
            const { data: newSession, error: sessError } = await supabase
                .from('sessions')
                .insert([{ agent_id: agent.id, title, user_id: userId }])
                .select()
                .single();

            if (sessError) throw sessError;
            sid = newSession.id;
        }

        // 2. 保存用户消息
        const { error: userMsgError } = await supabase
            .from('messages')
            .insert([{ session_id: sid, role: 'user', content: message }]);

        if (userMsgError) throw userMsgError;

        // 3. 构建上下文
        const contextMessages = [
            { role: 'system', content: agent.system_prompt },
        ];

        // 附加业务数据上下文 (现在是异步的)
        const bizContext = await buildBusinessContext(agentCode, message);
        if (bizContext) {
            contextMessages.push({ role: 'system', content: `以下是相关业务数据，请参考：\n${bizContext}` });
        }

        // 4. 获取历史记录 (最近10条)
        const { data: history } = await supabase
            .from('messages')
            .select('role, content')
            .eq('session_id', sid)
            .order('created_at', { ascending: true })
            .limit(20); // 取稍多一点，过滤后取10

        if (history) {
            const recentHistory = history.slice(-11); // 包含刚插入的用户消息
            recentHistory.forEach(h => {
                if (h.content !== message || h.role !== 'user') { // 避免重复添加刚存入的消息，如果逻辑上已经处理了则跳过
                    contextMessages.push({ role: h.role, content: h.content });
                }
            });
            // 确保刚发的消息在最后
            contextMessages.push({ role: 'user', content: message });
        }

        // 5. 调用LLM (传入可能存在的用户个人配置)
        const reply = await llmClient.chat(contextMessages, agentCode, userLLMConfig);

        // 6. 保存助手回复并更新会话时间
        await Promise.all([
            supabase.from('messages').insert([{ session_id: sid, role: 'assistant', content: reply }]),
            supabase.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sid)
        ]);

        res.json({
            success: true,
            data: { sessionId: sid, reply }
        });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 构建业务上下文
async function buildBusinessContext(agentCode, message) {
    const msg = message.toLowerCase();
    let context = '';

    try {
        switch (agentCode) {
            case 'violation': {
                // 并行查询违章和条款
                const [violationRes, ruleRes] = await Promise.all([
                    supabase.from('violations').select('*'),
                    supabase.from('penalty_rules').select('*')
                ]);

                if (msg.includes('统计') || msg.includes('积分') || msg.includes('查询')) {
                    const violations = violationRes.data || [];
                    context += `【违章记录】\n${violations.map(v =>
                        `- ${v.violation_date} ${v.department} ${v.person_name}: ${v.violation_type}，扣${v.penalty_score}分，罚款${v.penalty_amount}元 [${v.status === 'confirmed' ? '已确认' : '待审核'}]`
                    ).join('\n')}\n`;
                }
                if (msg.includes('考核') || msg.includes('条款') || msg.includes('安全帽') || msg.includes('工作票') || msg.includes('违章')) {
                    const rules = ruleRes.data || [];
                    const matched = rules.filter(r =>
                        msg.includes(r.violation_type) || msg.includes(r.category)
                    );
                    const showRules = matched.length > 0 ? matched : rules.slice(0, 5);
                    context += `【考核条款】\n${showRules.map(r =>
                        `- [${r.rule_code}] ${r.violation_type}: ${r.description}，${r.penalty_level}，扣${r.penalty_score}分，罚款${r.penalty_amount}元。依据: ${r.source_document}`
                    ).join('\n')}\n`;
                }
                break;
            }
            case 'hr': {
                const [perfRes, empRes] = await Promise.all([
                    supabase.from('performance').select('*'),
                    supabase.from('employees').select('*')
                ]);

                if (msg.includes('绩效') || msg.includes('分析') || msg.includes('报告')) {
                    const perf = perfRes.data || [];
                    context += `【绩效数据】\n${perf.map(p =>
                        `- ${p.period} ${p.department} ${p.employee_name}: ${p.score}分 (${p.level})`
                    ).join('\n')}\n`;
                }
                if (msg.includes('档案') || msg.includes('查询')) {
                    const employees = empRes.data || [];
                    const name = employees.find(e => msg.includes(e.name));
                    if (name) {
                        context += `【员工档案】\n工号: ${name.id}\n姓名: ${name.name}\n部门: ${name.department}\n职务: ${name.position}\n职称: ${name.title}\n学历: ${name.education}\n专业: ${name.major}\n入职日期: ${name.join_date}\n证书: ${name.certifications ? name.certifications.join('、') : '无'}\n`;
                    } else {
                        context += `【员工列表】\n${employees.slice(0, 10).map(e => `- ${e.id} ${e.name} ${e.department} ${e.position} ${e.title}`).join('\n')}\n`;
                    }
                }
                break;
            }
            case 'task': {
                const { data: tasks } = await supabase.from('tasks').select('*');
                if (tasks) {
                    context += `【现有任务】\n${tasks.map(t =>
                        `- [${t.priority === 'urgent' ? '紧急' : t.priority === 'important' ? '重要' : '一般'}] ${t.task_title} → ${t.responsible_dept}/${t.responsible_person}，截止: ${t.deadline}，状态: ${t.status === 'completed' ? '已完成' : t.status === 'in_progress' ? '进行中' : '待执行'}`
                    ).join('\n')}\n`;
                }
                break;
            }
            case 'production': {
                const [violationRes, taskRes, perfRes, deptRes] = await Promise.all([
                    supabase.from('violations').select('id, status'),
                    supabase.from('tasks').select('id, status'),
                    supabase.from('performance').select('id'),
                    supabase.from('departments').select('id')
                ]);

                const violations = violationRes.data || [];
                const tasks = taskRes.data || [];
                context += `【可用数据源】\n`;
                context += `- 违章记录: ${violations.length}条 (已确认${violations.filter(v => v.status === 'confirmed').length}条)\n`;
                context += `- 任务进度: 共${tasks.length}个任务, 已完成${tasks.filter(t => t.status === 'completed').length}个, 进行中${tasks.filter(t => t.status === 'in_progress').length}个\n`;
                context += `- 绩效数据: ${(perfRes.data || []).length}条记录\n`;
                context += `- 部门数量: ${(deptRes.data || []).length}个\n`;
                break;
            }
        }
    } catch (err) {
        console.error('Build context error:', err);
    }
    return context;
}

// 文件上传
app.post('/api/upload/:agentCode', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: '未选择文件' });

        // 获取智能体系统信息以关联
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('code', req.params.agentCode)
            .single();

        const agentId = agent ? agent.id : null;
        const sessionId = req.body.sessionId ? parseInt(req.body.sessionId) : null;

        // 简单文本解析
        let parsedContent = '';
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (['.txt', '.md', '.csv'].includes(ext)) {
            parsedContent = fs.readFileSync(req.file.path, 'utf8');
        } else {
            parsedContent = `[${ext}文件] ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB)\n提示：MVP阶段仅支持txt/md/csv文件的文本提取。PDF/DOCX/XLSX文件需要在商用版本中通过OCR和专用解析库支持。`;
        }

        // 保存到数据库 (这里我们可以创建一个 files 表，或者暂时存入知识库表中)
        // 考虑到 MVP 架构，我们可以先不存入数据库，或者创建一个 files 表
        // 目前 store.addFile 是存入内存，我们在这里存入 Supabase messages 作为一个系统通知也是一种选择
        // 但更好的做法是创建一个 files 表。
        // 为了保持简单，我们假设不需要持久化文件列表，或者我们可以通过 messages 发送。

        res.json({
            success: true,
            data: {
                filename: req.file.originalname,
                fileSize: req.file.size,
                fileType: ext,
                parsedPreview: parsedContent.substring(0, 2000),
            }
        });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 仪表盘统计
app.get('/api/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [agentsRes, sessionsRes, messagesRes, filesRes] = await Promise.all([
            supabase.from('agents').select('id', { count: 'exact' }).eq('is_active', true),
            supabase.from('sessions').select('id', { count: 'exact' }).gte('created_at', today),
            supabase.from('messages').select('id', { count: 'exact' }).gte('created_at', today),
            supabase.from('tasks').select('id', { count: 'exact' }) // 临时替代
        ]);

        // 检查是否有查询报错
        if (agentsRes.error) throw agentsRes.error;
        if (sessionsRes.error) throw sessionsRes.error;
        if (messagesRes.error) throw messagesRes.error;

        res.json({
            success: true,
            data: {
                agentCount: agentsRes.count || 0,
                todaySessions: sessionsRes.count || 0,
                todayMessages: messagesRes.count || 0,
                totalFiles: filesRes.count || 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 业务数据接口
app.get('/api/data/violations', async (req, res) => {
    const { data } = await supabase.from('violations').select('*').order('violation_date', { ascending: false });
    res.json({ success: true, data: data || [] });
});

app.get('/api/data/performance', async (req, res) => {
    const { data } = await supabase.from('performance').select('*').order('period', { ascending: false });
    res.json({ success: true, data: data || [] });
});

app.get('/api/data/employees', async (req, res) => {
    const { data } = await supabase.from('employees').select('*');
    res.json({ success: true, data: data || [] });
});

app.get('/api/data/tasks', async (req, res) => {
    const { data } = await supabase.from('tasks').select('*').order('deadline', { ascending: true });
    res.json({ success: true, data: data || [] });
});

app.get('/api/data/compliance', async (req, res) => {
    // 兼容旧模拟数据逻辑
    res.json({ success: true, data: [] });
});

// 系统默认 LLM 状态查询（供 config 页面展示，不暴露 key）
app.get('/api/system-llm-status', async (req, res) => {
    const status = llmClient.getStatus ? llmClient.getStatus() : null;
    const hasKey = !!(process.env.LLM_API_KEY || (status && status.hasKey));
    res.json({
        success: true,
        data: {
            configured: hasKey,
            model: process.env.LLM_MODEL_NAME || (status && status.model) || '未知',
            apiUrl: process.env.LLM_API_URL || (status && status.apiUrl) || '',
            source: hasKey ? (process.env.LLM_API_KEY ? '环境变量 (.env.production)' : '数据库 (system_configs)') : '未配置',
        }
    });
});

// 系统配置
app.get('/api/config', authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.json({ success: true, data: [] }); // 未登录返回空
        }

        const { data, error } = await supabase
            .from('system_configs')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/config', authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: '未登录' });

        const { configs } = req.body;
        const upsertData = Object.entries(configs).map(([k, v]) => ({
            user_id: userId,
            config_key: k,
            config_value: v
        }));

        const { error } = await supabase.from('system_configs').upsert(upsertData);
        if (error) throw error;

        res.json({ success: true, message: '个人配置已保存' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/config/test', authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        // 获取当前请求用户的配置快照进行测试
        const { data: configs } = await supabase
            .from('system_configs')
            .select('*')
            .eq('user_id', userId);

        let testConfig = null;
        if (configs && configs.length > 0) {
            testConfig = {};
            configs.forEach(c => {
                const key = c.config_key.replace('llm_', '');
                const map = { api_url: 'apiUrl', api_key: 'apiKey', model_name: 'modelName', temperature: 'temperature', max_tokens: 'maxTokens' };
                testConfig[map[key] || key] = c.config_value;
            });
        }

        // 如果用户没配置，测试连接默认会失败或由于 apiKey 缺失使用 mock
        const result = await llmClient.testConnection(testConfig);
        res.json({ success: true, data: result });
    } catch (err) {
        res.json({ success: true, data: { success: false, message: err.message } });
    }
});

// SPA 回退 - 所有html页面
app.get('*.html', (req, res) => {
    const filePath = path.join(__dirname, 'public', req.path);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ success: false, error: '服务器内部错误' });
});

// 启动服务器
async function startServer() {
    try {
        // 从 Supabase 加载初始全局配置 (user_id 为 null 的记录)
        const { data: configs } = await supabase
            .from('system_configs')
            .select('*')
            .filter('user_id', 'is', null);

        if (configs && configs.length > 0) {
            const configObj = {};
            configs.forEach(c => configObj[c.config_key] = c.config_value);
            llmClient.updateConfig({
                apiUrl: configObj.llm_api_url,
                apiKey: configObj.llm_api_key,
                modelName: configObj.llm_model_name,
                temperature: parseFloat(configObj.llm_temperature || '0.7'),
                maxTokens: parseInt(configObj.llm_max_tokens || '4096'),
            });
            console.log('   LLM配置来源: 数据库 (system_configs)');
        } else if (process.env.LLM_API_KEY) {
            // 兜底：数据库无配置时，从环境变量加载（生产环境 .env.production 提供）
            llmClient.updateConfig({
                apiUrl: process.env.LLM_API_URL,
                apiKey: process.env.LLM_API_KEY,
                modelName: process.env.LLM_MODEL_NAME || 'glm-4',
                temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
                maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096'),
            });
            console.log('   LLM配置来源: 环境变量 (.env.production)');
        } else {
            console.warn('   ⚠️  警告: 未检测到LLM配置，将使用演示模式');
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 国能南宁AI智能体平台已启动`);
            console.log(`   访问地址: http://localhost:${PORT}`);
            console.log(`   数据存储: Supabase (PostgreSQL)`);
            console.log(`   环境状态: ${process.env.NODE_ENV}\n`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
    }
}

// 供单测时使用
if (process.env.NODE_ENV !== 'test') {
    startServer();
}

module.exports = app;
