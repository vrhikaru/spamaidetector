document.addEventListener('DOMContentLoaded', async () => {
  const statusBox = document.getElementById('aiStatus');
  const instructionsBox = document.getElementById('setupInstructions');
  const downloadSection = document.getElementById('downloadSection');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadProgress = document.getElementById('downloadProgress');

  try {
    if (typeof LanguageModel === 'undefined') {
      showErrorState(statusBox, instructionsBox, '❌ 未偵測到 LanguageModel API。請確認 Chrome 版本與 Flags 設定。');
      return;
    }

    const state = await LanguageModel.availability();

    if (state === 'available') {
      statusBox.textContent = '✅ 內建 AI 已啟用，防護運作中';
      statusBox.className = 'status-box status-ok';
      instructionsBox.style.display = 'none';
      downloadSection.style.display = 'none';
      
    } else if (state === 'downloadable' || state === 'downloading') {
      statusBox.textContent = '⏳ AI 模型需要下載';
      statusBox.className = 'status-box status-error';
      instructionsBox.style.display = 'none';
      
      // 顯示下載區塊
      downloadSection.style.display = 'block';

      // 監聽按鈕點擊事件 (這就是 Chrome 要求的 User Gesture)
      downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = '📥 下載中，請勿關閉瀏覽器...';
        
        try {
          // 觸發下載並監聽進度
          await LanguageModel.create({
            monitor(m) {
              m.addEventListener('downloadprogress', (e) => {
                // 計算下載進度百分比或顯示位元組
                const downloadedMB = (e.loaded / 1024 / 1024).toFixed(1);
                const totalMB = (e.total / 1024 / 1024).toFixed(1);
                downloadProgress.textContent = `進度: ${downloadedMB} MB / ${totalMB} MB`;
              });
            }
          });
          
          // 下載完成
          statusBox.textContent = '✅ 模型下載完成！防護已啟動。';
          statusBox.className = 'status-box status-ok';
          downloadSection.style.display = 'none';
          
        } catch (downloadError) {
          downloadBtn.disabled = false;
          downloadBtn.textContent = '📥 重新嘗試下載';
          downloadProgress.textContent = `下載失敗: ${downloadError.message}`;
        }
      });
      
    } else {
      showErrorState(statusBox, instructionsBox, `⚠️ AI 模型目前無法使用 (狀態: ${state})`);
    }

  } catch (error) {
    console.error("AI 狀態檢查失敗:", error);
    showErrorState(statusBox, instructionsBox, `❌ 存取 AI 發生錯誤：${error.message}`);
  }
});

function showErrorState(statusElement, instructionsElement, message) {
  statusElement.textContent = message;
  statusElement.className = 'status-box status-error';
  instructionsElement.style.display = 'block';
}