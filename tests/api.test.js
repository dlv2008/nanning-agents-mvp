const request = require('supertest');
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
