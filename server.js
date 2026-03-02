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
app.get('/api/agents/:code', (req, res) => {
    try {
        const agent = store.getAgent(req.params.code);
        if (!agent) return res.status(404).json({ success: false, error: '智能体不存在' });
        res.json({ success: true, data: agent });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取会话列表
app.get('/api/sessions/:agentCode', (req, res) => {
    try {
        const sessions = store.getSessions(req.params.agentCode);
        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 获取消息列表
app.get('/api/messages/:sessionId', (req, res) => {
    try {
        const messages = store.getMessages(parseInt(req.params.sessionId));
        res.json({ success: true, data: messages });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 对话接口
app.post('/api/chat/:agentCode', async (req, res) => {
    try {
        const { agentCode } = req.params;
        const { sessionId, message } = req.body;

        const agent = store.getAgent(agentCode);
        if (!agent) return res.status(404).json({ success: false, error: '智能体不存在' });

        // 创建或获取会话
        let sid = sessionId;
        if (!sid) {
            const title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
            const session = store.createSession(agent.id, title);
            sid = session.id;
        }

        // 保存用户消息
        store.addMessage(sid, 'user', message);

        // 获取历史消息构建上下文
        const history = store.getMessages(sid);
        const contextMessages = [
            { role: 'system', content: agent.system_prompt },
        ];

        // 附加业务数据上下文
        const bizContext = buildBusinessContext(agentCode, message);
        if (bizContext) {
            contextMessages.push({ role: 'system', content: `以下是相关业务数据，请参考：\n${bizContext}` });
        }

        // 添加历史消息（最多取最近10条）
        const recentHistory = history.slice(-10);
        recentHistory.forEach(h => {
            contextMessages.push({ role: h.role, content: h.content });
        });

        // 调用LLM
        const reply = await llmClient.chat(contextMessages, agentCode);

        // 保存AI回复
        store.addMessage(sid, 'assistant', reply);

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
function buildBusinessContext(agentCode, message) {
    const msg = message.toLowerCase();
    let context = '';

    switch (agentCode) {
        case 'violation': {
            const violations = store.getViolations();
            const rules = store.getPenaltyRules();
            if (msg.includes('统计') || msg.includes('积分') || msg.includes('查询')) {
                context += `【违章记录】\n${violations.map(v =>
                    `- ${v.violation_date} ${v.department} ${v.person_name}: ${v.violation_type}，扣${v.penalty_score}分，罚款${v.penalty_amount}元 [${v.status === 'confirmed' ? '已确认' : '待审核'}]`
                ).join('\n')}\n`;
            }
            if (msg.includes('考核') || msg.includes('条款') || msg.includes('安全帽') || msg.includes('工作票') || msg.includes('违章')) {
                // 匹配相关条款
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
            const perf = store.getPerformance();
            const employees = store.getEmployees();
            if (msg.includes('绩效') || msg.includes('分析') || msg.includes('报告')) {
                context += `【绩效数据】\n${perf.map(p =>
                    `- ${p.period} ${p.department} ${p.employee_name}: ${p.score}分 (${p.level})`
                ).join('\n')}\n`;
            }
            if (msg.includes('档案') || msg.includes('查询')) {
                const name = employees.find(e => msg.includes(e.name));
                if (name) {
                    context += `【员工档案】\n工号: ${name.id}\n姓名: ${name.name}\n部门: ${name.department}\n职务: ${name.position}\n职称: ${name.title}\n学历: ${name.education}\n专业: ${name.major}\n入职日期: ${name.join_date}\n证书: ${name.certifications.join('、') || '无'}\n`;
                } else {
                    context += `【员工列表】\n${employees.map(e => `- ${e.id} ${e.name} ${e.department} ${e.position} ${e.title}`).join('\n')}\n`;
                }
            }
            break;
        }
        case 'task': {
            const tasks = store.getTasks();
            context += `【现有任务】\n${tasks.map(t =>
                `- [${t.priority === 'urgent' ? '紧急' : t.priority === 'important' ? '重要' : '一般'}] ${t.task_title} → ${t.responsible_dept}/${t.responsible_person}，截止: ${t.deadline}，状态: ${t.status === 'completed' ? '已完成' : t.status === 'in_progress' ? '进行中' : '待执行'}`
            ).join('\n')}\n`;
            break;
        }
        case 'compliance': {
            const records = store.getCompliance();
            context += `【合规审核记录】\n${records.map(r =>
                `- [${r.audit_result === 'pass' ? '✅通过' : r.audit_result === 'fail' ? '❌不通过' : '⚠️警告'}] ${r.audit_type}: ${r.document_name}\n  ${r.issues.length > 0 ? '问题: ' + r.issues.map(i => i.issue).join('; ') : '无问题'}\n  建议: ${r.suggestions}`
            ).join('\n')}\n`;
            break;
        }
        case 'production': {
            context += `【可用数据源】\n`;
            const violations = store.getViolations();
            const tasks = store.getTasks();
            context += `- 违章记录: ${violations.length}条 (已确认${violations.filter(v => v.status === 'confirmed').length}条)\n`;
            context += `- 任务进度: 共${tasks.length}个任务, 已完成${tasks.filter(t => t.status === 'completed').length}个, 进行中${tasks.filter(t => t.status === 'in_progress').length}个\n`;
            const perf = store.getPerformance();
            context += `- 绩效数据: ${perf.length}条记录\n`;
            context += `- 部门数量: ${store.data.departments.length}个\n`;
            break;
        }
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
app.get('/api/dashboard', (req, res) => {
    try {
        res.json({ success: true, data: store.getDashboard() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 业务数据接口
app.get('/api/data/violations', (req, res) => {
    res.json({ success: true, data: store.getViolations() });
});

app.get('/api/data/performance', (req, res) => {
    res.json({ success: true, data: store.getPerformance() });
});

app.get('/api/data/employees', (req, res) => {
    res.json({ success: true, data: store.getEmployees() });
});

app.get('/api/data/tasks', (req, res) => {
    res.json({ success: true, data: store.getTasks() });
});

app.get('/api/data/compliance', (req, res) => {
    res.json({ success: true, data: store.getCompliance() });
});

// 系统配置
app.get('/api/config', (req, res) => {
    try {
        res.json({ success: true, data: store.getConfigs() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/config', (req, res) => {
    try {
        const { configs } = req.body;
        for (const [key, value] of Object.entries(configs)) {
            store.updateConfig(key, value);
        }
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
    console.log(`   数据存储: JSON文件 (data/store.json)`);
    console.log(`   LLM模式: ${store.getConfigValue('llm_api_key') ? '已配置API' : '模拟演示模式'}\n`);
});
