document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    const moonIcon = document.getElementById('moon-icon');
    const sunIcon = document.getElementById('sun-icon');
    const logoImg = document.getElementById('logo-img');
    const apiKeyInput = document.getElementById('apiKey');
    const inputWrapper = document.getElementById('input-wrapper');
    const clearBtn = document.getElementById('clear-btn');
    const saveBtn = document.getElementById('saveBtn');
    const statusEl = document.getElementById('status');

    // ─── Theme ────────────────────────────────────
    // Default = light. Load persisted preference.
    const savedTheme = localStorage.getItem('aiub-theme') || 'light';
    applyTheme(savedTheme);

    themeToggle.addEventListener('click', () => {
        const isDark = body.classList.contains('dark');
        const next = isDark ? 'light' : 'dark';
        localStorage.setItem('aiub-theme', next);
        applyTheme(next);
    });

    function applyTheme(theme) {
        if (theme === 'dark') {
            body.classList.add('dark');
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
            if (logoImg) logoImg.src = 'icons/white.png';
        } else {
            body.classList.remove('dark');
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
            if (logoImg) logoImg.src = 'icons/black.png';
        }
    }

    // ─── Input ────────────────────────────────────
    apiKeyInput.addEventListener('focus',  () => inputWrapper.classList.add('focused'));
    apiKeyInput.addEventListener('blur',   () => inputWrapper.classList.remove('focused'));
    apiKeyInput.addEventListener('input',  updateClearBtn);

    clearBtn.addEventListener('click', () => {
        apiKeyInput.value = '';
        clearBtn.style.display = 'none';
        apiKeyInput.focus();
    });

    function updateClearBtn() {
        clearBtn.style.display = apiKeyInput.value ? 'flex' : 'none';
    }

    // ─── Storage ──────────────────────────────────
    chrome.storage.local.get(['ocrApiKey'], (result) => {
        if (result.ocrApiKey) {
            apiKeyInput.value = result.ocrApiKey;
            updateClearBtn();
        }
    });

    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            showStatus('Please enter an API key.', 'err');
            return;
        }
        chrome.storage.local.set({ ocrApiKey: key }, () => {
            showStatus('Saved!', 'ok');
            setTimeout(() => window.close(), 900);
        });
    });

    function showStatus(msg, type) {
        statusEl.textContent = msg;
        statusEl.className = 'status-msg ' + type;
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'status-msg';
        }, 2500);
    }
});
