/**
 * SAM v3.0 — Ultimate Frontend Engine
 * =====================================
 * Streaming SSE · Particles · Chat History · Voice I/O
 * Drag-Drop · Syntax Highlighting · Waveform · Sound FX
 */

// ─── DOM Elements ──────────────────────────────────────────────────────────
const $ = (s) => document.getElementById(s);
const chatForm = $("chatForm");
const userInput = $("userInput");
const messagesEl = $("messages");
const messagesWrap = $("messagesWrapper");
const sendBtn = $("sendBtn");
const newChatBtn = $("newChatBtn");
const menuToggle = $("menuToggle");
const sidebar = $("sidebar");
const ttsToggle = $("ttsToggle");
const sfxToggle = $("sfxToggle");
const streamToggle = $("streamToggle");
const particleToggle = $("particleToggle");
const stopTtsBtn = $("stopTtsBtn");
const imageUploadBtn = $("imageUploadBtn");
const imageFileInput = $("imageFileInput");
const imagePreviewBar = $("imagePreviewBar");
const imagePreviewThumb = $("imagePreviewThumb");
const imageFileName = $("imageFileName");
const removeImageBtn = $("removeImageBtn");
const micBtn = $("micBtn");
const aiStatus = $("aiStatus");
const chatSubtitle = $("chatSubtitle");
const toastContainer = $("toastContainer");
const lightbox = $("lightbox");
const lightboxImg = $("lightboxImg");
const lightboxClose = $("lightboxClose");
const dropOverlay = $("dropOverlay");
const searchInput = $("searchInput");
const chatHistoryEl = $("chatHistory");
const exportBtn = $("exportBtn");
const responseTimeEl = $("responseTime");
const rtValue = $("rtValue");
const waveformCanvas = $("waveformCanvas");
const particleCanvas = $("particleCanvas");

// ─── Debug V2 ─────────────────────────────────────────────────────────────
window.onerror = function (msg, url, line, col, error) {
    const errorMsg = `JS Error: ${msg}\nLine: ${line}`;
    console.error("Global Error Handler:", errorMsg, error);
    // Only show toast if toast system is ready, otherwise alert
    if (window.showToast) window.showToast("⚠️ Script Error: " + msg, "error");
    else alert(errorMsg);
    // If critical init error, update AI status to error
    const status = document.getElementById("aiStatus");
    if (status) status.classList.add("error");
    return false;
};

// ─── State ─────────────────────────────────────────────────────────────────
let conversationHistory = [];
let isWaiting = false;
let pendingImageBase64 = null;
let currentUtterance = null;
let isRecording = false;
let recognition = null;
let currentChatId = null;
let waveformAnimId = null;
let particlesEnabled = true;

// ─── Chat History (localStorage) ──────────────────────────────────────────
const STORAGE_KEY = "sam_chats";

function loadChats() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}

function saveChats(chats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function saveCurrentChat() {
    if (conversationHistory.length === 0) return;
    const chats = loadChats();
    const title = conversationHistory[0]?.content?.substring(0, 40) || "New Chat";
    const existing = chats.findIndex(c => c.id === currentChatId);

    const chatData = {
        id: currentChatId,
        title: title,
        messages: conversationHistory,
        updatedAt: Date.now(),
    };

    if (existing >= 0) {
        chats[existing] = chatData;
    } else {
        chats.unshift(chatData);
    }

    saveChats(chats);
    renderChatHistory();
}

function renderChatHistory(filter = "") {
    const chats = loadChats();
    const filtered = filter
        ? chats.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
        : chats;

    if (filtered.length === 0) {
        chatHistoryEl.innerHTML = '<div class="history-empty">No saved chats yet</div>';
        return;
    }

    chatHistoryEl.innerHTML = filtered.map(chat => `
        <div class="history-item ${chat.id === currentChatId ? 'active' : ''}" data-id="${chat.id}">
            <span class="hi-icon">💬</span>
            <span class="hi-title">${escapeHTML(chat.title)}</span>
            <button class="hi-delete" data-id="${chat.id}" title="Delete">✕</button>
        </div>
    `).join("");

    // Attach click events
    chatHistoryEl.querySelectorAll(".history-item").forEach(item => {
        item.addEventListener("click", (e) => {
            if (e.target.classList.contains("hi-delete")) return;
            loadChat(item.dataset.id);
        });
    });

    chatHistoryEl.querySelectorAll(".hi-delete").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteChat(btn.dataset.id);
        });
    });
}

