const API_BASE = "/api";
const STORAGE_KEY = "gemma_portfolio_v1";
const THEME_STORAGE_KEY = "gemma_theme";
const MODEL_NAME_STORAGE_KEY = "gemma_model_display_name";
const MAX_CONTEXT_MESSAGES = 12;
const MAX_FILE_SIZE_BYTES = 200_000;
const SUPPORTED_EXTENSIONS = new Set([
  "txt",
  "md",
  "py",
  "js",
  "ts",
  "tsx",
  "json",
  "csv",
  "xml",
  "html",
  "css",
  "yml",
  "yaml",
  "ini",
  "toml",
]);

const state = {
  conversations: [],
  activeId: null,
  attachments: [],
  busy: false,
  modelDisplayName: "Gemma",
  statusMode: "checking",
  runtimeModelTag: "",
};

const elements = {
  appShell: document.getElementById("appShell"),
  attachmentStrip: document.getElementById("attachmentStrip"),
  brandMark: document.getElementById("brandMark"),
  chatTitleInput: document.getElementById("chatTitleInput"),
  clearBtn: document.getElementById("clearBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  contextPill: document.getElementById("contextPill"),
  conversationCount: document.getElementById("conversationCount"),
  conversationList: document.getElementById("conversationList"),
  emptyState: document.getElementById("emptyState"),
  fileInput: document.getElementById("fileInput"),
  helperCopy: document.getElementById("helperCopy"),
  messageSurface: document.getElementById("messageSurface"),
  modelDisplayLabel: document.getElementById("modelDisplayLabel"),
  modelNameInput: document.getElementById("modelNameInput"),
  newChatBtn: document.getElementById("newChatBtn"),
  promptInput: document.getElementById("promptInput"),
  resetSettingsBtn: document.getElementById("resetSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  searchInput: document.getElementById("searchInput"),
  sidebar: document.getElementById("sidebar"),
  sidebarBackdrop: document.getElementById("sidebarBackdrop"),
  sidebarCloseBtn: document.getElementById("sidebarCloseBtn"),
  sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
  settingsCloseBtn: document.getElementById("settingsCloseBtn"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  settingsPopover: document.getElementById("settingsPopover"),
  settingsToggleBtn: document.getElementById("settingsToggleBtn"),
  sidebarCopy: document.getElementById("sidebarCopy"),
  sendBtn: document.getElementById("sendBtn"),
  statusPill: document.getElementById("statusPill"),
  themeToggle: document.getElementById("themeToggle"),
  workspaceTitle: document.getElementById("workspaceTitle"),
};

function boot() {
  hydrateTheme();
  hydrateModelSettings();
  hydrate();
  bindEvents();
  toggleSettingsPanel(false);
  syncViewportLayout();
  renderConversationList();
  loadConversation(state.activeId);
  pingHealth();
  setInterval(pingHealth, 20000);
  autoResize(elements.promptInput);
  elements.promptInput.focus();
}

function bindEvents() {
  elements.newChatBtn.addEventListener("click", createConversation);
  elements.clearBtn.addEventListener("click", clearConversation);
  elements.searchInput.addEventListener("input", () => renderConversationList(elements.searchInput.value));
  elements.fileInput.addEventListener("change", event => handleFiles(event.target.files));
  elements.sendBtn.addEventListener("click", sendMessage);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.sidebarToggleBtn.addEventListener("click", event => {
    event.preventDefault();
    toggleSidebar();
  });
  elements.sidebarCloseBtn.addEventListener("click", event => {
    event.preventDefault();
    toggleSidebar(false);
  });
  elements.sidebarBackdrop.addEventListener("click", () => {
    toggleSidebar(false);
  });
  elements.settingsToggleBtn.addEventListener("click", event => {
    event.stopPropagation();
    if (isMobileViewport()) {
      toggleSidebar(false);
    }
    toggleSettingsPanel();
  });
  elements.settingsCloseBtn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleSettingsPanel(false);
  });
  elements.settingsOverlay.addEventListener("click", event => {
    if (!elements.settingsPopover.contains(event.target)) {
      toggleSettingsPanel(false);
    }
  });
  elements.saveSettingsBtn.addEventListener("click", saveModelSettings);
  elements.resetSettingsBtn.addEventListener("click", resetModelSettings);
  elements.clearHistoryBtn.addEventListener("click", clearHistory);
  elements.modelNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveModelSettings();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      toggleSettingsPanel(false);
    }
  });
  elements.chatTitleInput.addEventListener("blur", commitConversationTitle);
  elements.chatTitleInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      elements.chatTitleInput.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      const conversation = getActiveConversation();
      elements.chatTitleInput.value = conversation ? conversation.title : "New conversation";
      elements.chatTitleInput.blur();
    }
  });
  elements.promptInput.addEventListener("input", () => autoResize(elements.promptInput));
  elements.promptInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  document.querySelectorAll("[data-suggestion]").forEach(button => {
    button.addEventListener("click", () => {
      elements.promptInput.value = button.dataset.suggestion || "";
      autoResize(elements.promptInput);
      elements.promptInput.focus();
    });
  });

  window.addEventListener("keydown", event => {
    if (event.key !== "Escape") {
      return;
    }

    if (!elements.settingsOverlay.hidden) {
      toggleSettingsPanel(false);
      return;
    }

    if (elements.appShell.classList.contains("is-sidebar-open")) {
      toggleSidebar(false);
    }
  });
  window.addEventListener("resize", syncViewportLayout);
}

