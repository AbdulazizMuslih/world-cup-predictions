const SUPABASE_URL = "https://sresffkyggpuvgfqwuqq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TQx_OZ-LeNYcQA7-DNdUQA_IqmC7HES";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const musicBtn = document.getElementById("musicBtn");
const daiDaiAudio = document.getElementById("daiDaiAudio");

let currentParticipant = null;

const participantCards = document.getElementById("participantCards");
const participantSelect = document.getElementById("participantSelect");
const pinInput = document.getElementById("pinInput");
const continueBtn = document.getElementById("continueBtn");
const loginMessage = document.getElementById("loginMessage");
const loginCard = document.getElementById("loginCard");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("dashboard");
const welcomeName = document.getElementById("welcomeName");

const availableMatches = document.getElementById("availableMatches");
const myPredictions = document.getElementById("myPredictions");
const leaderboard = document.getElementById("leaderboard");

const logoutBtn = document.getElementById("logoutBtn");

const ADMIN_PASSWORD = "Aziz123";

const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminTabBtn = document.getElementById("adminTabBtn");

let isAdminMode = false;

let currentTabName = "available";
let tabHistory = [];
let allowLeavingPage = false;
let dashboardRefreshTimer = null;

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
    await restoreParticipantSession();
}

async function restoreParticipantSession() {
    const savedAdminMode = localStorage.getItem("wcAdminMode");

    if (savedAdminMode === "true") {
        await openAdminDashboard(ADMIN_PASSWORD, false);
        return;
    }

    const savedParticipant = localStorage.getItem("wcParticipant");

    if (!savedParticipant) return;

    try {
        const participant = JSON.parse(savedParticipant);

        if (!participant || !participant.id || !participant.name) {
            localStorage.removeItem("wcParticipant");
            return;
        }

        await openParticipantDashboard(
            {
                id: participant.id,
                name: participant.name,
            },
            false
        );
    } catch (error) {
        console.error(error);
        localStorage.removeItem("wcParticipant");
    }
}

async function openParticipantDashboard(participant, rememberParticipant = true) {
    currentParticipant = participant;
    welcomeName.textContent = participant.name;

    if (rememberParticipant) {
        localStorage.setItem(
            "wcParticipant",
            JSON.stringify({
                id: participant.id,
                name: participant.name,
            })
        );
    }

    participantSelect.value = participant.id;

    document.querySelectorAll(".participant-card").forEach((btn) => {
        btn.classList.toggle("selected", btn.dataset.participantId === participant.id);
    });

    loginCard.classList.add("hidden");
    dashboard.classList.remove("hidden");

    isAdminMode = false;
    adminTabBtn.classList.add("hidden");

    document.querySelector('[data-tab="available"]').classList.remove("hidden");
    document.querySelector('[data-tab="mine"]').classList.remove("hidden");

    startDashboardTabSession("available");

    await loadAvailableMatches();
    await loadMyPredictions();
    await loadLeaderboard();
    await loadAdminMatches();
    startDashboardAutoRefresh();
}

async function loadParticipants() {
    const { data, error } = await db
        .from("participants")
        .select("id, name")
        .eq("active", true)
        .order("sort_order", { ascending: true });

    if (error) {
        participantSelect.innerHTML = `<option value="">تعذر تحميل الأسماء</option>`;
        participantCards.innerHTML = `<p class="message">تعذر تحميل الأسماء</p>`;
        return;
    }

    participantSelect.innerHTML = `<option value="">اختر اسمك</option>`;
    participantCards.innerHTML = "";

    adminParticipantSelect.innerHTML = `<option value="">اختر المشارك</option>`;

    data.forEach((participant) => {
        const option = document.createElement("option");
        option.value = participant.id;
        option.textContent = participant.name;
        participantSelect.appendChild(option);

        const adminOption = document.createElement("option");
        adminOption.value = participant.id;
        adminOption.textContent = participant.name;
        adminParticipantSelect.appendChild(adminOption);

        const card = document.createElement("button");
        card.type = "button";
        card.className = "participant-card";
        card.textContent = participant.name;
        card.dataset.participantId = participant.id;

        card.addEventListener("click", () => {
            participantSelect.value = participant.id;
            loginMessage.textContent = "";

            document.querySelectorAll(".participant-card").forEach((btn) => {
                btn.classList.remove("selected");
            });

            card.classList.add("selected");
            pinInput.focus();
        });

        participantCards.appendChild(card);
    });
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

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

    await openParticipantDashboard(data, true);
});

