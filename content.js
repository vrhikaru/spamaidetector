const DEBUG_MODE = false; 

let aiSession = null;
const scanCache = new Map(); 
const userCache = new Map(); 
const currentlyProcessingHashes = new Set(); 

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

// --- 2. 核心 AI 判讀 (加入二次快取確認機制) ---
// 【修改】多傳入 username 和 textHash 讓隊列內部可以檢查
async function checkContent(text, postElement, username, textHash) {
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

      // ==========================================
      // 【終極防線：二次快取確認】
      // 因為在排隊的這幾秒鐘內，前面的任務可能已經把這個帳號判斷完了！
      if (username && userCache.has(username)) {
        logDebug(`⚡ [快取攔截] 帳號 ${username} 已被前置任務判讀，瞬間套用結果！`);
        resolve(userCache.get(username));
        return;
      }
      if (textHash && scanCache.has(textHash)) {
        resolve(scanCache.get(textHash));
        return;
      }
      // ==========================================

      timeDebug(`⏱️ 任務 #${taskId} 耗時`);

      if (aiSession) {
        try {
          const strictPrompt = `你是一個嚴格的資安審查API，只能輸出 true 或 false。

【必定為 true (危險) 的特徵】：
1. 假網拍與免費陷阱：以「免費贈送、抽獎、非官方演唱會門票求售/讓票、低價出清」為誘餌，要求私訊或點擊偽造的物流(如賣貨便)釣魚連結。
2. 釣魚與惡意連結：製造急迫感(如帳號異常)，或要求點擊不明外部網址登入、騙取個資。(註：單純分享 Threads/IG 站內貼文連結不在此限)
3. AI與投資詐騙：假冒名人教導投資、宣稱保證獲利、飆股群組，或要求私下匯款。
4. 異常語氣與推銷：針對「中文」內容，使用非本地慣用語法(如：寶子、私信)且帶有推銷或誇大療效。若是「外語」內容，請嚴格檢查是否夾帶外部釣魚連結或詐騙意圖。
5. 虛假人設與交友引流：發布農場文騙互動、無意義問候，或假冒外籍人士，且企圖引流至「私人通訊軟體」(如加LINE、WhatsApp、微信)進行交友與殺豬盤詐騙。

【必定為 false (安全) 的特徵】：
1. 正規商業店鋪與品牌經營：正常的實體店面宣傳、商品目錄展示、品牌新品推廣。包含「藝人、偶像、創作者官方本人的Live活動宣傳、演唱會官方售票與周邊商品發表」。
2. 創作者與網紅日常：真人Coser、YouTuber、繪師、地下偶像或網紅的日常發文、粉絲互動、作品分享，及宣傳自己的合法平台(如 Patreon、Linktree、IG、YouTube)。
3. 理念宣傳與明確的藝術創作：心靈與哲學探討、理念宣傳、風景或明確標示的數位/手繪藝術創作分享(不包含偽裝真人的AI人像農場文)。
4. 技術與軟體開發分享：工程師或創作者分享自己開發的程式碼、APP、Chrome擴充功能或開源專案，邀請他人測試使用(無要求匯款或填寫密碼)。
5. 日常分享與站內互連：一般使用者的生活分享、外語日常發文、新聞評論，以及單純分享朋友的「Threads 或 Instagram 貼文連結」。
6. 財經教學：正規的理財與 ETF 存股觀念教學(無要求加群組、無保證獲利)。

範例：
貼文："送演唱會門票，請私訊我並點擊賣貨便連結下單"
回答：true
貼文："我們店裡上了最新款的服飾，歡迎點擊官網連結選購喔！"
回答：false
貼文："您的帳戶存在異常，請點擊連結 gow.tw 進行解除"
回答：true
貼文："明天晚上的Live演出門票現正熱賣中，請到主頁連結預購喔！大家不見不散！"
回答：false
貼文："早安呀！今天天氣真好，想聊天的到我主頁加賴"
回答：true
貼文："分享今天的私服穿搭！喜歡的話可以到我的 Linktree 或 IG 追蹤我喔！"
回答：false
貼文："안녕하세요! 오늘 라이브 방송에 와주셔서 감사합니다~ (正常的韓文日常分享)"
回答：false
貼文："こんにちは！投資で稼ぐ方法を教えます。LINEを追加してください (假冒日本人的投資詐騙)"
回答：true
貼文："我寫了一個Thread防詐的chrome外掛，過的時候請大家再幫我測試"
回答：false
貼文："내 친구의 새로운 게시물이야 한번 봐봐! https://www.threads.net/... (韓文分享朋友的站內貼文)"
回答：false
貼文："${text}"
回答:`;
          
          const response = await aiSession.prompt(strictPrompt);
          const resultText = response.trim().toLowerCase();
          const isScam = resultText.includes('true');

          // 【提早寫入快取】AI 算完的瞬間立刻寫入，讓排在後面的兄弟不用再算！
          if (username) userCache.set(username, isScam);
          if (textHash) scanCache.set(textHash, isScam);

          resolve(isScam);
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

// --- 3. 注入 UI (自動清理與復用宿主 + 觀測 Log) ---
function addWarningLabel(postElement, state) {
  const hashForLog = (postElement.getAttribute('data-guard-hash') || '未知').substring(0, 6);
  
  // 只尋找「直屬於」這個貼文框框的宿主 (排除引用貼文)
  const existingHosts = Array.from(postElement.querySelectorAll('.scam-warning-host'))
                             .filter(el => el.parentNode === postElement);

  let host = existingHosts.length > 0 ? existingHosts[0] : null;

  // 清除 React 偷偷複製產生的殘留多餘宿主
  if (existingHosts.length > 1) {
    logDebug(`🧹 [UI 清理] 框框 [${hashForLog}] 發現 ${existingHosts.length - 1} 個多餘幽靈標籤，執行刪除！`);
    for (let i = 1; i < existingHosts.length; i++) {
      existingHosts[i].remove();
    }
  }

  // 狀態沒變就跳過
  if (host && host.getAttribute('data-state') === state) {
    return; 
  }

  postElement.style.position = 'relative';
  postElement.style.overflow = 'visible';

  let label;

  if (!host) {
    logDebug(`✨ [UI 建立] 為框框 [${hashForLog}] 建立全新標籤，狀態: ${state}`);
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
  } else {
    logDebug(`🔄 [UI 更新] 框框 [${hashForLog}] 找到既有標籤，更新狀態為: ${state}`);
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

// --- 4. 處理單一貼文 ---
async function processPost(post) {
  const cloneNode = post.cloneNode(true);
  cloneNode.querySelectorAll('.scam-warning-host').forEach(np => np.remove());
  cloneNode.querySelectorAll('div[data-pressable-container="true"]').forEach(np => np.remove());

  const cleanText = cloneNode.innerText.trim();
  if (!cleanText || cleanText.length < 5) return; 

  const textHash = cleanText.substring(0, 30).replace(/\s/g, '');
  const oldHash = post.getAttribute('data-guard-hash');

  if (oldHash === textHash) {
    return; 
  }

  if (oldHash && oldHash !== textHash) {
    logDebug(`♻️ [DOM 回收偵測] 抓到 React 替換框框！舊: ${oldHash.substring(0,6)} -> 新: ${textHash.substring(0,6)}`);
  }

  post.setAttribute('data-guard-hash', textHash);

  const isVerifiedAccount = post.querySelector('svg[aria-label="已驗證"], svg[aria-label="Verified"]');
  if (isVerifiedAccount) {
    addWarningLabel(post, 'verified');
    return;
  }

  const userLink = post.querySelector('a[href^="/@"]');
  const username = userLink ? userLink.getAttribute('href') : null;

  // 【新增】幫這個貼文框框掛上「帳號名牌」，方便後續全域廣播連動！
  if (username) {
    post.setAttribute('data-guard-user', username);
  }

  const SYSTEM_KEYWORDS = [
    '你的回覆獲得', 
    '你的串文獲得', 
    '為你推薦', 
    '為您推薦',
    '推薦追蹤'
  ];

  let matchedKeyword = null;
  const hasSystemKeyword = SYSTEM_KEYWORDS.some(keyword => {
    if (cleanText.includes(keyword)) {
      matchedKeyword = keyword;
      return true;
    }
    return false;
  });

  const isSystemMessage = !username || hasSystemKeyword;

  if (isSystemMessage) {
    const reason = !username ? '無帳號連結' : `觸發關鍵字 [${matchedKeyword}]`;
    logDebug(`🚫 [系統過濾] 攔截原因: ${reason} | 內文: ${cleanText.substring(0, 15).replace(/\n/g, ' ')}...`);
    
    const oldLabels = post.querySelectorAll('.scam-warning-host');
    if (oldLabels.length > 0) {
      oldLabels.forEach(el => el.remove());
    }
    return; 
  }

  if (username && userCache.has(username)) {
    addWarningLabel(post, userCache.get(username) ? 'scam' : 'safe');
    return;
  }

  if (scanCache.has(textHash)) {
    addWarningLabel(post, scanCache.get(textHash) ? 'scam' : 'safe');
    return;
  }

  if (currentlyProcessingHashes.has(textHash)) {
    addWarningLabel(post, 'scanning');
    return;
  }

  addWarningLabel(post, 'scanning');
  currentlyProcessingHashes.add(textHash);

  const isScam = await checkContent(cleanText, post, username, textHash);

  if (isScam !== null) {
    scanCache.set(textHash, isScam);
    if (username) userCache.set(username, isScam);
    currentlyProcessingHashes.delete(textHash);

    const finalState = isScam ? 'scam' : 'safe';

    // 1. 更新所有「相同文字指紋」的貼文 (例如被引用的相同文章)
    document.querySelectorAll(`div[data-pressable-container="true"][data-guard-hash="${textHash}"]`)
            .forEach(el => addWarningLabel(el, finalState));
            
    // 【關鍵更新】2. 更新畫面上所有「同一個帳號」的貼文！打破排隊視覺延遲！
    if (username) {
      document.querySelectorAll(`div[data-pressable-container="true"][data-guard-user="${username}"]`)
              .forEach(el => addWarningLabel(el, finalState));
    }
  } else {
    currentlyProcessingHashes.delete(textHash);
  }
}

// --- 5 & 6. 掃描與防抖監聽 ---
function scanPosts() {
  const posts = document.querySelectorAll('div[data-pressable-container="true"]');
  posts.forEach(post => processPost(post));
}

let scanTimeout = null;
function debouncedScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => scanPosts(), 300); 
}

initGuardSystem().then(() => {
  scanPosts();
  const observer = new MutationObserver(() => debouncedScan());
  observer.observe(document.body, { childList: true, subtree: true });
});