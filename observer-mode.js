/* ==============================================================
   V39.2.9 — Responsive transient Abdulaziz leaderboard preview
   - Completely separate storage from official participants/predictions.
   - Keeps Abdulaziz as an optional, greyed-out leaderboard entry.
   - Uses the same participant dashboard and available-matches experience.
   - All Abdulaziz prediction writes remain isolated through observer RPCs.
   ============================================================== */

const OBSERVER_ACCOUNT_PREFIX = "observer:";
const OBSERVER_SESSION_STORAGE_KEY = "wcObserverSessionToken";
const OBSERVER_ACCOUNT_TYPE = "observer";
const OBSERVER_FROM_ADMIN_STORAGE_KEY = "wcObserverEnteredFromAdmin";
const OBSERVER_PUBLIC_LABEL = "خارج المنافسة";

let observerAccountsCache = [];
let observerTournamentStateCache = null;
let observerTournamentStateLoadedAt = 0;
let observerPredictionFilter = "all";
let observerLeaderboardVisibleForCurrentVisit = false;

PARTICIPANT_VISUALS["عبدالعزيز"] = { icon: "🧭", color: "#94a3b8" };

function isObserverParticipant(participant = currentParticipant) {
    return Boolean(participant && participant.accountType === OBSERVER_ACCOUNT_TYPE);
}

function getObserverSessionToken() {
    return currentParticipant?.observerSessionToken || localStorage.getItem(OBSERVER_SESSION_STORAGE_KEY) || "";
}

function getObserverAccountIdFromSelectValue(value) {
    const raw = String(value || "");
    return raw.startsWith(OBSERVER_ACCOUNT_PREFIX)
        ? raw.slice(OBSERVER_ACCOUNT_PREFIX.length)
        : "";
}

async function observerRpc(name, args = {}) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
}

async function loadObserverAccounts() {
    try {
        const rows = await observerRpc("observer_list_accounts");
        observerAccountsCache = Array.isArray(rows) ? rows : [];
        return observerAccountsCache;
    } catch (error) {
        // The observer feature remains invisible until the isolated SQL
        // migration is installed. The official contest keeps working.
        console.warn("Observer account list unavailable:", error?.message || error);
        observerAccountsCache = [];
        return [];
    }
}

function appendObserverLoginAccounts(accounts = []) {
    if (!participantSelect || !participantCards || !accounts.length) return;

    participantCards.querySelectorAll("[data-observer-login-card], .observer-login-separator").forEach((node) => node.remove());
    participantSelect.querySelectorAll("option[data-observer-account]").forEach((node) => node.remove());

    const separator = document.createElement("div");
    separator.className = "observer-login-separator";
    separator.innerHTML = `
        <span>للتسلية فقط</span>
        <small>حساب منفصل لا يدخل في نتائج المسابقة</small>
    `;
    participantCards.appendChild(separator);

    accounts.forEach((account) => {
        const optionValue = `${OBSERVER_ACCOUNT_PREFIX}${account.id}`;
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = `${account.name} — ${OBSERVER_PUBLIC_LABEL}`;
        option.dataset.observerAccount = "true";
        participantSelect.appendChild(option);

        const visual = getParticipantVisual(account.name);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "participant-card observer-login-card";
        card.dataset.observerLoginCard = "true";
        card.dataset.participantId = account.id;
        card.dataset.participantName = account.name;
        card.style.setProperty("--participant-accent", visual.color);
        card.innerHTML = `
            <span class="participant-avatar" aria-hidden="true">${visual.icon}</span>
            <span class="participant-card-name">
                ${escapeHtml(account.name)}
                <small>${OBSERVER_PUBLIC_LABEL}</small>
            </span>
            <span class="participant-card-check" aria-hidden="true">✓</span>
        `;

        card.addEventListener("click", () => {
            participantSelect.value = optionValue;
            loginMessage.textContent = "";
            document.querySelectorAll(".participant-card").forEach((button) => button.classList.remove("selected"));
            card.classList.add("selected");
            pinInput.focus();
        });

        participantCards.appendChild(card);
    });
}

/* ---------- Keep the observer account out of the public login screen ---------- */
const originalLoadParticipantsForObserverMode = loadParticipants;
loadParticipants = async function loadParticipantsWithoutObserverLogin() {
    await originalLoadParticipantsForObserverMode();
};

