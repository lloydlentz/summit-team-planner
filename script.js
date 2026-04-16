const DEFAULT_ENDPOINT = "https://slate-partners.technolutions.net/manage/query/run?id=8b7142c2-6c70-4109-9eeb-74d2494ba7c8&cmd=service&output=json&h=b0203357-4804-4c5d-8213-9e376263af44";
const STORAGE_KEY = "summit-team-planner-state-v1";

const elements = {
  endpoint: document.getElementById("endpoint"),
  loadSessions: document.getElementById("loadSessions"),
  status: document.getElementById("status"),
  sessions: document.getElementById("sessions"),
  template: document.getElementById("sessionTemplate"),
  teamMembersInput: document.getElementById("teamMembersInput"),
  saveTeamMembers: document.getElementById("saveTeamMembers"),
  settingsPanel: document.getElementById("settingsPanel"),
  dayFilter: document.getElementById("dayFilter"),
  timeFilter: document.getElementById("timeFilter"),
  typeFilter: document.getElementById("typeFilter")
};

const sampleSessions = [
  {
    id: "sample-keynote",
    type: "Keynote",
    name: "Opening Keynote: AI and Admissions",
    speaker: "Taylor Rivera",
    description: "A high-level overview of current trends and opportunities for teams.",
    day: "Day 1",
    time: "9:00 AM"
  },
  {
    id: "sample-workshop",
    type: "Workshop",
    name: "Building Better Yield Campaigns",
    speaker: "Jordan Lee",
    description: "Hands-on examples for campaign design, segmentation, and measurement.",
    day: "Day 1",
    time: "2:00 PM"
  }
];

let state = loadState();
state.filters = state.filters || { day: "", time: "", type: "" };
state.settingsOpen = Boolean(state.settingsOpen ?? false);

elements.endpoint.value = state.endpoint || DEFAULT_ENDPOINT;
elements.teamMembersInput.value = (state.teamMembers || []).join(", ");
elements.settingsPanel.open = state.settingsOpen;

wireEvents();
loadSessions();

function wireEvents() {
  elements.loadSessions.addEventListener("click", async () => {
    state.endpoint = elements.endpoint.value.trim() || DEFAULT_ENDPOINT;
    saveState();
    await loadSessions();
    state.settingsOpen = false;
    elements.settingsPanel.open = false;
    saveState();
  });

  elements.saveTeamMembers.addEventListener("click", () => {
    state.teamMembers = normalizeNameList(elements.teamMembersInput.value);
    elements.teamMembersInput.value = state.teamMembers.join(", ");
    state.settingsOpen = false;
    elements.settingsPanel.open = false;
    saveState();
    renderFilteredSessions();
  });

  elements.settingsPanel.addEventListener("toggle", () => {
    state.settingsOpen = elements.settingsPanel.open;
    saveState();
  });

  elements.dayFilter.addEventListener("change", () => {
    state.filters.day = elements.dayFilter.value;
    saveState();
    renderFilteredSessions();
  });

  elements.timeFilter.addEventListener("change", () => {
    state.filters.time = elements.timeFilter.value;
    saveState();
    renderFilteredSessions();
  });

  elements.typeFilter.addEventListener("change", () => {
    state.filters.type = elements.typeFilter.value;
    saveState();
    renderFilteredSessions();
  });
}

async function loadSessions() {
  setStatus("Loading sessions...");

  const endpoint = elements.endpoint.value.trim() || DEFAULT_ENDPOINT;
  let sessions = [];

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    const payload = await response.json();
    sessions = normalizeSessions(payload);

    if (!sessions.length) {
      throw new Error("No sessions found in endpoint response");
    }

    setStatus(`Loaded ${sessions.length} sessions from endpoint.`);
  } catch (error) {
    sessions = normalizeSessions(sampleSessions);
    setStatus(`Could not load endpoint (${error.message}). Showing sample sessions.`);
  }

  state.sessions = sessions;
  saveState();
  syncFilterControls();
  renderFilteredSessions();
}

