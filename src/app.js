// Configuration and standards
const POINT_ANCHORS = [20, 40, 60, 80, 100];
const EVENT_COUNT = 5;
const STRENGTH_SCALING = {
  exponent: 0.67,
  referenceBodyweight: {
    male: 180,
    female: 140
  }
};

const TABLES = {
  male: {
    squatRatio: [0.65, 0.95, 1.25, 1.50, 1.75],
    benchRatio: [0.55, 0.80, 1.05, 1.25, 1.45],
    eventThree: [1, 5, 10, 14, 18],
    dashSec: [6.5, 5.8, 5.2, 4.8, 4.5],
    runSec: [960, 825, 705, 615, 540],
    rowSec: [675, 545, 470, 425, 390]
  },
  female: {
    squatRatio: [0.50, 0.75, 1.00, 1.20, 1.45],
    benchRatio: [0.30, 0.50, 0.70, 0.85, 1.00],
    eventThree: [10, 25, 50, 75, 110],
    dashSec: [7.2, 6.5, 5.9, 5.5, 5.1],
    runSec: [1080, 915, 780, 690, 615],
    rowSec: [780, 645, 555, 500, 460]
  }
};

const SEX_BY_LAST_NAME = {
  Snyder: "female",
  Mahrlig: "female"
};

function getSexForLastName(lastName) {
  return SEX_BY_LAST_NAME[lastName] || "male";
}

// Firebase
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyArKbnGgpccWyBqK9jfU3s9l09Kw8h_rZI",
  authDomain: "heat-index-bfb8d.firebaseapp.com",
  projectId: "heat-index-bfb8d",
  storageBucket: "heat-index-bfb8d.firebasestorage.app",
  messagingSenderId: "366708033551",
  appId: "1:366708033551:web:a60f236a34c0a1c6d77b7a"
};

const HAS_FIREBASE_CONFIG = FIREBASE_CONFIG.apiKey !== "PASTE_YOUR_API_KEY";
let db = null;
if (HAS_FIREBASE_CONFIG) {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
}

let leaderboardRows = [];

const LEADERBOARD_VIEWS = {
  overall: {
    label: "Overall Heat Index"
  },
  squat: {
    label: "Squat 3RM",
    valueKey: "squatValue",
    rawKey: "squatRaw",
    scoreKey: "squatScore"
  },
  bench: {
    label: "Incline Bench 3RM",
    valueKey: "benchValue",
    rawKey: "benchRaw",
    scoreKey: "benchScore"
  },
  eventThree: {
    label: "Pull-Ups / Hang",
    valueKey: "eventThreeValue",
    rawKey: "eventThreeRaw",
    scoreKey: "eventThreeScore"
  },
  dash: {
    label: "40-Yard Dash",
    valueKey: "dashValue",
    rawKey: "dashRaw",
    scoreKey: "dashScore"
  },
  cardio: {
    label: "Run / Row",
    valueKey: "mileValue",
    rawKey: "mileRaw",
    scoreKey: "mileScore",
    modeKey: "cardioMode"
  }
};

// Scoring helpers
function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getReferenceBodyweight(sex) {
  return STRENGTH_SCALING.referenceBodyweight[sex] || STRENGTH_SCALING.referenceBodyweight.male;
}

function computeAllometricBodyweight(bodyweight, sex) {
  const referenceBodyweight = getReferenceBodyweight(sex);
  const safeBodyweight = bodyweight !== null && bodyweight > 0 ? bodyweight : referenceBodyweight;
  return Math.pow(safeBodyweight, STRENGTH_SCALING.exponent) *
    Math.pow(referenceBodyweight, 1 - STRENGTH_SCALING.exponent);
}

function computeAllometricLiftRatio(lift, bodyweight, sex) {
  if (!(lift > 0) || !(bodyweight > 0)) return null;
  return lift / computeAllometricBodyweight(bodyweight, sex);
}

