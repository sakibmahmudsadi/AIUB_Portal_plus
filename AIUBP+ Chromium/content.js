let hasAutoLogged = false;
let lastKeydownTime = 0;
let isSolving = false;

document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') {
        lastKeydownTime = Date.now();
    }
}, true);

function checkAutoLogin() {
    if (hasAutoLogged) return;

    // Prevent infinite loop if the user saved a wrong password
    if (document.body && document.body.textContent.toLowerCase().includes('invalid username or password')) {
        return; 
    }

    const usernameInput = document.querySelector('input[name*="user" i]') || document.querySelector('input[type="text"]');
    const passwordInput = document.querySelector('input[type="password"]');
    const captchaInput = document.getElementById('CaptchaInputText');
    const submitButton = document.querySelector('button[type="submit"]');

    if (!usernameInput || !passwordInput || !captchaInput || !submitButton) return;

    const usernameVal = usernameInput.value.trim();
    const passwordVal = passwordInput.value;
    const captchaVal = captchaInput.value.trim();

    const isUsernameAutofilled = usernameInput.matches(':-webkit-autofill');
    const isPasswordAutofilled = passwordInput.matches(':-webkit-autofill');

    const isUsernameValid = /^(\d{2}-\d{5}-\d|\d{4}-\d{3}-\d)$/.test(usernameVal) || isUsernameAutofilled;
    const isPasswordValid = passwordVal.length > 4 || isPasswordAutofilled;
    const isCaptchaFilled = captchaVal.length > 0;

    const isPasswordHovered = passwordInput.matches(':hover');
    
    if (passwordVal === '' && !isPasswordAutofilled && isPasswordHovered) {
        return; // Don't auto-login if password box is empty and hovered
    }

    if (isUsernameValid && isPasswordValid && isCaptchaFilled) {
        // Check if user is actively manually typing
        const isFocused = document.activeElement === passwordInput || document.activeElement === usernameInput;
        const timeSinceLastKey = Date.now() - lastKeydownTime;
        const isActivelyTyping = isFocused && (timeSinceLastKey < 1500); 
        
        if (isActivelyTyping) {
            return; // Give them 1.5s after their last keypress before auto-logging in
        }

        hasAutoLogged = true;
        if (fallbackIntervalId) clearInterval(fallbackIntervalId);

        setTimeout(() => {
            submitButton.click();
        }, 300);
    }
}

let fallbackIntervalId = null;

function setupInputListeners() {
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', checkAutoLogin);
        input.addEventListener('change', checkAutoLogin);
        input.addEventListener('blur', checkAutoLogin);
    });
    
    // Fallback for autofill that doesn't trigger events
    fallbackIntervalId = setInterval(() => {
        if (typeof checkCaptcha === 'function') checkCaptcha();
        checkAutoLogin();
    }, 1000);
}

function processImage(imgElement) {
    const width = imgElement.naturalWidth || 200;
    const height = imgElement.naturalHeight || 55;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(imgElement, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    const intensity = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] * 299 + data[i+1] * 587 + data[i+2] * 114) / 1000;
        intensity[i/4] = 255 - brightness; 
    }
    
    const blurred = new Float32Array(width * height);
    const radius = 2; 
    let maxBlur = 0;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        sum += intensity[ny * width + nx];
                        count++;
                    }
                }
            }
            const avg = sum / count;
            blurred[y * width + x] = avg;
            if (avg > maxBlur) {
                maxBlur = avg;
            }
        }
    }
    
    // Using 25% threshold to ensure thin strokes like "-" don't get erased
    const threshold = maxBlur * 0.25; 
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (blurred[y * width + x] > threshold) {
                data[idx] = data[idx+1] = data[idx+2] = 0; 
            } else {
                data[idx] = data[idx+1] = data[idx+2] = 255; 
            }
            data[idx+3] = 255; 
        }
    }
    ctx.putImageData(imageData, 0, 0);
    
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = width * 2;
    finalCanvas.height = height * 2;
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.imageSmoothingEnabled = false; 
    finalCtx.drawImage(canvas, 0, 0, width * 2, height * 2);
    
    const dataUrl = finalCanvas.toDataURL('image/png');
    console.log("Auto Captcha Solver: Cleaned Image ->", dataUrl);
    return dataUrl;
}

