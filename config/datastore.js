/**
 * 数据存储层 - 使用JSON文件代替PostgreSQL
 * MVP阶段不依赖数据库TCP连接，避免WSL网络问题
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function saveJSON(filename, data) {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

class DataStore {
    constructor() {
        this.data = {};
        this.init();
    }

    init() {
        const existing = loadJSON('store.json');
        if (existing) {
            this.data = existing;
            console.log('📂 已加载现有数据');
            return;
        }
        this.data = this.getDefaultData();
        this.save();
        console.log('🌱 已初始化默认数据');
    }

    save() {
        saveJSON('store.json', this.data);
    }

    getDefaultData() {
        return {
            // 系统配置
            system_config: {
                llm_api_url: 'https://api.openai.com/v1/chat/completions',
                llm_api_key: '',
                llm_model_name: 'gpt-4',
                llm_temperature: '0.7',
                llm_max_tokens: '4096',
            },

            // 智能体定义
            agents: [
                {
                    id: 1, name: '违章考核和生产考核管理智能体', code: 'violation',
                    description: '根据公司及上级公司相关标准、管理办法、现场问题描述，自动生成考核通知单，根据违规情况寻找考核条款初步生成考核单，对违章人员自动积分，每月自动统计分析。',
                    icon: '⚠️', category: '安全管理', is_active: true,
                    system_prompt: '你是国能南宁发电有限公司的违章考核管理智能助手。你的职责是：\n1. 根据用户描述的违规情况，从公司制度中精准匹配考核条款\n2. 判定违规等级和建议扣分\n3. 自动生成规范的考核通知单\n4. 统计人员违章积分\n\n注意：你必须严格依据公司制度文件进行判断，不得自行编造考核条款。'
                },
                {
                    id: 2, name: '人资绩效和档案管理助手', code: 'hr',
                    description: '绩效考核数据收集、分析；绩效数据可视化；人事档案电子化；自动解析简历与岗位匹配。',
                    icon: '👥', category: '人力资源', is_active: true,
                    system_prompt: '你是国能南宁发电有限公司的人力资源管理智能助手。你的职责是：\n1. 分析绩效考核数据，生成分析报告\n2. 管理员工档案信息\n3. 解析简历信息，与岗位需求匹配\n4. 生成绩效数据可视化报告'
                },
                {
                    id: 3, name: '上级文件和方案任务分解与总结智能体', code: 'task',
                    description: '参照上级下发的各类通知、方案，编制对应通知、方案措施、总结及报表；根据部门职责分解文件内容，生成任务清单。',
                    icon: '📋', category: '行政管理', is_active: true,
                    system_prompt: '你是国能南宁发电有限公司的任务分解管理智能助手。你的职责是：\n1. 解析上级下发的通知、方案、文件\n2. 根据部门职责自动分解任务\n3. 生成结构化的任务清单\n4. 生成督办提醒清单'
                },
                {
                    id: 4, name: '智能合规审核智能体', code: 'compliance',
                    description: '安全生产培训材料审核；制度文件合规性检查；法规冲突检测；试行制度到期提醒。',
                    icon: '✅', category: '合规管理', is_active: true,
                    system_prompt: '你是国能南宁发电有限公司的合规审核智能助手。你的职责是：\n1. 审核安全生产培训材料的合规性\n2. 对比企业制度与上级法规检测冲突条款\n3. 检查培训记录、保险单等材料的完整性和有效性\n4. 提醒试行制度到期修订'
                },
                {
                    id: 5, name: '生产经营总结智能整理智能体', code: 'production',
                    description: '自动生成月度/季度安全分析报告；周/月例会总结；福利费用分析；技术文件编制；日常工作报告生成。',
                    icon: '📊', category: '生产管理', is_active: true,
                    system_prompt: '你是国能南宁发电有限公司的生产经营报告智能助手。你的职责是：\n1. 综合多源数据素材，按模板生成各类报告\n2. 生成月度/季度安全分析报告\n3. 将会议记录整理为总结报告\n4. 生成福利费用分析报告'
                }
            ],

            // 对话会话
            sessions: [],
            nextSessionId: 1,

            // 对话消息
            messages: [],
            nextMessageId: 1,

            // 上传文件
            files: [],
            nextFileId: 1,

            // 部门
            departments: [
                { id: 1, name: '综合管理部', code: 'ZHGL', manager: '李明', description: '负责公司综合事务管理、行政后勤等工作' },
                { id: 2, name: '组织部', code: 'ZZB', manager: '王芳', description: '负责人事管理、干部管理等工作' },
                { id: 3, name: '党建部', code: 'DJB', manager: '张伟', description: '负责党建工作、纪检监察等' },
                { id: 4, name: '计划营销部', code: 'JHYX', manager: '刘洋', description: '负责电力营销、计划管理等' },
                { id: 5, name: '财务部', code: 'CWB', manager: '陈静', description: '负责财务管理、成本控制等' },
                { id: 6, name: '审计部', code: 'SJB', manager: '赵强', description: '负责内部审计工作' },
                { id: 7, name: '规划发展办', code: 'GHFZ', manager: '孙丽', description: '负责企业发展规划' },
                { id: 8, name: '生产技术部', code: 'SCJS', manager: '周刚', description: '负责生产技术管理、设备管理等' },
                { id: 9, name: '安全环保监察部', code: 'AQHB', manager: '吴勇', description: '负责安全生产、环保监察等' },
                { id: 10, name: '运行部', code: 'YXB', manager: '郑华', description: '负责机组运行管理' },
                { id: 11, name: '维护部', code: 'WHB', manager: '黄磊', description: '负责设备维护检修' },
            ],

            // 员工档案
            employees: [
                { id: 'NN001', name: '李明', gender: '男', birth_date: '1975-03-15', department: '综合管理部', position: '部门经理', title: '高级工程师', education: '本科', major: '电力系统自动化', join_date: '2005-07-01', phone: '13800000001', certifications: ['注册安全工程师'] },
                { id: 'NN002', name: '王芳', gender: '女', birth_date: '1980-08-22', department: '组织部', position: '部门经理', title: '高级工程师', education: '硕士', major: '人力资源管理', join_date: '2008-03-01', phone: '13800000002', certifications: ['人力资源管理师'] },
                { id: 'NN006', name: '周刚', gender: '男', birth_date: '1976-09-10', department: '生产技术部', position: '部门经理', title: '高级工程师', education: '本科', major: '热能动力工程', join_date: '2002-07-01', phone: '13800000006', certifications: ['注册安全工程师', '一级建造师'] },
                { id: 'NN007', name: '吴勇', gender: '男', birth_date: '1979-04-28', department: '安全环保监察部', position: '部门经理', title: '高级工程师', education: '本科', major: '安全工程', join_date: '2004-07-01', phone: '13800000007', certifications: ['注册安全工程师'] },
                { id: 'NN008', name: '郑华', gender: '男', birth_date: '1981-12-03', department: '运行部', position: '部门经理', title: '高级工程师', education: '本科', major: '电力系统自动化', join_date: '2006-07-01', phone: '13800000008', certifications: ['注册电气工程师'] },
                { id: 'NN009', name: '黄磊', gender: '男', birth_date: '1983-07-15', department: '维护部', position: '部门经理', title: '高级工程师', education: '本科', major: '机械设计制造', join_date: '2008-07-01', phone: '13800000009', certifications: ['一级建造师'] },
                { id: 'NN011', name: '张三', gender: '男', birth_date: '1990-05-12', department: '运行部', position: '值班员', title: '工程师', education: '本科', major: '电气工程', join_date: '2013-07-01', phone: '13800000011', certifications: [] },
                { id: 'NN012', name: '李四', gender: '男', birth_date: '1992-08-30', department: '维护部', position: '检修工', title: '助理工程师', education: '大专', major: '电力设备', join_date: '2015-07-01', phone: '13800000012', certifications: [] },
                { id: 'NN013', name: '王五', gender: '男', birth_date: '1988-11-18', department: '安全环保监察部', position: '安全员', title: '工程师', education: '本科', major: '安全工程', join_date: '2012-07-01', phone: '13800000013', certifications: ['注册安全工程师'] },
                { id: 'NN015', name: '赵七', gender: '男', birth_date: '1991-09-25', department: '生产技术部', position: '技术员', title: '工程师', education: '硕士', major: '热能工程', join_date: '2016-07-01', phone: '13800000015', certifications: [] },
            ],

            // 考核条款库
            penalty_rules: [
                { rule_code: 'AQ-001', category: '安全违章', violation_type: '未佩戴安全帽', description: '进入生产现场未按规定佩戴安全帽', penalty_level: '一般违章', penalty_score: 2, penalty_amount: 200, source_document: '《安全生产管理规定》第12条' },
                { rule_code: 'AQ-002', category: '安全违章', violation_type: '未佩戴安全带', description: '高处作业未按规定系安全带', penalty_level: '严重违章', penalty_score: 5, penalty_amount: 500, source_document: '《安全生产管理规定》第15条' },
                { rule_code: 'AQ-003', category: '安全违章', violation_type: '违规操作设备', description: '未经许可擅自操作设备', penalty_level: '严重违章', penalty_score: 8, penalty_amount: 1000, source_document: '《安全生产管理规定》第20条' },
                { rule_code: 'AQ-004', category: '安全违章', violation_type: '未执行工作票', description: '检修作业未办理工作票', penalty_level: '严重违章', penalty_score: 10, penalty_amount: 2000, source_document: '《两票管理办法》第8条' },
                { rule_code: 'AQ-005', category: '安全违章', violation_type: '未执行操作票', description: '操作未按操作票执行', penalty_level: '严重违章', penalty_score: 8, penalty_amount: 1500, source_document: '《两票管理办法》第12条' },
                { rule_code: 'AQ-006', category: '安全违章', violation_type: '未进行安全交底', description: '班组作业前未进行安全技术交底', penalty_level: '一般违章', penalty_score: 3, penalty_amount: 300, source_document: '《安全生产管理规定》第25条' },
                { rule_code: 'AQ-007', category: '安全违章', violation_type: '进入受限空间未检测', description: '进入受限空间前未进行气体检测', penalty_level: '严重违章', penalty_score: 10, penalty_amount: 2000, source_document: '《受限空间作业安全管理规定》第6条' },
                { rule_code: 'AQ-009', category: '安全违章', violation_type: '未按规定着装', description: '工作时间未穿工作服或穿着不规范', penalty_level: '轻微违章', penalty_score: 1, penalty_amount: 100, source_document: '《劳动纪律管理办法》第5条' },
                { rule_code: 'SC-001', category: '生产违规', violation_type: '未按操作规程操作', description: '运行操作未按操作规程执行', penalty_level: '一般违章', penalty_score: 3, penalty_amount: 500, source_document: '《运行管理规程》第15条' },
                { rule_code: 'SC-003', category: '生产违规', violation_type: '未及时处理缺陷', description: '发现设备缺陷48小时内未上报或处理', penalty_level: '一般违章', penalty_score: 2, penalty_amount: 300, source_document: '《缺陷管理办法》第8条' },
                { rule_code: 'SC-004', category: '生产违规', violation_type: '巡检不到位', description: '巡检漏检或记录不真实', penalty_level: '一般违章', penalty_score: 2, penalty_amount: 200, source_document: '《巡回检查管理办法》第12条' },
                { rule_code: 'SC-005', category: '生产违规', violation_type: '值班脱岗', description: '当班期间擅离工作岗位', penalty_level: '严重违章', penalty_score: 5, penalty_amount: 1000, source_document: '《运行管理规程》第8条' },
            ],

            // 违章记录
            violations: [
                { id: 1, violation_type: '未佩戴安全帽', description: '运行部张三在#1机组巡检时未佩戴安全帽，被安全监察部检查发现', department: '运行部', person_name: '张三', violation_date: '2025-12-15', penalty_clause: '《安全生产管理规定》第12条', penalty_score: 2, penalty_amount: 200, status: 'confirmed', created_by: '吴勇' },
                { id: 2, violation_type: '未执行工作票', description: '维护部李四在#2锅炉检修时未办理工作票即开始作业', department: '维护部', person_name: '李四', violation_date: '2025-12-20', penalty_clause: '《两票管理办法》第8条', penalty_score: 10, penalty_amount: 2000, status: 'confirmed', created_by: '吴勇' },
                { id: 3, violation_type: '巡检不到位', description: '运行部张三12月22日夜班巡检记录与实际不符', department: '运行部', person_name: '张三', violation_date: '2025-12-22', penalty_clause: '《巡回检查管理办法》第12条', penalty_score: 2, penalty_amount: 200, status: 'confirmed', created_by: '周刚' },
                { id: 4, violation_type: '未按规定着装', description: '维护部李四岗位作业未穿工作服', department: '维护部', person_name: '李四', violation_date: '2026-01-05', penalty_clause: '《劳动纪律管理办法》第5条', penalty_score: 1, penalty_amount: 100, status: 'confirmed', created_by: '吴勇' },
                { id: 5, violation_type: '未进行安全交底', description: '生产技术部赵七带队检修前未进行安全技术交底', department: '生产技术部', person_name: '赵七', violation_date: '2026-01-10', penalty_clause: '《安全生产管理规定》第25条', penalty_score: 3, penalty_amount: 300, status: 'pending', created_by: '吴勇' },
                { id: 6, violation_type: '未及时处理缺陷', description: '运行部值班员发现#1机给水泵异常振动未及时上报', department: '运行部', person_name: '张三', violation_date: '2026-01-15', penalty_clause: '《缺陷管理办法》第8条', penalty_score: 2, penalty_amount: 300, status: 'pending', created_by: '周刚' },
            ],

            // 绩效数据
            performance: [
                { department: '综合管理部', employee_name: '李明', employee_id: 'NN001', period: '2025-12', score: 92.5, level: 'A', details: { '工作完成': 45, '工作质量': 28, '协作配合': 19.5 } },
                { department: '运行部', employee_name: '郑华', employee_id: 'NN008', period: '2025-12', score: 88.0, level: 'B+', details: { '工作完成': 42, '工作质量': 26, '协作配合': 20 } },
                { department: '维护部', employee_name: '黄磊', employee_id: 'NN009', period: '2025-12', score: 85.5, level: 'B', details: { '工作完成': 40, '工作质量': 27, '协作配合': 18.5 } },
                { department: '运行部', employee_name: '张三', employee_id: 'NN011', period: '2025-12', score: 72.0, level: 'C', details: { '工作完成': 35, '工作质量': 22, '协作配合': 15 } },
                { department: '维护部', employee_name: '李四', employee_id: 'NN012', period: '2025-12', score: 68.5, level: 'C', details: { '工作完成': 32, '工作质量': 20, '协作配合': 16.5 } },
                { department: '安全环保监察部', employee_name: '吴勇', employee_id: 'NN007', period: '2025-12', score: 95.0, level: 'A+', details: { '工作完成': 48, '工作质量': 28, '协作配合': 19 } },
                { department: '生产技术部', employee_name: '周刚', employee_id: 'NN006', period: '2025-12', score: 90.0, level: 'A', details: { '工作完成': 44, '工作质量': 27, '协作配合': 19 } },
                { department: '运行部', employee_name: '张三', employee_id: 'NN011', period: '2026-01', score: 75.0, level: 'C+', details: { '工作完成': 37, '工作质量': 22, '协作配合': 16 } },
                { department: '维护部', employee_name: '李四', employee_id: 'NN012', period: '2026-01', score: 70.0, level: 'C', details: { '工作完成': 33, '工作质量': 21, '协作配合': 16 } },
            ],

            // 任务记录
            tasks: [
                { id: 1, source_document: '国能安〔2026〕1号 关于加强冬季安全生产工作的通知', task_title: '完善冬季防寒防冻应急预案', task_description: '根据通知要求修订完善本公司冬季防寒防冻应急预案', responsible_dept: '安全环保监察部', responsible_person: '吴勇', deadline: '2026-02-01', priority: 'urgent', status: 'completed' },
                { id: 2, source_document: '国能安〔2026〕1号 关于加强冬季安全生产工作的通知', task_title: '开展设备防冻检查', task_description: '组织对锅炉、汽机、电气等设备的防冻设施进行全面检查', responsible_dept: '生产技术部', responsible_person: '周刚', deadline: '2026-01-25', priority: 'urgent', status: 'completed' },
                { id: 3, source_document: '国能安〔2026〕1号 关于加强冬季安全生产工作的通知', task_title: '冬季安全培训', task_description: '组织全员冬季安全生产专项培训', responsible_dept: '安全环保监察部', responsible_person: '吴勇', deadline: '2026-02-10', priority: 'important', status: 'in_progress' },
                { id: 4, source_document: '广西公司〔2026〕15号 关于开展安全生产大检查的通知', task_title: '制定公司安全大检查方案', task_description: '根据广西公司通知要求制定本公司安全大检查实施方案', responsible_dept: '安全环保监察部', responsible_person: '吴勇', deadline: '2026-02-15', priority: 'important', status: 'in_progress' },
                { id: 5, source_document: '广西公司〔2026〕15号 关于开展安全生产大检查的通知', task_title: '运行部自查整改', task_description: '运行部按照检查清单开展自查并完成整改', responsible_dept: '运行部', responsible_person: '郑华', deadline: '2026-02-28', priority: 'important', status: 'pending' },
                { id: 6, source_document: '广西公司〔2026〕15号 关于开展安全生产大检查的通知', task_title: '维护部自查整改', task_description: '维护部按照检查清单开展自查并完成整改', responsible_dept: '维护部', responsible_person: '黄磊', deadline: '2026-02-28', priority: 'important', status: 'pending' },
                { id: 7, source_document: '国能南宁〔2026〕8号 关于2026年度设备检修计划', task_title: '编制#1机春季D级检修方案', task_description: '编制#1机组2026年春季D级检修详细方案', responsible_dept: '生产技术部', responsible_person: '周刚', deadline: '2026-03-01', priority: 'normal', status: 'pending' },
            ],

            // 合规审核记录
            compliance: [
                { id: 1, audit_type: '培训材料审核', document_name: '外包单位A三级安全教育培训记录', audit_result: 'pass', issues: [], suggestions: '材料齐全，符合要求' },
                { id: 2, audit_type: '培训材料审核', document_name: '外包单位B三级安全教育培训记录', audit_result: 'fail', issues: [{ issue: '培训时间晚于上岗时间', detail: '三级教育培训完成时间为2026-01-15，但人员上岗时间为2026-01-10', severity: '严重' }], suggestions: '建议暂停该人员作业资格，补充完成三级安全教育培训后方可上岗' },
                { id: 3, audit_type: '制度合规检查', document_name: '《南宁公司安全生产管理规定（试行）》', audit_result: 'warning', issues: [{ issue: '试行期即将到期', detail: '该制度试行期至2026-03-01，已不足45天', severity: '提醒' }], suggestions: '建议尽快组织制度修订工作' },
                { id: 4, audit_type: '保险审核', document_name: '外包单位C工伤保险审核', audit_result: 'fail', issues: [{ issue: '保险覆盖不全', detail: '保险单被保险人数为15人，但实际在场作业人数为18人，有3人未购买工伤保险', severity: '严重' }], suggestions: '要求外包单位立即为未投保人员购买工伤保险' },
            ],

            // 知识库
            knowledge: [
                { agent_id: 1, title: '安全帽佩戴要求', content: '根据《安全生产管理规定》第12条：所有人员进入生产现场必须正确佩戴安全帽。违反者按一般违章处理，扣2分，罚款200元。', category: '安全制度' },
                { agent_id: 1, title: '工作票管理要求', content: '根据《两票管理办法》第8条：凡在电气设备或线路上进行检修、维护等作业，必须办理工作票。未办理工作票即开始作业的，按严重违章处理，扣10分，罚款2000元。', category: '安全制度' },
                { agent_id: 3, title: '任务分解规则-安全类', content: '安全类通知由安全环保监察部牵头，各部门配合。涉及设备的由生产技术部负责，涉及人员培训的由安全环保监察部负责。紧急隐患3天内完成，一般隐患10天内完成。', category: '任务规则' },
                { agent_id: 4, title: '外包单位三级教育标准', content: '外包单位人员进入电厂前必须完成三级安全教育培训。总课时不少于72学时，其中公司级不少于24学时。培训完成时间必须早于上岗时间。', category: '合规标准' },
                { agent_id: 5, title: '月度安全报告模板要求', content: '月度安全报告应包含：本月安全生产总体情况、安全隐患排查治理、违章统计分析、两票执行情况、安全培训情况、下月工作计划等六个部分。', category: '报告模板' },
            ],
        };
    }

    // ========== 智能体 ==========
    getAgents() { return this.data.agents; }
    getAgent(code) { return this.data.agents.find(a => a.code === code); }

    // ========== 会话 ==========
    getSessions(agentCode) {
        const agent = this.getAgent(agentCode);
        if (!agent) return [];
        return this.data.sessions
            .filter(s => s.agent_id === agent.id)
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }

    createSession(agentId, title) {
        const session = {
            id: this.data.nextSessionId++,
            agent_id: agentId,
            title: title || '新会话',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        this.data.sessions.push(session);
        this.save();
        return session;
    }

    updateSessionTitle(sessionId, title) {
        const s = this.data.sessions.find(s => s.id === sessionId);
        if (s) { s.title = title; s.updated_at = new Date().toISOString(); this.save(); }
    }

    // ========== 消息 ==========
    getMessages(sessionId) {
        return this.data.messages
            .filter(m => m.session_id === sessionId)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    addMessage(sessionId, role, content) {
        const msg = {
            id: this.data.nextMessageId++,
            session_id: sessionId,
            role,
            content,
            created_at: new Date().toISOString(),
        };
        this.data.messages.push(msg);
        // 更新会话时间
        const s = this.data.sessions.find(s => s.id === sessionId);
        if (s) s.updated_at = new Date().toISOString();
        this.save();
        return msg;
    }

    // ========== 配置 ==========
    getConfigs() {
        return Object.entries(this.data.system_config).map(([k, v]) => ({ config_key: k, config_value: v }));
    }

    updateConfig(key, value) {
        this.data.system_config[key] = value;
        this.save();
    }

    getConfigValue(key) {
        return this.data.system_config[key] || '';
    }

    // ========== 文件 ==========
    addFile(agentId, sessionId, filename, filePath, fileType, fileSize, parsedContent) {
        const file = {
            id: this.data.nextFileId++,
            agent_id: agentId,
            session_id: sessionId,
            filename, file_path: filePath, file_type: fileType,
            file_size: fileSize, parsed_content: parsedContent,
            created_at: new Date().toISOString(),
        };
        this.data.files.push(file);
        this.save();
        return file;
    }

    // ========== 统计 ==========
    getDashboard() {
        const today = new Date().toISOString().split('T')[0];
        return {
            agentCount: this.data.agents.filter(a => a.is_active).length,
            todaySessions: this.data.sessions.filter(s => s.created_at && s.created_at.startsWith(today)).length,
            todayMessages: this.data.messages.filter(m => m.created_at && m.created_at.startsWith(today)).length,
            totalFiles: this.data.files.length,
        };
    }

    // ========== 业务数据查询 ==========
    getViolations() { return this.data.violations; }
    getPerformance() { return this.data.performance; }
    getEmployees() { return this.data.employees; }
    getTasks() { return this.data.tasks; }
    getCompliance() { return this.data.compliance; }
    getPenaltyRules() { return this.data.penalty_rules; }
    getKnowledge(agentId) { return this.data.knowledge.filter(k => !agentId || k.agent_id === agentId); }
}

module.exports = new DataStore();