function computeEventThreeAllometric(rawValue, bodyweight, addedWeight, sex) {
  if (rawValue === null) {
    return {
      adjustedValue: null,
      loadFactor: 1,
      totalLoad: null,
      bodyweightUsed: null,
      addedWeight: 0,
      usedReferenceBodyweight: false
    };
  }

  const referenceBodyweight = getReferenceBodyweight(sex);
  const bodyweightUsed = bodyweight !== null && bodyweight > 0 ? bodyweight : referenceBodyweight;
  const safeAddedWeight = addedWeight !== null && addedWeight > 0 ? addedWeight : 0;
  const allometricBodyweight = computeAllometricBodyweight(bodyweightUsed, sex);
  const totalLoad = bodyweightUsed + safeAddedWeight;
  const loadFactor = totalLoad / allometricBodyweight;

  return {
    adjustedValue: rawValue * loadFactor,
    loadFactor,
    totalLoad,
    bodyweightUsed,
    addedWeight: safeAddedWeight,
    usedReferenceBodyweight: !(bodyweight !== null && bodyweight > 0)
  };
}

function computeScoresFromValues(values) {
  const sex = values.sex || "male";
  const table = TABLES[sex] || TABLES.male;
  const bw = parseOptionalNumber(values.bodyweight);
  const squat = parseOptionalNumber(values.squat);
  const bench = parseOptionalNumber(values.bench);
  const eventThreeRaw = parseOptionalNumber(values.pullups);
  const eventThreeWeight = parseOptionalNumber(values.eventThreeWeight);
  const dashSec = parseOptionalNumber(values.dashSec);
  const mileMin = parseOptionalNumber(values.mileMin);
  const mileSec = parseOptionalNumber(values.mileSec);
  const rowMin = parseOptionalNumber(values.rowMin);
  const rowSec = parseOptionalNumber(values.rowSec);

  const squatRatio = computeAllometricLiftRatio(squat, bw, sex);
  const benchRatio = computeAllometricLiftRatio(bench, bw, sex);
  const eventThreeValue = eventThreeRaw !== null && eventThreeRaw >= 0 ? eventThreeRaw : null;
  const eventThreeAllometric = computeEventThreeAllometric(eventThreeValue, bw, eventThreeWeight, sex);
  const mileTotalSec = (mileMin !== null && mileSec !== null) ? (mileMin * 60 + mileSec) : null;
  const rowTotalSec = (rowMin !== null && rowSec !== null) ? (rowMin * 60 + rowSec) : null;

  const squatScore = squatRatio ? interpolateScore(squatRatio, table.squatRatio, true) : 0;
  const benchScore = benchRatio ? interpolateScore(benchRatio, table.benchRatio, true) : 0;
  const eventThreeScore = eventThreeAllometric.adjustedValue !== null
    ? interpolateScore(eventThreeAllometric.adjustedValue, table.eventThree, true)
    : 0;
  const dashScore = dashSec ? interpolateScore(-dashSec, table.dashSec.map(v => -v), true) : 0;
  const runScore = mileTotalSec ? interpolateScore(-mileTotalSec, table.runSec.map(v => -v), true) : 0;
  const rowScore = rowTotalSec ? interpolateScore(-rowTotalSec, table.rowSec.map(v => -v), true) : 0;
  const mileScore = Math.max(runScore, rowScore);
  const conditioningMode = mileScore === 0 ? null : (runScore >= rowScore ? "run" : "row");

  const totalScore = (
    squatScore +
    benchScore +
    eventThreeScore +
    dashScore +
    mileScore
  ) / EVENT_COUNT;

  return {
    squatScore,
    benchScore,
    eventThreeScore,
    dashScore,
    mileScore,
    totalScore,
    squatRatio,
    benchRatio,
    eventThreeValue,
    eventThreeAdjustedValue: eventThreeAllometric.adjustedValue,
    eventThreeLoadFactor: eventThreeAllometric.loadFactor,
    eventThreeTotalLoad: eventThreeAllometric.totalLoad,
    eventThreeBodyweightUsed: eventThreeAllometric.bodyweightUsed,
    eventThreeAddedWeight: eventThreeAllometric.addedWeight,
    eventThreeUsedReferenceBodyweight: eventThreeAllometric.usedReferenceBodyweight,
    dashSec,
    mileTotalSec,
    rowTotalSec,
    runScore,
    rowScore,
    conditioningMode
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function formatTime(totalSec) {
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatEventThreeMeta(scores, sex) {
  const rawLabel = sex === "male"
    ? `Strict reps: ${scores.eventThreeValue}`
    : `Dead-bar hang: ${scores.eventThreeValue} sec`;

  if (scores.eventThreeAdjustedValue === null) {
    return rawLabel;
  }

  const adjustedLabel = sex === "male"
    ? `${round1(scores.eventThreeAdjustedValue)} scaled reps`
    : `${round1(scores.eventThreeAdjustedValue)} scaled sec`;
  const addedLabel = scores.eventThreeAddedWeight > 0 ? `, +${scores.eventThreeAddedWeight} lb` : "";
  const referenceLabel = scores.eventThreeUsedReferenceBodyweight ? " using reference BW" : "";
  return `${rawLabel} | ${adjustedLabel} (${Math.round(scores.eventThreeTotalLoad)} lb load${addedLabel}${referenceLabel})`;
}

function rankBadge(index) {
  if (index === 0) return '<span class="place-badge place-gold">1</span>';
  if (index === 1) return '<span class="place-badge place-silver">2</span>';
  if (index === 2) return '<span class="place-badge place-bronze">3</span>';
  return `${index + 1}`;
}

function interpolateScore(value, thresholds, higherIsBetter = true) {
  if (value === null || Number.isNaN(value)) return 0;

  const t = higherIsBetter ? thresholds : [...thresholds].reverse();
  const p = higherIsBetter ? POINT_ANCHORS : [...POINT_ANCHORS].reverse();
  const v = higherIsBetter ? value : -value;
  const tv = higherIsBetter ? t : t.map(x => -x);

  if (v <= tv[0]) {
    const slope = (p[1] - p[0]) / (tv[1] - tv[0]);
    return Math.max(0, p[0] + (v - tv[0]) * slope);
  }

  for (let i = 0; i < tv.length - 1; i++) {
    if (v >= tv[i] && v <= tv[i + 1]) {
      const slope = (p[i + 1] - p[i]) / (tv[i + 1] - tv[i]);
      return p[i] + (v - tv[i]) * slope;
    }
  }

  const last = tv.length - 1;
  const slope = (p[last] - p[last - 1]) / (tv[last] - tv[last - 1]);
  return p[last] + (v - tv[last]) * slope;
}

function updateBar(id, score) {
  const width = clamp(score, 0, 120);
  document.getElementById(id).style.width = `${(width / 120) * 100}%`;
}

// Calculator UI
function calculateScore() {
  const sex = document.getElementById("sex").value;
  const bw = parseFloat(document.getElementById("bodyweight").value);
  const squat = parseFloat(document.getElementById("squat").value);
  const bench = parseFloat(document.getElementById("bench").value);
  const eventThreeRaw = parseFloat(document.getElementById("pullups").value);
  const eventThreeWeight = parseFloat(document.getElementById("eventThreeWeight").value);
  const dashSec = parseFloat(document.getElementById("dashSec").value);
  const mileMin = parseFloat(document.getElementById("mileMin").value);
  const mileSec = parseFloat(document.getElementById("mileSec").value);
  const rowMin = parseFloat(document.getElementById("rowMin").value);
  const rowSec = parseFloat(document.getElementById("rowSec").value);

  const scores = computeScoresFromValues({
    sex,
    bodyweight: bw,
    squat,
    bench,
    pullups: eventThreeRaw,
    eventThreeWeight,
    dashSec,
    mileMin,
    mileSec,
    rowMin,
    rowSec
  });

  document.getElementById("squatScore").textContent = round1(scores.squatScore);
  document.getElementById("benchScore").textContent = round1(scores.benchScore);
  document.getElementById("eventThreeScore").textContent = round1(scores.eventThreeScore);
  document.getElementById("dashScore").textContent = round1(scores.dashScore);
  document.getElementById("mileScore").textContent = round1(scores.mileScore);
  document.getElementById("totalScore").textContent = round1(scores.totalScore);

  const mobileTotalScore = document.getElementById("mobileTotalScore");
  if (mobileTotalScore) mobileTotalScore.textContent = round1(scores.totalScore);

  document.getElementById("eventThreeTitle").textContent = "Pull-Ups / Dead-Bar Hang";

  document.getElementById("squatMeta").textContent =
    scores.squatRatio ? `Scaled ratio: ${scores.squatRatio.toFixed(2)}` : "Enter squat and bodyweight";

  document.getElementById("benchMeta").textContent =
    scores.benchRatio ? `Scaled ratio: ${scores.benchRatio.toFixed(2)}` : "Enter incline bench and bodyweight";

  document.getElementById("eventThreeMeta").textContent =
    scores.eventThreeValue !== null
      ? formatEventThreeMeta(scores, sex)
      : "Men: pull-ups. Women: dead-bar hang.";

  document.getElementById("dashMeta").textContent =
    scores.dashSec ? `Dash time: ${scores.dashSec.toFixed(2)} sec` : "Enter a 40-yard dash time.";

  document.getElementById("mileMeta").textContent =
    scores.conditioningMode === "run"
      ? `Using run: ${formatTime(scores.mileTotalSec)} (${round1(scores.runScore)} pts)`
      : scores.conditioningMode === "row"
        ? `Using row: ${formatTime(scores.rowTotalSec)} (${round1(scores.rowScore)} pts)`
        : "Enter a 1.64-mile run time, a 2000m row time, or both.";

  document.getElementById("cardioBadge").textContent =
    scores.conditioningMode === "run"
      ? "Cardio used: Run"
      : scores.conditioningMode === "row"
        ? "Cardio used: Row"
        : "Cardio used: —";

  const mobileCardioBadge = document.getElementById("mobileCardioBadge");
  if (mobileCardioBadge) {
    mobileCardioBadge.textContent =
      scores.conditioningMode === "run"
        ? "Cardio: Run"
        : scores.conditioningMode === "row"
          ? "Cardio: Row"
          : "Cardio: —";
  }

  updateBar("squatBar", scores.squatScore);
  updateBar("benchBar", scores.benchScore);
  updateBar("eventThreeBar", scores.eventThreeScore);
  updateBar("dashBar", scores.dashScore);
  updateBar("mileBar", scores.mileScore);
}

function getFormData() {
  return {
    lastName: document.getElementById("lastName").value,
    sex: document.getElementById("sex").value,
    bodyweight: document.getElementById("bodyweight").value,
    squat: document.getElementById("squat").value,
    bench: document.getElementById("bench").value,
    pullups: document.getElementById("pullups").value,
    eventThreeWeight: document.getElementById("eventThreeWeight").value,
    dashSec: document.getElementById("dashSec").value,
    mileMin: document.getElementById("mileMin").value,
    mileSec: document.getElementById("mileSec").value,
    rowMin: document.getElementById("rowMin").value,
    rowSec: document.getElementById("rowSec").value
  };
}

// Local form persistence
function setFormData(data) {
  if (!data) return;
  document.getElementById("lastName").value = data.lastName || "";
  document.getElementById("sex").value = data.lastName ? getSexForLastName(data.lastName) : (data.sex || "male");
  document.getElementById("bodyweight").value = data.bodyweight || "";
  document.getElementById("squat").value = data.squat || "";
  document.getElementById("bench").value = data.bench || "";
  document.getElementById("pullups").value = data.pullups || "";
  document.getElementById("eventThreeWeight").value = data.eventThreeWeight || "";
  document.getElementById("dashSec").value = data.dashSec || "";
  document.getElementById("mileMin").value = data.mileMin || "";
  document.getElementById("mileSec").value = data.mileSec || "";
  document.getElementById("rowMin").value = data.rowMin || "";
  document.getElementById("rowSec").value = data.rowSec || "";
}

function saveToLocal() {
  localStorage.setItem("heatIndexForm", JSON.stringify(getFormData()));
  alert("Saved locally on this device.");
}

// Firebase writes
async function uploadPRs() {
  if (!HAS_FIREBASE_CONFIG || !db) {
    alert("Add your Firebase config in index.html first.");
    return;
  }

  const lastName = document.getElementById("lastName").value.trim();
  if (!lastName) {
    alert("Select your last name before uploading.");
    return;
  }

  const formData = getFormData();
  const hasRunMin = formData.mileMin !== "";
  const hasRunSec = formData.mileSec !== "";
  const hasRowMin = formData.rowMin !== "";
  const hasRowSec = formData.rowSec !== "";

  if (hasRunMin !== hasRunSec) {
    alert("Enter both run minutes and run seconds, or leave both blank.");
    return;
  }

  if (hasRowMin !== hasRowSec) {
    alert("Enter both row minutes and row seconds, or leave both blank.");
    return;
  }

  try {
    const docRef = db.collection("heatIndexPRs").doc(lastName.toLowerCase());
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data() : {};

    const updates = {
      lastName,
      sex: getSexForLastName(lastName),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    ["bodyweight", "squat", "bench", "pullups", "eventThreeWeight", "dashSec", "mileMin", "mileSec", "rowMin", "rowSec"].forEach((key) => {
      if (formData[key] !== "") {
        updates[key] = formData[key];
      }
    });

    const merged = { ...existing, ...updates };
    const scores = computeScoresFromValues(merged);
    updates.totalScore = round1(scores.totalScore);

    await docRef.set(updates, { merge: true });
    alert(`Uploaded PRs for ${lastName}.`);
    loadLeaderboard();
  } catch (error) {
    console.error("Upload PRs failed:", error);
    alert(`Upload failed: ${error.code || "unknown_error"}${error.message ? ` - ${error.message}` : ""}`);
  }
}

// Leaderboards
function getDivisionLabel(division) {
  if (division === "male") return "men";
  if (division === "female") return "women";
  return "all divisions";
}

function getLeaderboardSelection() {
  const viewControl = document.getElementById("leaderboardView");
  const divisionControl = document.getElementById("leaderboardSex");

  return {
    view: viewControl ? viewControl.value : "overall",
    division: divisionControl ? divisionControl.value : "all"
  };
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboardContent");
  if (!container) return;

  const summaryEl = document.getElementById("leaderboardSummary");
  const { view, division } = getLeaderboardSelection();
  const config = LEADERBOARD_VIEWS[view] || LEADERBOARD_VIEWS.overall;
  const divisionRows = leaderboardRows.filter((row) => division === "all" || row.sex === division);
  const divisionLabel = getDivisionLabel(division);

  if (!leaderboardRows.length) {
    if (summaryEl) summaryEl.textContent = "No PRs uploaded yet.";
    container.innerHTML = '<p class="small">No PRs uploaded yet.</p>';
    return;
  }

  if (!divisionRows.length) {
    if (summaryEl) summaryEl.textContent = `No uploaded PRs for ${divisionLabel}.`;
    container.innerHTML = '<p class="small">No matching PRs for this filter.</p>';
    return;
  }

  if (view === "overall") {
    const rankedRows = [...divisionRows].sort((a, b) => b.totalScore - a.totalScore);
    if (summaryEl) summaryEl.textContent = `Showing overall Heat Index rankings for ${divisionLabel}.`;

    let html = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Last Name</th>
              <th>Sex</th>
              <th>Heat Index</th>
              <th>Squat 3RM</th>
              <th>Incline Bench 3RM</th>
              <th>Pull-Ups / Hang</th>
              <th>40-Yard</th>
              <th>Cardio</th>
            </tr>
          </thead>
          <tbody>
    `;

    rankedRows.forEach((row, index) => {
      html += `
        <tr>
          <td>${rankBadge(index)}</td>
          <td>${row.lastName}</td>
          <td>${row.sex === "male" ? "M" : "F"}</td>
          <td>${row.totalScore}</td>
          <td>${row.squatRaw}<br><span class="small">${row.squatScore} pts</span></td>
          <td>${row.benchRaw}<br><span class="small">${row.benchScore} pts</span></td>
          <td>${row.eventThreeRaw}<br><span class="small">${row.eventThreeScore} pts</span></td>
          <td>${row.dashRaw}<br><span class="small">${row.dashScore} pts</span></td>
          <td>${row.cardioMode !== '-' ? row.cardioMode + ' ' : ''}${row.mileRaw}<br><span class="small">${row.mileScore} pts</span></td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
    container.innerHTML = html;
    return;
  }

  const rankedRows = divisionRows
    .filter((row) => row[config.valueKey] !== null && row[config.valueKey] !== undefined)
    .sort((a, b) => b[config.scoreKey] - a[config.scoreKey]);

  if (!rankedRows.length) {
    if (summaryEl) summaryEl.textContent = `No ${config.label} PRs uploaded for ${divisionLabel}.`;
    container.innerHTML = '<p class="small">No matching PRs for this event.</p>';
    return;
  }

  if (summaryEl) summaryEl.textContent = `Showing ${config.label} rankings for ${divisionLabel}.`;

  let html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Last Name</th>
            <th>Sex</th>
            <th>Result</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
  `;

  rankedRows.forEach((row, index) => {
    const rawResult = config.modeKey && row[config.modeKey] !== "-"
      ? `${row[config.modeKey]} ${row[config.rawKey]}`
      : row[config.rawKey];

    html += `
      <tr>
        <td>${rankBadge(index)}</td>
        <td>${row.lastName}</td>
        <td>${row.sex === "male" ? "M" : "F"}</td>
        <td>${rawResult}</td>
        <td>${row[config.scoreKey]}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;
  container.innerHTML = html;
}

async function loadLeaderboard() {
  const container = document.getElementById("leaderboardContent");
  if (!container) return;

  const updatedEl = document.getElementById("leaderboardUpdatedAt");

  if (!HAS_FIREBASE_CONFIG || !db) {
    if (updatedEl) updatedEl.textContent = "Last updated: Firebase not connected";
    leaderboardRows = [];
    const summaryEl = document.getElementById("leaderboardSummary");
    if (summaryEl) summaryEl.textContent = "Live leaderboard needs Firebase connection.";
    container.innerHTML = '<p class="small">Add your Firebase config in the script block to enable the live leaderboard.</p>';
    return;
  }

  const snapshot = await db.collection("heatIndexPRs").get();
  const rows = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const scores = computeScoresFromValues(data);

    const bodyweight = parseOptionalNumber(data.bodyweight);
    const squat = parseOptionalNumber(data.squat);
    const bench = parseOptionalNumber(data.bench);
    const eventThree = parseOptionalNumber(data.pullups);
    const eventThreeWeight = parseOptionalNumber(data.eventThreeWeight);
    const dashSec = parseOptionalNumber(data.dashSec);
    const mileMin = parseOptionalNumber(data.mileMin);
    const mileSec = parseOptionalNumber(data.mileSec);
    const rowMin = parseOptionalNumber(data.rowMin);
    const rowSec = parseOptionalNumber(data.rowSec);
    const mileTotalSec = (mileMin !== null && mileSec !== null) ? (mileMin * 60 + mileSec) : null;
    const rowTotalSec = (rowMin !== null && rowSec !== null) ? (rowMin * 60 + rowSec) : null;

    rows.push({
      lastName: data.lastName || doc.id,
      totalScore: round1(scores.totalScore),
      sex: data.sex || "male",
      updatedAt: data.updatedAt && data.updatedAt.toDate ? data.updatedAt.toDate() : null,
      squatRaw: (squat !== null && bodyweight > 0) ? `${squat} lb (${scores.squatRatio.toFixed(2)} scaled)` : "-",
      squatScore: round1(scores.squatScore),
      squatValue: scores.squatRatio !== null ? scores.squatRatio : null,
      benchRaw: (bench !== null && bodyweight > 0) ? `${bench} lb (${scores.benchRatio.toFixed(2)} scaled)` : "-",
      benchScore: round1(scores.benchScore),
      benchValue: scores.benchRatio !== null ? scores.benchRatio : null,
      eventThreeRaw: eventThree !== null
        ? formatEventThreeMeta(scores, data.sex || "male")
        : "-",
      eventThreeScore: round1(scores.eventThreeScore),
      eventThreeValue: scores.eventThreeAdjustedValue !== null ? scores.eventThreeAdjustedValue : null,
      eventThreeWeight: eventThreeWeight !== null ? eventThreeWeight : null,
      dashRaw: dashSec !== null ? `${dashSec.toFixed(2)} sec` : "-",
      dashScore: round1(scores.dashScore),
      dashValue: dashSec !== null ? dashSec : null,
      cardioMode: scores.conditioningMode === "run"
        ? "Run"
        : scores.conditioningMode === "row"
          ? "Row"
          : "-",
      mileRaw: scores.conditioningMode === "run"
        ? formatTime(mileTotalSec)
        : scores.conditioningMode === "row"
          ? formatTime(rowTotalSec)
          : "-",
      mileScore: round1(scores.mileScore),
      mileValue: scores.mileScore > 0 ? scores.mileScore : null
    });
  });

  rows.sort((a, b) => b.totalScore - a.totalScore);

  const latestUpdate = rows.reduce((latest, row) => {
    if (!row.updatedAt) return latest;
    if (!latest) return row.updatedAt;
    return row.updatedAt > latest ? row.updatedAt : latest;
  }, null);

  if (updatedEl) {
    updatedEl.textContent = latestUpdate
      ? `Last updated: ${latestUpdate.toLocaleString()}`
      : "Last updated: unknown";
  }

  if (!rows.length) {
    if (updatedEl) updatedEl.textContent = "Last updated: no PRs uploaded yet";
    leaderboardRows = [];
    renderLeaderboard();
    return;
  }

  leaderboardRows = rows;
  renderLeaderboard();
}

// Local form controls
function loadFromLocal() {
  const saved = localStorage.getItem("heatIndexForm");
  if (!saved) {
    return;
  }
  setFormData(JSON.parse(saved));
  calculateScore();
}

function clearForm() {
  setFormData({});
  document.getElementById("sex").value = "male";
  document.getElementById("lastName").value = "";
  calculateScore();
}

function showPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });

  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.remove("active");
  });

  const targetPage = document.getElementById(`page-${pageName}`);
  const targetButton = document.querySelector(`.tab-btn[data-page="${pageName}"]`);

  if (targetPage) targetPage.classList.add("active");
  if (targetButton) targetButton.classList.add("active");
}

