/**
 * UI & Theme Management
 */

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleUI(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggleUI(newTheme);
}

function updateThemeToggleUI(theme) {
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    const btn = document.getElementById('theme-toggle-btn');
    if (sunIcon && moonIcon) {
        sunIcon.style.display = theme === 'dark' ? 'block' : 'none';
        moonIcon.style.display = theme === 'dark' ? 'none' : 'block';
    }
    if (btn) {
        btn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    }
}

// Mobile menu toggle
function toggleMobileMenu() {
    const nav = document.getElementById('header-nav');
    if (nav) {
        nav.classList.toggle('open');
    }
}

// Close mobile menu when clicking outside
document.addEventListener('click', function (e) {
    const nav = document.getElementById('header-nav');
    const btn = document.getElementById('mobile-menu-btn');
    if (nav && btn && !nav.contains(e.target) && !btn.contains(e.target)) {
        nav.classList.remove('open');
    }
});

// Initialize theme as soon as possible
initTheme();
