const fs = require('fs');
const path = require('path');
const supabase = require('../services/supabase-client');

async function migrate() {
    console.log('🚀 开始从 JSON 迁移数据到 Supabase...');

    const storePath = path.join(__dirname, '../data/store.json');
    if (!fs.existsSync(storePath)) {
        console.error('❌ 未找到 data/store.json 文件');
        return;
    }

    const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));

    // 1. 迁移部门 (Departments)
    if (data.departments && data.departments.length > 0) {
        console.log(`📦 正在迁移部门 (${data.departments.length}条)...`);
        const { error } = await supabase.from('departments').upsert(
            data.departments.map(d => ({
                id: d.id,
                name: d.name,
                code: d.code,
                manager: d.manager,
                description: d.description
            }))
        );
        if (error) console.error('❌ 部门迁移失败:', error.message);
    }

    // 2. 迁移员工 (Employees)
    if (data.employees && data.employees.length > 0) {
        console.log(`📦 正在迁移员工 (${data.employees.length}条)...`);
        const { error } = await supabase.from('employees').upsert(
            data.employees.map(e => ({
                id: e.id,
                name: e.name,
                gender: e.gender,
                birth_date: e.birth_date,
                department: e.department,
                position: e.position,
                title: e.title,
                education: e.education,
                major: e.major,
                join_date: e.join_date,
                phone: e.phone,
                certifications: e.certifications
            }))
        );
        if (error) console.error('❌ 员工迁移失败:', error.message);
    }

    // 3. 迁移智能体 (Agents)
    if (data.agents && data.agents.length > 0) {
        console.log(`📦 正在迁移智能体 (${data.agents.length}条)...`);
        const { error } = await supabase.from('agents').upsert(
            data.agents.map(a => ({
                id: a.id,
                name: a.name,
                code: a.code,
                description: a.description,
                icon: a.icon,
                category: a.category,
                is_active: a.is_active,
                system_prompt: a.system_prompt
            }))
        );
        if (error) console.error('❌ 智能体迁移失败:', error.message);
    }

    // 4. 迁移考核条款 (Penalty Rules)
    if (data.penalty_rules && data.penalty_rules.length > 0) {
        console.log(`📦 正在迁移考核条款 (${data.penalty_rules.length}条)...`);
        const { error } = await supabase.from('penalty_rules').upsert(
            data.penalty_rules.map(r => ({
                rule_code: r.rule_code,
                category: r.category,
                violation_type: r.violation_type,
                description: r.description,
                penalty_level: r.penalty_level,
                penalty_score: r.penalty_score,
                penalty_amount: r.penalty_amount,
                source_document: r.source_document
            }))
        );
        if (error) console.error('❌ 考核条款迁移失败:', error.message);
    }

    // 5. 迁移违章记录 (Violations)
    if (data.violations && data.violations.length > 0) {
        console.log(`📦 正在迁移违章记录 (${data.violations.length}条)...`);
        const { error } = await supabase.from('violations').upsert(
            data.violations.map(v => ({
                id: v.id,
                violation_type: v.violation_type,
                description: v.description,
                department: v.department,
                person_name: v.person_name,
                violation_date: v.violation_date,
                penalty_clause: v.penalty_clause,
                penalty_score: v.penalty_score,
                penalty_amount: v.penalty_amount,
                status: v.status,
                created_by: v.created_by
            }))
        );
        if (error) console.error('❌ 违章记录迁移失败:', error.message);
    }

    // 6. 迁移绩效数据 (Performance)
    if (data.performance && data.performance.length > 0) {
        console.log(`📦 正在迁移绩效数据 (${data.performance.length}条)...`);
        const { error } = await supabase.from('performance').upsert(
            data.performance.map(p => ({
                department: p.department,
                employee_name: p.employee_name,
                employee_id: p.employee_id,
                period: p.period,
                score: p.score,
                level: p.level,
                details: p.details
            }))
        );
        if (error) console.error('❌ 绩效数据迁移失败:', error.message);
    }

    // 7. 迁移任务数据 (Tasks)
    if (data.tasks && data.tasks.length > 0) {
        console.log(`📦 正在迁移任务数据 (${data.tasks.length}条)...`);
        const { error } = await supabase.from('tasks').upsert(
            data.tasks.map(t => ({
                id: t.id,
                source_document: t.source_document,
                task_title: t.task_title,
                task_description: t.task_description,
                responsible_dept: t.responsible_dept,
                responsible_person: t.responsible_person,
                deadline: t.deadline,
                priority: t.priority,
                status: t.status
            }))
        );
        if (error) console.error('❌ 任务数据迁移失败:', error.message);
    }

    console.log('✅ 数据迁移完成！');
    process.exit(0);
}

migrate().catch(error => {
    console.error('❌ 迁移过程中发生严重错误:', error);
    process.exit(1);
});