function hydrateModelSettings() {
  try {
    const storedValue = localStorage.getItem(MODEL_NAME_STORAGE_KEY);
    state.modelDisplayName = normalizeModelDisplayName(storedValue || "Gemma");
  } catch {
    state.modelDisplayName = "Gemma";
  }

  applyModelDisplayName();
}

function normalizeModelDisplayName(value) {
  const nextValue = String(value || "").trim().replace(/\s+/g, " ");
  return nextValue || "Gemma";
}

function getAssistantName() {
  return state.modelDisplayName;
}

function getAssistantInitial() {
  return getAssistantName().charAt(0).toUpperCase() || "G";
}

function buildStatusLabel(mode) {
  const modelName = getAssistantName().toUpperCase();
  if (mode === "online") {
    return `${modelName} ONLINE`;
  }
  if (mode === "offline") {
    return `${modelName} OFFLINE`;
  }
  return `CHECKING ${modelName}`;
}

function applyModelDisplayName() {
  const assistantName = getAssistantName();
  elements.brandMark.textContent = getAssistantInitial();
  elements.workspaceTitle.textContent = `${assistantName} Workspace`;
  elements.sidebarCopy.textContent = `A lightweight chat UI for a ${assistantName} model running through Ollama completely locally.`;
  elements.promptInput.placeholder = `Message ${assistantName} locally…`;
  elements.modelDisplayLabel.textContent = `Model name: ${assistantName}`;
  elements.modelNameInput.value = assistantName;
  setStatus(state.statusMode, state.runtimeModelTag);

  const conversation = getActiveConversation();
  if (conversation) {
    renderMessages(conversation);
  }
}