function loadChat(chatId) {
    const chats = loadChats();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    currentChatId = chatId;
    conversationHistory = chat.messages;
    messagesEl.innerHTML = "";

    for (let i = 0; i < conversationHistory.length; i++) {
        const msg = conversationHistory[i];
        appendMessage(msg.role, msg.content);
    }
    scrollToBottom();
    renderChatHistory();
    showToast("📂 Chat loaded!", "info");
}

function deleteChat(chatId) {
    let chats = loadChats();
    chats = chats.filter(c => c.id !== chatId);
    saveChats(chats);
    if (chatId === currentChatId) {
        startNewChat();
    }
    renderChatHistory();
    showToast("🗑️ Chat deleted", "info");
}

function startNewChat() {
    if (conversationHistory.length > 0) saveCurrentChat();
    currentChatId = "chat_" + Date.now();
    conversationHistory = [];
    messagesEl.innerHTML = "";
    messagesEl.appendChild(createWelcomeScreen());
    userInput.value = "";
    userInput.style.height = "auto";
    isWaiting = false;
    sendBtn.disabled = false;
    clearPendingImage();
    stopSpeaking();
    setAIStatus("idle", "Ready to chat");
    responseTimeEl.style.display = "none";
    renderChatHistory();
}

// Search
searchInput.addEventListener("input", () => renderChatHistory(searchInput.value));

// Init
currentChatId = "chat_" + Date.now();
renderChatHistory();

// ─── Sound Effects ────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }

function playTone(freq1, freq2, freq3, type, vol, dur) {
    if (!sfxToggle.checked) return;
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq1, ctx.currentTime);
        if (freq2) osc.frequency.setValueAtTime(freq2, ctx.currentTime + dur * 0.3);
        if (freq3) osc.frequency.setValueAtTime(freq3, ctx.currentTime + dur * 0.6);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
    } catch (e) { }
}

const playSendSound = () => playTone(880, 1100, 1320, "sine", 0.06, 0.18);
const playReceiveSound = () => playTone(660, 880, 1320, "sine", 0.05, 0.22);
const playErrorSound = () => playTone(300, 200, null, "square", 0.04, 0.25);
const playStreamStart = () => playTone(440, 660, null, "sine", 0.03, 0.15);

// ─── Toast ────────────────────────────────────────────────────────────────
function showToast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

// ─── TTS (Cute Female Voice) ──────────────────────────────────────────────
const synth = window.speechSynthesis;

function speakText(text) {
    return new Promise((resolve) => {
        synth.cancel();
        const clean = text
            .replace(/```[\s\S]*?```/g, "code block")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/#{1,6}\s/g, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/\n+/g, ". ");

        const utt = new SpeechSynthesisUtterance(clean);
        utt.rate = 1.1; utt.pitch = 1.5; utt.volume = 1.0;

        const voices = synth.getVoices();
        const keywords = ["Zira", "Haruka", "Nanami", "Female", "Samantha", "Karen", "Girl", "Hazel"];
        let voice = null;
        for (const kw of keywords) { voice = voices.find(v => v.name.includes(kw) && v.lang.startsWith("en")); if (voice) break; }
        if (!voice) voice = voices.find(v => v.lang.startsWith("en"));
        if (voice) utt.voice = voice;

        setAIStatus("speaking", "Speaking...");
        utt.onend = () => { currentUtterance = null; stopTtsBtn.style.display = "none"; setAIStatus("idle", "Ready to chat"); resolve(); };
        utt.onerror = () => { currentUtterance = null; stopTtsBtn.style.display = "none"; setAIStatus("idle", "Ready to chat"); resolve(); };
        currentUtterance = utt;
        stopTtsBtn.style.display = "flex";
        synth.speak(utt);
    });
}