function normalizeSessions(payload) {
  const raw = extractRecords(payload);
  const sessions = raw
    .map((record, index) => {
      const type = pickValue(record, ["type", "session_type", "category", "track", "group"]) || "Other";
      const name = pickValue(record, ["name", "title", "session", "session_name", "event"]) || `Session ${index + 1}`;
      const speaker = pickValue(record, ["speaker", "presenter", "facilitator", "host", "faculty"]) || "Speaker to be determined";
      const description = pickValue(record, ["description", "abstract", "summary", "details", "body"]) || "No description provided.";
      const id =
        pickValue(record, ["id", "session_id", "uuid", "slug"]) ||
        `${slugify(type)}-${slugify(name)}-${slugify(speaker)}`;

      const schedule = deriveSchedule(record);

      return {
        id,
        type: String(type),
        typeKey: slugify(type) || "uncategorized",
        name: String(name),
        speaker: String(speaker),
        description: String(description),
        dayLabel: schedule.dayLabel,
        dayKey: schedule.dayKey,
        timeLabel: schedule.timeLabel,
        timeKey: schedule.timeKey
      };
    })
    .filter((session) => session.name.trim().length);

  return deduplicateById(sessions);
}

function deriveSchedule(record) {
  const dayRaw = pickValue(record, ["day", "date", "session_date", "event_date", "start_date"]);
  const timeRaw = pickValue(record, ["time", "session_time", "start_time", "hour"]);
  const dateTimeRaw = pickValue(record, ["start", "start_at", "start_datetime", "datetime", "date_time"]);

  const dateFromDateTime = parseDate(dateTimeRaw);

  const dayLabel =
    formatDayLabel(dayRaw) ||
    (dateFromDateTime ? formatDateForDay(dateFromDateTime) : "Unscheduled");

  const timeLabel =
    formatTimeLabel(timeRaw) ||
    (dateFromDateTime ? formatDateForTime(dateFromDateTime) : "Unscheduled");

  return {
    dayLabel,
    dayKey: slugify(dayLabel) || "unscheduled",
    timeLabel,
    timeKey: slugify(timeLabel) || "unscheduled"
  };
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function formatDayLabel(value) {
  if (!value) {
    return "";
  }

  const raw = String(value).trim();
  const parsed = parseDate(raw);
  if (parsed) {
    return formatDateForDay(parsed);
  }

  return raw;
}

function formatTimeLabel(value) {
  if (!value) {
    return "";
  }

  const raw = String(value).trim();
  const parsed = parseDate(raw);
  if (parsed) {
    return formatDateForTime(parsed);
  }

  return raw;
}

function formatDateForDay(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatDateForTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function extractRecords(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const likelyKeys = ["rows", "results", "data", "items", "sessions"];
  for (const key of likelyKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return Object.values(payload).find((value) => Array.isArray(value)) || [];
}

function pickValue(record, hints) {
  if (!record || typeof record !== "object") {
    return "";
  }

  const entries = Object.entries(record);
  const lowerMap = new Map(entries.map(([key, value]) => [key.toLowerCase(), value]));

  for (const hint of hints) {
    if (lowerMap.has(hint.toLowerCase())) {
      return lowerMap.get(hint.toLowerCase());
    }
  }

  for (const [key, value] of entries) {
    const keyLower = key.toLowerCase();
    if (hints.some((hint) => keyLower.includes(hint.toLowerCase()))) {
      return value;
    }
  }

  return "";
}

function deduplicateById(sessions) {
  const seen = new Set();
  return sessions.filter((session) => {
    const key = session.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function syncFilterControls() {
  const sessions = state.sessions || [];
  const dayOptions = createFilterOptions(sessions, "dayKey", "dayLabel");
  const timeOptions = createFilterOptions(sessions, "timeKey", "timeLabel");
  const typeOptions = createFilterOptions(sessions, "typeKey", "type");

  setSelectOptions(elements.dayFilter, dayOptions, "All days", "day");
  setSelectOptions(elements.timeFilter, timeOptions, "All times", "time");
  setSelectOptions(elements.typeFilter, typeOptions, "All session types", "type");
}

function createFilterOptions(sessions, keyField, labelField) {
  const optionMap = new Map();

  sessions.forEach((session) => {
    const key = session[keyField];
    const label = session[labelField];
    if (key && label && !optionMap.has(key)) {
      optionMap.set(key, label);
    }
  });

  return [...optionMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function setSelectOptions(selectElement, options, allLabel, filterKey) {
  const desiredValue = state.filters[filterKey] || "";
  const availableValues = new Set(options.map((option) => option.value));
  const nextValue = availableValues.has(desiredValue) ? desiredValue : "";

  selectElement.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  selectElement.appendChild(allOption);

  options.forEach((option) => {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    selectElement.appendChild(optionEl);
  });

  selectElement.value = nextValue;
  state.filters[filterKey] = nextValue;
}

function renderFilteredSessions() {
  const sessions = state.sessions || [];
  const filtered = sessions.filter((session) => {
    const dayMatches = !state.filters.day || session.dayKey === state.filters.day;
    const timeMatches = !state.filters.time || session.timeKey === state.filters.time;
    const typeMatches = !state.filters.type || session.typeKey === state.filters.type;
    return dayMatches && timeMatches && typeMatches;
  });

  renderSessions(filtered);
}

function renderSessions(sessions) {
  elements.sessions.innerHTML = "";

  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.textContent = "No sessions match the selected filters.";
    elements.sessions.appendChild(empty);
    return;
  }

  const grouped = new Map();
  sessions.forEach((session) => {
    const group = session.type || "Other";
    if (!grouped.has(group)) {
      grouped.set(group, []);
    }
    grouped.get(group).push(session);
  });

  [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([groupName, groupSessions]) => {
      const heading = document.createElement("h3");
      heading.textContent = groupName;
      heading.className = "group-heading";
      elements.sessions.appendChild(heading);

      const groupWrap = document.createElement("div");
      groupWrap.className = "sessions";
      elements.sessions.appendChild(groupWrap);

      groupSessions.forEach((session) => {
        const fragment = elements.template.content.cloneNode(true);
        const card = fragment.querySelector(".session-card");
        card.dataset.sessionId = session.id;

        fragment.querySelector(".session-name").textContent = session.name;
        fragment.querySelector(".session-type").textContent = session.type;
        fragment.querySelector(".session-speaker").textContent = `Speaker: ${session.speaker}`;
        fragment.querySelector(".session-meta").textContent = `${session.dayLabel} • ${session.timeLabel}`;
        fragment.querySelector(".session-description").textContent = session.description;

        const prefs = state.preferences?.[session.id] || {};
        const interesting = fragment.querySelector(".interesting");
        const attending = fragment.querySelector(".attending");
        const teamAttending = fragment.querySelector(".team-attending");
        const notes = fragment.querySelector(".notes");

        interesting.checked = Boolean(prefs.interesting);
        attending.checked = Boolean(prefs.attending);
        teamAttending.value = (prefs.teamAttending || []).join(", ");
        notes.value = prefs.notes || "";

        interesting.addEventListener("change", () => updatePreference(session.id, "interesting", interesting.checked));
        attending.addEventListener("change", () => updatePreference(session.id, "attending", attending.checked));
        teamAttending.addEventListener("change", () =>
          updatePreference(session.id, "teamAttending", filterToKnownTeam(teamAttending.value))
        );
        notes.addEventListener("change", () => updatePreference(session.id, "notes", notes.value.trim()));

        groupWrap.appendChild(fragment);
      });
    });
}

function filterToKnownTeam(rawInput) {
  const requested = normalizeNameList(rawInput);
  if (!state.teamMembers?.length) {
    return requested;
  }

  const validTeam = new Set(state.teamMembers.map((member) => member.toLowerCase()));
  return requested.filter((member) => validTeam.has(member.toLowerCase()));
}

function updatePreference(sessionId, key, value) {
  state.preferences ||= {};
  state.preferences[sessionId] ||= {};
  state.preferences[sessionId][key] = value;
  saveState();
}

function normalizeNameList(raw) {
  return String(raw || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      endpoint: parsed.endpoint || DEFAULT_ENDPOINT,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      preferences: parsed.preferences && typeof parsed.preferences === "object" ? parsed.preferences : {},
      teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : [],
      filters: parsed.filters && typeof parsed.filters === "object" ? parsed.filters : { day: "", time: "", type: "" },
      settingsOpen: Boolean(parsed.settingsOpen)
    };
  } catch (_) {
    return {
      endpoint: DEFAULT_ENDPOINT,
      sessions: [],
      preferences: {},
      teamMembers: [],
      filters: { day: "", time: "", type: "" },
      settingsOpen: false
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setStatus(message) {
  elements.status.textContent = message;
}