/* ---------- Restore the isolated session without touching official sessions ---------- */
const originalRestoreParticipantSessionForObserverMode = restoreParticipantSession;
restoreParticipantSession = async function restoreParticipantSessionWithObserverMode() {
    if (localStorage.getItem("wcAdminMode") === "true") {
        return originalRestoreParticipantSessionForObserverMode();
    }

    const savedParticipantRaw = localStorage.getItem("wcParticipant");
    if (!savedParticipantRaw) return originalRestoreParticipantSessionForObserverMode();

    try {
        const savedParticipant = JSON.parse(savedParticipantRaw);
        if (savedParticipant?.accountType !== OBSERVER_ACCOUNT_TYPE) {
            return originalRestoreParticipantSessionForObserverMode();
        }

        const token = localStorage.getItem(OBSERVER_SESSION_STORAGE_KEY) || savedParticipant.observerSessionToken || "";
        if (!token) throw new Error("Observer session missing");

        const rows = await observerRpc("observer_session_info", { p_token: token });
        const account = Array.isArray(rows) ? rows[0] : rows;
        if (!account?.account_id) throw new Error("Observer session expired");

        await openParticipantDashboard({
            id: account.account_id,
            name: account.account_name,
            accountType: OBSERVER_ACCOUNT_TYPE,
            observerSessionToken: token
        }, false);
    } catch (error) {
        console.warn("Observer session restore failed:", error?.message || error);
        localStorage.removeItem("wcParticipant");
        localStorage.removeItem(OBSERVER_SESSION_STORAGE_KEY);
    }
};

/* ---------- Participant dashboard chrome ---------- */
const originalOpenParticipantDashboardForObserverMode = openParticipantDashboard;
openParticipantDashboard = async function openParticipantDashboardWithObserverMode(participant, rememberParticipant = true) {
    if (!participant || participant.accountType !== OBSERVER_ACCOUNT_TYPE) {
        const result = await originalOpenParticipantDashboardForObserverMode(participant, rememberParticipant);
        dashboard?.classList.remove("observer-dashboard");
        await applySeasonEndChromeForOfficialParticipant();
        return result;
    }

    const result = await originalOpenParticipantDashboardForObserverMode(participant, false);

    currentParticipant.accountType = OBSERVER_ACCOUNT_TYPE;
    currentParticipant.observerSessionToken = participant.observerSessionToken;

    // Keep the isolated data source, but use the same visual dashboard as
    // every participant. No all-matches workbench or observer banner.
    dashboard?.classList.remove("observer-dashboard");
    dashboard?.classList.remove("admin-dashboard");
    document.querySelector(".observer-mode-banner")?.remove();

    if (rememberParticipant) {
        localStorage.setItem("wcParticipant", JSON.stringify({
            id: participant.id,
            name: participant.name,
            accountType: OBSERVER_ACCOUNT_TYPE
        }));
        localStorage.setItem(OBSERVER_SESSION_STORAGE_KEY, participant.observerSessionToken || "");
    }

    participantSelect.value = `${OBSERVER_ACCOUNT_PREFIX}${participant.id}`;
    document.querySelectorAll(".participant-card").forEach((button) => {
        button.classList.toggle("selected", button.dataset.observerLoginCard === "true" && button.dataset.participantId === String(participant.id));
    });

    updateMenuProfileCard();
    await applySeasonEndChromeForOfficialParticipant();
    return result;
};

function ensureObserverDashboardBanner() {
    if (!dashboard || dashboard.querySelector(".observer-mode-banner")) return;
    const top = dashboard.querySelector(".dashboard-top");
    if (!top) return;
    const enteredFromAdmin = localStorage.getItem(OBSERVER_FROM_ADMIN_STORAGE_KEY) === "true";
    top.insertAdjacentHTML("afterend", `
        <section class="observer-mode-banner">
            <span aria-hidden="true">🧭</span>
            <div>
                <strong>وضع التوقعات للمتعة</strong>
                <p>هذه التوقعات محفوظة في قاعدة منفصلة، ولا تغيّر نقاط المسابقة أو ترتيب المشاركين الرسمي.</p>
            </div>
            ${enteredFromAdmin ? `<button type="button" class="observer-return-admin-btn" onclick="returnToAdminFromObserver()">العودة للإدارة</button>` : ""}
        </section>
    `);
}

logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem(OBSERVER_SESSION_STORAGE_KEY);
    localStorage.removeItem(OBSERVER_FROM_ADMIN_STORAGE_KEY);
    dashboard?.classList.remove("observer-dashboard");
    document.querySelector(".observer-mode-banner")?.remove();
}, true);

/* ---------- Tournament completion / post-tournament experience ---------- */
async function getObserverTournamentState(force = false) {
    const now = Date.now();
    if (!force && observerTournamentStateCache && now - observerTournamentStateLoadedAt < 60_000) {
        return observerTournamentStateCache;
    }

    const { data, error } = await db
        .from("matches")
        .select("id, status, actual_team1_goals, actual_team2_goals, stage")
        .order("kickoff_at", { ascending: true });

    if (error) throw error;

    const matches = data || [];
    const completed = matches.filter(isConfirmedCompletedMatch).length;
    observerTournamentStateCache = {
        total: matches.length,
        completed,
        isComplete: matches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT && completed >= EXPECTED_WORLD_CUP_MATCH_COUNT
    };
    observerTournamentStateLoadedAt = now;
    return observerTournamentStateCache;
}