function stopSpeaking() {
    synth.cancel(); currentUtterance = null;
    stopTtsBtn.style.display = "none";
    setAIStatus("idle", "Ready to chat");
}

if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = () => synth.getVoices();

// ─── Speech-to-Text ───────────────────────────────────────────────────────
function initSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micBtn.style.opacity = "0.3"; return; }

    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("recording");
        setAIStatus("idle", "Listening...");
        showToast("🎤 Listening...", "info");
        startWaveform();
    };

    recognition.onresult = (e) => {
        let t = "";
        for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
        userInput.value = t;
        userInput.style.height = "auto";
        userInput.style.height = Math.min(userInput.scrollHeight, 150) + "px";
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove("recording");
        setAIStatus("idle", "Ready to chat");
        stopWaveform();
        if (userInput.value.trim()) {
            showToast("✅ Sending...", "success");
            chatForm.dispatchEvent(new Event("submit"));
        }
    };

    recognition.onerror = (e) => {
        isRecording = false;
        micBtn.classList.remove("recording");
        stopWaveform();
        setAIStatus("idle", "Ready to chat");
        if (e.error !== "no-speech") showToast("🎤 " + e.error, "error");
    };
}

function toggleMic() {
    if (!recognition) { showToast("Not supported", "error"); return; }
    isRecording ? recognition.stop() : recognition.start();
}

initSpeechRecognition();

// ─── Voice Waveform Visualization ─────────────────────────────────────────
function startWaveform() {
    waveformCanvas.style.display = "block";
    const ctx = waveformCanvas.getContext("2d");
    const w = waveformCanvas.width = 100;
    const h = waveformCanvas.height = 36;

    function draw() {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#ef4444";
        const bars = 12;
        const barW = 4;
        const gap = (w - bars * barW) / (bars + 1);
        for (let i = 0; i < bars; i++) {
            const barH = Math.random() * (h - 8) + 4;
            const x = gap + i * (barW + gap);
            const y = (h - barH) / 2;
            ctx.beginPath();
            // Use rect instead of roundRect for better compatibility
            ctx.rect(x, y, barW, barH);
            ctx.fill();
        }
        waveformAnimId = requestAnimationFrame(draw);
    }
    draw();
}

function stopWaveform() {
    if (waveformAnimId) cancelAnimationFrame(waveformAnimId);
    waveformCanvas.style.display = "none";
}

// ─── AI Status ────────────────────────────────────────────────────────────
function setAIStatus(state, subtitle) {
    aiStatus.className = "ai-status-indicator";
    if (state !== "idle") aiStatus.classList.add(state);
    chatSubtitle.textContent = subtitle;
}

// ─── Particle System ──────────────────────────────────────────────────────
(function initParticles() {
    const ctx = particleCanvas.getContext("2d");
    let particles = [];
    let mouseX = -1, mouseY = -1;
    const PARTICLE_COUNT = 60;
    const CONNECT_DIST = 120;

    function resize() {
        particleCanvas.width = window.innerWidth;
        particleCanvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    document.addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY; });

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * particleCanvas.width;
            this.y = Math.random() * particleCanvas.height;
            this.vx = (Math.random() - 0.5) * 0.4;
            this.vy = (Math.random() - 0.5) * 0.4;
            this.r = Math.random() * 1.5 + 0.5;
            this.alpha = Math.random() * 0.3 + 0.1;
        }
        update() {
            this.x += this.vx; this.y += this.vy;
            if (this.x < 0 || this.x > particleCanvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > particleCanvas.height) this.vy *= -1;

            // Mouse repulsion
            if (mouseX > 0) {
                const dx = this.x - mouseX, dy = this.y - mouseY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    this.x += dx / dist * 1.5;
                    this.y += dy / dist * 1.5;
                }
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(124, 111, 224, ${this.alpha})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

    function animate() {
        if (!particlesEnabled) {
            ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
            requestAnimationFrame(animate);
            return;
        }
        ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

        particles.forEach(p => { p.update(); p.draw(); });

        // Draw connection lines
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < CONNECT_DIST) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(124, 111, 224, ${0.08 * (1 - dist / CONNECT_DIST)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
})();

particleToggle.addEventListener("change", () => { particlesEnabled = particleToggle.checked; });

// ─── Drag & Drop ──────────────────────────────────────────────────────────
let dragCounter = 0;
document.addEventListener("dragenter", (e) => { e.preventDefault(); dragCounter++; dropOverlay.classList.add("active"); });
document.addEventListener("dragleave", (e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dropOverlay.classList.remove("active"); dragCounter = 0; } });
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
    e.preventDefault();
    dropOverlay.classList.remove("active");
    dragCounter = 0;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
        handleImageFile(file);
    }
});

