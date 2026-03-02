// 权限处理与认证逻辑
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authForm = document.getElementById('auth-form');
const submitBtn = document.getElementById('submit-btn');
const toggleLink = document.getElementById('toggle-link');
const toggleText = document.getElementById('toggle-text');
const errorMsg = document.getElementById('error-msg');

let isLogin = true;

// 切换登录/注册模式
toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;

    if (isLogin) {
        authTitle.textContent = '欢迎登录';
        authSubtitle.textContent = '请使用您的邮箱和密码进行登录';
        submitBtn.textContent = '立即登录';
        toggleText.textContent = '还没有账号？';
        toggleLink.textContent = '立即注册';
    } else {
        authTitle.textContent = '注册账号';
        authSubtitle.textContent = '创建一个新账号以开始使用平台';
        submitBtn.textContent = '注册并登录';
        toggleText.textContent = '已有账号？';
        toggleLink.textContent = '返回登录';
    }
    errorMsg.style.display = 'none';
});

// 处理表单提交
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    errorMsg.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = isLogin ? '登录中...' : '注册中...';

    try {
        let result;
        if (isLogin) {
            result = await window.supabase.auth.signInWithPassword({ email, password });
        } else {
            result = await window.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: email.split('@')[0]
                    }
                }
            });
            // 自动确认逻辑由本地 Supabase 配置决定，通常 MVP 下会直接登录或需要点击邮件
            if (result.data?.user && !result.error && !result.data.session) {
                alert('注册成功！请查收邮件确认（或联系管理员）。');
            }
        }

        if (result.error) throw result.error;

        if (result.data.session) {
            // 登录成功
            window.location.href = '/';
        }
    } catch (err) {
        errorMsg.textContent = `操作失败: ${err.message}`;
        errorMsg.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isLogin ? '立即登录' : '注册并登录';
    }
});

// 检查是否已登录 (如果已经在登录页且已登录，也跳回首页)
async function checkAuth() {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
        window.location.href = '/';
    }
}

if (window.location.pathname.includes('login.html')) {
    checkAuth();
}
