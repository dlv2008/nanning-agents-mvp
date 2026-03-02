const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const store = require('./config/datastore');
const llmClient = require('./services/llm-client');
const supabase = require('./services/supabase-client');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
app.get('/api/sessions/:agentCode', async (req, res) => {
    try {
        // 先获取智能体ID
        const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('code', req.params.agentCode)
            .single();

        if (!agent) return res.json({ success: true, data: [] });

        const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('agent_id', agent.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (err) {
        console.error('Fetch sessions error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取消息列表
app.get('/api/messages/:sessionId', async (req, res) => {
    try {
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
app.post('/api/chat/:agentCode', async (req, res) => {
    try {
        const { agentCode } = req.params;
        const { sessionId, message } = req.body;

        // 获取智能体信息
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('code', agentCode)
            .single();

        if (agentError || !agent) return res.status(404).json({ success: false, error: '智能体不存在' });

        // 1. 获取或创建会话
        let sid = sessionId;
        if (!sid) {
            const title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
            const { data: newSession, error: sessError } = await supabase
                .from('sessions')
                .insert([{ agent_id: agent.id, title }])
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

        // 5. 调用LLM
        const reply = await llmClient.chat(contextMessages, agentCode);

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
app.post('/api/upload/:agentCode', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: '未选择文件' });

        const agent = store.getAgent(req.params.agentCode);
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

        const file = store.addFile(agentId, sessionId, req.file.originalname, req.file.path, ext, req.file.size, parsedContent);

        res.json({
            success: true,
            data: {
                fileId: file.id,
                filename: req.file.originalname,
                fileSize: req.file.size,
                fileType: ext,
                parsedPreview: parsedContent.substring(0, 2000),
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 仪表盘统计
app.get('/api/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [agents, sessions, messages, files] = await Promise.all([
            supabase.from('agents').select('id', { count: 'exact' }).eq('is_active', true),
            supabase.from('sessions').select('id', { count: 'exact' }).gte('created_at', today),
            supabase.from('messages').select('id', { count: 'exact' }).gte('created_at', today),
            supabase.from('tasks').select('id', { count: 'exact' }) // 临时替代
        ]);

        res.json({
            success: true,
            data: {
                agentCount: agents.count || 0,
                todaySessions: sessions.count || 0,
                todayMessages: messages.count || 0,
                totalFiles: files.count || 0
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

// 系统配置
app.get('/api/config', async (req, res) => {
    try {
        const { data, error } = await supabase.from('system_configs').select('*');
        if (error) throw error;
        res.json({ success: true, data: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { configs } = req.body;
        const upsertData = Object.entries(configs).map(([k, v]) => ({ config_key: k, config_value: v }));

        const { error } = await supabase.from('system_configs').upsert(upsertData);
        if (error) throw error;

        // 同步刷新LLM客户端配置
        llmClient.updateConfig({
            apiUrl: configs.llm_api_url,
            apiKey: configs.llm_api_key,
            modelName: configs.llm_model_name,
            temperature: parseFloat(configs.llm_temperature || '0.7'),
            maxTokens: parseInt(configs.llm_max_tokens || '4096'),
        });
        res.json({ success: true, message: '配置已保存' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/config/test', async (req, res) => {
    try {
        const result = await llmClient.testConnection();
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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 国能南宁AI智能体平台已启动`);
    console.log(`   访问地址: http://localhost:${PORT}`);
    console.log(`   数据存储: Supabase (PostgreSQL)`);
    console.log(`   环境状态: ${process.env.NODE_ENV}\n`);
});