// ─── Image Handling ───────────────────────────────────────────────────────
imageUploadBtn.addEventListener("click", () => imageFileInput.click());
imageFileInput.addEventListener("change", (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); });
removeImageBtn.addEventListener("click", clearPendingImage);

function handleImageFile(file) {
    if (file.size > 10 * 1024 * 1024) { showToast("📸 Image too large! Max 10MB.", "error"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        pendingImageBase64 = e.target.result;
        imagePreviewThumb.src = pendingImageBase64;
        imageFileName.textContent = file.name;
        imagePreviewBar.style.display = "flex";
        showToast("📸 Image ready!", "info");
    };
    reader.readAsDataURL(file);
}

function clearPendingImage() {
    pendingImageBase64 = null;
    imagePreviewBar.style.display = "none";
    imagePreviewThumb.src = "";
    imageFileName.textContent = "";
    imageFileInput.value = "";
}

// ─── Lightbox ─────────────────────────────────────────────────────────────
lightboxClose.addEventListener("click", () => lightbox.classList.remove("active"));
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) lightbox.classList.remove("active"); });

function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.add("active");
}

// ─── Export Chat ──────────────────────────────────────────────────────────
exportBtn.addEventListener("click", exportChat);

function exportChat() {
    if (conversationHistory.length === 0) { showToast("Nothing to export", "info"); return; }
    let text = "SAM AI Chat Export\n" + "=".repeat(40) + "\n\n";
    conversationHistory.forEach(msg => {
        const label = msg.role === "user" ? "You" : "SAM";
        text += `[${label}]\n${msg.content}\n\n`;
    });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sam_chat_${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
    showToast("📥 Chat exported!", "success");
}

// ─── Event Listeners ──────────────────────────────────────────────────────
chatForm.addEventListener("submit", handleSubmit);
userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + "px";
});
userInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chatForm.dispatchEvent(new Event("submit")); } });

document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => { userInput.value = chip.dataset.prompt; chatForm.dispatchEvent(new Event("submit")); });
});

newChatBtn.addEventListener("click", () => { startNewChat(); showToast("✨ New chat!", "success"); });
menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
stopTtsBtn.addEventListener("click", stopSpeaking);
micBtn.addEventListener("click", toggleMic);

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "n") { e.preventDefault(); startNewChat(); showToast("✨ New chat!", "success"); }
    if (e.ctrlKey && e.key === "m") { e.preventDefault(); toggleMic(); }
    if (e.ctrlKey && e.key === "e") { e.preventDefault(); exportChat(); }
});

// ─── Core: Handle Submit ──────────────────────────────────────────────────
async function handleSubmit(e) {
    e.preventDefault();
    const text = userInput.value.trim();
    const hasImage = !!pendingImageBase64;

    if ((!text && !hasImage) || isWaiting) return;

    const ws = document.getElementById("welcomeScreen");
    if (ws) ws.remove();

    const displayText = text || "📸 Analyze this image";
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    appendMessage("user", displayText, hasImage ? pendingImageBase64 : null, ts);
    playSendSound();

    if (text) conversationHistory.push({ role: "user", content: text });

    userInput.value = "";
    userInput.style.height = "auto";

    // Clear pending state
    clearPendingImage();

    isWaiting = true;
    sendBtn.disabled = true;

    if (hasImage) {
        await handleVision(text);
    } else if (streamToggle.checked) {
        await handleStreamingChat();
    } else {
        await handleRegularChat();
    }

    isWaiting = false;
    sendBtn.disabled = false;
    userInput.focus();
    saveCurrentChat();
}

