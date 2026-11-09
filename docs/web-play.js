// Public website only: play links, backup guidance, and aggregate session counts.
(function () {
  const copy = {
    'zh-HK': { play: '即刻玩', title: '累計網頁遊玩人次', pending: '暫未提供', stale: '暫未更新', limited: '統計受限',
      detail: '正式網頁版開始遊玩滿 10 秒嘅已記錄人次，唔係獨立玩家數；離線或封鎖統計可能未計入。',
      since: '開始統計', updated: '最後更新', heading: '網頁遊玩同存檔備份',
      help: '毋須安裝或登入。Save 會存喺呢個瀏覽器；File → 下載城市存檔可以備份，再喺另一部機或桌面版用「匯入城市存檔」繼續。清除網站資料或無痕模式可能令本機存檔消失。城市唔會自動上傳，亦冇跨裝置自動同步。',
      platforms: '網頁首版支援桌面瀏覽器、滑鼠同鍵盤；AI 雲端新聞同即時海域報告暫限桌面版。' },
    'zh-TW': { play: '線上遊玩', title: '累計網頁遊玩人次', pending: '暫未提供', stale: '暫未更新', limited: '統計受限',
      detail: '正式網頁版開始遊玩滿 10 秒的已記錄人次，並非獨立玩家數；離線或封鎖統計可能未計入。',
      since: '開始統計', updated: '最後更新', heading: '線上遊玩與存檔備份',
      help: '不必安裝或登入。Save 會儲存在這個瀏覽器；File → 下載城市存檔可備份，再到另一台裝置或桌面版「匯入城市存檔」繼續。清除網站資料或無痕模式可能使本機存檔消失。城市不會自動上傳，也沒有跨裝置自動同步。',
      platforms: '網頁首版支援桌面瀏覽器、滑鼠與鍵盤；AI 雲端新聞與即時海域報告暫限桌面版。' },
    en: { play: 'Play in Browser', title: 'Recorded Web Play Sessions', pending: 'Unavailable', stale: 'Not updated', limited: 'Counting limited',
      detail: 'Recorded sessions with at least 10 seconds of play in the official browser game, not unique players. Offline or blocked events may be missing.',
      since: 'Counting since', updated: 'Last updated', heading: 'Browser play and city backups',
      help: 'No installation or sign-in is needed. Save keeps your city in this browser. Use File → Download City to back up, then Import City on another device or in the desktop game. Clearing site data or using private browsing can remove local saves. Cities are not automatically uploaded or synced across devices.',
      platforms: 'The first browser release supports desktop browsers, a mouse and keyboard. Cloud AI news and live coastal reports remain desktop features.' },
    ja: { play: 'ブラウザーで遊ぶ', title: '累計ブラウザープレイ回数', pending: '現在利用できません', stale: '未更新', limited: '集計制限中',
      detail: '公式ブラウザー版で10秒以上遊んだ記録済みセッション数です。利用者の実人数ではありません。オフラインや送信の遮断により集計されない場合があります。',
      since: '集計開始', updated: '最終更新', heading: 'ブラウザープレイと都市のバックアップ',
      help: 'インストールやログインは不要です。Saveはこのブラウザーに都市を保存します。File → 都市セーブをダウンロードでバックアップし、別の端末やデスクトップ版で読み込めます。サイトデータの削除やプライベートモードで保存が消える場合があります。都市の自動アップロードや端末間の自動同期はありません。',
      platforms: '初版はデスクトップブラウザー、マウスとキーボードに対応します。クラウドAIニュースとリアルタイム海域情報はデスクトップ版の機能です。' },
  };
  const cacheKey = 'heung-shing.website-play-stats.v1';
  let stats = null, stale = false;
  function render() {
    const language = typeof siteCurrentLanguage === 'string' ? siteCurrentLanguage : 'zh-HK';
    const words = copy[language] || copy['zh-HK'];
    document.querySelectorAll('[data-web-copy]').forEach(node => { node.textContent = words[node.dataset.webCopy] || ''; });
    const value = document.querySelector('[data-web-play-total]');
    if (!value) return;
    value.textContent = stats ? new Intl.NumberFormat(language).format(stats.webPlaySessions) : words.pending;
    const info = document.querySelector('[data-web-play-time]');
    if (info) info.textContent = stats ? `${words.since}: ${new Date(stats.since).toLocaleDateString(language)} · ${words.updated}: ${new Date(stats.updatedAt).toLocaleString(language)}${stale ? ` · ${words.stale}` : stats.status === 'limited' ? ` · ${words.limited}` : ''}` : '';
  }
  async function initialize() {
    try {
      const candidate = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (candidate && Number.isSafeInteger(candidate.webPlaySessions) && candidate.webPlaySessions >= 0
        && Number.isFinite(Date.parse(candidate.since)) && Number.isFinite(Date.parse(candidate.updatedAt))) { stats = candidate; stale = true; }
    } catch {}
    render();
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    try {
      const response = await fetch('release-manifest.json', { cache: 'no-cache', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const release = await response.json();
      if (release.available === true && /^https:\/\//.test(release.playUrl)) {
        document.querySelectorAll('[data-web-play-link]').forEach(link => { link.href = release.playUrl; link.hidden = false; });
        const names = { 'mac-arm64': /-arm64\.dmg$/, 'mac-x64': /-x64\.dmg$/,
          'windows-setup': /\.Setup\.[\d.]+\.exe$/, 'windows-portable': /\.Shing\.[\d.]+\.exe$/ };
        document.querySelectorAll('[data-download-link]').forEach(link => {
          const filename = release.desktopAssets?.find(name => names[link.dataset.downloadLink]?.test(name));
          if (filename) link.href = `https://github.com/nortonyuen-oss/heung_shing_simulator/releases/download/v${release.version}/${encodeURIComponent(filename)}`;
        });
      }
      if (!/^https:\/\//.test(release.statisticsUrl || '')) return;
      const result = await fetch(`${release.statisticsUrl}/v1/stats`, { signal: AbortSignal.timeout(5000) });
      if (!result.ok) throw new Error('Statistics unavailable');
      const data = await result.json();
      if (!Number.isSafeInteger(data.webPlaySessions) || data.webPlaySessions < 0
        || !Number.isFinite(Date.parse(data.since)) || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error('Invalid statistics');
      stats = data; stale = false;
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
    } catch { stale = true; }
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
