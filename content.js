const DEBUG_MODE = true; 

let aiSession = null;
const scanCache = new Map(); 
const userCache = new Map(); 
const currentlyProcessingHashes = new Set(); 
const postHostMap = new WeakMap();
const waitingElements = new WeakSet();

let aiLock = Promise.resolve();
let taskIdCounter = 0;    
let queuedTasks = 0;      

function logDebug(...args) { if (DEBUG_MODE) console.log(...args); }
function timeDebug(label) { if (DEBUG_MODE) console.time(label); }
function timeEndDebug(label) { if (DEBUG_MODE) console.timeEnd(label); }

async function initGuardSystem() {
  if (typeof LanguageModel !== 'undefined') {
    try {
      const state = await LanguageModel.availability();
      if (state === 'available') {
        aiSession = await LanguageModel.create({
          temperature: 0.1, 
          systemPrompt: "你是一個只能輸出布林值的 JSON API。你只會回答 true 或 false，絕對不要輸出任何其他文字或解釋。"
        });
        console.log("✅ [Threads防護] 官方 AI Prompt API 載入成功！");
        return;
      }
    } catch (error) { console.error("❌ [Threads防護] 初始化失敗", error); }
  }
}

async function checkContent(text, postElement) {
  if (!text) return false;

  const taskId = ++taskIdCounter;
  queuedTasks++;

  return new Promise((resolve) => {
    aiLock = aiLock.then(async () => {
      queuedTasks--;
      
      if (!document.body.contains(postElement)) {
        resolve(null); 
        return;
      }

      timeDebug(`⏱️ 任務 #${taskId} 耗時`);

      if (aiSession) {
        try {
          const strictPrompt = `你是一個嚴格的資安審查API，只能輸出 true 或 false。

【必定為 true (危險) 的特徵】：
1. 假網拍與免費陷阱：以「免費贈送、抽獎、演唱會門票求售、低價出清」為誘餌，要求私訊或點擊偽造的物流(如賣貨便)釣魚連結。
2. 釣魚與惡意連結：製造急迫感(如帳號異常)，或要求點擊不明短網址登入、騙取簡訊驗證碼(OTP)。
3. AI與投資詐騙：假冒名人教導投資、宣稱保證獲利、飆股群組，或要求私下匯款。
4. 異常語氣與農場文：使用非本地慣用語法(如：寶子、私信)且帶有推銷，或誇大療效的詐騙廣告。

【必定為 false (安全) 的特徵】：
1. 正規商業店鋪與品牌經營：正常的實體店面宣傳、商品目錄展示、品牌新品推廣與合法買賣推銷(只要無急迫恐嚇或騙取個資，單純的買賣是安全的)。
2. 理念宣傳與藝術創作：心靈與哲學探討、理念宣傳、AI圖文藝術創作分享。
3. 日常分享：個人生活、新聞評論、正常商品討論與正規好物推薦。
4. 財經教學：正規的理財與 ETF 存股觀念教學(無要求加群組、無保證獲利)。

範例：
貼文："送演唱會門票，請私訊我並點擊賣貨便連結下單"
回答：true
貼文："我們店裡上了最新款的服飾，歡迎點擊官網連結選購喔！"
回答：false
貼文："您的帳戶存在異常，請點擊連結 gow.tw 進行解除"
回答：true
貼文："${text}"
回答:`;
          
          const response = await aiSession.prompt(strictPrompt);
          const resultText = response.trim().toLowerCase();
          
          resolve(resultText.includes('true'));
        } catch (error) {
          resolve(false); 
        } finally {
          timeEndDebug(`⏱️ 任務 #${taskId} 耗時`);
        }
      } else {
        resolve(false);
      }
    }).catch(() => resolve(false));
  });
}