// ─── Streaming Chat (SSE) ─────────────────────────────────────────────────
async function handleStreamingChat() {
    setAIStatus("streaming", "Streaming...");
    playStreamStart();
    responseTimeEl.style.display = "none";

    // Create the AI message bubble immediately
    const msgEl = document.createElement("div");
    msgEl.className = "message assistant";
    msgEl.innerHTML = `
        <div class="message-avatar">${getAvatarHTML("assistant")}</div>
        <div class="message-content"><span class="stream-cursor"></span></div>
    `;
    messagesEl.appendChild(msgEl);
    scrollToBottom();

    const contentEl = msgEl.querySelector(".message-content");
    let fullText = "";

    try {
        const response = await fetch("/api/chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: conversationHistory }),
        });

        if (!response.ok) {
            const err = await response.json();
            contentEl.innerHTML = `<span style="color: var(--red)">${err.error || "Stream failed"}</span>`;
            playErrorSound();
            setAIStatus("idle", "Ready to chat");
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                    const data = JSON.parse(line.slice(6));

                    if (data.error) {
                        contentEl.innerHTML = `<span style="color: var(--red)">${data.error}</span>`;
                        playErrorSound();
                        setAIStatus("idle", "Ready to chat");
                        return;
                    }

                    if (data.token) {
                        fullText += data.token;
                        contentEl.innerHTML = formatContent(fullText) + '<span class="stream-cursor"></span>';
                        scrollToBottom();
                    }

                    if (data.done) {
                        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        contentEl.innerHTML = formatContent(fullText)
                            + `<span class="message-timestamp">${ts} · ⚡ ${data.time}s</span>`
                            + buildActions();

                        // Syntax highlighting safety
                        contentEl.querySelectorAll("pre code").forEach(block => {
                            if (window.hljs) hljs.highlightElement(block);
                        });
                        addCodeCopyButtons(contentEl);
                        attachActions(contentEl, fullText);

                        rtValue.textContent = data.time + "s";
                        responseTimeEl.style.display = "flex";

                        playReceiveSound();

                        conversationHistory.push({ role: "assistant", content: fullText });

                        if (ttsToggle.checked) await speakText(fullText);
                    }
                } catch { }
            }
        }
    } catch (err) {
        contentEl.innerHTML = `<span style="color: var(--red)">Network error</span>`;
        playErrorSound();
        console.error(err);
    }

    setAIStatus("idle", "Ready to chat");
}

// ─── Regular Chat (no streaming) ──────────────────────────────────────────
async function handleRegularChat() {
    setAIStatus("thinking", "Thinking...");
    const loadingEl = showLoading();

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: conversationHistory }),
        });
        const data = await response.json();
        loadingEl.remove();

        if (!response.ok || data.error) {
            appendMessage("error", data.error || "Something went wrong.");
            playErrorSound();
            setAIStatus("idle", "Ready to chat");
            return;
        }

        playReceiveSound();
        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        conversationHistory.push({ role: "assistant", content: data.reply });

        if (data.time) { rtValue.textContent = data.time + "s"; responseTimeEl.style.display = "flex"; }
        await appendMessageWithTyping("assistant", data.reply, ts, data.time);

        setAIStatus("idle", "Ready to chat");
        if (ttsToggle.checked) await speakText(data.reply);

    } catch (err) {
        loadingEl.remove();
        appendMessage("error", "Network error.");
        playErrorSound();
        setAIStatus("idle", "Ready to chat");
    }
}

// ─── Vision ───────────────────────────────────────────────────────────────
async function handleVision(text) {
    setAIStatus("thinking", "Analyzing image...");
    const loadingEl = showLoading();
    const imageData = pendingImageBase64;
    clearPendingImage();

    try {
        const response = await fetch("/api/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: imageData, prompt: text || "Describe this image!" }),
        });
        const data = await response.json();
        loadingEl.remove();

        if (!response.ok || data.error) {
            appendMessage("error", data.error || "Vision failed.");
            playErrorSound();
        } else {
            playReceiveSound();
            const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            conversationHistory.push({ role: "assistant", content: data.reply });
            if (data.time) { rtValue.textContent = data.time + "s"; responseTimeEl.style.display = "flex"; }
            await appendMessageWithTyping("assistant", data.reply, ts, data.time);
            if (ttsToggle.checked) await speakText(data.reply);
        }
    } catch (err) {
        loadingEl.remove();
        appendMessage("error", "Network error.");
        playErrorSound();
    }
    setAIStatus("idle", "Ready to chat");
}

