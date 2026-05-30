document.addEventListener('DOMContentLoaded', async () => {
  const statusBox = document.getElementById('aiStatus');
  const instructionsBox = document.getElementById('setupInstructions');
  const downloadSection = document.getElementById('downloadSection');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadProgress = document.getElementById('downloadProgress');

  try {
    // 1. 恢復使用你原本會通的 LanguageModel 檢查
    if (typeof LanguageModel === 'undefined') {
      showErrorState(statusBox, instructionsBox, '❌ 未偵測到 LanguageModel API。請確認 Chrome 版本與 Flags 設定。');
      return;
    }

    // 2. 恢復使用你原本會通的 availability() 檢查狀態
    const state = await LanguageModel.availability();

    // 為了相容性，同時判斷舊版與新版的狀態字串
    if (state === 'available' || state === 'readily') {
      statusBox.textContent = '✅ 內建 AI 已啟用，防護運作中';
      statusBox.className = 'status-box status-ok';
      instructionsBox.style.display = 'none';
      downloadSection.style.display = 'none';
      
    } else if (state === 'downloadable' || state === 'downloading' || state === 'after-download') {
      statusBox.textContent = '⏳ AI 模型需要下載';
      statusBox.className = 'status-box status-error';
      instructionsBox.style.display = 'none';
      
      downloadSection.style.display = 'block';

      downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = '📥 下載中，請勿關閉瀏覽器...';
        
        try {
          // 3. 觸發下載：使用你提供的 expectedOutputs 陣列寫法
          await LanguageModel.create({
            expectedInputs: [{ type: "text" , languages: ["en","ja","zh"]}],
            expectedOutputs: [{ type: "text" , languages: ["en","ja","zh"]}],
            monitor(m) {
              m.addEventListener('downloadprogress', (e) => {
                const downloadedMB = (e.loaded / 1024 / 1024).toFixed(1);
                const totalMB = (e.total / 1024 / 1024).toFixed(1);
                downloadProgress.textContent = `進度: ${downloadedMB} MB / ${totalMB} MB`;
              });
            }
          });
          
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