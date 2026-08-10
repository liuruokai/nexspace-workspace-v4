/**
 * NexSpace UI 组件库
 * ----------------------------------------------------------------
 * - Toast: 成功 / 错误 / 警告 / 信息
 * - Modal: 自定义模态框
 * - Confirm: 确认对话框
 * - 选择器辅助
 */
(function (global) {
  'use strict';
  const { escapeHtml, EventBus } = global.NS;

  /* ================== Toast ================== */
  const toastContainer = () => document.getElementById('toast-container');
  function Toast(options = {}) {
    const {
      type = 'info', // info/success/error/warning
      message = '',
      duration = 2400,
      icon = null
    } = options;
    const root = toastContainer();
    if (!root) return;
    const el = document.createElement('div');
    const iconMap = {
      success: 'mdi:check-circle',
      error: 'mdi:close-circle',
      warning: 'mdi:alert-circle',
      info: 'mdi:information'
    };
    el.className = `toast ${type}`;
    el.innerHTML = `
      <iconify-icon icon="${icon || iconMap[type] || iconMap.info}" class="text-lg"></iconify-icon>
      <span>${escapeHtml(message)}</span>
    `;
    root.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 280);
    }, duration);
  }
  const toast = Toast;

  /* ================== Modal ================== */
  function Modal({ title = '', content = '', footer = '', onClose = null, size = 'md' }) {
    const root = document.getElementById('modal-container');
    if (!root) return null;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const widthMap = { sm: '420px', md: '600px', lg: '840px', xl: '1080px' };
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:${widthMap[size] || widthMap.md}">
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 class="text-base font-semibold">${escapeHtml(title)}</h3>
          <button class="modal-close p-2 hover:bg-white/10 rounded-lg">
            <iconify-icon icon="mdi:close" class="text-lg"></iconify-icon>
          </button>
        </div>
        <div class="modal-body px-6 py-4">${content}</div>
        ${footer ? `<div class="modal-footer px-6 py-3 border-t border-white/10 flex justify-end gap-2">${footer}</div>` : ''}
      </div>
    `;
    root.appendChild(overlay);
    const close = () => {
      overlay.remove();
      onClose && onClose();
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    return { root: overlay, close };
  }

  async function Confirm({ title = '确认', message = '', confirmText = '确定', cancelText = '取消', danger = false }) {
    return new Promise((resolve) => {
      const m = Modal({
        title,
        content: `<p class="text-sm">${escapeHtml(message)}</p>`,
        footer: `
          <button class="btn-ghost cancel-btn">${escapeHtml(cancelText)}</button>
          <button class="${danger ? 'btn-danger' : 'btn-primary'} confirm-btn"
                  style="${danger ? 'padding:8px 16px;font-size:13px;' : ''}">${escapeHtml(confirmText)}</button>
        `,
        size: 'sm'
      });
      m.root.querySelector('.cancel-btn').addEventListener('click', () => { m.close(); resolve(false); });
      m.root.querySelector('.confirm-btn').addEventListener('click', () => { m.close(); resolve(true); });
    });
  }

  /* ================== Prompt ================== */
  async function Prompt({
    title = '输入',
    message = '',
    placeholder = '',
    defaultValue = '',
    confirmText = '确定',
    cancelText = '取消',
    multiline = false
  }) {
    return new Promise((resolve) => {
      const inputHtml = multiline
        ? `<textarea class="textarea mt-2" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea>`
        : `<input class="input mt-2" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" />`;
      const m = Modal({
        title,
        content: `<p class="text-sm text-slate-500">${escapeHtml(message)}</p>${inputHtml}`,
        footer: `
          <button class="btn-ghost cancel-btn">${escapeHtml(cancelText)}</button>
          <button class="btn-primary confirm-btn">${escapeHtml(confirmText)}</button>
        `,
        size: 'sm',
        onClose: () => resolve(null)
      });
      const input = m.root.querySelector('input, textarea');
      setTimeout(() => input && input.focus(), 50);
      m.root.querySelector('.cancel-btn').addEventListener('click', () => m.close());
      m.root.querySelector('.confirm-btn').addEventListener('click', () => {
        const v = input.value;
        m.close();
        resolve(v);
      });
      if (!multiline) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            const v = input.value;
            m.close();
            resolve(v);
          }
        });
      }
    });
  }

  /* ================== 日期/颜色小工具 ================== */
  function priorityColor(p) {
    return { high: 'var(--accent-coral)', medium: '#fbbf24', low: 'var(--accent-mint)' }[p] || '#fbbf24';
  }
  function priorityLabel(p) {
    return { high: '紧急', medium: '普通', low: '低优' }[p] || '普通';
  }

  /** 时间戳 → 友好相对时间（基于 relTime） */
  function relTime(ts) {
    return global.NS.relTime(ts);
  }

  /* ================== 暴露 ================== */
  Object.assign(global.NS, {
    Toast,
    toast,
    Modal,
    Confirm,
    Prompt,
    priorityColor,
    priorityLabel
  });
})(window);