// ─── Message Rendering ───────────────────────────────────────────────────
function appendMessage(role, content, imageUrl = null, timestamp = "") {
    const el = document.createElement("div");
    el.className = `message ${role}`;
    const avatar = getAvatarHTML(role);
    const formatted = formatContent(content);
    const img = imageUrl ? `<img src="${imageUrl}" alt="Image" class="message-image" onclick="openLightbox(this.src)" />` : "";
    const ts = timestamp ? `<span class="message-timestamp">${timestamp}</span>` : "";
    el.innerHTML = `<div class="message-avatar">${avatar}</div><div class="message-content">${img}${formatted}${ts}</div>`;
    messagesEl.appendChild(el);
    scrollToBottom();
}

async function appendMessageWithTyping(role, content, timestamp = "", respTime = null) {
    const el = document.createElement("div");
    el.className = `message ${role}`;
    el.innerHTML = `<div class="message-avatar">${getAvatarHTML(role)}</div><div class="message-content"><span class="typing-cursor"></span></div>`;
    messagesEl.appendChild(el);
    scrollToBottom();

    const contentEl = el.querySelector(".message-content");
    await typeWords(contentEl, content);

    const ts = timestamp ? `<span class="message-timestamp">${timestamp}${respTime ? ` · ⚡ ${respTime}s` : ""}</span>` : "";
    contentEl.innerHTML = formatContent(content) + ts + buildActions();

    contentEl.querySelectorAll("pre code").forEach(block => {
        if (window.hljs) hljs.highlightElement(block);
    });
    addCodeCopyButtons(contentEl);
    attachActions(contentEl, content);
    scrollToBottom();
}

function buildActions() {
    return `<div class="msg-actions"><button class="action-btn speak-action">🔊 Listen</button><button class="action-btn copy-action">📋 Copy</button></div>`;
}

function attachActions(contentEl, content) {
    const speakBtn = contentEl.querySelector(".speak-action");
    if (speakBtn) speakBtn.addEventListener("click", async () => {
        if (synth.speaking) { stopSpeaking(); speakBtn.textContent = "🔊 Listen"; speakBtn.classList.remove("active"); }
        else { speakBtn.textContent = "⏹️ Stop"; speakBtn.classList.add("active"); await speakText(content); speakBtn.textContent = "🔊 Listen"; speakBtn.classList.remove("active"); }
    });

    const copyBtn = contentEl.querySelector(".copy-action");
    if (copyBtn) copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(content).then(() => {
            copyBtn.textContent = "✅ Copied!"; copyBtn.classList.add("active");
            showToast("📋 Copied!", "success");
            setTimeout(() => { copyBtn.textContent = "📋 Copy"; copyBtn.classList.remove("active"); }, 2000);
        });
    });
}

