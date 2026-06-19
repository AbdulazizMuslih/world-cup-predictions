const SUPABASE_URL = "https://sresffkyggpuvgfqwuqq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TQx_OZ-LeNYcQA7-DNdUQA_IqmC7HES";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const musicBtn = document.getElementById("musicBtn");
const daiDaiAudio = document.getElementById("daiDaiAudio");

let currentParticipant = null;

const participantSelect = document.getElementById("participantSelect");
const pinInput = document.getElementById("pinInput");
const continueBtn = document.getElementById("continueBtn");
const loginMessage = document.getElementById("loginMessage");
const loginCard = document.getElementById("loginCard");
const dashboard = document.getElementById("dashboard");
const welcomeName = document.getElementById("welcomeName");

const availableMatches = document.getElementById("availableMatches");
const myPredictions = document.getElementById("myPredictions");
const leaderboard = document.getElementById("leaderboard");

const logoutBtn = document.getElementById("logoutBtn");

document.addEventListener("DOMContentLoaded", init);

musicBtn.addEventListener("click", async () => {
  if (daiDaiAudio.paused) {
    await daiDaiAudio.play();
    musicBtn.textContent = "⏸ إيقاف Dai Dai";
  } else {
    daiDaiAudio.pause();
    musicBtn.textContent = "▶ شغّل Dai Dai";
  }
});

daiDaiAudio.addEventListener("ended", () => {
  musicBtn.textContent = "▶ شغّل Dai Dai";
});

async function init() {
  setupTabs();
  await loadParticipants();
  await loadLeaderboard();
}

async function loadParticipants() {
  const { data, error } = await db
    .from("participants")
    .select("id, name")
    .eq("active", true)
    .order("name");

  if (error) {
    participantSelect.innerHTML = `<option value="">تعذر تحميل الأسماء</option>`;
    return;
  }

  participantSelect.innerHTML = `<option value="">اختر اسمك</option>`;

  data.forEach((participant) => {
    const option = document.createElement("option");
    option.value = participant.id;
    option.textContent = participant.name;
    participantSelect.appendChild(option);
  });
}

continueBtn.addEventListener("click", async () => {
  const participantId = participantSelect.value;
  const pin = pinInput.value.trim();

  if (!participantId || !pin) {
    loginMessage.textContent = "الرجاء اختيار الاسم وإدخال الرقم السري.";
    return;
  }

  const { data, error } = await db
    .from("participants")
    .select("id, name")
    .eq("id", participantId)
    .eq("pin", pin)
    .single();

  if (error || !data) {
    loginMessage.textContent = "الاسم أو الرقم السري غير صحيح.";
    return;
  }

  currentParticipant = data;
  welcomeName.textContent = data.name;

  loginCard.classList.add("hidden");
  dashboard.classList.remove("hidden");

  await loadAvailableMatches();
  await loadMyPredictions();
  await loadLeaderboard();
  await loadAdminMatches();
});

logoutBtn.addEventListener("click", () => {
  currentParticipant = null;
  pinInput.value = "";
  dashboard.classList.add("hidden");
  loginCard.classList.remove("hidden");
});

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = {
    available: document.getElementById("availableTab"),
    mine: document.getElementById("mineTab"),
    leaderboard: document.getElementById("leaderboardTab"),
    admin: document.getElementById("adminTab"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      Object.values(panels).forEach((panel) => panel.classList.add("hidden"));
      panels[tab.dataset.tab].classList.remove("hidden");
    });
  });
}

function isAvailable(kickoffAt) {
  const now = new Date();
  const kickoff = new Date(kickoffAt);
  const openTime = new Date(kickoff.getTime() - 24 * 60 * 60 * 1000);

  return now >= openTime && now < kickoff;
}

async function loadAvailableMatches() {
  const { data: matches, error } = await db
    .from("matches")
    .select("*")
    .eq("status", "scheduled")
    .order("kickoff_at");

  if (error) {
    availableMatches.innerHTML = `<p>تعذر تحميل المباريات.</p>`;
    return;
  }

  const openMatches = matches.filter((match) => isAvailable(match.kickoff_at));

  if (openMatches.length === 0) {
    availableMatches.innerHTML = `<p>لا توجد مباريات متاحة للتوقع حالياً.</p>`;
    return;
  }

  availableMatches.innerHTML = "";

  openMatches.forEach((match) => {
    const card = document.createElement("div");
    card.className = "match-card";

    card.innerHTML = `
      <div class="match-title">
        <span>${match.team1}</span>
        <span class="vs">ضد</span>
        <span>${match.team2}</span>
      </div>

      <p class="kickoff">
        وقت المباراة: ${new Date(match.kickoff_at).toLocaleString("ar-SA")}
      </p>

      <div class="score-row">
        <input id="team1-${match.id}" type="number" min="0" placeholder="${match.team1}" />
        <input id="team2-${match.id}" type="number" min="0" placeholder="${match.team2}" />
      </div>

      <button onclick="savePrediction('${match.id}')">حفظ التوقع</button>
    `;

    availableMatches.appendChild(card);
  });
}

async function savePrediction(matchId) {
  if (!currentParticipant) return;

  const team1Input = document.getElementById(`team1-${matchId}`);
  const team2Input = document.getElementById(`team2-${matchId}`);

  const team1Goals = Number(team1Input.value);
  const team2Goals = Number(team2Input.value);

  if (!Number.isInteger(team1Goals) || !Number.isInteger(team2Goals)) {
    alert("الرجاء إدخال نتيجة صحيحة.");
    return;
  }

  const { error } = await db
    .from("predictions")
    .upsert(
      {
        participant_id: currentParticipant.id,
        match_id: matchId,
        predicted_team1_goals: team1Goals,
        predicted_team2_goals: team2Goals,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "participant_id,match_id",
      }
    );

  if (error) {
    alert("تعذر حفظ التوقع.");
    return;
  }

  alert("تم حفظ التوقع!");
  await loadMyPredictions();
}

