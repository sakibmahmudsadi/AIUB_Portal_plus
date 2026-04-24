async function fetchOCR(base64Image, engineType, apiKey) {
    const formData = new FormData();
    formData.append('apikey', apiKey); 
    formData.append('language', 'eng');
    formData.append('scale', 'true');
    formData.append('OCREngine', engineType); 
    formData.append('base64image', base64Image);

    try {
        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.IsErroredOnProcessing && data.ErrorMessage && data.ErrorMessage.includes("Rate limit")) {
            return "RATE_LIMIT";
        }
        
        if (data.ParsedResults && data.ParsedResults.length > 0) {
            return data.ParsedResults[0].ParsedText || "";
        }
    } catch (e) {
        console.error("OCR Fetch Error:", e);
    }
    return "";
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'solveCaptcha') {
        (async () => {
            try {
                // Get the user's personal API key from storage
                const storage = await chrome.storage.local.get(['ocrApiKey']);
                const userApiKey = storage.ocrApiKey;
                const isFallback = (!userApiKey || userApiKey.trim() === '');
                const actualKey = isFallback ? 'K81218530988957' : userApiKey;

                const enginesToTry = ['5', '1', '2'];
                let finalMatchedText = "";

                for (const engine of enginesToTry) {
                    const text = await fetchOCR(request.image, engine, actualKey);
                    
                    if (text === "RATE_LIMIT") {
                        await sleep(1500);
                        continue;
                    }
                    
                    if (text) {
                        let cleanedText = text.replace(/\s+/g, '');
                        cleanedText = cleanedText
                            .replace(/[Oo]/g, '0')
                            .replace(/[Il\|]/g, '1')
                            .replace(/[Ss]/g, '5')
                            .replace(/[Zz]/g, '2')
                            .replace(/[Bb]/g, '8');

                        const match = cleanedText.match(/(\d+)([\+\-\_\~\.])(\d+)/);
                        
                        if (match) {
                            finalMatchedText = text;
                            break; 
                        }
                    }
                    await sleep(1200);
                }

                if (finalMatchedText) {
                    sendResponse({ text: finalMatchedText });
                } else {
                    sendResponse({ error: "Failed to parse math. Check if your API Key is correct in the extension settings.", isFallback: isFallback });
                }
            } catch (err) {
                sendResponse({ error: err.toString(), isFallback: true });
            }
        })();
        return true; 
    }
});