async function applySeasonEndChromeForOfficialParticipant() {
    if (!currentParticipant || isAdminMode) return;

    try {
        const state = await getObserverTournamentState();
        const availableTabButton = document.querySelector('[data-tab="available"]');
        const availableTitle = document.querySelector("#availableTab > h3");

        if (state.isComplete) {
            if (availableTabButton) availableTabButton.textContent = "بعد الختام";
            if (availableTitle) availableTitle.textContent = "رحلة اكتملت… وذكريات بقيت";
        } else {
            if (availableTabButton) availableTabButton.textContent = "المباريات المتاحة";
            if (availableTitle) availableTitle.textContent = "المباريات المتاحة للتوقع";
        }
    } catch (error) {
        console.warn("Could not apply season-end participant chrome:", error?.message || error);
    }
}

function renderSeasonEndHub() {
    availableMatches.className = "season-end-hub";
    availableMatches.innerHTML = `
        <section class="season-end-hero-card">
            <div class="season-end-hero-icon" aria-hidden="true">🏆</div>
            <div>
                <p class="eyebrow">انتهت المباريات… وبقيت الحكاية</p>
                <h4>كل شيء جاهز للعودة إليه</h4>
                <p>راجع توقعاتك، شاهد الترتيب النهائي، افتح كتاب رحلتك، وتصفّح الأضواء واللحظات التي صنعت هذا الشهر.</p>
            </div>
        </section>
        <div class="season-end-action-grid">
            <button type="button" onclick="goToDashboardTab('mine')"><span>📖</span><strong>توقعاتي كاملة</strong><small>كل مباراة ونقاطها</small></button>
            <button type="button" onclick="goToDashboardTab('leaderboard')"><span>🏅</span><strong>الترتيب النهائي</strong><small>المنصة والنتائج الرسمية</small></button>
            <button type="button" onclick="goToDashboardTab('profile')"><span>👤</span><strong>ملفي وكتاب الرحلة</strong><small>الإحصائيات والشارات وPDF</small></button>
            <button type="button" onclick="goToDashboardTab('highlights')"><span>✨</span><strong>الأضواء</strong><small>أجمل اللقطات والقصص</small></button>
            <button type="button" onclick="goToDashboardTab('statistics')"><span>📊</span><strong>أرقام لها طعم</strong><small>حقائق وشارات المسابقة</small></button>
            <button type="button" onclick="goToDashboardTab('seasonRecap')"><span>❤️</span><strong>ختام المسابقة</strong><small>الرسالة الأخيرة</small></button>
        </div>
    `;
}

/* ---------- Normal available-matches view backed by isolated storage ---------- */
const originalLoadAvailableMatchesForObserverMode = loadAvailableMatches;
loadAvailableMatches = async function loadAvailableMatchesWithObserverMode() {
    if (isObserverParticipant()) {
        return loadObserverAvailableMatches();
    }

    await originalLoadAvailableMatchesForObserverMode();

    try {
        const state = await getObserverTournamentState();
        if (state.isComplete) renderSeasonEndHub();
    } catch (error) {
        console.warn("Season-end hub check failed:", error?.message || error);
    }
};

async function loadObserverAvailableMatches() {
    const token = getObserverSessionToken();
    if (!token) {
        availableMatches.className = "match-grid";
        availableMatches.innerHTML = `<p>انتهت الجلسة. سجّل الدخول من جديد.</p>`;
        return;
    }

    try {
        const [matchesResult, predictions, championRows] = await Promise.all([
            db.from("matches").select("*").order("kickoff_at", { ascending: true }),
            observerRpc("observer_get_predictions", { p_token: token }),
            observerRpc("observer_get_champion_prediction", { p_token: token })
        ]);

        if (matchesResult.error) throw matchesResult.error;

        const matches = matchesResult.data || [];
        const openMatches = matches
            .filter((match) => match.status === "scheduled" && isAvailable(match.kickoff_at))
            .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

        await loadSiteStageThemeFromTournamentProgress();

        const predictionMap = new Map(
            (predictions || []).map((prediction) => [String(prediction.match_id), prediction])
        );
        const championPrediction = Array.isArray(championRows) ? championRows[0] : championRows;
        const championResult = getChampionPredictionResult(matches);
        const championFinalCardHtml = renderChampionPredictionFinalCard(
            championPrediction,
            championResult,
            matches
        );

        if (openMatches.length === 0) {
            const state = await getObserverTournamentState();
            if (state.isComplete) {
                renderSeasonEndHub();
                return;
            }

            availableMatches.className = championFinalCardHtml
                ? "match-grid champion-only-grid"
                : "match-grid";
            availableMatches.innerHTML = championFinalCardHtml || `<p>لا توجد مباريات متاحة للتوقع حالياً.</p>`;
            scheduleAvailableTeamNameFit();
            return;
        }

        const groups = groupMatchesByStage(openMatches);
        const visibleSections = AVAILABLE_STAGE_SECTIONS.filter((section) => {
            return groups[section.stage] && groups[section.stage].length > 0;
        });

        availableMatches.className = "match-grid available-stage-grid";
        availableMatches.innerHTML = championFinalCardHtml + visibleSections.map((section) => {
            const stageMatches = groups[section.stage].sort((a, b) => {
                return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
            });

            return `
                ${renderAvailableStageHeader(section.stage, stageMatches.length)}
                ${stageMatches.map((match) => {
                    return renderAvailableMatchCard(match, predictionMap.get(String(match.id)));
                }).join("")}
            `;
        }).join("");

        scheduleAvailableTeamNameFit();
    } catch (error) {
        console.error("Observer available matches failed:", error);
        availableMatches.className = "match-grid";
        availableMatches.innerHTML = `<p>تعذر تحميل المباريات.</p>`;
    }
}