function showStandardsPanel(panelName) {
  document.querySelectorAll(".standards-panel").forEach((panel) => {
    const isActive = panel.dataset.standardPanel === panelName;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  });

  document.querySelectorAll(".segment-btn[data-standard-panel]").forEach((button) => {
    const isActive = button.dataset.standardPanel === panelName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

// Event wiring
document.querySelectorAll(".tab-btn").forEach((button) => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
    if (button.dataset.page === "leaderboard") {
      loadLeaderboard();
    }
  });
});

document.querySelectorAll(".segment-btn[data-standard-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    showStandardsPanel(button.dataset.standardPanel);
  });
});

["leaderboardView", "leaderboardSex"].forEach((id) => {
  const control = document.getElementById(id);
  if (control) {
    control.addEventListener("change", renderLeaderboard);
  }
});

document.getElementById("lastName").addEventListener("change", () => {
  const lastName = document.getElementById("lastName").value;
  document.getElementById("sex").value = getSexForLastName(lastName);
  calculateScore();
});

document.getElementById("sex").addEventListener("change", () => {
  calculateScore();
});

window.addEventListener("load", () => {
  loadFromLocal();
  const lastName = document.getElementById("lastName").value;
  document.getElementById("sex").value = getSexForLastName(lastName);
  calculateScore();
  showPage("home");
  showStandardsPanel("male");
  loadLeaderboard();
});
