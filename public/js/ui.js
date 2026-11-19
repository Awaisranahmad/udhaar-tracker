'use strict';

/**
 * DOM helpers. User data is ALWAYS rendered with textContent - never
 * innerHTML - so a name like `<script>alert(1)</script>` is shown as text,
 * not executed. This is the frontend half of the XSS defence.
 */
const ui = (() => {
  function el(tag, text, attrs = {}) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else node.setAttribute(key, value);
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function formatPkr(paisa) {
    const sign = paisa < 0 ? '-' : '';
    const abs = Math.abs(paisa);
    const rupees = Math.floor(abs / 100);
    const ps = abs % 100;
    return `${sign}Rs ${rupees.toLocaleString('en-PK')}.${String(ps).padStart(2, '0')}`;
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.classList.toggle('error', isError);
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 4000);
  }

  return { el, clear, formatPkr, toast };
})();
