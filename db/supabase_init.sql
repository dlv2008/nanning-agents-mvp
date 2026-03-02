-- 1. 创建基础信息表
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    manager TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, -- 工号
    name TEXT NOT NULL,
    gender TEXT,
    birth_date DATE,
    department TEXT, -- 关联部门名或ID
    position TEXT,
    title TEXT,
    education TEXT,
    major TEXT,
    join_date DATE,
    phone TEXT,
    certifications TEXT[], -- 数组类型
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 智能体核心表
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    category TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    system_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 对话会话表 (与 Auth 用户关联)
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- 关联 Supabase Auth
    agent_id INTEGER REFERENCES agents(id),
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 业务数据表
CREATE TABLE IF NOT EXISTS penalty_rules (
    id SERIAL PRIMARY KEY,
    rule_code TEXT UNIQUE,
    category TEXT,
    violation_type TEXT,
    description TEXT,
    penalty_level TEXT,
    penalty_score INTEGER,
    penalty_amount INTEGER,
    source_document TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS violations (
    id SERIAL PRIMARY KEY,
    violation_type TEXT,
    description TEXT,
    department TEXT,
    person_name TEXT,
    violation_date DATE,
    penalty_clause TEXT,
    penalty_score INTEGER,
    penalty_amount INTEGER,
    status TEXT DEFAULT 'pending', -- confirmed, pending
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance (
    id SERIAL PRIMARY KEY,
    department TEXT,
    employee_name TEXT,
    employee_id TEXT REFERENCES employees(id),
    period TEXT, -- 如 "2025-12"
    score NUMERIC(5,2),
    level TEXT,
    details JSONB, -- 存储各项得分详情
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    source_document TEXT,
    task_title TEXT,
    task_description TEXT,
    responsible_dept TEXT,
    responsible_person TEXT,
    deadline DATE,
    priority TEXT,
    status TEXT, -- completed, in_progress, pending
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 存储每个用户的额外信息 (可选)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    username TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 创建索引提高查询效率
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_employee_id ON performance(employee_id);
