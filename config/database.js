const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '54322'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
});

pool.on('error', (err) => {
    console.error('数据库连接池错误:', err);
});

module.exports = { pool };