/* ---------- Isolated prediction writes for the normal participant cards ---------- */
window.saveObserverPrediction = async function saveObserverPrediction(matchId) {
    const token = getObserverSessionToken();
    const team1Input = document.getElementById(`team1-${matchId}`);
    const team2Input = document.getElementById(`team2-${matchId}`);
    const team1Goals = Number(team1Input?.value);
    const team2Goals = Number(team2Input?.value);

    if (!Number.isInteger(team1Goals) || !Number.isInteger(team2Goals) || team1Goals < 0 || team2Goals < 0 || team1Goals > 20 || team2Goals > 20) {
        alert("الرجاء إدخال نتيجة صحيحة.");
        return;
    }

    try {
        await observerRpc("observer_save_prediction", {
            p_token: token,
            p_match_id: String(matchId),
            p_team1_goals: team1Goals,
            p_team2_goals: team2Goals
        });
        alert("تم حفظ التوقع!");
        await Promise.all([loadAvailableMatches(), loadMyPredictions(), loadLeaderboard()]);
    } catch (error) {
        console.error("Observer prediction save failed:", error);
        alert("تعذر حفظ التوقع.");
    }
};

window.saveObserverChampionPrediction = async function saveObserverChampionPrediction() {
    const token = getObserverSessionToken();
    const selectedTeam = String(
        selectedChampionPredictionTeam ||
        document.querySelector('input[name="championPredictionTeam"]:checked')?.value ||
        document.getElementById("observerChampionTeamSelect")?.value ||
        ""
    ).trim();

    if (!selectedTeam) {
        alert("اختر المنتخب أولاً.");
        return;
    }

    try {
        await observerRpc("observer_save_champion_prediction", {
            p_token: token,
            p_predicted_team: selectedTeam
        });
        alert("تم حفظ توقع البطل!");
        await Promise.all([loadAvailableMatches(), loadMyPredictions(), loadLeaderboard()]);
    } catch (error) {
        console.error("Observer champion save failed:", error);
        alert("تعذر حفظ توقع البطل.");
    }
};

