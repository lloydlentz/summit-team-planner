const DEFAULT_ENDPOINT = "https://slate-partners.technolutions.net/manage/query/run?id=8b7142c2-6c70-4109-9eeb-74d2494ba7c8&cmd=service&output=json&h=b0203357-4804-4c5d-8213-9e376263af44";
const STORAGE_KEY = "summit-team-planner-state-v1";

const elements = {
  endpoint: document.getElementById("endpoint"),
  loadSessions: document.getElementById("loadSessions"),
  status: document.getElementById("status"),
  sessions: document.getElementById("sessions"),
  template: document.getElementById("sessionTemplate"),
  teamMembersInput: document.getElementById("teamMembersInput"),
  saveTeamMembers: document.getElementById("saveTeamMembers")
};

const sampleSessions = [
  {
    id: "sample-keynote",
    type: "Keynote",
    name: "Opening Keynote: AI and Admissions",
    speaker: "Taylor Rivera",
    description: "A high-level overview of current trends and opportunities for teams."
  },
  {
    id: "sample-workshop",
    type: "Workshop",
    name: "Building Better Yield Campaigns",
    speaker: "Jordan Lee",
    description: "Hands-on examples for campaign design, segmentation, and measurement."
  }
];

let state = loadState();

elements.endpoint.value = state.endpoint || DEFAULT_ENDPOINT;
elements.teamMembersInput.value = (state.teamMembers || []).join(", ");

wireEvents();
loadSessions();

function wireEvents() {
  elements.loadSessions.addEventListener("click", () => {
    state.endpoint = elements.endpoint.value.trim() || DEFAULT_ENDPOINT;
    saveState();
    loadSessions();
  });

  elements.saveTeamMembers.addEventListener("click", () => {
    state.teamMembers = normalizeNameList(elements.teamMembersInput.value);
    elements.teamMembersInput.value = state.teamMembers.join(", ");
    saveState();
    renderSessions(state.sessions || []);
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
    sessions = sampleSessions;
    setStatus(`Could not load endpoint (${error.message}). Showing sample sessions.`);
  }

  state.sessions = sessions;
  saveState();
  renderSessions(sessions);
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

      return {
        id,
        type: String(type),
        name: String(name),
        speaker: String(speaker),
        description: String(description)
      };
    })
    .filter((session) => session.name.trim().length);

  return deduplicateById(sessions);
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

function renderSessions(sessions) {
  elements.sessions.innerHTML = "";

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
      teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : []
    };
  } catch (_) {
    return { endpoint: DEFAULT_ENDPOINT, sessions: [], preferences: {}, teamMembers: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setStatus(message) {
  elements.status.textContent = message;
}