async function openAdminDashboard(password = ADMIN_PASSWORD, rememberAdmin = true) {
    isAdminMode = true;
    currentParticipant = null;

    if (rememberAdmin) {
        localStorage.setItem("wcAdminMode", "true");
    }

    localStorage.removeItem("wcParticipant");

    welcomeName.textContent = "الإدارة";

    loginCard.classList.add("hidden");
    dashboard.classList.remove("hidden");

    adminTabBtn.classList.remove("hidden");

    document.querySelector('[data-tab="available"]').classList.add("hidden");
    document.querySelector('[data-tab="mine"]').classList.add("hidden");

    adminPassword.value = password;

    await loadLeaderboard();
    await loadAdminMatches();

    startDashboardTabSession("admin");
    startDashboardAutoRefresh();
}

adminLoginBtn.addEventListener("click", async () => {
    const password = prompt("أدخل كلمة مرور الإدارة");

    if (password !== ADMIN_PASSWORD) {
        alert("كلمة مرور الإدارة غير صحيحة.");
        return;
    }

    await openAdminDashboard(password, true);
});

logoutBtn.addEventListener("click", () => {
    currentParticipant = null;
    isAdminMode = false;
    stopDashboardAutoRefresh();

    localStorage.removeItem("wcParticipant");
    localStorage.removeItem("wcAdminMode");
    tabHistory = [];
    currentTabName = "available";
    allowLeavingPage = false;
    history.replaceState(null, "", window.location.pathname);

    pinInput.value = "";
    adminPassword.value = "";

    participantSelect.value = "";

    document.querySelectorAll(".participant-card").forEach((btn) => {
        btn.classList.remove("selected");
    });

    adminTabBtn.classList.add("hidden");

    document.querySelector('[data-tab="available"]').classList.remove("hidden");
    document.querySelector('[data-tab="mine"]').classList.remove("hidden");

    dashboard.classList.add("hidden");
    loginCard.classList.remove("hidden");

    activateTab("available");
});

function setupTabs() {
    const tabs = document.querySelectorAll(".tab");

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            goToDashboardTab(tab.dataset.tab);
        });
    });
}

function activateTab(tabName) {
    const tabs = document.querySelectorAll(".tab");

    const panels = {
        available: document.getElementById("availableTab"),
        mine: document.getElementById("mineTab"),
        leaderboard: document.getElementById("leaderboardTab"),
        admin: document.getElementById("adminTab"),
    };

    if (!panels[tabName]) return;

    tabs.forEach((tab) => {
        tab.classList.remove("active");

        if (tab.dataset.tab === tabName) {
            tab.classList.add("active");
        }
    });

    Object.values(panels).forEach((panel) => {
        panel.classList.add("hidden");
    });

    panels[tabName].classList.remove("hidden");
    currentTabName = tabName;
}

function startDashboardTabSession(tabName) {
    tabHistory = [tabName];
    activateTab(tabName);
    installBackGuard();
}

function goToDashboardTab(tabName) {
    if (tabName === currentTabName) return;

    tabHistory.push(tabName);
    activateTab(tabName);
}

function installBackGuard() {
    if (dashboard.classList.contains("hidden")) return;

    history.pushState(
        { wcBackGuard: true },
        "",
        window.location.href
    );
}

function startDashboardAutoRefresh() {
    stopDashboardAutoRefresh();

    dashboardRefreshTimer = setInterval(async () => {
        if (dashboard.classList.contains("hidden")) return;

        try {
            await loadLeaderboard();

            if (currentParticipant) {
                await loadMyPredictions();
            }

            if (isAdminMode) {
                await loadAdminMatches();
            }
        } catch (error) {
            console.error("Dashboard auto-refresh failed:", error);
        }
    }, 60 * 1000);
}

function stopDashboardAutoRefresh() {
    if (dashboardRefreshTimer) {
        clearInterval(dashboardRefreshTimer);
        dashboardRefreshTimer = null;
    }
}

