const request = require('supertest');

// 方案2：实施 Mock 模拟，拦截真实网络请求
// 这样 GitHub CI 就不需要穿透防火墙去连云服务器了
jest.mock('../services/supabase-client', () => {
    let lastCode = '';
    const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation((key, value) => {
            if (key === 'code') lastCode = value;
            return mockSupabase;
        }),
        order: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        single: jest.fn().mockImplementation(() => {
            // 针对获取单个智能体的模拟返回
            if (lastCode === 'unknown') {
                return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
            }
            return Promise.resolve({ data: { code: lastCode, name: '测试智能体' }, error: null });
        }),
        // 针对列表查询的模拟返回
        then: jest.fn().mockImplementation((callback) => {
            // 模拟 dashboard 和 agents 列表的不同返回结构
            const mockData = {
                data: [{ id: 1, code: 'test-agent', is_active: true }],
                count: 5,
                error: null
            };
            return Promise.resolve(callback(mockData));
        })
    };
    return mockSupabase;
});

const app = require('../server');

describe('API 路由健康测试', () => {
    it('GET /api/dashboard 应当返回仪表盘数据', async () => {
        const res = await request(app).get('/api/dashboard');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('agentCount');
        expect(res.body.data).toHaveProperty('todaySessions');
    });

    it('GET /api/agents 应当返回所有被激活的智能体列表', async () => {
        const res = await request(app).get('/api/agents');
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/agents/unknown 应当返回404找不到智能体信息', async () => {
        const res = await request(app).get('/api/agents/unknown');
        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });
});