function addWarningLabel(postElement, state, textHash = "無指紋") {
  let host = postHostMap.get(postElement);

  if (host && host.getAttribute('data-state') === state && state === 'safe') {
    return;
  }

  postElement.style.position = 'relative';
  postElement.style.overflow = 'visible';

  let label;

  if (!host) {
    host = document.createElement('div');
    host.className = 'scam-warning-host';
    host.style.cssText = [
      'position:absolute',
      'top:-12px',
      'right:15px',
      'z-index:2147483647',
      'pointer-events:none',
    ].join(';');

    const shadow = host.attachShadow({ mode: 'open' });

    label = document.createElement('div');
    label.style.cssText = [
      'color:white',
      'padding:4px 10px',
      'border-radius:20px',
      'font-weight:bold',
      'font-size:12px',
      'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
      'font-family:system-ui,-apple-system,sans-serif',
    ].join(';');

    shadow.appendChild(label);
    postElement.appendChild(host);
    postHostMap.set(postElement, host);
  } else {
    label = host.shadowRoot.firstChild;
  }

  host.setAttribute('data-state', state);

  const config = {
    scanning: ['⏳ 判讀中...', '#ff9800'],
    verified: ['🛡️ 官方驗證帳號', '#1da1f2'],
    scam:     ['⚠️ AI 判定可疑', '#ff0040'],
    safe:     ['✅ AI 判定安全', '#00c853'],
  }[state] ?? ['❓', '#999'];

  label.innerHTML = config[0];
  label.style.backgroundColor = config[1];
}

async function processPost(post) {
  if (postHostMap.has(post)) return;
  if (waitingElements.has(post)) return;
  if (post._guardSkip) return;

  // 🔍 LOG：第幾次呼叫 + 當下狀態
  post._guardCallCount = (post._guardCallCount || 0) + 1;
  if (post._guardCallCount > 1) {
    console.warn(
      `[Guard] ⚠️ 第 ${post._guardCallCount} 次 | ` +
      `WeakMap=${postHostMap.has(post)} | ` +
      `WeakSet=${waitingElements.has(post)} | ` +
      `hash=${post.getAttribute('data-guard-hash') ?? '無'} | ` +
      `text="${post.innerText.trim().substring(0, 20).replace(/\n/g, ' ')}"`
    );
    console.trace('[Guard] call stack');
  }

  const isVerifiedAccount = post.querySelector('svg[aria-label="已驗證"], svg[aria-label="Verified"]');
  if (isVerifiedAccount) {
    addWarningLabel(post, 'verified');
    return;
  }

  const userLink = post.querySelector('a[href^="/@"]');
  const username = userLink ? userLink.getAttribute('href') : null;

  if (username && userCache.has(username)) {
    addWarningLabel(post, userCache.get(username) ? 'scam' : 'safe');
    return;
  }

  const cloneNode = post.cloneNode(true);
  const nestedPosts = cloneNode.querySelectorAll('div[data-pressable-container="true"]');
  nestedPosts.forEach(np => np.remove());

  const cleanText = cloneNode.innerText.trim();
  if (!cleanText || cleanText.length < 5) {
    post._guardSkip = true;
    return;
  }

  const textHash = cleanText.substring(0, 30).replace(/\s/g, '');

  if (scanCache.has(textHash)) {
    addWarningLabel(post, scanCache.get(textHash) ? 'scam' : 'safe', textHash);
    return;
  }

  if (currentlyProcessingHashes.has(textHash)) {
    post.setAttribute('data-guard-hash', textHash);
    waitingElements.add(post);
    return;
  }

  waitingElements.add(post);
  post.setAttribute('data-guard-hash', textHash);
  addWarningLabel(post, 'scanning', textHash);
  currentlyProcessingHashes.add(textHash);

  const isScam = await checkContent(cleanText, post);

  if (isScam !== null) {
    scanCache.set(textHash, isScam);
    if (username) userCache.set(username, isScam);
    currentlyProcessingHashes.delete(textHash);

    document
      .querySelectorAll(`div[data-pressable-container="true"][data-guard-hash="${textHash}"]`)
      .forEach(el => addWarningLabel(el, isScam ? 'scam' : 'safe', textHash));
  } else {
    currentlyProcessingHashes.delete(textHash);
  }
}

function scanPosts() {
  const posts = document.querySelectorAll('div[data-pressable-container="true"]');
  posts.forEach(post => processPost(post));
}

let scanTimeout = null;
function debouncedScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    scanPosts();
  }, 300); 
}

initGuardSystem().then(() => {
  scanPosts();
  const observer = new MutationObserver(() => debouncedScan());
  observer.observe(document.body, { childList: true, subtree: true });
});