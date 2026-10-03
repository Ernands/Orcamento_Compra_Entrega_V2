(() => {
  const STYLE_ID = 'purchase-delivery-top-scroll-style';
  const ATTACHED_ATTR = 'data-top-scroll-attached';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .purchase-delivery-scroll.purchase-delivery-scroll--top-controlled {
        scrollbar-width: none;
      }

      .purchase-delivery-scroll.purchase-delivery-scroll--top-controlled::-webkit-scrollbar {
        width: 0;
        height: 0;
      }

      .purchase-delivery-top-scroll {
        width: 100%;
        height: 18px;
        overflow-x: auto;
        overflow-y: hidden;
        background: #f8faf9;
        border-bottom: 1px solid #dce3df;
        scrollbar-gutter: stable;
      }

      .purchase-delivery-top-scroll__spacer {
        height: 1px;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function attachTopScroller(scroll) {
    if (scroll.hasAttribute(ATTACHED_ATTR)) return;

    scroll.setAttribute(ATTACHED_ATTR, 'true');
    scroll.classList.add('purchase-delivery-scroll--top-controlled');

    const topScroll = document.createElement('div');
    topScroll.className = 'purchase-delivery-top-scroll';
    topScroll.setAttribute('aria-label', 'Rolagem horizontal da tabela');
    topScroll.setAttribute('role', 'region');

    const spacer = document.createElement('div');
    spacer.className = 'purchase-delivery-top-scroll__spacer';
    topScroll.appendChild(spacer);
    scroll.parentNode?.insertBefore(topScroll, scroll);

    let syncing = false;

    const syncSize = () => {
      spacer.style.width = `${scroll.scrollWidth}px`;
      const needsScroll = scroll.scrollWidth > scroll.clientWidth + 1;
      topScroll.style.display = needsScroll ? 'block' : 'none';
      topScroll.scrollLeft = scroll.scrollLeft;
    };

    topScroll.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      scroll.scrollLeft = topScroll.scrollLeft;
      window.requestAnimationFrame(() => {
        syncing = false;
      });
    });

    scroll.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      topScroll.scrollLeft = scroll.scrollLeft;
      window.requestAnimationFrame(() => {
        syncing = false;
      });
    });

    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(scroll);
    const table = scroll.querySelector('.purchase-delivery-table');
    if (table) resizeObserver.observe(table);

    syncSize();
  }

  function scan() {
    ensureStyles();
    document.querySelectorAll('.purchase-delivery-scroll').forEach(attachTopScroller);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