window.addEventListener("popstate", () => {
    if (allowLeavingPage) return;

    if (dashboard.classList.contains("hidden")) {
        return;
    }

    if (tabHistory.length > 1) {
        tabHistory.pop();

        const previousTab = tabHistory[tabHistory.length - 1];

        activateTab(previousTab);
        installBackGuard();
        return;
    }

    const shouldLeave = confirm("هل تريد الخروج من الصفحة؟");

    if (shouldLeave) {
        allowLeavingPage = true;
        history.back();
    } else {
        installBackGuard();
    }
});

function isAvailable(kickoffAt) {
    const now = new Date();
    const kickoff = new Date(kickoffAt);
    const openTime = new Date(kickoff.getTime() - 24 * 60 * 60 * 1000);

    return now >= openTime && now < kickoff;
}

async function loadAvailableMatches() {
    if (!currentParticipant) return;

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

    const { data: participantPredictions, error: predictionsError } = await db
        .from("predictions")
        .select("match_id, predicted_team1_goals, predicted_team2_goals")
        .eq("participant_id", currentParticipant.id);

    if (predictionsError) {
        console.error(predictionsError);
    }

    const predictionMap = new Map();

    (participantPredictions || []).forEach((prediction) => {
        predictionMap.set(prediction.match_id, prediction);
    });

    availableMatches.innerHTML = "";

    openMatches.forEach((match) => {
        const existingPrediction = predictionMap.get(match.id);

        const card = document.createElement("div");
        card.className = existingPrediction
            ? "match-card match-card-predicted"
            : "match-card";

        const savedPredictionHtml = existingPrediction
            ? `
        <div class="saved-prediction-card">
            <div class="saved-prediction-row">
                <span class="saved-prediction-title">✅ بالتوفيق</span>
                <span class="saved-score">
                    ${existingPrediction.predicted_team1_goals} - ${existingPrediction.predicted_team2_goals}
                </span>
            </div>
            <div class="saved-prediction-note">
                تم حفظ توقعك ويمكنك تعديله حتى بداية المباراة.
            </div>
        </div>
      `
            : "";

        card.innerHTML = `
      <div class="match-title">
        <span>${match.team1}</span>
        <span class="vs">ضد</span>
        <span>${match.team2}</span>
      </div>

      <p class="kickoff">
        وقت المباراة: ${new Date(match.kickoff_at).toLocaleString("ar-SA")}
      </p>

      ${savedPredictionHtml}

      <div class="score-row">
        <input 
          id="team1-${match.id}" 
          type="number" 
          min="0" 
          placeholder="${match.team1}" 
          value="${existingPrediction ? existingPrediction.predicted_team1_goals : ""}"
        />
        <input 
          id="team2-${match.id}" 
          type="number" 
          min="0" 
          placeholder="${match.team2}" 
          value="${existingPrediction ? existingPrediction.predicted_team2_goals : ""}"
        />
      </div>

      <button onclick="savePrediction('${match.id}')">
        ${existingPrediction ? "تحديث التوقع" : "حفظ التوقع"}
      </button>
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
    await loadAvailableMatches();
    await loadMyPredictions();
}

function hasActualScore(match) {
    return (
        match.actual_team1_goals !== null &&
        match.actual_team1_goals !== undefined &&
        match.actual_team2_goals !== null &&
        match.actual_team2_goals !== undefined
    );
}

function formatScore(team1Goals, team2Goals) {
    return `<span class="score-text">${team1Goals} - ${team2Goals}</span>`;
}

function calculateLivePredictionPoints(prediction, match) {
    if (!hasActualScore(match)) {
        return prediction.points || 0;
    }

    return calculatePoints(
        prediction.predicted_team1_goals,
        prediction.predicted_team2_goals,
        match.actual_team1_goals,
        match.actual_team2_goals
    );
}

async function loadMyPredictions() {
    if (!currentParticipant) return;

    const { data, error } = await db
        .from("matches")
        .select(`
            id,
            team1,
            team2,
            kickoff_at,
            status,
            actual_team1_goals,
            actual_team2_goals,
            predictions!inner (
                predicted_team1_goals,
                predicted_team2_goals,
                points,
                participant_id
            )
        `)
        .eq("predictions.participant_id", currentParticipant.id);

    if (error) {
        console.error(error);
        myPredictions.innerHTML = `<p>تعذر تحميل التوقعات.</p>`;
        return;
    }

    if (!data || data.length === 0) {
        myPredictions.innerHTML = `<p>لم تقم بإضافة أي توقع حتى الآن.</p>`;
        return;
    }

    const sortedMatches = [...data].sort((a, b) => {
        return new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime();
    });

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
        ${sortedMatches.map((match) => {
        const prediction = match.predictions[0];

        const livePoints = calculateLivePredictionPoints(prediction, match);

        return `
              <tr>
                <td>${match.team1} ضد ${match.team2}</td>
                <td>
                    ${formatScore(
            prediction.predicted_team1_goals,
            prediction.predicted_team2_goals
        )}
                </td>
                <td>
                    ${hasActualScore(match)
                ? formatScore(match.actual_team1_goals, match.actual_team2_goals)
                : "-"
            }
                </td>
                <td>${livePoints}</td>
              </tr>
            `;
    }).join("")}
      </tbody>
    </table>
  `;
}

async function loadAdminParticipantPredictions(participantId) {
    const selectedName =
        adminParticipantSelect.options[adminParticipantSelect.selectedIndex]?.textContent || "";

    const { data, error } = await db
        .from("matches")
        .select(`
            id,
            team1,
            team2,
            kickoff_at,
            status,
            actual_team1_goals,
            actual_team2_goals,
            predictions!inner (
                predicted_team1_goals,
                predicted_team2_goals,
                points,
                participant_id
            )
        `)
        .eq("predictions.participant_id", participantId);

    if (error) {
        console.error(error);
        adminParticipantPredictions.innerHTML = `<p>تعذر تحميل توقعات المشارك.</p>`;
        return;
    }

    if (!data || data.length === 0) {
        adminParticipantPredictions.innerHTML = `<p>لا توجد توقعات لهذا المشارك.</p>`;
        return;
    }

    const sortedMatches = [...data].sort((a, b) => {
        return new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime();
    });

    adminParticipantPredictions.innerHTML = `
        <h4>توقعات ${selectedName}</h4>

        <table class="table">
            <thead>
                <tr>
                    <th>المباراة</th>
                    <th>التوقع</th>
                    <th>النتيجة الفعلية</th>
                    <th>النقاط</th>
                </tr>
            </thead>
            <tbody>
                ${sortedMatches.map((match) => {
                    const prediction = match.predictions[0];
                    const livePoints = calculateLivePredictionPoints(prediction, match);

                    return `
                        <tr>
                            <td>${match.team1} ضد ${match.team2}</td>
                            <td>
                                ${formatScore(
                                    prediction.predicted_team1_goals,
                                    prediction.predicted_team2_goals
                                )}
                            </td>
                            <td>
                                ${hasActualScore(match)
                                    ? formatScore(match.actual_team1_goals, match.actual_team2_goals)
                                    : "-"
                                }
                            </td>
                            <td>${livePoints}</td>
                        </tr>
                    `;
                }).join("")}
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
            predictions(
                predicted_team1_goals,
                predicted_team2_goals,
                points,
                matches(
                    actual_team1_goals,
                    actual_team2_goals
                )
            )
        `)
        .eq("active", true);

    if (error) {
        console.error(error);
        leaderboard.innerHTML = `<p>تعذر تحميل الترتيب.</p>`;
        return;
    }

    const rows = data
        .map((participant) => {
            const totalPoints = (participant.predictions || []).reduce((sum, prediction) => {
                const match = prediction.matches;

                if (
                    match &&
                    match.actual_team1_goals !== null &&
                    match.actual_team1_goals !== undefined &&
                    match.actual_team2_goals !== null &&
                    match.actual_team2_goals !== undefined
                ) {
                    return sum + calculatePoints(
                        prediction.predicted_team1_goals,
                        prediction.predicted_team2_goals,
                        match.actual_team1_goals,
                        match.actual_team2_goals
                    );
                }

                return sum + (prediction.points || 0);
            }, 0);

            return {
                name: participant.name,
                points: totalPoints,
            };
        })
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
const adminParticipantSelect = document.getElementById("adminParticipantSelect");
const adminParticipantPredictions = document.getElementById("adminParticipantPredictions");

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
    if (adminPassword.value !== ADMIN_PASSWORD) {
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

adminParticipantSelect.addEventListener("change", async () => {
    const participantId = adminParticipantSelect.value;

    if (!participantId) {
        adminParticipantPredictions.innerHTML = "";
        return;
    }

    await loadAdminParticipantPredictions(participantId);
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