function toggleSettingsPanel(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : elements.settingsOverlay.hidden;
  elements.settingsOverlay.hidden = !shouldOpen;
  elements.settingsToggleBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");

  if (!shouldOpen) {
    elements.modelNameInput.value = getAssistantName();
    return;
  }

  elements.modelNameInput.value = getAssistantName();
  elements.modelNameInput.focus();
  elements.modelNameInput.select();
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function toggleSidebar(forceOpen) {
  if (isMobileViewport()) {
    const shouldOpen = typeof forceOpen === "boolean"
      ? forceOpen
      : !elements.appShell.classList.contains("is-sidebar-open");

    elements.appShell.classList.toggle("is-sidebar-open", shouldOpen);
    elements.appShell.classList.remove("is-sidebar-collapsed");
    elements.sidebarToggleBtn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    return;
  }

  const shouldShow = typeof forceOpen === "boolean"
    ? forceOpen
    : elements.appShell.classList.contains("is-sidebar-collapsed");

  elements.appShell.classList.remove("is-sidebar-open");
  elements.appShell.classList.toggle("is-sidebar-collapsed", !shouldShow);
  elements.sidebarToggleBtn.setAttribute("aria-expanded", shouldShow ? "true" : "false");
}

function syncViewportLayout() {
  if (isMobileViewport()) {
    elements.appShell.classList.remove("is-sidebar-collapsed");
    elements.appShell.classList.remove("is-sidebar-open");
    elements.sidebarToggleBtn.setAttribute("aria-expanded", "false");
    return;
  }

  elements.appShell.classList.remove("is-sidebar-open");
  elements.sidebarToggleBtn.setAttribute(
    "aria-expanded",
    elements.appShell.classList.contains("is-sidebar-collapsed") ? "false" : "true",
  );
}

function saveModelSettings() {
  state.modelDisplayName = normalizeModelDisplayName(elements.modelNameInput.value);

  try {
    localStorage.setItem(MODEL_NAME_STORAGE_KEY, state.modelDisplayName);
  } catch {
    // Ignore storage failures and keep the in-memory setting.
  }

  applyModelDisplayName();
  toggleSettingsPanel(false);
}

function resetModelSettings() {
  state.modelDisplayName = "Gemma";

  try {
    localStorage.removeItem(MODEL_NAME_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the in-memory setting.
  }

  applyModelDisplayName();
  toggleSettingsPanel(false);
}

function hydrateTheme() {
  const savedTheme = getStoredTheme();
  const theme = savedTheme || getSystemTheme();
  applyTheme(theme, false);
}

function getStoredTheme() {
  try {
    const theme = localStorage.getItem(THEME_STORAGE_KEY);
    return theme === "dark" || theme === "light" ? theme : "";
  } catch {
    return "";
  }
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(currentTheme === "dark" ? "light" : "dark", true);
}

function applyTheme(theme, persistTheme) {
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  elements.themeToggle.setAttribute("title", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  elements.themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");

  if (!persistTheme) {
    return;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep the in-memory theme.
  }
}

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.conversations = raw ? JSON.parse(raw) : [];
  } catch {
    state.conversations = [];
  }

  if (!state.conversations.length) {
    const conversation = makeConversation();
    state.conversations = [conversation];
  }

  state.activeId = state.conversations[0].id;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
}

function makeConversation() {
  const timestamp = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  };
}

function getActiveConversation() {
  return state.conversations.find(conversation => conversation.id === state.activeId) || null;
}

function createConversation() {
  const conversation = makeConversation();
  state.conversations.unshift(conversation);
  state.activeId = conversation.id;
  state.attachments = [];
  persist();
  renderAttachments();
  renderConversationList();
  loadConversation(conversation.id);
  elements.promptInput.focus();
}

function commitConversationTitle() {
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }

  const nextTitle = elements.chatTitleInput.value.trim() || "New conversation";
  conversation.title = nextTitle;
  conversation.updatedAt = Date.now();
  elements.chatTitleInput.value = nextTitle;
  persist();
  renderConversationList(elements.searchInput.value);
}

function clearConversation() {
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }

  conversation.messages = [];
  conversation.title = "New conversation";
  conversation.updatedAt = Date.now();
  persist();
  loadConversation(conversation.id);
  renderConversationList(elements.searchInput.value);
}

function clearHistory() {
  if (state.busy) {
    setHelperCopy("Wait for the current response to finish before clearing history.");
    return;
  }

  const conversation = makeConversation();
  state.conversations = [conversation];
  state.activeId = conversation.id;
  state.attachments = [];
  elements.searchInput.value = "";
  elements.promptInput.value = "";
  autoResize(elements.promptInput);
  renderAttachments();
  persist();
  renderConversationList();
  loadConversation(conversation.id);
  setHelperCopy("Conversation history cleared.");
  toggleSettingsPanel(false);
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter(conversation => conversation.id !== id);
  if (!state.conversations.length) {
    state.conversations.push(makeConversation());
  }

  if (!state.conversations.some(conversation => conversation.id === state.activeId)) {
    state.activeId = state.conversations[0].id;
  }

  persist();
  renderConversationList(elements.searchInput.value);
  loadConversation(state.activeId);
}

function loadConversation(id) {
  state.activeId = id;
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }

  if (isMobileViewport()) {
    toggleSidebar(false);
  }
  elements.chatTitleInput.value = conversation.title;
  updateContextPill(conversation.messages.length);
  renderConversationList(elements.searchInput.value);
  renderMessages(conversation);
}