/* ---------- Observer prediction history ---------- */
const originalLoadMyPredictionsForObserverMode = loadMyPredictions;
loadMyPredictions = async function loadMyPredictionsWithObserverMode() {
    if (!isObserverParticipant()) return originalLoadMyPredictionsForObserverMode();

    myPredictions.innerHTML = `<div class="placeholder-card">جاري تحميل توقعاتك المنفصلة...</div>`;

    try {
        const token = getObserverSessionToken();
        const [matchesResult, predictions, championRows] = await Promise.all([
            db.from("matches").select("id, team1, team2, kickoff_at, status, stage, score_duration, winner_side, actual_team1_goals, actual_team2_goals").order("kickoff_at", { ascending: true }),
            observerRpc("observer_get_predictions", { p_token: token }),
            observerRpc("observer_get_champion_prediction", { p_token: token })
        ]);
        if (matchesResult.error) throw matchesResult.error;

        const allMatches = matchesResult.data || [];
        const predictionMap = new Map((predictions || []).map((row) => [String(row.match_id), row]));
        const historyRows = allMatches.map((match) => {
            const prediction = predictionMap.get(String(match.id));
            return {
                ...match,
                predictions: prediction ? [{
                    predicted_team1_goals: prediction.predicted_team1_goals,
                    predicted_team2_goals: prediction.predicted_team2_goals,
                    points: 0,
                    participant_id: currentParticipant.id
                }] : []
            };
        }).filter((match) => hasActualScore(match) || hasParticipantPrediction(match));

        const championPrediction = Array.isArray(championRows) ? championRows[0] : championRows;
        const championResult = getChampionPredictionResult(allMatches);
        const championWindow = getChampionPredictionWindow(allMatches);
        const championFinalCardHtml = renderChampionPredictionFinalCard(championPrediction, championResult, allMatches);

        const summary = historyRows.reduce((acc, match) => {
            const prediction = getMatchPrediction(match);
            const points = calculateLivePredictionPoints(prediction, match);
            if (prediction) acc.totalPredictions += 1;
            acc.totalPoints += points;
            if (hasActualScore(match) && isExactScorePrediction(prediction, match)) acc.exact += 1;
            if (hasActualScore(match) && points === 10) acc.correct += 1;
            return acc;
        }, { totalPredictions: 0, totalPoints: 0, exact: 0, correct: 0 });

        const championPoints = championResult
            ? calculateChampionPredictionPoints(championPrediction?.predicted_team, championResult)
            : 0;
        summary.totalPoints += championPoints;

        myPredictions.innerHTML = `
            ${championFinalCardHtml}
            <div class="prediction-summary-card prediction-summary-card-v36">
                <div class="prediction-summary-title">
                    <p class="eyebrow">ملخص توقعاتك</p>
                    <h4>${escapeHtml(currentParticipant.name)}</h4>
                </div>
                <div class="prediction-summary-grid">
                    <span><strong>${summary.totalPoints}</strong><small>نقطة</small></span>
                    <span><strong>${summary.totalPredictions}</strong><small>توقع</small></span>
                    <span><strong>${summary.exact}</strong><small>بالملّي</small></span>
                    <span><strong>${summary.correct}</strong><small>صحيح</small></span>
                </div>
                <div class="prediction-summary-art" aria-hidden="true">
                    <img src="assets/prediction-summary-ball-v36.png" alt="" loading="lazy" />
                </div>
            </div>
            ${renderPredictionStageSections([...historyRows].sort((a, b) => new Date(b.kickoff_at) - new Date(a.kickoff_at)), {
                championPredictionContext: {
                    prediction: championPrediction,
                    result: championResult,
                    matches: allMatches,
                    windowState: championWindow
                }
            })}
        `;
    } catch (error) {
        console.error("Observer history failed:", error);
        myPredictions.innerHTML = `<div class="placeholder-card">تعذر تحميل التوقعات المنفصلة.</div>`;
    }
};

/* ---------- Optional grey observer row on the official leaderboard ---------- */
const originalLoadLeaderboardForObserverMode = loadLeaderboard;
loadLeaderboard = async function loadLeaderboardWithObserverMode() {
    await originalLoadLeaderboardForObserverMode();
    await injectObserverLeaderboardOption();
};

function resetObserverLeaderboardPreview() {
    observerLeaderboardVisibleForCurrentVisit = false;

    const row = document.getElementById("observerLeaderboardRow");
    const button = document.getElementById("observerLeaderboardToggleBtn");

    row?.classList.add("hidden");

    if (button) {
        button.textContent = "عرض عبدالعزيز";
        button.setAttribute("aria-pressed", "false");
    }
}

/* The preview is intentionally session-transient:
   - It remains visible while the user stays on the leaderboard, including refreshes.
   - Leaving the leaderboard clears it.
   - Returning to the leaderboard always starts hidden again. */
const originalActivateTabForObserverLeaderboard = activateTab;
activateTab = function activateTabWithObserverLeaderboardReset(tabName) {
    const movingBetweenLeaderboardAndAnotherPage =
        tabName !== currentTabName &&
        (tabName === "leaderboard" || currentTabName === "leaderboard");

    if (movingBetweenLeaderboardAndAnotherPage) {
        resetObserverLeaderboardPreview();
    }

    return originalActivateTabForObserverLeaderboard(tabName);
};

