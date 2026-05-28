// ==========================================
// 系統設定與全域變數
// ==========================================
const DEBUG_MODE = true; 

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

// ==========================================
// 核心功能
// ==========================================

// --- 1. 初始化 ---
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

// --- 2. 判斷邏輯 (升級通緝名單) ---
async function checkContent(text, postElement) {
  if (!text) return false;

  const taskId = ++taskIdCounter;
  queuedTasks++;

  return new Promise((resolve) => {
    aiLock = aiLock.then(async () => {
      queuedTasks--;
      
      if (!document.body.contains(postElement)) {
        logDebug(`🗑️ [丟棄] 任務 #${taskId} 貼文已滑走。剩餘排隊: ${queuedTasks}`);
        resolve(null); 
        return;
      }

      logDebug(`▶️ [執行] 任務 #${taskId} 開始推論。文字長度: ${text.length}`);
      timeDebug(`⏱️ 任務 #${taskId} 耗時`);

 if (aiSession) {
        try {
          // 【終極 Prompt】新增「正規商業店鋪與品牌經營」的安全豁免條款
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
          
          logDebug(`🟢 [成功] 任務 #${taskId} 判讀完畢: [${resultText}]`);
          resolve(resultText.includes('true'));
        } catch (error) {
          console.error(`🔴 [錯誤] 任務 #${taskId} 發生異常:`, error);
          resolve(false); 
        } finally {
          timeEndDebug(`⏱️ 任務 #${taskId} 耗時`);
        }
      } else {
        resolve(false);
      }
    }).catch((err) => {
      console.error(`💥 [嚴重錯誤] 隊伍動線斷裂:`, err);
      resolve(false); 
    });
  });
}

// --- 3. 注入 UI (加入嚴謹追蹤 Log，不破壞排版) ---
function addWarningLabel(postElement, state, textHash = "無指紋") {
  const existingLabels = Array.from(postElement.children).filter(el => el.classList.contains('scam-warning-label'));
  
  logDebug(`🔍 [UI 除錯] 準備標記 [${state}] | 指紋: ${textHash.substring(0,8)} | 發現既有標籤數: ${existingLabels.length}`);

  let label = existingLabels.length > 0 ? existingLabels[0] : null;

  if (label && label.getAttribute('data-state') === state) {
    logDebug(`⏭️ [UI 除錯] 狀態同為 [${state}]，跳過渲染。標籤 ID: ${label.getAttribute('data-id')}`);
    return;
  }

  if (existingLabels.length > 1) {
    logDebug(`⚠️ [UI 除錯] 發現 ${existingLabels.length} 個標籤！執行清理，只保留一個。`);
    for (let i = 1; i < existingLabels.length; i++) {
      existingLabels[i].remove();
    }
  }

  postElement.style.position = 'relative';
  postElement.style.overflow = 'visible';

  if (!label) {
    label = document.createElement('div');
    label.className = 'scam-warning-label';
    
    const uniqueId = Math.random().toString(36).substring(2, 7);
    label.setAttribute('data-id', uniqueId);
    logDebug(`✨ [UI 除錯] 建立新標籤 (ID: ${uniqueId})，使用 appendChild 插入。`);

    label.style.color = 'white';
    label.style.padding = '4px 10px';
    label.style.borderRadius = '20px';
    label.style.fontWeight = 'bold';
    label.style.fontSize = '12px';
    label.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    label.style.position = 'absolute';
    label.style.top = '-12px'; 
    label.style.right = '15px';
    label.style.zIndex = '2147483647'; 
    label.style.pointerEvents = 'none'; 

    postElement.appendChild(label);
  } else {
    logDebug(`🔄 [UI 除錯] 原地更新既有標籤 (ID: ${label.getAttribute('data-id')})，切換狀態為 [${state}]。`);
  }

  label.setAttribute('data-state', state);
  
  if (state === 'scanning') {
    label.innerHTML = `⏳ 判讀中...`;
    label.style.backgroundColor = '#ff9800'; 
  } else if (state === 'verified') {
    label.innerHTML = `🛡️ 官方驗證帳號`;
    label.style.backgroundColor = '#1da1f2'; 
  } else if (state === 'scam') {
    label.innerHTML = `⚠️ AI 判定可疑`;
    label.style.backgroundColor = '#ff0040'; 
  } else {
    label.innerHTML = `✅ AI 判定安全`;
    label.style.backgroundColor = '#00c853'; 
  }
}

// --- 4. 處理單一貼文 (虛擬節點取字法) ---
async function processPost(post) {
  // 檢查藍勾勾
  const isVerifiedAccount = post.querySelector('svg[aria-label="已驗證"], svg[aria-label="Verified"]');
  if (isVerifiedAccount) {
    addWarningLabel(post, 'verified');
    return;
  }

  // 檢查帳號快取
  const userLink = post.querySelector('a[href^="/@"]');
  const username = userLink ? userLink.getAttribute('href') : null;
  
  if (username && userCache.has(username)) {
    addWarningLabel(post, userCache.get(username) ? 'scam' : 'safe');
    return;
  }

  // 【保留文字除錯 Log】讓你確認原本會污染的文字是否被成功攔截
  const rawText = post.innerText || "";
  if(rawText.includes("⏳ 判讀中") || rawText.includes("AI 判定") || rawText.includes("官方驗證")) {
     logDebug(`⚠️ [文字除錯] 警告！原始 innerText 抓到了 UI 文字！（已被虛擬節點自動過濾）`);
  }

  // 【優化】虛擬節點複製法，取得 100% 乾淨文字
  const cloneNode = post.cloneNode(true);
  const labelsInClone = cloneNode.querySelectorAll('.scam-warning-label');
  labelsInClone.forEach(l => l.remove());
  const cleanText = cloneNode.innerText.trim();
  
  if (!cleanText || cleanText.length < 5) return; 

  const textHash = cleanText.substring(0, 30).replace(/\s/g, '');

  // 檢查快取
  if (scanCache.has(textHash)) {
    addWarningLabel(post, scanCache.get(textHash) ? 'scam' : 'safe', textHash);
    currentlyProcessingHashes.delete(textHash);
    return;
  }

  if (currentlyProcessingHashes.has(textHash)) {
    addWarningLabel(post, 'scanning', textHash);
    post.setAttribute('data-guard-hash', textHash);
    return;
  }

  post.setAttribute('data-guard-hash', textHash);
  addWarningLabel(post, 'scanning', textHash);
  currentlyProcessingHashes.add(textHash);

  const isScam = await checkContent(cleanText, post);
  
  if (isScam !== null) {
    scanCache.set(textHash, isScam);
    if (username) userCache.set(username, isScam);

    currentlyProcessingHashes.delete(textHash);

    if (document.body.contains(post) && post.getAttribute('data-guard-hash') === textHash) {
      addWarningLabel(post, isScam ? 'scam' : 'safe', textHash);
    } else {
       logDebug(`👻 [UI 除錯] 貼文 DOM 發生變動或指紋不符，放棄渲染最終結果。`);
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
  scanTimeout = setTimeout(() => {
    scanPosts();
  }, 300); 
}

initGuardSystem().then(() => {
  scanPosts();
  const observer = new MutationObserver(() => {
    debouncedScan();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});