// ─── Code Copy Buttons ────────────────────────────────────────────────────
function addCodeCopyButtons(container) {
    container.querySelectorAll("pre").forEach(pre => {
        if (pre.parentElement.classList.contains("code-block-wrapper")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "code-block-wrapper";

        const codeEl = pre.querySelector("code");
        const lang = codeEl?.className?.replace("language-", "").replace("hljs", "").trim() || "code";

        const header = document.createElement("div");
        header.className = "code-block-header";
        header.innerHTML = `<span class="code-lang">${lang}</span>`;

        const btn = document.createElement("button");
        btn.className = "copy-code-btn";
        btn.textContent = "📋 Copy";
        btn.addEventListener("click", () => {
            navigator.clipboard.writeText(pre.textContent).then(() => {
                btn.textContent = "✅ Copied!"; btn.classList.add("copied");
                setTimeout(() => { btn.textContent = "📋 Copy"; btn.classList.remove("copied"); }, 2000);
            });
        });
        header.appendChild(btn);

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
    });
}

// ─── Word-by-word Typing ──────────────────────────────────────────────────
function typeWords(element, text) {
    return new Promise((resolve) => {
        const words = text.split(/(\s+)/);
        let i = 0, displayed = "";
        function tick() {
            if (i < words.length) {
                displayed += words[i++];
                element.innerHTML = escapeHTML(displayed) + '<span class="typing-cursor"></span>';
                scrollToBottom();
                setTimeout(tick, 25);
            } else resolve();
        }
        tick();
    });
}

// ─── Loading ──────────────────────────────────────────────────────────────
function showLoading() {
    const el = document.createElement("div");
    el.className = "loading-indicator";
    el.innerHTML = `<div class="message-avatar" style="background:linear-gradient(135deg,#12121a,#1a1a28);font-size:14px;">⚡</div><div class="loading-dots"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
}

function scrollToBottom() { messagesWrap.scrollTop = messagesWrap.scrollHeight; }

function getAvatarHTML(role) {
    if (role === "user") return "👤";
    if (role === "assistant") return "⚡";
    if (role === "error") return "⚠️";
    return "❓";
}

// ─── Markdown Formatting ──────────────────────────────────────────────────
function formatContent(text) {
    let h = escapeHTML(text);

    // Code blocks with language
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
        `<pre><code class="language-${lang || 'plaintext'}">${code}</code></pre>`
    );

    // Inline code
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold + Italic
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Blockquotes
    h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rule
    h = h.replace(/^---$/gm, '<hr/>');

    // Simple table support (pipe tables)
    h = h.replace(/(?:^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*))/gm, (_, header, sep, body) => {
        const ths = header.split("|").filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join("");
        const rows = body.trim().split("\n").map(row => {
            const tds = row.split("|").filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join("");
            return `<tr>${tds}</tr>`;
        }).join("");
        return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Line breaks
    h = h.replace(/\n/g, '<br/>');

    return h;
}

function escapeHTML(s) { const d = document.createElement("div"); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

// ─── Recreate Welcome Screen ──────────────────────────────────────────────
function createWelcomeScreen() {
    const el = document.createElement("div");
    el.className = "welcome-screen";
    el.id = "welcomeScreen";
    el.innerHTML = `
        <div class="welcome-glow"></div>
        <div class="welcome-avatar"><span>⚡</span></div>
        <h2 class="welcome-title">Hey! I'm <span class="gradient-text-animated">SAM</span></h2>
        <p class="welcome-desc">Your ultimate AI sidekick — streaming responses, image vision, voice I/O, and terrible jokes.</p>
        <div class="feature-cards">
            <div class="feature-card fc-delay-1"><div class="fc-icon-wrap"><span>📡</span></div><span class="fc-title">Streaming</span><span class="fc-desc">Real-time tokens</span></div>
            <div class="feature-card fc-delay-2"><div class="fc-icon-wrap"><span>👁️</span></div><span class="fc-title">Vision</span><span class="fc-desc">Analyze images</span></div>
            <div class="feature-card fc-delay-3"><div class="fc-icon-wrap"><span>🎤</span></div><span class="fc-title">Voice</span><span class="fc-desc">Speak & listen</span></div>
            <div class="feature-card fc-delay-4"><div class="fc-icon-wrap"><span>🧠</span></div><span class="fc-title">Memory</span><span class="fc-desc">Saves history</span></div>
        </div>
        <div class="suggestion-chips">
            <button class="chip chip-delay-1" data-prompt="Tell me the funniest programming joke you know">😂 Tell me a joke</button>
            <button class="chip chip-delay-2" data-prompt="Explain quantum computing like I'm 5 but make it hilarious">💡 Quantum comedy</button>
            <button class="chip chip-delay-3" data-prompt="Write a short funny poem about debugging at 3am">📝 Debug poem</button>
            <button class="chip chip-delay-4" data-prompt="Give me 5 wild startup ideas that might actually work">🚀 Crazy ideas</button>
        </div>
    `;
    el.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => { userInput.value = chip.dataset.prompt; chatForm.dispatchEvent(new Event("submit")); });
    });
    return el;
}

// Make openLightbox available globally
window.openLightbox = openLightbox;
