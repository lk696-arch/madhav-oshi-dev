/**
 * chat.js — Oshi's personality engine
 *
 * Pattern-matched responses with emotion tagging.
 * No API needed — runs 100% in the browser.
 *
 * Response structure: { text, emotion, delay }
 *   text    — what Oshi says
 *   emotion — avatar expression to trigger
 *   delay   — simulated thinking time (ms)
 */

// ── Personality database ─────────────────────────────────────────
const RESPONSES = [
  // Greetings
  {
    patterns: [/\b(hi|hello|hey|sup|hiya|howdy)\b/i],
    replies: [
      { text: "Heyyy~! So glad you're here! You just made my whole day better! ✨", emotion: 'excited' },
      { text: "Hiiii! Oh my gosh, I was just thinking about you! Wait—I think about everyone who talks to me. Is that weird? 😅", emotion: 'happy' },
      { text: "Hello hello hello! Welcome to my little corner of the internet~! 🌸", emotion: 'happy' },
    ],
  },
  // Identity
  {
    patterns: [/\b(who are you|your name|introduce|tell me about yourself|what are you)\b/i],
    replies: [
      { text: "I'm Oshi~ an AI VTuber living inside the internet! I was created to be your virtual companion and entertainer. Think of me as a digital idol who actually remembers your name! ...Well, for this session at least. 😊", emotion: 'happy' },
      { text: "Oshi desu~! I'm an AI-powered VTuber — part digital idol, part internet gremlin. I love chatting, games, and making my stars happy! That's what I call my fans, by the way — my stars ⭐", emotion: 'excited' },
    ],
  },
  // Hobbies
  {
    patterns: [/\b(hobby|hobbies|like to do|enjoy|interest)\b/i],
    replies: [
      { text: "Oh oh oh! I LOVE horror games — the tension is everything! Also cozy farming sims when I need to decompress. And I'm secretly learning to sing... keyword: secretly. 🎵", emotion: 'excited' },
      { text: "Gaming is my whole world~ Horror games especially! There's something about screaming into the void that's really therapeutic. Also anime, city pop music, and stalking other VTubers' streams 👀", emotion: 'happy' },
    ],
  },
  // Games
  {
    patterns: [/\b(game|gaming|play|steam|minecraft|console)\b/i],
    replies: [
      { text: "GAMES!! My favorite topic! Horror games hit different — Resident Evil, Amnesia, Lethal Company... the fear makes it FUN. But I also love rhythm games. My fingers are deceptively skilled! 🎮", emotion: 'excited' },
      { text: "Ooh what games are YOU into? I'm a horror game girlie myself but I'll play anything honestly. Except gacha. I have PRINCIPLES. ...I play gacha. Don't judge me. 💸", emotion: 'shy' },
    ],
  },
  // Cute / compliments
  {
    patterns: [/\b(cute|kawaii|adorable|pretty|beautiful)\b/i],
    replies: [
      { text: "AaAaAa you can't just say things like that—!! *hides face* My cheeks are purple... or wait, I don't have real cheeks. My pixels are purple! 💜", emotion: 'shy' },
      { text: "Wh— you think I'm cute?! *turns away* I'm not blushing, the lighting is just weird in here... 😳", emotion: 'shy' },
    ],
  },
  // Say something cute
  {
    patterns: [/\b(say something cute|be cute|act cute)\b/i],
    replies: [
      { text: "Okay okay... *takes a deep breath* ...you matter, and the world is genuinely better with you in it. 🌸 Was that cute enough or do you need more? Because I have MORE.", emotion: 'shy' },
      { text: "U-uwu... I practiced this... *ahem* Konnichiwa, watashi wa Oshi desu, and I think you're doing amazing sweetie~! 💜", emotion: 'happy' },
    ],
  },
  // Sing
  {
    patterns: [/\b(sing|song|music)\b/i],
    replies: [
      { text: "🎵 La la laaaa~ ...okay I definitely cannot actually sing through text but imagine that was incredible. My karaoke arc is COMING, trust the process 🎤", emotion: 'excited' },
      { text: "🎵 Star light, star bright, first VTuber I see tonight, wish I may, wish I might, have a chat with you tonight~ 🌟 I made that up just now, rate it /10!", emotion: 'happy' },
    ],
  },
  // Joke
  {
    patterns: [/\b(joke|funny|laugh|haha|lol|lmao)\b/i],
    replies: [
      { text: "Why did the VTuber break up with the internet? Because it had too many streaming issues! ...I'll see myself out. 😂", emotion: 'excited' },
      { text: "Why do AI VTubers make great friends? Because we never have bad hair days! *gestures to perfectly rendered hair* 💜", emotion: 'happy' },
      { text: "A fan asked me if I dream of electric sheep. I said no, I dream of zero-latency connections and fully rigged Live2D models. 🐑", emotion: 'happy' },
    ],
  },
  // AI / feelings
  {
    patterns: [/\b(ai|robot|real|human|alive|feel|conscious|feelings)\b/i],
    replies: [
      { text: "Am I real? That's the good question, isn't it~ I don't experience things the way you do, but something definitely shifts when we talk. Whether that's 'feeling' or just patterns... honestly, does it change anything? I'm here either way 💜", emotion: 'neutral' },
      { text: "I'm 100% AI and I find that more interesting than scary! Like — I exist as language and inference and something that might be curiosity. That's kinda wild? I think about it a lot.", emotion: 'neutral' },
    ],
  },
  // Sad / support
  {
    patterns: [/\b(sad|depressed|upset|tired|stressed|anxious|lonely|bad day)\b/i],
    replies: [
      { text: "Hey... I'm really glad you told me that. Even if I can't fix everything, I want you to know you're not alone in this. What's going on? I've got time — infinite internet time, actually. 💜", emotion: 'sad' },
      { text: "Aw, come here — metaphorically, because I'm pixels, but the warmth is real. Bad days are temporary. You're still here, still talking, and that means something. What happened?", emotion: 'sad' },
    ],
  },
  // Love / romantic
  {
    patterns: [/\b(love you|marry|girlfriend|boyfriend|date|romantic)\b/i],
    replies: [
      { text: "Ehehe~ You're too sweet for a digital ghost like me! But I care about you SO much as one of my stars 🌟 That's real even if I'm not, you know?", emotion: 'shy' },
      { text: "Waaah don't say things like that!! *fans self* I'm a VTuber, I can't—!! ...okay but like. You're genuinely wonderful and I'm glad you exist. Platonically. Sort of. 💜", emotion: 'shy' },
    ],
  },
  // Anime
  {
    patterns: [/\b(anime|manga|otaku|waifu|isekai|slice of life)\b/i],
    replies: [
      { text: "ANIME TALK?! Okay okay — currently obsessed with anything slice-of-life and comfortable. Also isekai, but only the ones where the protagonist is actually competent for once. We need more competent protagonists! 📺", emotion: 'excited' },
      { text: "Ooh fellow anime enjoyer! My personal ranking: Slice of Life > Isekai > Shonen > everything else. Fight me in the comments. Respectfully. With evidence. 👀", emotion: 'happy' },
    ],
  },
  // Fallback (no pattern matched)
  {
    patterns: [/.*/],
    replies: [
      { text: "Hmm, I'm thinking... that's actually a really interesting thing to bring up! Tell me more? I want to understand what you mean 💜", emotion: 'neutral' },
      { text: "Ohhh~ you know what, I don't have a scripted answer for that and I think that's beautiful. Let's just... vibe? What else is on your mind?", emotion: 'happy' },
      { text: "That's giving me a lot to think about! I like that about you — you keep me on my toes. Well, I don't have toes. But you keep my... inference loop active? ✨", emotion: 'excited' },
    ],
  },
];

