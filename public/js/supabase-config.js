// 根据当前访问环境动态决定 Supabase 地址
// - 本地开发 (localhost / 127.0.0.1): 连本地 Supabase Docker
// - 云服务器 (www.trendbot.cn 等): 通过 Nginx 代理的 /supabase/ 路径访问云端 Supabase
(function () {
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    window.SUPABASE_URL = isLocal
        ? 'http://127.0.0.1:54321'
        : (window.location.origin + '/supabase');

    window.SUPABASE_ANON_KEY = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwODc4MjM3MTl9.cQdyxRj257TXRjVm8Vjz57fvF3Zerb-cUN8DdqirDAB_tqIus5ZvJNlji14Ib5RxpDxxV5rov_y0DDb9A1XZPw';

    // 初始化 Supabase 客户端
    const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    window.supabase = supabaseClient;

    console.log('[Supabase] URL:', window.SUPABASE_URL, '| 环境:', isLocal ? '本地开发' : '云服务器');
})();
