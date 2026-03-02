window.SUPABASE_URL = 'http://127.0.0.1:54321';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwODc4MjM3MTl9.cQdyxRj257TXRjVm8Vjz57fvF3Zerb-cUN8DdqirDAB_tqIus5ZvJNlji14Ib5RxpDxxV5rov_y0DDb9A1XZPw';

// 初始化 Supabase 客户端
const supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
window.supabase = supabaseClient;
