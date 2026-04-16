const DEFAULT_ENDPOINT = "https://slate-partners.technolutions.net/manage/query/run?id=8b7142c2-6c70-4109-9eeb-74d2494ba7c8&cmd=service&output=json&h=b0203357-4804-4c5d-8213-9e376263af44";
const STORAGE_KEY = "summit-team-planner-state-v1";
const FALLBACK_CONFERENCE_YEAR = 2026;
const FALLBACK_CONFERENCE_DATES = {
  wednesday: { month: 5, day: 25 },
  thursday: { month: 5, day: 26 },
  friday: { month: 5, day: 27 }
};

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
  typeFilter: document.getElementById("typeFilter"),
  statusFilter: document.getElementById("statusFilter"),
  memberFilter: document.getElementById("memberFilter"),
  schedule: document.getElementById("schedule")
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
state.filters = state.filters || { day: "", time: "", type: "", status: "", member: "" };
state.filters.status ||= "";
state.filters.member ||= "";
state.settingsOpen = state.settingsOpen ?? false;

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
    syncFilterControls();
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

  elements.statusFilter.addEventListener("change", () => {
    state.filters.status = elements.statusFilter.value;
    saveState();
    renderFilteredSessions();
  });

  elements.memberFilter.addEventListener("change", () => {
    state.filters.member = elements.memberFilter.value;
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
        timeKey: schedule.timeKey,
        dateValue: schedule.dateValue,
        startMinutes: schedule.startMinutes
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
  const dateFromDayRaw = parseDate(dayRaw);
  const mappedConferenceDate = !dateFromDateTime && !dateFromDayRaw ? mapConferenceDate(dayRaw) : null;
  const activeDate = dateFromDateTime || dateFromDayRaw || mappedConferenceDate;

  const dayLabel = activeDate ? formatDateForDay(activeDate) : formatDayLabel(dayRaw) || "Unscheduled";
  const timeLabel = formatTimeLabel(timeRaw) || (dateFromDateTime ? formatDateForTime(dateFromDateTime) : "Unscheduled");

  return {
    dayLabel,
    dayKey: slugify(dayLabel) || "unscheduled",
    timeLabel,
    timeKey: slugify(timeLabel) || "unscheduled",
    dateValue: activeDate ? activeDate.toISOString().slice(0, 10) : "",
    startMinutes: parseTimeToMinutes(timeLabel)
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

function mapConferenceDate(dayValue) {
  const weekday = getWeekdayName(dayValue);
  if (!weekday || !FALLBACK_CONFERENCE_DATES[weekday]) {
    return null;
  }

  const mapped = FALLBACK_CONFERENCE_DATES[weekday];
  return new Date(FALLBACK_CONFERENCE_YEAR, mapped.month, mapped.day);
}

function getWeekdayName(value) {
  if (!value) {
    return "";
  }

  const normalized = String(value).toLowerCase();
  if (normalized.includes("wednesday") || normalized.includes("wed")) {
    return "wednesday";
  }
  if (normalized.includes("thursday") || normalized.includes("thu")) {
    return "thursday";
  }
  if (normalized.includes("friday") || normalized.includes("fri")) {
    return "friday";
  }
  return "";
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

function parseTimeToMinutes(value) {
  if (!value || value === "Unscheduled") {
    return null;
  }

  const match = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]) % 12;
  const minute = Number(match[2] || 0);
  const period = match[3].toUpperCase();
  if (period === "PM") {
    hour += 12;
  }

  return hour * 60 + minute;
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
  const memberOptions = (state.teamMembers || []).map((member) => ({ value: member, label: member }));

  setSelectOptions(elements.dayFilter, dayOptions, "All days", "day");
  setSelectOptions(elements.timeFilter, timeOptions, "All times", "time");
  setSelectOptions(elements.typeFilter, typeOptions, "All session types", "type");
  setSelectOptions(elements.memberFilter, memberOptions, "All team members", "member");
  setSelectOptions(
    elements.statusFilter,
    [
      { value: "interested", label: "Team interested" },
      { value: "going", label: "Team going" }
    ],
    "All sessions",
    "status"
  );
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
    const statusMatches = !state.filters.status || hasTeamStatus(session.id, state.filters.status, state.filters.member);
    const memberMatches = !state.filters.member || hasAnyTeamPreference(session.id, state.filters.member);
    return dayMatches && timeMatches && typeMatches && statusMatches && memberMatches;
  });

  renderSessions(filtered);
  renderSchedule(filtered);
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
        const teamControls = fragment.querySelector(".team-controls");
        const notes = fragment.querySelector(".notes");

        interesting.checked = Boolean(prefs.interesting);
        attending.checked = Boolean(prefs.attending);
        notes.value = prefs.notes || "";
        renderTeamControls(session.id, teamControls);

        interesting.addEventListener("change", () => updatePreference(session.id, "interesting", interesting.checked));
        attending.addEventListener("change", () => updatePreference(session.id, "attending", attending.checked));
        notes.addEventListener("change", () => updatePreference(session.id, "notes", notes.value.trim()));

        groupWrap.appendChild(fragment);
      });
    });
}

function updatePreference(sessionId, key, value) {
  state.preferences ||= {};
  state.preferences[sessionId] ||= {};
  state.preferences[sessionId][key] = value;
  saveState();
}

