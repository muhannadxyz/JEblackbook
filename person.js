function normalizeName(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const statusLabels = {
  confirmed: "CONFIRMED",
  alleged: "ALLEGED",
  disputed: "DISPUTED",
  unverified: "UNVERIFIED",
};

const nameEl = document.getElementById("personName");
const tagEl = document.getElementById("personTag");
const noteEl = document.getElementById("personNote");
const sourcesEl = document.getElementById("personSources");

const allNames = Array.isArray(window.blackBookNames) ? window.blackBookNames : [];
const tagByNameRaw =
  window.nameTagByName && typeof window.nameTagByName === "object" ? window.nameTagByName : {};
const infoByNameRaw =
  window.personInfoByName && typeof window.personInfoByName === "object"
    ? window.personInfoByName
    : {};
const sourcesByNameRaw =
  window.personSourcesByName && typeof window.personSourcesByName === "object"
    ? window.personSourcesByName
    : {};
const islandNames = Array.isArray(window.islandFlagNames) ? window.islandFlagNames : [];

const tagByName = new Map(
  Object.entries(tagByNameRaw).map(([k, v]) => [normalizeName(k), String(v)]),
);
const infoByName = new Map(
  Object.entries(infoByNameRaw).map(([k, v]) => [normalizeName(k), String(v)]),
);
const sourcesByName = new Map(
  Object.entries(sourcesByNameRaw).map(([k, v]) => [
    normalizeName(k),
    Array.isArray(v) ? v.map((x) => String(x)) : [],
  ]),
);
const islandSet = new Set(islandNames.map(normalizeName));

const params = new URLSearchParams(window.location.search);
const requested = (params.get("name") || "").trim();
const requestedKey = normalizeName(requested);

let canonical = requested;
for (const n of allNames) {
  if (normalizeName(n) === requestedKey) {
    canonical = n;
    break;
  }
}
if (!canonical) canonical = "Unknown entry";

const status = tagByName.get(requestedKey) || "unverified";
const note =
  infoByName.get(requestedKey) || "No additional context available for this entry yet.";
const sources = sourcesByName.get(requestedKey) || [];

nameEl.textContent = canonical;
tagEl.textContent = statusLabels[status] || "UNVERIFIED";
tagEl.classList.add(`tag-${status}`);
if (islandSet.has(requestedKey) && status === "confirmed") {
  nameEl.classList.add("island-flag");
}
noteEl.textContent = note;

sourcesEl.textContent = "";
if (sources.length) {
  sources.forEach((url) => {
    const li = document.createElement("li");
    li.className = "person-source-item";
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = url;
    li.appendChild(a);
    sourcesEl.appendChild(li);
  });
} else {
  const li = document.createElement("li");
  li.className = "person-source-item";
  li.textContent = "No source links available for this entry yet.";
  sourcesEl.appendChild(li);
}