function solveCaptcha(imgElement) {
    if (!imgElement.complete || imgElement.naturalWidth === 0) {
        imgElement.onload = () => solveCaptcha(imgElement);
        return;
    }

    if (isSolving) return;
    isSolving = true;

    console.log("Auto Captcha Solver: Sending to background...");
    const base64Image = processImage(imgElement);
    
    chrome.runtime.sendMessage({ action: 'solveCaptcha', image: base64Image }, response => {
        isSolving = false;
        if (chrome.runtime.lastError) {
            console.error("Auto Captcha Solver: Extension Error:", chrome.runtime.lastError.message);
            return; 
        }

        if (response && response.text) {
            let text = response.text.replace(/\s+/g, ''); 
            console.log("Auto Captcha Solver: OCR Raw Text ->", text);
            
            // Sanitize OCR hallucinations (e.g., S instead of 5)
            text = text
                .replace(/[Oo]/g, '0')
                .replace(/[Il\|]/g, '1')
                .replace(/[Ss]/g, '5')
                .replace(/[Zz]/g, '2')
                .replace(/[Bb]/g, '8');

            // Allow _, ~, or . to be matched as a minus sign. Limit to 1-2 digits to avoid hallucinated large numbers.
            const match = text.match(/(\d{1,2})([\+\-\_\~\.])(\d{1,2})/);
            
            if (match) {
                retryCount = 0; 
                console.log("Auto Captcha Solver: Math matched! Solving...");
                const num1 = parseInt(match[1]);
                const operatorRaw = match[2];
                // Normalize operator
                const operator = operatorRaw === '+' ? '+' : '-';
                const num2 = parseInt(match[3]);
                const result = operator === '+' ? num1 + num2 : num1 - num2;
                
                // Add strict validation: AIUB captchas never result in < 0 or > 100
                if (result < 0 || result > 100 || isNaN(result)) {
                    handleOcrFailure(`Unrealistic result (${result}) from text: ${text}`);
                    return;
                }
                
                const captchaInput = document.getElementById('CaptchaInputText');
                if (captchaInput) {
                    captchaInput.value = result;
                    captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
                    captchaInput.dispatchEvent(new Event('change', { bubbles: true }));

                    checkAutoLogin();
                }
            } else {
                handleOcrFailure(`Regex mismatch. Sanitized text was: ${text}`);
            }
        } else if (response && response.error) {
            if (response.isFallback) {
                console.warn("AIUB Portal+ Captcha Solver: Public API key failed or hit rate limit. Not auto-refreshing. Add a personal key in the extension.");
                return; // Stop and do not retry
            }
            handleOcrFailure(`Background Error: ${response.error}`);
        } else {
            handleOcrFailure(`Unknown error, empty response received.`);
        }
    });
}

function handleOcrFailure(errorMessage) {
    console.error(`Auto Captcha Solver: ${errorMessage}`);
    if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`Auto Captcha Solver: Retrying... (${retryCount}/${MAX_RETRIES})`);
        
        setTimeout(() => {
            const refreshBtn = document.querySelector('a[href="#CaptchaInputText"]');
            if (refreshBtn) {
                refreshBtn.click();
            }
        }, 2000); // Wait 2s to prevent spamming OCR rate limits!
    } else {
        console.error("Auto Captcha Solver: Max retries reached. Stopping.");
    }
}

let lastCaptchaSrc = '';

function checkCaptcha() {
    const img = document.getElementById('CaptchaImage');
    if (!img) return;
    
    // Ignore if it's hidden
    if (img.offsetParent === null) return;

    if (img.src && img.src !== lastCaptchaSrc) {
        lastCaptchaSrc = img.src;
        solveCaptcha(img);
    }
}

function initObserver() {
    // 1. Solve immediately if the image exists
    checkCaptcha();

    // 2. Observe the document for instant refresh button response and dynamic loads
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.target.id === 'CaptchaImage' && mutation.attributeName === 'src') {
                checkCaptcha();
            } else if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.id === 'CaptchaImage' || (node.querySelector && node.querySelector('#CaptchaImage'))) {
                        checkCaptcha();
                    }
                });
            }
        }
    });

    observer.observe(document.body, { 
        childList: true, 
        subtree: true, 
        attributes: true, 
        attributeFilter: ['src'] 
    });
}

setupInputListeners();
initObserver();