function renderTeamControls(sessionId, root) {
  root.innerHTML = "";

  if (!state.teamMembers?.length) {
    const hint = document.createElement("p");
    hint.className = "team-controls-empty";
    hint.textContent = "Add team members in Settings to track team interest and attendance.";
    root.appendChild(hint);
    return;
  }

  const title = document.createElement("p");
  title.className = "team-controls-title";
  title.textContent = "Team";
  root.appendChild(title);

  state.teamMembers.forEach((member) => {
    const row = document.createElement("div");
    row.className = "team-member-row";

    const name = document.createElement("span");
    name.className = "team-member-name";
    name.textContent = member;
    row.appendChild(name);

    const interestedLabel = document.createElement("label");
    const interested = document.createElement("input");
    interested.type = "checkbox";
    interested.checked = Boolean(getTeamPreference(sessionId, member).interested);
    interested.addEventListener("change", () => updateTeamPreference(sessionId, member, "interested", interested.checked));
    interestedLabel.append(interested, " Interested");
    row.appendChild(interestedLabel);

    const goingLabel = document.createElement("label");
    const going = document.createElement("input");
    going.type = "checkbox";
    going.checked = Boolean(getTeamPreference(sessionId, member).going);
    going.addEventListener("change", () => updateTeamPreference(sessionId, member, "going", going.checked));
    goingLabel.append(going, " Going");
    row.appendChild(goingLabel);

    root.appendChild(row);
  });
}

function getTeamPreference(sessionId, member) {
  const teamPrefs = state.preferences?.[sessionId]?.team || {};
  return teamPrefs[member] || { interested: false, going: false };
}

function updateTeamPreference(sessionId, member, key, value) {
  state.preferences ||= {};
  state.preferences[sessionId] ||= {};
  state.preferences[sessionId].team ||= {};
  state.preferences[sessionId].team[member] ||= { interested: false, going: false };
  state.preferences[sessionId].team[member][key] = value;
  saveState();
  renderFilteredSessions();
}

function hasAnyTeamPreference(sessionId, member) {
  const prefs = getTeamPreference(sessionId, member);
  return Boolean(prefs.interested || prefs.going);
}

function hasTeamStatus(sessionId, status, member) {
  const team = state.preferences?.[sessionId]?.team || {};
  const membersToCheck = member ? [member] : Object.keys(team);
  return membersToCheck.some((name) => Boolean(team[name]?.[status]));
}

function renderSchedule(sessions) {
  elements.schedule.innerHTML = "";

  const scheduled = sessions.filter((session) => session.dateValue && Number.isFinite(session.startMinutes));
  if (!scheduled.length) {
    elements.schedule.textContent = "No scheduled sessions for the selected filters.";
    return;
  }

  const dayMap = new Map();
  scheduled.forEach((session) => {
    if (!dayMap.has(session.dateValue)) {
      dayMap.set(session.dateValue, []);
    }
    dayMap.get(session.dateValue).push(session);
  });

  [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([, daySessions]) => {
      daySessions.sort((a, b) => a.startMinutes - b.startMinutes);
      const dayColumn = document.createElement("section");
      dayColumn.className = "schedule-day";

      const dayTitle = document.createElement("h3");
      dayTitle.textContent = daySessions[0].dayLabel;
      dayColumn.appendChild(dayTitle);

      daySessions.forEach((session) => {
        const item = document.createElement("article");
        item.className = "schedule-item";

        const heading = document.createElement("strong");
        heading.textContent = `${session.timeLabel} — ${session.name}`;
        item.appendChild(heading);

        const attendees = getGoingTeamMembers(session.id);
        const people = document.createElement("p");
        people.textContent = attendees.length ? `Going: ${attendees.join(", ")}` : "Going: None selected";
        item.appendChild(people);

        item.title = buildSessionTooltip(session);
        dayColumn.appendChild(item);
      });

      elements.schedule.appendChild(dayColumn);
    });
}

function getGoingTeamMembers(sessionId) {
  const team = state.preferences?.[sessionId]?.team || {};
  return Object.entries(team)
    .filter(([, pref]) => pref.going)
    .map(([name]) => name);
}

function buildSessionTooltip(session) {
  return `${session.name}\n${session.dayLabel} • ${session.timeLabel}\nSpeaker: ${session.speaker}\n${session.description}`;
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
    const normalizedPreferences = normalizeStoredPreferences(parsed.preferences);
    return {
      endpoint: parsed.endpoint || DEFAULT_ENDPOINT,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      preferences: normalizedPreferences,
      teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : [],
      filters:
        parsed.filters && typeof parsed.filters === "object"
          ? { day: parsed.filters.day || "", time: parsed.filters.time || "", type: parsed.filters.type || "", status: parsed.filters.status || "", member: parsed.filters.member || "" }
          : { day: "", time: "", type: "", status: "", member: "" },
      settingsOpen: Boolean(parsed.settingsOpen)
    };
  } catch (_) {
    return {
      endpoint: DEFAULT_ENDPOINT,
      sessions: [],
      preferences: {},
      teamMembers: [],
      filters: { day: "", time: "", type: "", status: "", member: "" },
      settingsOpen: false
    };
  }
}

function normalizeStoredPreferences(rawPreferences) {
  if (!rawPreferences || typeof rawPreferences !== "object") {
    return {};
  }

  const normalized = {};
  Object.entries(rawPreferences).forEach(([sessionId, prefs]) => {
    const safePrefs = prefs && typeof prefs === "object" ? { ...prefs } : {};
    const team = safePrefs.team && typeof safePrefs.team === "object" ? { ...safePrefs.team } : {};

    if (Array.isArray(safePrefs.teamAttending)) {
      safePrefs.teamAttending.forEach((name) => {
        team[name] ||= { interested: false, going: false };
        team[name].going = true;
      });
      delete safePrefs.teamAttending;
    }

    safePrefs.team = team;
    normalized[sessionId] = safePrefs;
  });

  return normalized;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setStatus(message) {
  elements.status.textContent = message;
}
