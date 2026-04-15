const API_BASE = "/api";
const STORAGE_KEY = "gemma_portfolio_v1";
const THEME_STORAGE_KEY = "gemma_theme";
const MODEL_NAME_STORAGE_KEY = "gemma_model_display_name";
const MAX_CONTEXT_MESSAGES = 12;
const MAX_TEXT_FILE_SIZE_BYTES = 200_000;
const MAX_IMAGE_SIZE_BYTES = 5_000_000;
const DEFAULT_HELPER_COPY = "Text files and images only. Large chats are trimmed before sending.";
const SUPPORTED_TEXT_EXTENSIONS = new Set([
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
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const state = {
  conversations: [],
  activeId: null,
  attachments: [],
  busy: false,
  pendingConversationId: null,
  modelDisplayName: "Gemma",
  statusMode: "checking",
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
  emptyMark: document.getElementById("emptyMark"),
  emptyState: document.getElementById("emptyState"),
  fileInput: document.getElementById("fileInput"),
  fileTrigger: document.querySelector('label[for="fileInput"]'),
  helperCopy: document.getElementById("helperCopy"),
  messageSurface: document.getElementById("messageSurface"),
  modelDisplayLabel: document.getElementById("modelDisplayLabel"),
  modelNameInput: document.getElementById("modelNameInput"),
  newChatBtn: document.getElementById("newChatBtn"),
  promptInput: document.getElementById("promptInput"),
  resetSettingsBtn: document.getElementById("resetSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  searchInput: document.getElementById("searchInput"),
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
  elements.emptyMark.textContent = getAssistantInitial();
  elements.workspaceTitle.textContent = `${assistantName} Workspace`;
  elements.sidebarCopy.textContent = `A lightweight chat UI for a ${assistantName} model running through Ollama completely locally.`;
  elements.promptInput.placeholder = `Message ${assistantName} locally…`;
  elements.modelDisplayLabel.textContent = `Model name: ${assistantName}`;
  elements.modelNameInput.value = assistantName;
  setStatus(state.statusMode);

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

function warnBusy(actionLabel) {
  setHelperCopy(`Wait for the current response to finish before ${actionLabel}.`);
}

function isPendingConversation(id) {
  return Boolean(id) && state.pendingConversationId === id;
}

function syncUiAvailability() {
  const activeConversation = getActiveConversation();
  const activeIsPending = activeConversation ? isPendingConversation(activeConversation.id) : false;

  elements.sendBtn.disabled = state.busy;
  elements.promptInput.disabled = state.busy;
  elements.fileInput.disabled = state.busy;
  elements.clearBtn.disabled = activeIsPending;
  elements.clearHistoryBtn.disabled = state.busy;

  if (elements.fileTrigger) {
    elements.fileTrigger.classList.toggle("is-disabled", state.busy);
    elements.fileTrigger.setAttribute("aria-disabled", state.busy ? "true" : "false");
    if (state.busy) {
      elements.fileTrigger.setAttribute("tabindex", "-1");
    } else {
      elements.fileTrigger.removeAttribute("tabindex");
    }
  }
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.conversations));
  } catch {
    setHelperCopy("Could not save conversation history in browser storage.");
  }
}

function createAttachmentRecord(file, kind) {
  return {
    id: crypto.randomUUID(),
    kind,
    file,
    name: file.name,
    previewUrl: kind === "image" ? URL.createObjectURL(file) : "",
  };
}

function resetAttachments() {
  state.attachments.forEach(attachment => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
  state.attachments = [];
  renderAttachments();
}

function getAttachmentKind(file) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  if (SUPPORTED_IMAGE_MIME_TYPES.has(file.type) || SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  return "";
}

function buildDefaultMessage(textAttachmentCount, imageAttachmentCount) {
  if (textAttachmentCount && imageAttachmentCount) {
    return "Review the attached files and images.";
  }

  if (imageAttachmentCount) {
    return imageAttachmentCount === 1 ? "Describe the attached image." : "Describe the attached images.";
  }

  return "Summarize the attached files.";
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
  resetAttachments();
  persist();
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

  if (isPendingConversation(conversation.id)) {
    warnBusy("clearing this conversation");
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
  if (state.pendingConversationId) {
    warnBusy("clearing history");
    return;
  }

  const conversation = makeConversation();
  state.conversations = [conversation];
  state.activeId = conversation.id;
  resetAttachments();
  elements.searchInput.value = "";
  elements.promptInput.value = "";
  autoResize(elements.promptInput);
  persist();
  renderConversationList();
  loadConversation(conversation.id);
  setHelperCopy("Conversation history cleared.");
  toggleSettingsPanel(false);
}

function deleteConversation(id) {
  if (isPendingConversation(id)) {
    warnBusy("deleting a conversation");
    return;
  }

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
  syncUiAvailability();
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
        <div class="conversation-meta">${isPendingConversation(conversation.id) ? "Thinking…" : timeAgo(conversation.updatedAt)}</div>
      `;

      const openButton = item.querySelector(".conversation-open");
      openButton.addEventListener("click", () => {
        loadConversation(conversation.id);
      });

      const deleteButton = item.querySelector(".conversation-delete");
      deleteButton.disabled = isPendingConversation(conversation.id);
      deleteButton.addEventListener("click", () => {
        if (isPendingConversation(conversation.id)) {
          warnBusy("deleting a conversation");
          return;
        }

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

  if (isPendingConversation(conversation.id)) {
    stack.appendChild(buildTypingCard());
  }

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
  const lines = normalizeMathDelimiters(source).split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmedLine = line.trimStart();
    const fenceMatch = trimmedLine.match(/^```(?:\s*([\w-]+))?\s*$/);
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);

    if (fenceMatch) {
      const language = fenceMatch[1] || "code";
      const codeLines = [];
      const indentation = line.slice(0, line.length - trimmedLine.length);
      index += 1;

      while (index < lines.length && !lines[index].trimStart().startsWith("```")) {
        const currentLine = lines[index];
        const normalizedLine = indentation && currentLine.startsWith(indentation)
          ? currentLine.slice(indentation.length)
          : currentLine;
        codeLines.push(escapeHtml(normalizedLine));
        index += 1;
      }

      blocks.push(`<pre><code class="language-${escapeHtml(language)}">${codeLines.join("\n")}</code></pre>`);
      index += 1;
      continue;
    }

    if (/^\s*(?:\*\s*){3,}\s*$/.test(line) || /^\s*(?:-\s*){3,}\s*$/.test(line) || /^\s*(?:_\s*){3,}\s*$/.test(line) || line.trim() === "--") {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (line.trim().startsWith("$$")) {
      const mathLines = [];
      const firstLine = line.trim();

      if (firstLine.length > 4 && firstLine.endsWith("$$")) {
        blocks.push(renderMathBlock(firstLine.slice(2, -2).trim()));
        index += 1;
        continue;
      }

      const initialContent = firstLine.slice(2).trim();
      if (initialContent) {
        mathLines.push(initialContent);
      }

      index += 1;
      while (index < lines.length) {
        const currentLine = lines[index];
        const trimmedCurrent = currentLine.trim();
        if (trimmedCurrent.endsWith("$$")) {
          const closingContent = trimmedCurrent.slice(0, -2).trim();
          if (closingContent) {
            mathLines.push(closingContent);
          }
          index += 1;
          break;
        }

        mathLines.push(currentLine);
        index += 1;
      }

      blocks.push(renderMathBlock(mathLines.join(" ").trim()));
      continue;
    }

    if (isTableLine(line) && index + 1 < lines.length && isTableDividerLine(lines[index + 1])) {
      const headerCells = parseTableRow(line);
      const bodyRows = [];
      index += 2;

      while (index < lines.length && isTableLine(lines[index])) {
        bodyRows.push(parseTableRow(lines[index]));
        index += 1;
      }

      blocks.push(renderTable(headerCells, bodyRows));
      continue;
    }

    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6);
      blocks.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^> /.test(trimmedLine)) {
      blocks.push(`<blockquote>${formatInline(trimmedLine.slice(2))}</blockquote>`);
      index += 1;
      continue;
    }

    if (/^[-*] /.test(trimmedLine)) {
      const listItems = [];
      while (index < lines.length && /^[-*] /.test(lines[index].trimStart())) {
        listItems.push(`<li>${formatInline(lines[index].trimStart().slice(2))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${listItems.join("")}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(trimmedLine)) {
      const listItems = [];
      while (index < lines.length && /^\d+\. /.test(lines[index].trimStart())) {
        listItems.push(`<li>${formatInline(lines[index].trimStart().replace(/^\d+\. /, ""))}</li>`);
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
      !/^(```|#{1,6} |> |[-*] |\d+\. )/.test(lines[index].trimStart()) &&
      !/^\s*(?:\*\s*){3,}\s*$/.test(lines[index]) &&
      !/^\s*(?:-\s*){3,}\s*$/.test(lines[index]) &&
      !/^\s*(?:_\s*){3,}\s*$/.test(lines[index]) &&
      lines[index].trim() !== "--" &&
      !lines[index].trim().startsWith("$$") &&
      !(isTableLine(lines[index]) && index + 1 < lines.length && isTableDividerLine(lines[index + 1]))
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
  const mathPlaceholders = [];
  output = output.replace(/\$([^$\n]+?)\$/g, (_, expression) => {
    const placeholder = `@@MATH_${mathPlaceholders.length}@@`;
    mathPlaceholders.push(renderMathInline(expression));
    return placeholder;
  });
  output = output.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  output = output.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__(.+?)__/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = sanitizeUrl(href);
    return safeHref ? `<a href="${safeHref}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });
  mathPlaceholders.forEach((markup, idx) => {
    output = output.replace(`@@MATH_${idx}@@`, markup);
  });
  return output;
}

function renderMathInline(expression) {
  return `<span class="math-inline">${renderMathExpression(expression)}</span>`;
}

function renderMathBlock(expression) {
  return `<div class="math-block">${renderMathExpression(expression)}</div>`;
}

function renderMathExpression(source) {
  const normalized = source
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .trim();
  return parseMathSegment(normalized).html;
}

function normalizeMathDelimiters(source) {
  return source
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expression) => `$$${expression}$$`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expression) => `$${expression}$`)
    .replace(/\\\$\\\$([\s\S]+?)\\\$\\\$/g, (_, expression) => `$$${expression}$$`)
    .replace(/\\\$([^$\n]+?)\\\$/g, (_, expression) => `$${expression}$`);
}

function parseMathSegment(source, start = 0, stopChar = "") {
  const tokens = [];
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (stopChar && char === stopChar) {
      return { html: tokens.join(""), nextIndex: index + 1 };
    }

    if (char === "\\") {
      const atom = parseMathAtom(source, index);
      tokens.push(atom.html);
      index = atom.nextIndex;
      continue;
    }

    if (char === "{") {
      const group = parseMathSegment(source, index + 1, "}");
      tokens.push(group.html);
      index = group.nextIndex;
      continue;
    }

    if (char === "^" || char === "_") {
      const script = parseMathArgument(source, index + 1);
      if (tokens.length) {
        const base = tokens.pop();
        tokens.push(char === "^" ? `${base}<sup>${script.html}</sup>` : `${base}<sub>${script.html}</sub>`);
      } else {
        tokens.push(char === "^" ? `<sup>${script.html}</sup>` : `<sub>${script.html}</sub>`);
      }
      index = script.nextIndex;
      continue;
    }

    tokens.push(escapeHtml(char));
    index += 1;
  }

  return { html: tokens.join(""), nextIndex: index };
}

function parseMathArgument(source, startIndex) {
  return parseMathAtom(source, startIndex);
}

function parseMathAtom(source, startIndex) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }

  if (index >= source.length) {
    return { html: "", nextIndex: index };
  }

  if (source[index] === "{") {
    return parseMathSegment(source, index + 1, "}");
  }

  if (source[index] === "\\") {
    const commandMatch = source.slice(index + 1).match(/^[A-Za-z]+/);
    if (!commandMatch) {
      if (index + 1 < source.length) {
        return { html: escapeHtml(source[index + 1]), nextIndex: index + 2 };
      }
      return { html: "\\", nextIndex: index + 1 };
    }

    const command = commandMatch[0];
    index += 1 + command.length;

    if (command === "sqrt") {
      const radicand = parseMathArgument(source, index);
      return {
        html: `<span class="math-sqrt"><span class="math-radical">√</span><span class="math-radicand">${radicand.html}</span></span>`,
        nextIndex: radicand.nextIndex,
      };
    }

    if (command === "frac") {
      const numerator = parseMathArgument(source, index);
      const denominator = parseMathArgument(source, numerator.nextIndex);
      return {
        html: `<span class="math-frac"><span class="math-frac-top">${numerator.html}</span><span class="math-frac-bottom">${denominator.html}</span></span>`,
        nextIndex: denominator.nextIndex,
      };
    }

    if (command === "text") {
      const textContent = parseMathArgument(source, index);
      return {
        html: `<span class="math-text">${textContent.html}</span>`,
        nextIndex: textContent.nextIndex,
      };
    }

    if (command === "mathbf" || command === "mathrm" || command === "mathit" || command === "mathbb") {
      const styledContent = parseMathArgument(source, index);
      return {
        html: `<span class="math-${command}">${styledContent.html}</span>`,
        nextIndex: styledContent.nextIndex,
      };
    }

    return { html: getMathCommandMarkup(command), nextIndex: index };
  }

  return { html: escapeHtml(source[index]), nextIndex: index + 1 };
}

function getMathCommandMarkup(command) {
  const symbolMap = {
    alpha: "α",
    approx: "≈",
    beta: "β",
    cdot: "·",
    cdots: "⋯",
    delta: "δ",
    dots: "…",
    gamma: "γ",
    ge: "≥",
    geq: "≥",
    infty: "∞",
    lambda: "λ",
    le: "≤",
    leq: "≤",
    leftarrow: "←",
    mu: "μ",
    ne: "≠",
    neq: "≠",
    omega: "ω",
    phi: "φ",
    pi: "π",
    pm: "±",
    rightarrow: "→",
    sigma: "σ",
    sqrt: "√",
    theta: "θ",
    times: "×",
    to: "→",
    Leftarrow: "⇐",
    Rightarrow: "⇒",
  };

  return symbolMap[command] || escapeHtml(command);
}

function isTableLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

function isTableDividerLine(line) {
  if (!isTableLine(line)) {
    return false;
  }

  return parseTableRow(line).every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map(cell => cell.trim());
}

function renderTable(headerCells, bodyRows) {
  const headerHtml = headerCells.map(cell => `<th>${formatInline(cell)}</th>`).join("");
  const bodyHtml = bodyRows
    .map(row => `<tr>${row.map(cell => `<td>${formatInline(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
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
    const kind = getAttachmentKind(file);
    if (!kind) {
      setHelperCopy(`Skipped ${file.name}. Only supported text files and images are allowed.`);
      return;
    }

    if (kind === "text" && file.size > MAX_TEXT_FILE_SIZE_BYTES) {
      setHelperCopy(`Skipped ${file.name}. Keep text files under ${Math.round(MAX_TEXT_FILE_SIZE_BYTES / 1000)} KB.`);
      return;
    }

    if (kind === "image" && file.size > MAX_IMAGE_SIZE_BYTES) {
      setHelperCopy(`Skipped ${file.name}. Keep images under ${Math.round(MAX_IMAGE_SIZE_BYTES / 1_000_000)} MB.`);
      return;
    }

    if (!state.attachments.some(existing => existing.name === file.name && existing.kind === kind)) {
      additions.push(createAttachmentRecord(file, kind));
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
    .map(attachment => {
      return `
        <span class="attachment-chip ${attachment.kind === "image" ? "attachment-chip--image" : ""}">
          ${attachment.previewUrl ? `<img class="attachment-preview" src="${attachment.previewUrl}" alt="">` : ""}
          <span>${escapeHtml(attachment.name)}</span>
          <button type="button" data-remove="${attachment.id}" aria-label="Remove ${escapeHtml(attachment.name)}">x</button>
        </span>
      `;
    })
    .join("");

  elements.attachmentStrip.querySelectorAll("[data-remove]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.remove;
      const removed = state.attachments.find(attachment => attachment.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      state.attachments = state.attachments.filter(attachment => attachment.id !== id);
      renderAttachments();
      setHelperCopy(DEFAULT_HELPER_COPY);
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
  let imagePayloads = [];
  const attachmentNames = state.attachments.map(attachment => attachment.name);
  const textAttachments = state.attachments.filter(attachment => attachment.kind === "text");
  const imageAttachments = state.attachments.filter(attachment => attachment.kind === "image");

  try {
    if (textAttachments.length) {
      attachmentContext = await Promise.all(textAttachments.map(readTextAttachment)).then(chunks => chunks.join("\n\n"));
    }
    if (imageAttachments.length) {
      imagePayloads = await Promise.all(imageAttachments.map(readImageAttachment));
    }
  } catch (error) {
    setHelperCopy(error.message || "Failed to read attachments.");
    return;
  }

  const resolvedText = rawText || buildDefaultMessage(textAttachments.length, imageAttachments.length);

  const userMessage = {
    role: "user",
    text: resolvedText,
    files: attachmentNames,
    time: Date.now(),
  };

  conversation.messages.push(userMessage);
  conversation.updatedAt = Date.now();

  if (conversation.messages.length === 1 && conversation.title === "New conversation") {
    conversation.title = buildConversationTitle(userMessage.text);
  }

  persist();
  resetAttachments();
  elements.promptInput.value = "";
  autoResize(elements.promptInput);
  loadConversation(conversation.id);

  state.pendingConversationId = conversation.id;
  setBusy(true);
  refreshConversationViews(conversation.id);

  try {
    const payload = {
      messages: buildRequestMessages(conversation, attachmentContext, userMessage.text, imagePayloads),
    };

    const response = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await parseApiJson(response);
    if (!response.ok) {
      throw new Error(data.detail || `The backend request failed (${response.status}).`);
    }

    if (!data.response || typeof data.response !== "string") {
      throw new Error("The backend returned an invalid response payload.");
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
    setStatus("online");
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
    setStatus("offline");
    setHelperCopy(error.message || "The request failed.");
  } finally {
    state.pendingConversationId = null;
    setBusy(false);
    refreshConversationViews(conversation.id, { focusPrompt: true });
  }
}

function buildTypingCard() {
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

  return card;
}

function refreshConversationViews(updatedConversationId, options = {}) {
  const { focusPrompt = false } = options;
  renderConversationList(elements.searchInput.value);
  syncUiAvailability();

  const activeConversation = getActiveConversation();
  if (!activeConversation) {
    return;
  }

  elements.chatTitleInput.value = activeConversation.title;
  updateContextPill(activeConversation.messages.length);
  renderMessages(activeConversation);

  if (focusPrompt && state.activeId === updatedConversationId) {
    elements.promptInput.focus();
  }
}

async function parseApiJson(response) {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    if (response.ok) {
      throw new Error("The backend returned an empty response.");
    }

    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    if (response.ok) {
      throw new Error("The backend returned a non-JSON response.");
    }

    throw new Error(`The backend request failed (${response.status}).`);
  }
}

async function readTextAttachment(attachment) {
  const text = await attachment.file.text();
  return `File: ${attachment.name}\n\`\`\`\n${text}\n\`\`\``;
}

async function readImageAttachment(attachment) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const [, encoded] = result.split(",", 2);
      if (!encoded) {
        reject(new Error(`Could not encode ${attachment.name}.`));
        return;
      }
      resolve(encoded);
    };

    reader.onerror = () => {
      reject(new Error(`Could not read ${attachment.name}.`));
    };

    reader.readAsDataURL(attachment.file);
  });
}

function buildRequestMessages(conversation, attachmentContext, currentMessage, images) {
  const recentMessages = conversation.messages.slice(-MAX_CONTEXT_MESSAGES - 1, -1);
  const messages = [
    {
      role: "system",
      content: "You are a helpful local AI assistant running in a browser-based chat app.",
    },
    ...recentMessages.map(message => ({
      role: message.role,
      content: message.text,
    })),
  ];

  const latestSections = [];
  if (attachmentContext) {
    latestSections.push(`Attached file context:\n\n${attachmentContext}`);
  }
  latestSections.push(currentMessage);

  const latestMessage = {
    role: "user",
    content: latestSections.join("\n\n"),
  };
  if (images.length) {
    latestMessage.images = images;
  }

  messages.push(latestMessage);

  return messages;
}

function buildConversationTitle(text) {
  return text.length > 44 ? `${text.slice(0, 44)}…` : text;
}

function setBusy(busy) {
  state.busy = busy;
  syncUiAvailability();
  renderConversationList(elements.searchInput.value);
}

function updateContextPill(count) {
  elements.contextPill.textContent = `${count} message${count === 1 ? "" : "s"} in context`;
}

function setHelperCopy(message) {
  elements.helperCopy.textContent = message;
}

function setStatus(mode) {
  state.statusMode = mode;

  elements.statusPill.textContent = buildStatusLabel(mode);
  elements.statusPill.classList.toggle("is-online", mode === "online");
  elements.statusPill.classList.toggle("is-offline", mode === "offline");
}

async function pingHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, { method: "GET" });
    const data = await parseApiJson(response);
    setStatus(data.status === "online" ? "online" : "offline");
    return;
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