function renderConversationList(filter = "") {
  const query = filter.trim().toLowerCase();
  const filtered = state.conversations.filter(conversation => {
    return !query || conversation.title.toLowerCase().includes(query);
  });

  elements.conversationCount.textContent = `${filtered.length} ${filtered.length === 1 ? "chat" : "chats"}`;
  elements.conversationList.innerHTML = "";

  const buckets = [
    { label: "Today", items: filtered.filter(conversation => ageInDays(conversation.updatedAt) < 1) },
    {
      label: "Yesterday",
      items: filtered.filter(conversation => ageInDays(conversation.updatedAt) >= 1 && ageInDays(conversation.updatedAt) < 2),
    },
    {
      label: "This week",
      items: filtered.filter(conversation => ageInDays(conversation.updatedAt) >= 2 && ageInDays(conversation.updatedAt) < 7),
    },
    { label: "Older", items: filtered.filter(conversation => ageInDays(conversation.updatedAt) >= 7) },
  ];

  let hasContent = false;

  buckets.forEach(bucket => {
    if (!bucket.items.length) {
      return;
    }

    hasContent = true;
    const group = document.createElement("section");
    group.className = "conversation-group";

    const label = document.createElement("div");
    label.className = "conversation-group-label";
    label.textContent = bucket.label;
    group.appendChild(label);

    bucket.items.forEach(conversation => {
      const item = document.createElement("article");
      item.className = `conversation-item ${conversation.id === state.activeId ? "is-active" : ""}`;
      item.innerHTML = `
        <div class="conversation-item-head">
          <button class="conversation-open" type="button">
            <span class="conversation-title">${escapeHtml(conversation.title)}</span>
            <span class="conversation-meta">${conversation.messages.length} messages</span>
          </button>
          <button class="conversation-delete" type="button" aria-label="Delete conversation">x</button>
        </div>
        <div class="conversation-meta">${timeAgo(conversation.updatedAt)}</div>
      `;

      const openButton = item.querySelector(".conversation-open");
      openButton.addEventListener("click", () => loadConversation(conversation.id));

      const deleteButton = item.querySelector(".conversation-delete");
      deleteButton.addEventListener("click", () => {
        deleteConversation(conversation.id);
      });

      group.appendChild(item);
    });

    elements.conversationList.appendChild(group);
  });

  if (!hasContent) {
    const empty = document.createElement("p");
    empty.className = "conversation-meta";
    empty.textContent = "No conversations match that search.";
    elements.conversationList.appendChild(empty);
  }
}

function renderMessages(conversation) {
  if (!conversation.messages.length) {
    elements.messageSurface.innerHTML = "";
    elements.messageSurface.appendChild(elements.emptyState);
    return;
  }

  const stack = document.createElement("div");
  stack.className = "message-stack";

  conversation.messages.forEach(message => {
    stack.appendChild(buildMessageCard(message));
  });

  elements.messageSurface.innerHTML = "";
  elements.messageSurface.appendChild(stack);
  elements.messageSurface.scrollTop = elements.messageSurface.scrollHeight;
}

