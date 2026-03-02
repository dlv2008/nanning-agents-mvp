const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration. Please check your .env file.');
    process.exit(1);
}

// 使用 Service Role Key 初始化，以便在后端拥有管理权限（绕过 RLS）
const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;
