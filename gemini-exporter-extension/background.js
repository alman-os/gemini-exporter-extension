chrome.action.onClicked.addListener((tab) => {
  // --- NEW: Safety Check ---
  // Prevent running on restricted chrome:// or edge:// pages
  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
    console.log("⚠️ Cannot run on system pages.");
    return;
  }
  // ------------------------

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: exportGeminiChat
  });
});

function exportGeminiChat() {
  // Shadow DOM breaker
  const deepQuerySelectorAll = (selector, root = document) => {
    const results = [];
    const nodes = root.querySelectorAll(selector);
    results.push(...Array.from(nodes));
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        results.push(...deepQuerySelectorAll(selector, el.shadowRoot));
      }
    });
    return results;
  };

  // --- START OF NEW TITLE LOGIC (Preserving our previous fix!) ---
  const getChatTitle = () => {
    // Priority 1: The Visual Header
    const visualTitle = document.querySelector('.conversation-title');
    if (visualTitle && visualTitle.innerText.trim()) {
      return visualTitle.innerText.trim();
    }

    // Priority 2: The Browser Tab (Fallback)
    const docTitle = document.querySelector('title');
    if (docTitle) {
      const cleaned = docTitle.innerText.replace(/Google/g, '').replace(/Gemini/g, '').replace(/ - /g, '').trim();
      if (cleaned) return cleaned;
    }

    // Priority 3: Safety Net
    return 'Gemini_Export';
  };
  // --- END OF NEW TITLE LOGIC ---

  const getTimestamp = () => new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const chatTitle = getChatTitle();

  function htmlToMd(html) {
    let text = html;
    text = text.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gim, '');
    text = text.replace(/<button[^>]*>[\s\S]*?<\/button>/gim, '');
    text = text.replace(/<(code-block|pre)[^>]*>([\s\S]*?)<\/(code-block|pre)>/gim, (m) => {
      const code = m.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
      return code ? '\n```\n' + code[1].replace(/<[^>]+>/g, '').trim() + '\n```\n' : '';
    });
    text = text.replace(/<h[123][^>]*>(.*?)<\/h[123]>/gim, (m, c) => (m.startsWith('<h1') ? '#' : m.startsWith('<h2') ? '##' : '###') + ' ' + c.trim() + '\n');
    text = text.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gim, '**$2**');
    text = text.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gim, '*$2*');
    text = text.replace(/<code[^>]*>(.*?)<\/code>/gim, '`$1`');
    text = text.replace(/<a href="(.*?)"[^>]*>(.*?)<\/a>/gim, '[$2]($1)');
    text = text.replace(/<ul>([\s\S]*?)<\/ul>/gim, (m, c) => c.replace(/<li>(.*?)<\/li>/gim, '- $1\n'));
    text = text.replace(/<ol>([\s\S]*?)<\/ol>/gim, (m, c) => {let i = 1; return c.replace(/<li>(.*?)<\/li>/gim, () => (i++) + '. $1\n');});
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gim, '$1\n\n');
    text = text.replace(/<br\s*\/?>/gim, '\n');
    const t = document.createElement('textarea');
    t.innerHTML = text.replace(/<[^>]+>/g, '').trim();
    return t.value.trim();
  }

  const selector = '.query-text, .markdown-main-panel';
  const turns = deepQuerySelectorAll(selector);
  
  if (!turns.length) {
    alert('⚠️ No messages found!');
    return;
  }

  let content = `# ${chatTitle}\n*Exported: ${getTimestamp()}*\n\n---\n\n`;
  
  Array.from(turns).forEach(t => {
    let role = '';
    let htmlData = t.innerHTML;
    if (t.classList.contains('query-text')) {
      role = 'User';
    } else if (t.classList.contains('markdown-main-panel')) {
      role = 'Gemini';
    }
    if (role && htmlData.trim()) {
      content += `### ${role}\n\n${htmlToMd(htmlData)}\n\n---\n\n`;
    }
  });

  content = content.replace(/### Gemini/g, '### ChatGPT');

  navigator.clipboard.writeText(content).then(() => {
    alert('✅ Copied to clipboard!');
  }).catch(() => {
    const b = new Blob([content], {type: 'text/markdown'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${chatTitle.replace(/[^a-z0-9]/gi, '_').substring(0,50)}_${getTimestamp()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    alert('⚠️ Downloaded file instead!');
  });
}