function buildMessageCard(message) {
  const card = document.createElement("article");
  card.className = `message-card ${message.role === "assistant" ? "message-card--assistant" : ""}`;

  const timestamp = new Date(message.time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  card.innerHTML = `
    <div class="message-avatar">${message.role === "assistant" ? getAssistantInitial() : "You"}</div>
    <div>
      <div class="message-meta">
        <span class="message-author">${message.role === "assistant" ? getAssistantName() : "You"}</span>
        <span class="message-time">${timestamp}</span>
      </div>
      ${Array.isArray(message.files) && message.files.length ? renderMessageFiles(message.files) : ""}
      <div class="message-copy">${message.role === "assistant" ? renderMarkdown(message.text) : renderPlainText(message.text)}</div>
    </div>
  `;

  return card;
}

function renderMessageFiles(files) {
  return `
    <div class="message-files">
      ${files.map(file => `<span class="message-file">${escapeHtml(file)}</span>`).join("")}
    </div>
  `;
}

function renderPlainText(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderMarkdown(source) {
  const lines = source.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const fenceMatch = line.match(/^```([\w-]*)/);

    if (fenceMatch) {
      const language = fenceMatch[1] || "code";
      const codeLines = [];
      index += 1;

      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(escapeHtml(lines[index]));
        index += 1;
      }

      blocks.push(`<pre><code class="language-${escapeHtml(language)}">${codeLines.join("\n")}</code></pre>`);
      index += 1;
      continue;
    }

    if (/^### /.test(line)) {
      blocks.push(`<h3>${formatInline(line.slice(4))}</h3>`);
      index += 1;
      continue;
    }

    if (/^## /.test(line)) {
      blocks.push(`<h2>${formatInline(line.slice(3))}</h2>`);
      index += 1;
      continue;
    }

    if (/^# /.test(line)) {
      blocks.push(`<h1>${formatInline(line.slice(2))}</h1>`);
      index += 1;
      continue;
    }

    if (/^> /.test(line)) {
      blocks.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
      index += 1;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const listItems = [];
      while (index < lines.length && /^[-*] /.test(lines[index])) {
        listItems.push(`<li>${formatInline(lines[index].slice(2))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${listItems.join("")}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const listItems = [];
      while (index < lines.length && /^\d+\. /.test(lines[index])) {
        listItems.push(`<li>${formatInline(lines[index].replace(/^\d+\. /, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${listItems.join("")}</ol>`);
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(```|#{1,3} |> |[-*] |\d+\. )/.test(lines[index])
    ) {
      paragraph.push(formatInline(lines[index]));
      index += 1;
    }

    blocks.push(`<p>${paragraph.join("<br>")}</p>`);
  }

  return blocks.join("");
}

function formatInline(value) {
  let output = escapeHtml(value);
  output = output.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__(.+?)__/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = sanitizeUrl(href);
    return safeHref ? `<a href="${safeHref}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });
  return output;
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return "";
  }
  return "";
}

function handleFiles(fileList) {
  const additions = [];

  Array.from(fileList).forEach(file => {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      setHelperCopy(`Skipped ${file.name}. Only text-based files are supported.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setHelperCopy(`Skipped ${file.name}. Keep attachments under ${Math.round(MAX_FILE_SIZE_BYTES / 1000)} KB.`);
      return;
    }

    if (!state.attachments.some(existing => existing.name === file.name)) {
      additions.push(file);
    }
  });

  if (additions.length) {
    state.attachments = state.attachments.concat(additions);
    setHelperCopy(`${state.attachments.length} attachment${state.attachments.length === 1 ? "" : "s"} ready.`);
    renderAttachments();
  }

  elements.fileInput.value = "";
}

function renderAttachments() {
  elements.attachmentStrip.innerHTML = state.attachments
    .map(file => {
      return `
        <span class="attachment-chip">
          ${escapeHtml(file.name)}
          <button type="button" data-remove="${escapeHtml(file.name)}" aria-label="Remove ${escapeHtml(file.name)}">x</button>
        </span>
      `;
    })
    .join("");

  elements.attachmentStrip.querySelectorAll("[data-remove]").forEach(button => {
    button.addEventListener("click", () => {
      const name = button.dataset.remove;
      state.attachments = state.attachments.filter(file => file.name !== name);
      renderAttachments();
      setHelperCopy("Text attachments only. Large chats are trimmed before sending.");
    });
  });
}

async function sendMessage() {
  if (state.busy) {
    return;
  }

  const rawText = elements.promptInput.value.trim();
  if (!rawText && !state.attachments.length) {
    return;
  }

  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }

  let attachmentContext = "";
  const attachmentNames = state.attachments.map(file => file.name);

  if (state.attachments.length) {
    attachmentContext = await Promise.all(state.attachments.map(readTextAttachment)).then(chunks => chunks.join("\n\n"));
  }

  const userMessage = {
    role: "user",
    text: rawText || "Summarize the attached files.",
    files: attachmentNames,
    time: Date.now(),
  };

  conversation.messages.push(userMessage);
  conversation.updatedAt = Date.now();

  if (conversation.messages.length === 1 && conversation.title === "New conversation") {
    conversation.title = buildConversationTitle(userMessage.text);
  }

  persist();
  state.attachments = [];
  renderAttachments();
  elements.promptInput.value = "";
  autoResize(elements.promptInput);
  loadConversation(conversation.id);

  const typingCard = appendTypingCard();
  setBusy(true);

  try {
    const payload = {
      prompt: buildPrompt(conversation, attachmentContext, userMessage.text),
    };

    const response = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "The backend request failed.");
    }

    const assistantMessage = {
      role: "assistant",
      text: data.response,
      files: [],
      time: Date.now(),
    };

    conversation.messages.push(assistantMessage);
    conversation.updatedAt = Date.now();
    persist();
    loadConversation(conversation.id);
    setStatus("online", data.model || "");
    setHelperCopy("Response generated successfully.");
  } catch (error) {
    conversation.messages.push({
      role: "assistant",
      text: `Request failed.\n\n${error.message}\n\nStart the app with:\n\n\`\`\`bash\nuvicorn app:app --reload\n\`\`\``,
      files: [],
      time: Date.now(),
    });
    conversation.updatedAt = Date.now();
    persist();
    loadConversation(conversation.id);
    setStatus("offline");
    setHelperCopy("The backend could not reach Ollama.");
  } finally {
    typingCard.remove();
    setBusy(false);
    elements.promptInput.focus();
  }
}

function appendTypingCard() {
  const existingStack = elements.messageSurface.querySelector(".message-stack");
  const stack = existingStack || document.createElement("div");
  if (!existingStack) {
    stack.className = "message-stack";
    elements.messageSurface.innerHTML = "";
    elements.messageSurface.appendChild(stack);
  }

  const card = document.createElement("article");
  card.className = "message-card message-card--assistant";
  card.innerHTML = `
    <div class="message-avatar">${getAssistantInitial()}</div>
    <div>
      <div class="message-meta">
        <span class="message-author">${getAssistantName()}</span>
        <span class="message-time">Thinking…</span>
      </div>
      <div class="typing-card typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;

  stack.appendChild(card);
  elements.messageSurface.scrollTop = elements.messageSurface.scrollHeight;
  return card;
}

async function readTextAttachment(file) {
  const text = await file.text();
  return `File: ${file.name}\n\`\`\`\n${text}\n\`\`\``;
}

function buildPrompt(conversation, attachmentContext, currentMessage) {
  const recentMessages = conversation.messages.slice(-MAX_CONTEXT_MESSAGES - 1, -1);
  const history = recentMessages
    .map(message => {
      const speaker = message.role === "assistant" ? "Assistant" : "User";
      return `${speaker}: ${message.text}`;
    })
    .join("\n\n");

  const sections = [
    "You are a helpful local AI assistant running in a browser-based chat app.",
    history ? `Conversation history:\n\n${history}` : "",
    attachmentContext ? `Attached file context:\n\n${attachmentContext}` : "",
    `Latest user message:\n${currentMessage}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

function buildConversationTitle(text) {
  return text.length > 44 ? `${text.slice(0, 44)}…` : text;
}

function setBusy(busy) {
  state.busy = busy;
  elements.sendBtn.disabled = busy;
}

function updateContextPill(count) {
  elements.contextPill.textContent = `${count} message${count === 1 ? "" : "s"} in context`;
}

function setHelperCopy(message) {
  elements.helperCopy.textContent = message;
}

function setStatus(mode, runtimeModelTag = "") {
  state.statusMode = mode;
  if (runtimeModelTag) {
    state.runtimeModelTag = runtimeModelTag;
  }

  elements.statusPill.textContent = buildStatusLabel(mode);
  elements.statusPill.classList.toggle("is-online", mode === "online");
  elements.statusPill.classList.toggle("is-offline", mode === "offline");
}

async function pingHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, { method: "GET" });
    const data = await response.json();
    if (data.status === "online") {
      setStatus("online", data.model || "");
      return;
    }
  } catch {
    // Ignore and mark offline below.
  }

  setStatus("offline");
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, 240);
  textarea.style.height = `${Math.max(nextHeight, 72)}px`;
  textarea.style.overflowY = textarea.scrollHeight > 240 ? "auto" : "hidden";
}

function timeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ageInDays(timestamp) {
  return (Date.now() - timestamp) / 86_400_000;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

boot();
