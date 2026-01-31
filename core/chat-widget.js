/**
 * L'AGENCE Chat Widget
 *
 * A right-rail chat widget that adapts to the current agent context.
 * Include this script on any page to add the chat functionality.
 *
 * Usage:
 *   <script src="https://your-domain.com/chat-widget.js"></script>
 *
 * Or with custom config:
 *   <script>
 *     window.LAGENCE_CHAT_CONFIG = {
 *       apiUrl: 'http://167.71.145.110:3000',
 *       agentId: 'ecommerce' // Optional override
 *     };
 *   </script>
 *   <script src="https://your-domain.com/chat-widget.js"></script>
 */

(function() {
  'use strict';

  class LagenceChatWidget {
    constructor(config = {}) {
      this.apiUrl = config.apiUrl || window.LAGENCE_CHAT_CONFIG?.apiUrl || 'http://167.71.145.110:3000';
      this.agentId = config.agentId || window.LAGENCE_CHAT_CONFIG?.agentId || this.detectAgent();
      this.sessionKey = `lagence_chat_${this.agentId}`;
      this.messages = this.loadSession();
      this.agent = null;
      this.isOpen = true;
      this.isLoading = false;
      this.pendingClassification = null;

      this.init();
    }

    /**
     * Detect which agent to use based on URL path
     */
    detectAgent() {
      const path = window.location.pathname;
      if (path.startsWith('/ecommerce')) return 'ecommerce';
      if (path.startsWith('/wholesale')) return 'wholesale';
      if (path.startsWith('/design')) return 'design';
      if (path.startsWith('/admin')) return 'admin';
      return 'ecommerce'; // Default to Emma
    }

    /**
     * Load conversation from session storage
     */
    loadSession() {
      try {
        const saved = sessionStorage.getItem(this.sessionKey);
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }

    /**
     * Save conversation to session storage
     */
    saveSession() {
      try {
        sessionStorage.setItem(this.sessionKey, JSON.stringify(this.messages));
      } catch (e) {
        console.warn('Failed to save chat session:', e);
      }
    }

    /**
     * Initialize the widget
     */
    async init() {
      try {
        // Load agent info from API
        const res = await fetch(`${this.apiUrl}/agents/${this.agentId}`);
        if (!res.ok) throw new Error('Failed to load agent');
        const data = await res.json();
        this.agent = data.agent;
      } catch (e) {
        console.warn('Failed to load agent, using defaults:', e);
        this.agent = {
          id: this.agentId,
          name: 'Assistant',
          title: 'L\'AGENCE Agent',
          greeting: 'Hi! How can I help you today?'
        };
      }

      this.injectStyles();
      this.createWidget();
      this.renderMessages();
      this.bindEvents();
    }

    /**
     * Inject CSS styles
     */
    injectStyles() {
      if (document.getElementById('lagence-chat-styles')) return;

      const style = document.createElement('style');
      style.id = 'lagence-chat-styles';
      style.textContent = `
        #lagence-chat-widget {
          position: fixed;
          top: 0;
          right: 0;
          width: 380px;
          height: 100vh;
          background: #fff;
          border-left: 1px solid #e5e5e5;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          z-index: 99999;
          box-shadow: -4px 0 20px rgba(0,0,0,0.08);
          transition: transform 0.3s ease;
        }

        #lagence-chat-widget.minimized {
          transform: translateX(340px);
        }

        #lagence-chat-widget.minimized .chat-toggle-btn {
          transform: rotate(180deg);
        }

        .chat-header {
          padding: 16px 20px;
          background: #000;
          color: #fff;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .chat-agent-info {
          display: flex;
          flex-direction: column;
        }

        .chat-agent-info strong {
          font-size: 16px;
          font-weight: 600;
        }

        .chat-agent-info span {
          font-size: 12px;
          opacity: 0.8;
        }

        .chat-toggle-btn {
          background: none;
          border: none;
          color: #fff;
          cursor: pointer;
          padding: 8px;
          transition: transform 0.3s;
          font-size: 18px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #fafafa;
        }

        .chat-message {
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 16px;
          line-height: 1.5;
          font-size: 14px;
          word-wrap: break-word;
        }

        .chat-message.user {
          align-self: flex-end;
          background: #000;
          color: #fff;
          border-bottom-right-radius: 4px;
        }

        .chat-message.assistant {
          align-self: flex-start;
          background: #fff;
          color: #333;
          border: 1px solid #e5e5e5;
          border-bottom-left-radius: 4px;
        }

        .chat-message.system {
          align-self: center;
          background: #e8f5e9;
          color: #2e7d32;
          font-size: 12px;
          padding: 8px 16px;
          border-radius: 8px;
        }

        .chat-message.system.error {
          background: #ffebee;
          color: #c62828;
        }

        .chat-action-buttons {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .chat-action-btn {
          background: #000;
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .chat-action-btn:hover {
          background: #333;
        }

        .chat-action-btn.secondary {
          background: #e5e5e5;
          color: #333;
        }

        .chat-action-btn.secondary:hover {
          background: #d0d0d0;
        }

        .chat-input-container {
          padding: 16px 20px;
          background: #fff;
          border-top: 1px solid #e5e5e5;
          display: flex;
          gap: 12px;
          flex-shrink: 0;
        }

        .chat-input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #e5e5e5;
          border-radius: 24px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          border-color: #000;
        }

        .chat-input:disabled {
          background: #f5f5f5;
        }

        .chat-send-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #000;
          color: #fff;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
          flex-shrink: 0;
        }

        .chat-send-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .chat-send-btn:hover:not(:disabled) {
          background: #333;
        }

        .chat-send-btn svg {
          width: 20px;
          height: 20px;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 12px 16px;
          background: #fff;
          border: 1px solid #e5e5e5;
          border-radius: 16px;
          border-bottom-left-radius: 4px;
          align-self: flex-start;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: #999;
          border-radius: 50%;
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }

        /* Adjust main content when widget is visible */
        body.lagence-chat-open {
          margin-right: 380px;
          transition: margin-right 0.3s ease;
        }

        body.lagence-chat-minimized {
          margin-right: 40px;
        }

        /* Mobile responsive */
        @media (max-width: 768px) {
          #lagence-chat-widget {
            width: 100%;
          }
          body.lagence-chat-open {
            margin-right: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    /**
     * Create the widget DOM
     */
    createWidget() {
      const widget = document.createElement('div');
      widget.id = 'lagence-chat-widget';
      widget.innerHTML = `
        <div class="chat-header">
          <div class="chat-agent-info">
            <strong>${this.agent.name}</strong>
            <span>${this.agent.title}</span>
          </div>
          <button class="chat-toggle-btn" title="Toggle chat">‹</button>
        </div>
        <div class="chat-messages" id="lagence-chat-messages"></div>
        <div class="chat-input-container">
          <input
            type="text"
            class="chat-input"
            id="lagence-chat-input"
            placeholder="Message ${this.agent.name}..."
          />
          <button class="chat-send-btn" id="lagence-chat-send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/>
            </svg>
          </button>
        </div>
      `;
      document.body.appendChild(widget);
      document.body.classList.add('lagence-chat-open');

      this.widget = widget;
      this.messagesContainer = document.getElementById('lagence-chat-messages');
      this.input = document.getElementById('lagence-chat-input');
      this.sendBtn = document.getElementById('lagence-chat-send');
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
      // Send button
      this.sendBtn.addEventListener('click', () => this.sendMessage());

      // Enter key
      this.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Toggle button
      this.widget.querySelector('.chat-toggle-btn').addEventListener('click', () => {
        this.widget.classList.toggle('minimized');
        document.body.classList.toggle('lagence-chat-minimized');
      });

      // Action buttons (using event delegation)
      this.messagesContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('chat-action-btn')) {
          const action = e.target.dataset.action;
          if (action === 'confirm_change') {
            await this.confirmChange();
          } else if (action === 'approve_plan') {
            await this.approvePlan();
          } else if (action === 'dismiss') {
            this.pendingClassification = null;
            this.addSystemMessage('Okay, let me know if you change your mind.');
          }
          // Disable the buttons after clicking
          e.target.closest('.chat-action-buttons')?.remove();
        }
      });
    }

    /**
     * Render all messages
     */
    renderMessages() {
      this.messagesContainer.innerHTML = '';

      if (this.messages.length === 0) {
        // Show greeting
        this.addMessageToDOM({
          role: 'assistant',
          content: this.agent.greeting
        });
      } else {
        this.messages.forEach(msg => this.addMessageToDOM(msg));
      }
    }

    /**
     * Add a message to the DOM
     */
    addMessageToDOM(message) {
      const div = document.createElement('div');
      div.className = `chat-message ${message.role}`;
      div.textContent = message.content;

      // Add action buttons if present
      if (message.actionButtons) {
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'chat-action-buttons';
        message.actionButtons.forEach(btn => {
          const button = document.createElement('button');
          button.className = `chat-action-btn ${btn.style || ''}`;
          button.dataset.action = btn.action;
          button.textContent = btn.label;
          buttonsDiv.appendChild(button);
        });
        div.appendChild(buttonsDiv);
      }

      this.messagesContainer.appendChild(div);
      this.scrollToBottom();
    }

    /**
     * Add a system message
     */
    addSystemMessage(content, isError = false) {
      const div = document.createElement('div');
      div.className = `chat-message system${isError ? ' error' : ''}`;
      div.textContent = content;
      this.messagesContainer.appendChild(div);
      this.scrollToBottom();
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
      const indicator = document.createElement('div');
      indicator.className = 'typing-indicator';
      indicator.id = 'lagence-typing-indicator';
      indicator.innerHTML = '<span></span><span></span><span></span>';
      this.messagesContainer.appendChild(indicator);
      this.scrollToBottom();
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
      document.getElementById('lagence-typing-indicator')?.remove();
    }

    /**
     * Scroll to bottom of messages
     */
    scrollToBottom() {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * Send a message
     */
    async sendMessage() {
      const content = this.input.value.trim();
      if (!content || this.isLoading) return;

      // Add user message
      const userMessage = { role: 'user', content };
      this.messages.push(userMessage);
      this.addMessageToDOM(userMessage);
      this.saveSession();

      this.input.value = '';
      this.input.disabled = true;
      this.sendBtn.disabled = true;
      this.isLoading = true;
      this.showTypingIndicator();

      try {
        const response = await fetch(`${this.apiUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: this.agentId,
            messages: this.messages.map(m => ({
              role: m.role,
              content: m.content
            }))
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        this.hideTypingIndicator();

        const assistantMessage = {
          role: 'assistant',
          content: data.message
        };

        // Check if this is a capability change request
        if (data.classification?.request_type === 'capability_tweak' &&
            data.classification?.can_auto_pr &&
            !data.action_taken) {
          this.pendingClassification = data.classification;
          assistantMessage.actionButtons = [
            { label: 'Create PR for this change', action: 'confirm_change' },
            { label: 'Not now', action: 'dismiss', style: 'secondary' }
          ];
        } else if (data.classification?.requires_plan_approval &&
                   !data.action_taken) {
          this.pendingClassification = data.classification;
          assistantMessage.actionButtons = [
            { label: 'Approve this plan', action: 'approve_plan' },
            { label: 'Let me think about it', action: 'dismiss', style: 'secondary' }
          ];
        }

        // Show PR link if created
        if (data.action_taken?.type === 'pr_created') {
          this.addSystemMessage(`PR created: ${data.action_taken.pr_url}`);
        }

        this.messages.push(assistantMessage);
        this.addMessageToDOM(assistantMessage);
        this.saveSession();

      } catch (error) {
        this.hideTypingIndicator();
        this.addSystemMessage(`Error: ${error.message}`, true);
      }

      this.input.disabled = false;
      this.sendBtn.disabled = false;
      this.isLoading = false;
      this.input.focus();
    }

    /**
     * Confirm a capability change (create PR)
     */
    async confirmChange() {
      if (!this.pendingClassification) return;

      this.showTypingIndicator();

      try {
        const response = await fetch(`${this.apiUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: this.agentId,
            messages: this.messages.map(m => ({ role: m.role, content: m.content })),
            confirm_change: true
          })
        });

        const data = await response.json();
        this.hideTypingIndicator();

        if (data.action_taken?.pr_url) {
          this.addSystemMessage(`PR created! Review it here: ${data.action_taken.pr_url}`);
        } else if (data.action_taken?.error) {
          this.addSystemMessage(`Failed to create PR: ${data.action_taken.error}`, true);
        }
      } catch (error) {
        this.hideTypingIndicator();
        this.addSystemMessage(`Error: ${error.message}`, true);
      }

      this.pendingClassification = null;
    }

    /**
     * Approve a plan proposal
     */
    async approvePlan() {
      if (!this.pendingClassification) return;

      this.showTypingIndicator();

      try {
        const response = await fetch(`${this.apiUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: this.agentId,
            messages: this.messages.map(m => ({ role: m.role, content: m.content })),
            approve_plan: true
          })
        });

        const data = await response.json();
        this.hideTypingIndicator();

        if (data.action_taken?.proposal_id) {
          this.addSystemMessage(`Plan approved and saved for implementation. I'll work on this and create a PR when ready.`);
        }
      } catch (error) {
        this.hideTypingIndicator();
        this.addSystemMessage(`Error: ${error.message}`, true);
      }

      this.pendingClassification = null;
    }

    /**
     * Clear chat history
     */
    clearHistory() {
      this.messages = [];
      sessionStorage.removeItem(this.sessionKey);
      this.renderMessages();
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.lagenceChat = new LagenceChatWidget();
    });
  } else {
    window.lagenceChat = new LagenceChatWidget();
  }

  // Expose class for manual initialization
  window.LagenceChatWidget = LagenceChatWidget;
})();
