const fallbackNames = ["Prince Andrew", "Bill Clinton", "Ehud Barak"];
const importedNamesRaw =
  Array.isArray(window.blackBookNames) && window.blackBookNames.length
    ? window.blackBookNames
    : fallbackNames;
const flaggedIslandNames = Array.isArray(window.islandFlagNames) ? window.islandFlagNames : [];
const rawTagByName =
  window.nameTagByName && typeof window.nameTagByName === "object"
    ? window.nameTagByName
    : {};

function normalizeName(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildNameKeys(value) {
  const raw = String(value || "").trim();
  const base = normalizeName(raw);
  const keys = new Set();
  if (base) keys.add(base);

  // Treat "Last, First" and "First Last" as the same person key.
  if (raw.includes(",")) {
    const [last, ...restParts] = raw.split(",");
    const rest = restParts.join(" ").trim();
    const lastTrimmed = last.trim();
    if (rest && lastTrimmed) {
      const flipped = normalizeName(`${rest} ${lastTrimmed}`);
      if (flipped) keys.add(flipped);
    }
  }

  return Array.from(keys);
}

function matchByAnyKey(knownKeysSet, value) {
  const keys = buildNameKeys(value);
  return keys.some((k) => knownKeysSet.has(k));
}

function getByAnyKey(map, value) {
  const keys = buildNameKeys(value);
  for (const key of keys) {
    if (map.has(key)) return map.get(key);
  }
  return undefined;
}

const seenNames = new Set();
const importedNames = importedNamesRaw.filter((name) => {
  const keys = buildNameKeys(name);
  if (!keys.length) return false;
  if (keys.some((k) => seenNames.has(k))) return false;
  keys.forEach((k) => seenNames.add(k));
  return true;
});

const islandNameSet = new Set(flaggedIslandNames.map(normalizeName));
const tagByName = new Map(
  Object.entries(rawTagByName).map(([name, tag]) => [normalizeName(name), String(tag)]),
);

const entries = importedNames.map((name, index) => ({
  name: String(name).trim(),
  status: getByAnyKey(tagByName, name) || "unverified",
  note: "Name record loaded from the directory dataset.",
  filingDate: "2024-01-01",
  listId: index + 1,
  islandFlag: matchByAnyKey(islandNameSet, name),
}));

function isRedEntry(entry) {
  return entry.islandFlag && entry.status === "confirmed";
}

const statusLabels = {
  confirmed: "Confirmed",
  reported: "Reported",
  alleged: "Alleged",
  disputed: "Disputed",
  unverified: "Unverified",
};

const pageSize = 14;
const PAGE_FLIP_MS = 760;
const PAGE_SWAP_MS = 360;
const SPREAD_STEP = 2;
let currentLeftPage = 1;
let isOpening = false;
let isPageFlipping = false;
let flipSwapTimer = null;
let flipEndTimer = null;
let flipVersion = 0;

const bookShell = document.getElementById("bookShell");
const coverButton = document.getElementById("coverButton");
const bookPages = document.getElementById("bookPages");
const controlsPanel = document.getElementById("controlsPanel");
const rightPage = document.querySelector(".right-page");
const caseNotesPanel = document.getElementById("caseNotesPanel");
const leftEntryList = document.getElementById("leftEntryList");
const entryList = document.getElementById("entryList");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const resultSummary = document.getElementById("resultSummary");
const prevPage = document.getElementById("prevPage");
const nextPage = document.getElementById("nextPage");
const pageLabel = document.getElementById("pageLabel");
const leftPageLabel = document.getElementById("leftPageLabel");
const leftPageSubtitle = document.getElementById("leftPageSubtitle");
const rightPageLabel = document.getElementById("rightPageLabel");
const template = document.getElementById("entryTemplate");

function formatDate(iso) {
  const date = new Date(iso + "T00:00:00");
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function filterEntries() {
  const q = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  return entries.filter((entry) => {
    const matchesText =
      !q ||
      entry.name.toLowerCase().includes(q) ||
      entry.note.toLowerCase().includes(q);
    const matchesStatus = status === "all" || entry.status === status;
    return matchesText && matchesStatus;
  });
}

function renderList(target, items) {
  target.textContent = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.className = "entry";
    li.textContent = "No names on this page.";
    target.appendChild(li);
    return;
  }

  items.forEach((entry) => {
    const node = template.content.cloneNode(true);
    const nameNode = node.querySelector(".entry-name");
    nameNode.textContent = entry.name;
    nameNode.href = `person.html?name=${encodeURIComponent(entry.name)}`;
    nameNode.setAttribute("aria-label", `Open person page for ${entry.name}`);
    if (isRedEntry(entry)) {
      nameNode.classList.add("island-flag");
    }
    const tagNode = node.querySelector(".entry-tag");
    tagNode.textContent = statusLabels[entry.status] || "Unverified";
    tagNode.classList.add(`tag-${entry.status}`);
    node.querySelector(".entry-meta").textContent = `Entry #${String(entry.listId).padStart(4, "0")}`;
    target.appendChild(node);
  });
}

function pageItemsFor(pageNumber, filtered) {
  if (pageNumber <= 1) return null;
  const dataPageIndex = pageNumber - 2;
  const start = dataPageIndex * pageSize;
  return filtered.slice(start, start + pageSize);
}

function render() {
  const filtered = filterEntries();
  const totalDataPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const maxPhysicalPage = totalDataPages + 1;
  currentLeftPage = Math.min(Math.max(1, currentLeftPage), maxPhysicalPage);

  const rightPageNumber = currentLeftPage + 1;
  const leftItems = pageItemsFor(currentLeftPage, filtered);
  const rightItems = pageItemsFor(rightPageNumber, filtered);

  const onCaseNotes = currentLeftPage === 1;
  caseNotesPanel.hidden = !onCaseNotes;
  leftEntryList.hidden = onCaseNotes;
  leftPageSubtitle.textContent = onCaseNotes ? "Case Notes" : "Left page";
  if (!onCaseNotes) {
    renderList(leftEntryList, leftItems || []);
  }
  renderList(entryList, rightItems);

  const flaggedCount = filtered.filter((entry) => isRedEntry(entry)).length;
  resultSummary.textContent =
    `Showing ${filtered.length} total names. Red names in this filtered view: ${flaggedCount}.`;
  leftPageLabel.textContent = `Page ${String(currentLeftPage).padStart(2, "0")}`;
  rightPageLabel.textContent = `Page ${String(rightPageNumber).padStart(2, "0")}`;
  pageLabel.textContent = `Pages ${String(currentLeftPage).padStart(2, "0")}-${String(rightPageNumber).padStart(2, "0")}`;
  prevPage.disabled = currentLeftPage <= 1;
  nextPage.disabled = currentLeftPage + SPREAD_STEP > maxPhysicalPage;
}

function flipToPage(direction, updatePage) {
  if (isPageFlipping) return;
  if (!rightPage) {
    updatePage();
    render();
    return;
  }

  isPageFlipping = true;
  const runId = ++flipVersion;
  const className = direction === "next" ? "page-flip-next" : "page-flip-prev";
  rightPage.classList.remove("page-flip-next", "page-flip-prev");
  void rightPage.offsetWidth;
  rightPage.classList.add(className);

  flipSwapTimer = setTimeout(() => {
    if (runId !== flipVersion) return;
    updatePage();
    render();
  }, PAGE_SWAP_MS);

  flipEndTimer = setTimeout(() => {
    if (runId !== flipVersion) return;
    rightPage.classList.remove(className);
    isPageFlipping = false;
    flipSwapTimer = null;
    flipEndTimer = null;
  }, PAGE_FLIP_MS);
}

function cancelPendingFlip() {
  if (flipSwapTimer) clearTimeout(flipSwapTimer);
  if (flipEndTimer) clearTimeout(flipEndTimer);
  flipSwapTimer = null;
  flipEndTimer = null;
  flipVersion += 1;
  isPageFlipping = false;
  if (rightPage) rightPage.classList.remove("page-flip-next", "page-flip-prev");
}

function openBook() {
  if (coverButton.classList.contains("opened") || isOpening) return;
  isOpening = true;
  bookShell.classList.add("opening");
  coverButton.classList.add("opened");
  coverButton.setAttribute("aria-expanded", "true");

  setTimeout(() => {
    bookPages.hidden = false;
    if (controlsPanel) controlsPanel.hidden = false;
    requestAnimationFrame(() => {
      bookPages.classList.add("open");
      searchInput.focus();
    });
  }, 450);

  setTimeout(() => {
    bookShell.classList.remove("opening");
    bookShell.classList.add("opened-view");
    isOpening = false;
  }, 1220);
}

searchInput.addEventListener("input", () => {
  cancelPendingFlip();
  currentLeftPage = 1;
  render();
});

statusFilter.addEventListener("change", () => {
  cancelPendingFlip();
  currentLeftPage = 1;
  render();
});

prevPage.addEventListener("click", () => {
  if (isPageFlipping || currentLeftPage <= 1) return;
  flipToPage("prev", () => {
    currentLeftPage = Math.max(1, currentLeftPage - SPREAD_STEP);
  });
});

nextPage.addEventListener("click", () => {
  if (isPageFlipping) return;
  const totalDataPages = Math.max(1, Math.ceil(filterEntries().length / pageSize));
  const maxPhysicalPage = totalDataPages + 1;
  if (currentLeftPage + SPREAD_STEP > maxPhysicalPage) return;
  flipToPage("next", () => {
    currentLeftPage += SPREAD_STEP;
  });
});

coverButton.addEventListener("click", openBook);

render();