async function loadMyPredictions() {
  if (!currentParticipant) return;

  const { data, error } = await db
    .from("predictions")
    .select(`
      id,
      predicted_team1_goals,
      predicted_team2_goals,
      points,
      matches (
        team1,
        team2,
        kickoff_at,
        status,
        actual_team1_goals,
        actual_team2_goals
      )
    `)
    .eq("participant_id", currentParticipant.id);

  if (error) {
    myPredictions.innerHTML = `<p>تعذر تحميل التوقعات.</p>`;
    return;
  }

  if (data.length === 0) {
    myPredictions.innerHTML = `<p>لم تقم بإضافة أي توقع حتى الآن.</p>`;
    return;
  }

  myPredictions.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>المباراة</th>
          <th>توقعك</th>
          <th>النتيجة الفعلية</th>
          <th>النقاط</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((row) => `
          <tr>
            <td>${row.matches.team1} ضد ${row.matches.team2}</td>
            <td>${row.predicted_team1_goals} - ${row.predicted_team2_goals}</td>
            <td>
              ${
                row.matches.status === "completed"
                  ? `${row.matches.actual_team1_goals} - ${row.matches.actual_team2_goals}`
                  : "-"
              }
            </td>
            <td>${row.points}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadLeaderboard() {
  const { data, error } = await db
    .from("participants")
    .select(`
      id,
      name,
      predictions(points)
    `)
    .eq("active", true);

  if (error) {
    leaderboard.innerHTML = `<p>تعذر تحميل الترتيب.</p>`;
    return;
  }

  const rows = data
    .map((participant) => ({
      name: participant.name,
      points: participant.predictions.reduce((sum, p) => sum + p.points, 0),
    }))
    .sort((a, b) => b.points - a.points);

  leaderboard.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>المركز</th>
          <th>المشارك</th>
          <th>النقاط</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${row.name}</td>
            <td>${row.points}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

const adminPassword = document.getElementById("adminPassword");
const adminMatchSelect = document.getElementById("adminMatchSelect");
const actualTeam1Goals = document.getElementById("actualTeam1Goals");
const actualTeam2Goals = document.getElementById("actualTeam2Goals");
const saveResultBtn = document.getElementById("saveResultBtn");
const adminMessage = document.getElementById("adminMessage");

async function loadAdminMatches() {
  const { data, error } = await db
    .from("matches")
    .select("*")
    .order("kickoff_at");

  if (error) return;

  adminMatchSelect.innerHTML = "";

  data.forEach((match) => {
    const option = document.createElement("option");
    option.value = match.id;
    option.textContent = `${match.team1} vs ${match.team2}`;
    adminMatchSelect.appendChild(option);
  });
}

saveResultBtn.addEventListener("click", async () => {
  if (adminPassword.value !== "Aziz123") {
    adminMessage.textContent = "كلمة مرور الإدارة غير صحيحة.";
    return;
  }

  const matchId = adminMatchSelect.value;
  const team1Goals = Number(actualTeam1Goals.value);
  const team2Goals = Number(actualTeam2Goals.value);

  if (!Number.isInteger(team1Goals) || !Number.isInteger(team2Goals)) {
    adminMessage.textContent = "الرجاء إدخال نتيجة صحيحة.";
    return;
  }

  const { error } = await db
    .from("matches")
    .update({
      actual_team1_goals: team1Goals,
      actual_team2_goals: team2Goals,
      status: "completed",
    })
    .eq("id", matchId);

  if (error) {
    adminMessage.textContent = "تعذر حفظ النتيجة.";
    return;
  }

  await recalculatePoints(matchId, team1Goals, team2Goals);

  adminMessage.textContent = "تم حفظ النتيجة وتحديث النقاط.";
  await loadLeaderboard();
  await loadMyPredictions();
});

async function recalculatePoints(matchId, actualTeam1GoalsValue, actualTeam2GoalsValue) {
  const { data: predictions, error } = await db
    .from("predictions")
    .select("*")
    .eq("match_id", matchId);

  if (error) return;

  for (const prediction of predictions) {
    const points = calculatePoints(
      prediction.predicted_team1_goals,
      prediction.predicted_team2_goals,
      actualTeam1GoalsValue,
      actualTeam2GoalsValue
    );

    await db
      .from("predictions")
      .update({ points })
      .eq("id", prediction.id);
  }
}

function calculatePoints(predicted1, predicted2, actual1, actual2) {
  if (predicted1 === actual1 && predicted2 === actual2) {
    return 50;
  }

  const predictedOutcome = getOutcome(predicted1, predicted2);
  const actualOutcome = getOutcome(actual1, actual2);

  return predictedOutcome === actualOutcome ? 10 : 0;
}

function getOutcome(team1, team2) {
  if (team1 > team2) return "team1";
  if (team2 > team1) return "team2";
  return "draw";
}

function isAvailable(kickoffAt) {
  const now = new Date();
  const kickoff = new Date(kickoffAt);
  const openTime = new Date(kickoff.getTime() - 24 * 60 * 60 * 1000);

  return now >= openTime && now < kickoff;
}