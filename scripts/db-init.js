const { pool } = require('../config/database');

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔧 开始初始化数据库...');

    // 创建Schema
    await client.query(`CREATE SCHEMA IF NOT EXISTS ai_agents;`);

    // 系统配置表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.system_config (
        id SERIAL PRIMARY KEY,
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 智能体定义表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        category VARCHAR(50),
        system_prompt TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 对话会话表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.chat_sessions (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES ai_agents.agents(id),
        title VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 对话消息表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.chat_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES ai_agents.chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 上传文件表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.uploaded_files (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES ai_agents.agents(id),
        session_id INTEGER REFERENCES ai_agents.chat_sessions(id),
        filename VARCHAR(500) NOT NULL,
        file_path VARCHAR(1000),
        file_type VARCHAR(50),
        file_size INTEGER,
        parsed_content TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 知识库表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.knowledge_base (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES ai_agents.agents(id),
        title VARCHAR(500),
        content TEXT,
        category VARCHAR(100),
        source VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 违章考核记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.violation_records (
        id SERIAL PRIMARY KEY,
        violation_type VARCHAR(100),
        description TEXT,
        department VARCHAR(100),
        person_name VARCHAR(50),
        violation_date DATE,
        penalty_clause TEXT,
        penalty_score DECIMAL(10,2),
        penalty_amount DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending',
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 绩效考核记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.performance_records (
        id SERIAL PRIMARY KEY,
        department VARCHAR(100),
        employee_name VARCHAR(50),
        employee_id VARCHAR(50),
        period VARCHAR(20),
        score DECIMAL(5,2),
        level VARCHAR(20),
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 员工档案表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.employee_records (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(50) UNIQUE,
        name VARCHAR(50),
        gender VARCHAR(10),
        birth_date DATE,
        department VARCHAR(100),
        position VARCHAR(100),
        title VARCHAR(100),
        education VARCHAR(50),
        major VARCHAR(100),
        join_date DATE,
        phone VARCHAR(20),
        email VARCHAR(100),
        certifications JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 任务分解记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.task_records (
        id SERIAL PRIMARY KEY,
        source_document VARCHAR(500),
        task_title VARCHAR(500),
        task_description TEXT,
        responsible_dept VARCHAR(100),
        responsible_person VARCHAR(50),
        deadline DATE,
        priority VARCHAR(20) DEFAULT 'normal',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 合规审核记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.compliance_records (
        id SERIAL PRIMARY KEY,
        audit_type VARCHAR(100),
        document_name VARCHAR(500),
        audit_result VARCHAR(20),
        issues JSONB DEFAULT '[]',
        suggestions TEXT,
        audited_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 生产经营报告表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.production_reports (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(100),
        report_period VARCHAR(50),
        title VARCHAR(500),
        content TEXT,
        template_used VARCHAR(100),
        data_sources JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 组织架构表
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) UNIQUE,
        parent_id INTEGER REFERENCES ai_agents.departments(id),
        manager VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 考核条款库
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents.penalty_rules (
        id SERIAL PRIMARY KEY,
        rule_code VARCHAR(50),
        category VARCHAR(100),
        violation_type VARCHAR(200),
        description TEXT,
        penalty_level VARCHAR(50),
        penalty_score DECIMAL(10,2),
        penalty_amount DECIMAL(10,2),
        source_document VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ 数据库表创建完成');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initDatabase()
    .then(async () => {
      console.log('🎉 数据库初始化成功');
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('数据库初始化失败:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { initDatabase };