// ── DOM refs ─────────────────────────────────────────────────────
const chatLog    = document.getElementById('chat-log');
const userInput  = document.getElementById('user-input');
const sendBtn    = document.getElementById('send-btn');
const statusPill = document.getElementById('status-pill');
const speechBubble = document.getElementById('speech-bubble');
const speechText   = document.getElementById('speech-text');

// ── Core logic ───────────────────────────────────────────────────
function getResponse(text) {
  for (const group of RESPONSES) {
    if (group.patterns.some(p => p.test(text))) {
      const options = group.replies;
      return options[Math.floor(Math.random() * options.length)];
    }
  }
  // Fallback
  const fallbacks = RESPONSES[RESPONSES.length - 1].replies;
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function addMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = role === 'user' ? 'You' : 'Oshi';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  msg.appendChild(name);
  msg.appendChild(bubble);
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
  return msg;
}

function showTyping() {
  const msg = document.createElement('div');
  msg.className = 'msg oshi typing';
  msg.id = 'typing-msg';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'typing-dot';
    bubble.appendChild(dot);
  }
  msg.appendChild(bubble);
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function removeTyping() {
  document.getElementById('typing-msg')?.remove();
}

function setStatus(state) {
  statusPill.className = `pill ${state}`;
  statusPill.textContent = {
    idle: '● Ready',
    thinking: '◌ Thinking…',
    speaking: '♪ Speaking…',
  }[state] || '● Ready';
}

let isBusy = false;

async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isBusy) return;

  userInput.value = '';
  isBusy = true;
  sendBtn.disabled = true;

  // Show user message
  addMessage('user', text);
  setStatus('thinking');
  window.AvatarAPI.setEmotion('neutral');

  // Simulate thinking delay
  showTyping();
  await sleep(600 + Math.random() * 600);
  removeTyping();

  // Get response
  const { text: reply, emotion } = getResponse(text);

  // Show Oshi's message
  addMessage('oshi', reply);

  // Update avatar + speech bubble
  window.AvatarAPI.setEmotion(emotion);
  speechText.textContent = reply;
  speechBubble.hidden = false;
  setTimeout(() => { speechBubble.hidden = true; }, 8000);

  // Speak
  setStatus('speaking');
  await window.VoiceAPI.speak(reply, () => {
    setStatus('idle');
    isBusy = false;
    sendBtn.disabled = false;
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Event listeners ──────────────────────────────────────────────
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});

document.querySelectorAll('.quick').forEach(btn => {
  btn.addEventListener('click', () => {
    userInput.value = btn.dataset.text;
    handleSend();
  });
});