async function injectObserverLeaderboardOption() {
    if (!leaderboard || leaderboard.querySelector(".observer-leaderboard-control")) return;

    try {
        const rows = await observerRpc("observer_get_public_entry");
        const entry = Array.isArray(rows) ? rows[0] : rows;
        if (!entry?.account_name) return;

        const table = leaderboard.querySelector(".leaderboard-table");
        const tbody = table?.querySelector("tbody");
        if (!table || !tbody) return;

        const observerPoints = Number(entry.total_points || 0);
        const officialRows = [...tbody.querySelectorAll("tr.leaderboard-row")];
        const officialRowPoints = officialRows.map((row) => {
            const value = Number(row.querySelector(".leaderboard-points-number")?.textContent || 0);
            return Number.isFinite(value) ? value : 0;
        });

        /* Keep every official rank exactly as rendered. Abdulaziz is inserted only
           as a grey visual comparison, after equal-point official rows and before
           the first lower-scoring official row. */
        const firstLowerOfficialIndex = officialRowPoints.findIndex((points) => points < observerPoints);
        const visualIndex = firstLowerOfficialIndex === -1 ? officialRows.length : firstLowerOfficialIndex;
        const hypotheticalPosition = visualIndex + 1;
        const isVisible = observerLeaderboardVisibleForCurrentVisit;

        table.insertAdjacentHTML("beforebegin", `
            <div class="observer-leaderboard-control">
                <div>
                    <span aria-hidden="true">🧭</span>
                    <p><strong>عبدالعزيز خارج المنافسة</strong><small>عرض اختياري داخل جدول الترتيب فقط، دون التأثير على المراكز الرسمية.</small></p>
                </div>
                <button type="button" id="observerLeaderboardToggleBtn" aria-pressed="${isVisible}">
                    ${isVisible ? "إخفاء عبدالعزيز" : "عرض عبدالعزيز"}
                </button>
            </div>
        `);

        const observerRowHtml = `
            <tr class="leaderboard-row observer-leaderboard-row ${isVisible ? "" : "hidden"}" id="observerLeaderboardRow">
                <td><span class="rank-badge observer-rank-badge">${hypotheticalPosition}</span></td>
                <td class="leaderboard-name">
                    ${escapeHtml(entry.account_name)}
                    <small>${OBSERVER_PUBLIC_LABEL} · ترتيب افتراضي داخل العرض فقط</small>
                </td>
                <td class="leaderboard-points">
                    <span class="leaderboard-points-wrap leaderboard-points-wrap-table">
                        <span class="leaderboard-points-number">${observerPoints}</span>
                        <small>لا يؤثر على المنافسة</small>
                    </span>
                </td>
            </tr>
        `;

        const insertionTarget = officialRows[visualIndex] || null;
        if (insertionTarget) {
            insertionTarget.insertAdjacentHTML("beforebegin", observerRowHtml);
        } else {
            tbody.insertAdjacentHTML("beforeend", observerRowHtml);
        }

        document.getElementById("observerLeaderboardToggleBtn")?.addEventListener("click", () => {
            observerLeaderboardVisibleForCurrentVisit = !observerLeaderboardVisibleForCurrentVisit;

            const row = document.getElementById("observerLeaderboardRow");
            const button = document.getElementById("observerLeaderboardToggleBtn");

            row?.classList.toggle("hidden", !observerLeaderboardVisibleForCurrentVisit);

            if (button) {
                button.textContent = observerLeaderboardVisibleForCurrentVisit
                    ? "إخفاء عبدالعزيز"
                    : "عرض عبدالعزيز";
                button.setAttribute("aria-pressed", String(observerLeaderboardVisibleForCurrentVisit));
            }
        });
    } catch (error) {
        console.warn("Observer leaderboard entry unavailable:", error?.message || error);
    }
}

/* ---------- Observer profile ---------- */
const originalRenderProfilePageShellForObserverMode = renderProfilePageShell;
renderProfilePageShell = async function renderProfilePageShellWithObserverMode() {
    if (!isObserverParticipant()) return originalRenderProfilePageShellForObserverMode();
    return renderObserverProfilePage();
};

async function renderObserverProfilePage() {
    const profileSummary = document.getElementById("profileSummary");
    const profileBadges = document.getElementById("profileBadges");
    const profileAiStory = document.getElementById("profileAiStory");
    const profileRecapDownload = document.getElementById("profileRecapDownload");
    if (!profileSummary) return;

    if (profilePageTitle) profilePageTitle.textContent = `ملف ${currentParticipant.name}`;
    profileSummary.innerHTML = `<div class="placeholder-card">جاري بناء ملفك المنفصل...</div>`;
    if (profileBadges) profileBadges.innerHTML = "";
    if (profileAiStory) profileAiStory.innerHTML = "";
    if (profileRecapDownload) profileRecapDownload.innerHTML = "";

    try {
        const token = getObserverSessionToken();
        const [matchesResult, predictions, publicRows] = await Promise.all([
            db.from("matches").select("id, team1, team2, kickoff_at, stage, status, actual_team1_goals, actual_team2_goals").order("kickoff_at", { ascending: true }),
            observerRpc("observer_get_predictions", { p_token: token }),
            observerRpc("observer_get_public_entry")
        ]);
        if (matchesResult.error) throw matchesResult.error;

        const matches = matchesResult.data || [];
        const predictionMap = new Map((predictions || []).map((row) => [String(row.match_id), row]));
        const completedRows = matches.filter(hasActualScore).map((match) => ({ match, prediction: predictionMap.get(String(match.id)) || null }));
        const scored = completedRows.map(({ match, prediction }) => ({
            match,
            prediction,
            points: prediction ? calculatePoints(Number(prediction.predicted_team1_goals), Number(prediction.predicted_team2_goals), Number(match.actual_team1_goals), Number(match.actual_team2_goals), match) : 0
        }));
        const entry = Array.isArray(publicRows) ? publicRows[0] : publicRows;
        const predictionCount = predictionMap.size;
        const exact = scored.filter(({ match, prediction }) => prediction && isExactScorePrediction(prediction, match)).length;
        const correct = scored.filter((row) => row.points > 0).length;
        const accuracy = predictionCount ? Math.round((correct / predictionCount) * 100) : 0;
        const bestStreak = calculateObserverBestStreak(scored);
        const bestStage = calculateObserverBestStage(scored);
        const visual = getParticipantVisual(currentParticipant.name);

        profileSummary.innerHTML = `
            <div class="profile-hero-card profile-hero-card-final" style="--participant-accent:${visual.color}">
                <div class="profile-hero-avatar" aria-hidden="true">${visual.icon}</div>
                <div>
                    <p class="eyebrow">الملف الشخصي</p>
                    <h4>${escapeHtml(currentParticipant.name)}</h4>
                    <p>صفحتك الخاصة في المسابقة: أرقام، شارات، ولمحة خفيفة عن طريقتك في قراءة المباريات.</p>
                </div>
            </div>
            <div class="profile-stat-grid profile-stat-grid-final">
                <div class="profile-stat-card"><strong>${Number(entry?.total_points || 0)}</strong><span>نقطة</span></div>
                <div class="profile-stat-card"><strong>${predictionCount}</strong><span>توقع</span></div>
                <div class="profile-stat-card"><strong>${exact}</strong><span>بالملّي</span></div>
                <div class="profile-stat-card"><strong>${accuracy}%</strong><span>دقة</span></div>
                <div class="profile-stat-card"><strong>${bestStreak}</strong><span>أطول سلسلة</span></div>
                <div class="profile-stat-card profile-stat-card-wide"><strong>${escapeHtml(bestStage.label)}</strong><span>أفضل مرحلة</span></div>
            </div>
        `;

        const badges = [
            { icon: "🎯", title: "عينك على النتيجة", value: `${exact} بالملّي` },
            { icon: "✅", title: "قراءة ناجحة", value: `${correct} توقعاً` },
            { icon: "🔥", title: "سلسلة صحيحة", value: `${bestStreak} متتالية` },
            { icon: "📚", title: "سجل التوقعات", value: `${predictionCount} توقعاً` },
            { icon: "📈", title: "أفضل مرحلة", value: bestStage.label }
        ];
        if (profileBadges) {
            profileBadges.innerHTML = badges.map((badge) => `
                <div class="badge-card profile-badge-card-final observer-profile-badge">
                    <span aria-hidden="true">${badge.icon}</span><strong>${escapeHtml(badge.title)}</strong><small>${escapeHtml(badge.value)}</small>
                </div>
            `).join("");
        }

        if (profileAiStory) {
            profileAiStory.innerHTML = `
                <div class="profile-closing-note profile-closing-note-final">
                    <div class="profile-closing-note-head"><span aria-hidden="true">✨</span><div><strong>لمحة الختام</strong><small>رسالة شخصية خفيفة</small></div></div>
                    <p>${escapeHtml(currentParticipant.name)} كان جزءاً من جو المسابقة مباراة بعد مباراة، وهذه الصفحة تحفظ أرقامه ولحظاته كما تحفظ رحلة كل مشارك.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Observer profile failed:", error);
        profileSummary.innerHTML = `<div class="placeholder-card">تعذر تحميل الملف المنفصل.</div>`;
    }
}

function calculateObserverBestStreak(rows = []) {
    let current = 0;
    let best = 0;
    [...rows].sort((a, b) => new Date(a.match.kickoff_at) - new Date(b.match.kickoff_at)).forEach((row) => {
        if (row.prediction && row.points > 0) {
            current += 1;
            best = Math.max(best, current);
        } else {
            current = 0;
        }
    });
    return best;
}

function calculateObserverBestStage(rows = []) {
    const byStage = new Map();
    rows.forEach((row) => {
        if (!row.prediction) return;
        const stage = getPredictionStage(row.match);
        if (!byStage.has(stage)) byStage.set(stage, { stage, predictions: 0, points: 0 });
        const item = byStage.get(stage);
        item.predictions += 1;
        item.points += row.points;
    });
    const winner = [...byStage.values()].map((item) => ({
        ...item,
        rate: item.predictions ? item.points / item.predictions : 0
    })).sort((a, b) => b.rate - a.rate || b.points - a.points)[0];
    return winner ? { ...winner, label: getFinalRecapStageLabel(winner.stage) } : { label: "بانتظار التوقعات" };
}

/* ---------- Admin-only access to the separated account ---------- */
function renderAdminObserverAccessPanel(entry) {
    const stats = document.getElementById("adminOverviewStats");
    if (!stats || !entry?.account_name) return;

    let panel = document.getElementById("adminObserverAccessPanel");
    if (!panel) {
        panel = document.createElement("section");
        panel.id = "adminObserverAccessPanel";
        panel.className = "admin-observer-access-panel";
        stats.insertAdjacentElement("afterend", panel);
    }

    panel.innerHTML = `
        <div class="admin-observer-access-icon" aria-hidden="true">🧭</div>
        <div class="admin-observer-access-copy">
            <small>ORGANISER FUN ACCOUNT</small>
            <h4>${escapeHtml(entry.account_name)}</h4>
            <p>حسابك المنفصل عن بيانات المشاركين الرسميين، بواجهة المشارك نفسها وسجل توقعات محفوظ بشكل مستقل.</p>
            <div class="admin-observer-access-metrics">
                <span><strong>${Number(entry.total_points || 0)}</strong><small>نقطة</small></span>
                <span><strong>${Number(entry.prediction_count || 0)}</strong><small>توقع محفوظ</small></span>
                <span><strong>${Number(entry.exact_count || 0)}</strong><small>بالملّي</small></span>
            </div>
        </div>
        <button id="adminObserverLoginBtn" type="button" class="admin-observer-login-btn" onclick="openObserverAccountFromAdmin()">
            الدخول كعبدالعزيز
            <span aria-hidden="true">←</span>
        </button>
    `;
}

window.openObserverAccountFromAdmin = async function openObserverAccountFromAdmin() {
    if (!isAdminMode) return;

    const button = document.getElementById("adminObserverLoginBtn");
    const originalText = button?.innerHTML || "";
    if (button) {
        button.disabled = true;
        button.textContent = "جاري فتح الحساب...";
    }

    try {
        const rows = await observerRpc("observer_admin_login", {
            p_admin_password: ADMIN_PASSWORD
        });
        const session = Array.isArray(rows) ? rows[0] : rows;
        if (!session?.session_token || !session?.account_id) {
            throw new Error("Observer admin session was not created");
        }

        localStorage.removeItem("wcAdminMode");
        localStorage.setItem(OBSERVER_FROM_ADMIN_STORAGE_KEY, "true");
        localStorage.setItem(OBSERVER_SESSION_STORAGE_KEY, session.session_token);

        await openParticipantDashboard({
            id: session.account_id,
            name: session.account_name,
            accountType: OBSERVER_ACCOUNT_TYPE,
            observerSessionToken: session.session_token
        }, true);
    } catch (error) {
        console.error("Admin observer login failed:", error);
        alert("تعذر فتح حساب عبدالعزيز حالياً.");
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }
};

window.returnToAdminFromObserver = async function returnToAdminFromObserver() {
    localStorage.removeItem("wcParticipant");
    localStorage.removeItem(OBSERVER_SESSION_STORAGE_KEY);
    localStorage.removeItem(OBSERVER_FROM_ADMIN_STORAGE_KEY);
    document.querySelector(".observer-mode-banner")?.remove();
    dashboard?.classList.remove("observer-dashboard");
    await openAdminDashboard(ADMIN_PASSWORD, true);
};

if (typeof loadAdminConsoleOverview === "function") {
    const originalLoadAdminConsoleOverviewForObserverMode = loadAdminConsoleOverview;
    loadAdminConsoleOverview = async function loadAdminConsoleOverviewWithObserverMode(options = {}) {
        const result = await originalLoadAdminConsoleOverviewForObserverMode(options);
        try {
            const rows = await observerRpc("observer_get_public_entry");
            const entry = Array.isArray(rows) ? rows[0] : rows;
            renderAdminObserverAccessPanel(entry);
        } catch (error) {
            console.warn("Admin observer access unavailable:", error?.message || error);
            document.getElementById("adminObserverAccessPanel")?.remove();
        }
        return result;
    };
}

/* Final write guards: an observer session can never fall through to the
   official prediction or champion-prediction tables, even if an old inline
   handler or a console call reaches the original global functions. */
const originalSavePredictionForObserverMode = savePrediction;
savePrediction = async function savePredictionWithObserverGuard(matchId) {
    if (isObserverParticipant()) return window.saveObserverPrediction(String(matchId));
    return originalSavePredictionForObserverMode(matchId);
};

const originalSaveChampionPredictionForObserverMode = saveChampionPrediction;
saveChampionPrediction = async function saveChampionPredictionWithObserverGuard() {
    if (isObserverParticipant()) return window.saveObserverChampionPrediction();
    return originalSaveChampionPredictionForObserverMode();
};
