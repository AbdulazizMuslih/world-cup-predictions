const SUPABASE_URL = "https://sresffkyggpuvgfqwuqq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TQx_OZ-LeNYcQA7-DNdUQA_IqmC7HES";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const musicBtn = document.getElementById("musicBtn");
const prevMusicBtn = document.getElementById("prevMusicBtn");
const nextMusicBtn = document.getElementById("nextMusicBtn");
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
const adminPredictionsTabBtn = document.getElementById("adminPredictionsTabBtn");

let isAdminMode = false;

let currentTabName = "available";
let tabHistory = [];
let allowLeavingPage = false;
let dashboardRefreshTimer = null;

const APP_VERSION = "38.9.2";
let updateCheckTimer = null;
const SITE_STAGE_CACHE_KEY = "wcSiteStage";

let availableTeamNameResizeTimer = null;

window.addEventListener("resize", () => {
    clearTimeout(availableTeamNameResizeTimer);

    availableTeamNameResizeTimer = setTimeout(() => {
        scheduleAvailableTeamNameFit();
    }, 120);
});

document.addEventListener("DOMContentLoaded", init);

const MUSIC_TRACKS = [
    {
        title: "❤️",
        src: "./assets/song 2.mp3?v=38.9.2"
    },
    {
        title: "Dai Dai",
        src: "./assets/song.mp3?v=38.9.2"
    }
];

let currentMusicTrackIndex = 0;

function getCurrentMusicTrack() {
    return MUSIC_TRACKS[currentMusicTrackIndex] || MUSIC_TRACKS[0];
}

function updateMusicButtonLabel(isPlaying = false) {
    const track = getCurrentMusicTrack();
    musicBtn.textContent = `${isPlaying ? "⏸ إيقاف" : "▶ شغّل"} ${track.title}`;
    musicBtn.title = track.title;
}

function loadCurrentMusicTrack() {
    const track = getCurrentMusicTrack();

    if (daiDaiAudio.getAttribute("src") !== track.src) {
        daiDaiAudio.setAttribute("src", track.src);
        daiDaiAudio.load();
    }

    updateMusicButtonLabel(!daiDaiAudio.paused);
}

async function playCurrentMusicTrack() {
    loadCurrentMusicTrack();
    await daiDaiAudio.play();
    updateMusicButtonLabel(true);
}

async function switchMusicTrack(direction) {
    const wasPlaying = !daiDaiAudio.paused;

    daiDaiAudio.pause();
    currentMusicTrackIndex = (currentMusicTrackIndex + direction + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
    loadCurrentMusicTrack();

    if (wasPlaying) {
        await playCurrentMusicTrack();
    }
}

loadCurrentMusicTrack();

musicBtn.addEventListener("click", async () => {
    if (daiDaiAudio.paused) {
        await playCurrentMusicTrack();
    } else {
        daiDaiAudio.pause();
        updateMusicButtonLabel(false);
    }
});

prevMusicBtn.addEventListener("click", () => {
    switchMusicTrack(-1);
});

nextMusicBtn.addEventListener("click", () => {
    switchMusicTrack(1);
});

daiDaiAudio.addEventListener("ended", () => {
    updateMusicButtonLabel(false);
});

async function init() {
    setupTabs();

    applySiteStageTheme(getCachedSiteStage());

    await checkForAppUpdate(false);

    updateCheckTimer = setInterval(() => {
        checkForAppUpdate(false);
    }, 60 * 1000);

    await loadSiteStageThemeFromTournamentProgress();
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
    dashboard.classList.remove("admin-dashboard");
    dashboard.classList.add("participant-dashboard");

    isAdminMode = false;
    adminTabBtn.classList.add("hidden");
    adminPredictionsTabBtn.classList.add("hidden");

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

    if (adminPredictionParticipantSelect) {
        adminPredictionParticipantSelect.innerHTML = `<option value="">اختر المشارك</option>`;
    }

    data.forEach((participant) => {
        const option = document.createElement("option");
        option.value = participant.id;
        option.textContent = participant.name;
        participantSelect.appendChild(option);

        const adminOption = document.createElement("option");
        adminOption.value = participant.id;
        adminOption.textContent = participant.name;
        adminParticipantSelect.appendChild(adminOption);

        if (adminPredictionParticipantSelect) {
            const adminPredictionOption = document.createElement("option");
            adminPredictionOption.value = participant.id;
            adminPredictionOption.textContent = participant.name;
            adminPredictionParticipantSelect.appendChild(adminPredictionOption);
        }

        const participantVisual = getParticipantVisual(participant.name);

        const card = document.createElement("button");
        card.type = "button";
        card.className = "participant-card";
        card.dataset.participantId = participant.id;
        card.dataset.participantName = participant.name;
        card.style.setProperty("--participant-accent", participantVisual.color);
        card.innerHTML = `
            <span class="participant-avatar" aria-hidden="true">${participantVisual.icon}</span>
            <span class="participant-card-name">${escapeHtml(participant.name)}</span>
            <span class="participant-card-check" aria-hidden="true">✓</span>
        `;

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

const PARTICIPANT_VISUALS = {
    "عبدالرحمن": { icon: "⚡", color: "#38bdf8" },
    "رحاب": { icon: "🌟", color: "#facc15" },
    "الهام": { icon: "🚀", color: "#fb7185" },
    "غادة": { icon: "💎", color: "#e879f9" },
    "عبدالإله": { icon: "🛡️", color: "#a78bfa" },
    "عبدالاله": { icon: "🛡️", color: "#a78bfa" },
    "عبدالمجيد": { icon: "👑", color: "#e879f9" },
    "يزيد": { icon: "☀️", color: "#d946ef" },
    "عبدالوهاب": { icon: "🌞", color: "#facc15" },
    "عبدالملك": { icon: "💠", color: "#60a5fa" },
    "يوسف": { icon: "🥅", color: "#22c55e" },
    "أنس": { icon: "⚽", color: "#fb7185" },
    "انس": { icon: "⚽", color: "#fb7185" },
    "منذر": { icon: "🛡️", color: "#34d6bd" },
    "تالين": { icon: "⭐", color: "#60a5fa" },
    "لمار": { icon: "💜", color: "#e879f9" },
    "سليم": { icon: "💎", color: "#a78bfa" },
    "وهبو": { icon: "🎲", color: "#e879f9" },
    "أمل": { icon: "🔥", color: "#f1d89a" },
    "امل": { icon: "🔥", color: "#f1d89a" },
    "يوسف": { icon: "🥅", color: "#22c55e" }
};

const FALLBACK_PARTICIPANT_VISUALS = [
    { icon: "⚽", color: "#fb7185" },
    { icon: "🏆", color: "#f1d89a" },
    { icon: "🔥", color: "#f97316" },
    { icon: "⭐", color: "#60a5fa" },
    { icon: "🎯", color: "#34d6bd" },
    { icon: "💎", color: "#e879f9" },
    { icon: "🛡️", color: "#a78bfa" },
    { icon: "🚀", color: "#fb7185" }
];

function getParticipantVisual(name) {
    const cleanName = String(name || "").trim();

    if (PARTICIPANT_VISUALS[cleanName]) {
        return PARTICIPANT_VISUALS[cleanName];
    }

    const hash = hashString(cleanName);
    return FALLBACK_PARTICIPANT_VISUALS[hash % FALLBACK_PARTICIPANT_VISUALS.length];
}

function hashString(value) {
    return String(value).split("").reduce((hash, character) => {
        return ((hash << 5) - hash + character.charCodeAt(0)) >>> 0;
    }, 0);
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
    dashboard.classList.remove("participant-dashboard");
    dashboard.classList.add("admin-dashboard");

    adminTabBtn.classList.remove("hidden");
    adminPredictionsTabBtn.classList.remove("hidden");

    document.querySelector('[data-tab="available"]').classList.add("hidden");
    document.querySelector('[data-tab="mine"]').classList.add("hidden");

    adminPassword.value = password;

    await loadLeaderboard();
    await loadAdminMatches();

    startDashboardTabSession("leaderboard");
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
    adminPredictionsTabBtn.classList.add("hidden");

    document.querySelector('[data-tab="available"]').classList.remove("hidden");
    document.querySelector('[data-tab="mine"]').classList.remove("hidden");

    dashboard.classList.add("hidden");
    dashboard.classList.remove("admin-dashboard", "participant-dashboard");
    loginCard.classList.remove("hidden");

    loadSiteStageThemeFromTournamentProgress();
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
        adminPredictions: document.getElementById("adminPredictionsTab"),
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

    if (isAdminMode && tabName === "admin") {
        loadAdminMatches()
            .then(() => loadAdminPredictionForSelectedMatch())
            .catch((error) => console.error("Admin prediction match refresh failed:", error));
    }
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

                if (adminPredictionParticipantSelect?.value && adminPredictionMatchSelect?.value) {
                    await loadAdminPredictionForSelectedMatch();
                }

                if (adminParticipantSelect.value) {
                    await loadAdminParticipantPredictions(adminParticipantSelect.value);
                }
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
    const openTime = new Date(kickoff.getTime() - 72 * 60 * 60 * 1000);

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
        availableMatches.className = "match-grid";
        availableMatches.innerHTML = `<p>تعذر تحميل المباريات.</p>`;
        return;
    }

    const openMatches = matches
        .filter((match) => isAvailable(match.kickoff_at))
        .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

    await loadSiteStageThemeFromTournamentProgress();

    if (openMatches.length === 0) {
        availableMatches.className = "match-grid";
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

    const groups = groupMatchesByStage(openMatches);
    const visibleSections = AVAILABLE_STAGE_SECTIONS.filter((section) => {
        return groups[section.stage] && groups[section.stage].length > 0;
    });

    availableMatches.className = "match-grid available-stage-grid";
    availableMatches.innerHTML = visibleSections.map((section) => {
        const stageMatches = groups[section.stage].sort((a, b) => {
            return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
        });

        return `
            ${renderAvailableStageHeader(section.stage, stageMatches.length)}
            ${stageMatches.map((match) => {
            return renderAvailableMatchCard(match, predictionMap.get(match.id));
        }).join("")}
        `;
    }).join("");

    scheduleAvailableTeamNameFit();
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

const TEAM_FLAG_CODES = {
    "المكسيك": "mx",
    "جنوب أفريقيا": "za",
    "كوريا الجنوبية": "kr",
    "كوريا": "kr",
    "التشيك": "cz",
    "كندا": "ca",
    "البوسنة والهرسك": "ba",
    "البوسنة": "ba",
    "قطر": "qa",
    "سويسرا": "ch",
    "البرازيل": "br",
    "المغرب": "ma",
    "هايتي": "ht",
    "اسكتلندا": "gb-sct",
    "أستراليا": "au",
    "تركيا": "tr",
    "أمريكا": "us",
    "الولايات المتحدة": "us",
    "باراغواي": "py",
    "ألمانيا": "de",
    "كوراساو": "cw",
    "ساحل العاج": "ci",
    "الإكوادور": "ec",
    "هولندا": "nl",
    "اليابان": "jp",
    "السويد": "se",
    "تونس": "tn",
    "إسبانيا": "es",
    "السعودية": "sa",
    "الأوروغواي": "uy",
    "الرأس الأخضر": "cv",
    "بلجيكا": "be",
    "مصر": "eg",
    "إيران": "ir",
    "نيوزيلندا": "nz",
    "فرنسا": "fr",
    "السنغال": "sn",
    "العراق": "iq",
    "النرويج": "no",
    "الأرجنتين": "ar",
    "الجزائر": "dz",
    "النمسا": "at",
    "الأردن": "jo",
    "البرتغال": "pt",
    "الكونغو الديمقراطية": "cd",
    "أوزبكستان": "uz",
    "كولومبيا": "co",
    "إنجلترا": "gb-eng",
    "كرواتيا": "hr",
    "غانا": "gh",
    "بنما": "pa"
};

function getTeamFlagCode(teamName) {
    return TEAM_FLAG_CODES[teamName] || "un";
}

function formatTeamFlag(teamName) {
    const code = getTeamFlagCode(teamName);
    const safeTeamName = escapeHtml(teamName);

    return `
        <img
            class="scoreline-flag-img"
            src="https://flagcdn.com/40x30/${code}.png"
            alt=""
            title="${safeTeamName}"
            loading="lazy"
        />
    `;
}

function formatAvailableTeamBlock(teamName, side = "") {
    const safeTeamName = escapeHtml(teamName);
    const sideClass = side ? ` available-team-${side}` : "";

    return `
        <span class="available-team${sideClass}" title="${safeTeamName}">
            <span class="available-team-flag" aria-hidden="true">
                ${formatTeamFlag(teamName)}
            </span>
            <span class="available-team-name">${safeTeamName}</span>
        </span>
    `;
}

function scheduleAvailableTeamNameFit() {
    requestAnimationFrame(() => {
        fitAvailableTeamNames();

        // Re-check after flags/fonts finish painting so the layout stays correct
        // on desktop, tablet, and mobile.
        setTimeout(fitAvailableTeamNames, 80);
        setTimeout(fitAvailableTeamNames, 240);
    });
}

function fitAvailableTeamNames() {
    const matchups = document.querySelectorAll("#availableMatches .available-matchup");

    matchups.forEach((matchup) => {
        const teamNames = Array.from(matchup.querySelectorAll(".available-team-name"));

        if (teamNames.length === 0) return;

        teamNames.forEach((teamName) => {
            teamName.style.fontSize = "";
            teamName.style.letterSpacing = "";
        });

        const matchupWidth = matchup.getBoundingClientRect().width;
        const isVerySmall = matchupWidth <= 340;
        const isSmall = matchupWidth <= 460;
        const isMedium = matchupWidth <= 620;

        const minimumFontSize = isVerySmall ? 11 : isSmall ? 12 : isMedium ? 13 : 14;
        let currentFontSize = Math.min(
            ...teamNames.map((teamName) => parseFloat(window.getComputedStyle(teamName).fontSize) || 20)
        );

        let attempts = 0;

        while (
            teamNames.some(availableTeamNameNeedsFit) &&
            currentFontSize > minimumFontSize &&
            attempts < 24
        ) {
            currentFontSize -= 0.5;

            teamNames.forEach((teamName) => {
                teamName.style.fontSize = `${currentFontSize}px`;
            });

            attempts += 1;
        }

        if (teamNames.some(availableTeamNameNeedsFit)) {
            teamNames.forEach((teamName) => {
                teamName.style.letterSpacing = "-0.055em";
            });
        }
    });
}

function availableTeamNameNeedsFit(teamName) {
    const style = window.getComputedStyle(teamName);
    const fontSize = parseFloat(style.fontSize) || 16;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.12;
    const allowedHeight = lineHeight * 2.25;

    return (
        teamName.scrollWidth > teamName.clientWidth + 1 ||
        teamName.scrollHeight > allowedHeight
    );
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatMatchCell(team1Name, team2Name) {
    const matchText = `${team1Name} ضد ${team2Name}`;
    const isLongMatch = matchText.length > 22;

    return `
        <div class="match-cell-name-only ${isLongMatch ? "match-cell-long" : ""}" title="${matchText}">
            <span class="match-team-name">${team1Name}</span>
            <span class="match-vs-word">ضد</span>
            <span class="match-team-name">${team2Name}</span>
        </div>
    `;
}

function formatTeamScore(team1Name, team1Goals, team2Name, team2Goals, options = {}) {
    const safeTeam1Name = escapeHtml(team1Name);
    const safeTeam2Name = escapeHtml(team2Name);
    const winnerSide = options.winnerSide || null;
    const highlightWinner = Boolean(options.highlightWinner && winnerSide && winnerSide !== "DRAW");
    const team1NumberClass = highlightWinner && winnerSide === "HOME_TEAM"
        ? "scoreline-number scoreline-number-winner"
        : "scoreline-number";
    const team2NumberClass = highlightWinner && winnerSide === "AWAY_TEAM"
        ? "scoreline-number scoreline-number-winner"
        : "scoreline-number";
    const winnerLabel = highlightWinner ? " - المتأهل محدد باللون الأخضر" : "";

    return `
        <div class="scoreline ${highlightWinner ? "scoreline-knockout-winner" : ""}" dir="ltr" title="${safeTeam1Name} ${team1Goals} - ${team2Goals} ${safeTeam2Name}${winnerLabel}">
            ${formatTeamFlag(team1Name)}
            <span class="${team1NumberClass}">${team1Goals}</span>
            <span class="scoreline-dash">-</span>
            <span class="${team2NumberClass}">${team2Goals}</span>
            ${formatTeamFlag(team2Name)}
        </div>
    `;
}

const PREDICTION_STAGE_SECTIONS = [
    { stage: "FINAL", title: "توقعات النهائي (كرة كأس العالم)", knockout: true },
    { stage: "THIRD_PLACE", title: "توقعات المركز الثالث", knockout: true },
    { stage: "SEMI_FINALS", title: "توقعات نصف النهائي 🔥", knockout: true },
    { stage: "QUARTER_FINALS", title: "توقعات الأدوار الإقصائية 8", knockout: true },
    { stage: "LAST_16", title: "توقعات الأدوار الإقصائية 16", knockout: true },
    { stage: "LAST_32", title: "توقعات الأدوار الإقصائية 32", knockout: true },
    { stage: "GROUP_STAGE", title: "توقعات دور المجموعات", knockout: false }
];

const AVAILABLE_STAGE_SECTIONS = [
    { stage: "GROUP_STAGE" },
    { stage: "LAST_32" },
    { stage: "LAST_16" },
    { stage: "QUARTER_FINALS" },
    { stage: "SEMI_FINALS" },
    { stage: "THIRD_PLACE" },
    { stage: "FINAL" }
];

const STAGE_THEME_META = {
    GROUP_STAGE: {
        themeClass: "stage-theme-group",
        icon: "🌍",
        kicker: "دور المجموعات",
        title: "المباريات المتاحة للتوقع",
        note: "اجمع النقاط قبل بداية المباراة."
    },
    LAST_32: {
        themeClass: "stage-theme-last-32",
        icon: "🧊",
        kicker: "بداية خروج المغلوب",
        title: "توقعات دور الـ32",
        note: "من هنا تبدأ كل مباراة تحسم الطريق."
    },
    LAST_16: {
        themeClass: "stage-theme-last-16",
        icon: "🔷",
        kicker: "مرحلة أقوى",
        title: "توقعات دور الـ16",
        note: "الأسماء الكبيرة تبدأ تضغط، وكل نتيجة تفرق."
    },
    QUARTER_FINALS: {
        themeClass: "stage-theme-quarter-finals",
        icon: "🟠",
        kicker: "ربع النهائي",
        title: "توقعات دور الـ8",
        note: "خطوة واحدة عن نصف النهائي، والحماس أعلى."
    },
    SEMI_FINALS: {
        themeClass: "stage-theme-semi-finals",
        icon: "🔥",
        kicker: "نصف النهائي",
        title: "توقعات نصف النهائي",
        note: "كل توقع صار نار، والفرق بين المراكز يصير حساس."
    },
    THIRD_PLACE: {
        themeClass: "stage-theme-third-place",
        icon: "🥉",
        kicker: "مباراة المركز الثالث",
        title: "توقعات المركز الثالث",
        note: "مباراة واحدة، لكنها قد تغيّر ترتيب المسابقة."
    },
    FINAL: {
        themeClass: "stage-theme-final",
        icon: "🏆",
        kicker: "النهائي",
        title: "توقعات النهائي",
        note: "آخر توقع، أعلى حماس، وفرصة ذهبية قبل الختام."
    }
};

function getStageThemeMeta(stage) {
    return STAGE_THEME_META[stage] || {
        themeClass: "stage-theme-group",
        icon: "⚽",
        kicker: "مرحلة متاحة",
        title: "المباريات المتاحة للتوقع",
        note: "التوقع متاح حتى بداية المباراة."
    };
}

function getStageThemeClass(stage) {
    return getStageThemeMeta(stage).themeClass;
}

const SITE_STAGE_FLOW = [
    "GROUP_STAGE",
    "LAST_32",
    "LAST_16",
    "QUARTER_FINALS",
    "SEMI_FINALS"
];

const SITE_STAGE_THEME_CLASSES = [
    ...new Set(Object.values(STAGE_THEME_META).map((meta) => meta.themeClass))
];

function isMatchCompletedForSiteTheme(match) {
    return (
        match.status === "completed" ||
        match.status === "FINISHED" ||
        (match.actual_team1_goals !== null &&
            match.actual_team1_goals !== undefined &&
            match.actual_team2_goals !== null &&
            match.actual_team2_goals !== undefined)
    );
}

function areStageMatchesCompleted(matches = []) {
    return matches.length > 0 && matches.every(isMatchCompletedForSiteTheme);
}

function getTournamentProgressStageForSiteTheme(matches = []) {
    const matchesByStage = matches.reduce((groups, match) => {
        const stage = getPredictionStage(match);

        if (!groups[stage]) {
            groups[stage] = [];
        }

        groups[stage].push(match);
        return groups;
    }, {});

    for (const stage of SITE_STAGE_FLOW) {
        const stageMatches = matchesByStage[stage] || [];

        if (stageMatches.length === 0) {
            return stage;
        }

        if (!areStageMatchesCompleted(stageMatches)) {
            return stage;
        }
    }

    const finalMatches = matchesByStage.FINAL || [];
    const thirdPlaceMatches = matchesByStage.THIRD_PLACE || [];

    if (finalMatches.length > 0 && !areStageMatchesCompleted(finalMatches)) {
        return "FINAL";
    }

    if (thirdPlaceMatches.length > 0 && !areStageMatchesCompleted(thirdPlaceMatches)) {
        return "THIRD_PLACE";
    }

    if (finalMatches.length > 0) {
        return "FINAL";
    }

    return "SEMI_FINALS";
}

function getCachedSiteStage() {
    const cachedStage = localStorage.getItem(SITE_STAGE_CACHE_KEY);

    if (cachedStage && STAGE_THEME_META[cachedStage]) {
        return cachedStage;
    }

    return "GROUP_STAGE";
}

async function loadSiteStageThemeFromTournamentProgress() {
    try {
        const { data: matches, error } = await db
            .from("matches")
            .select("stage, kickoff_at, status, actual_team1_goals, actual_team2_goals")
            .order("kickoff_at");

        if (error) {
            console.error(error);
            applySiteStageTheme(getCachedSiteStage());
            return;
        }

        const resolvedStage = getTournamentProgressStageForSiteTheme(matches || []);

        localStorage.setItem(SITE_STAGE_CACHE_KEY, resolvedStage);
        applySiteStageTheme(resolvedStage);
    } catch (error) {
        console.error("Site stage theme load failed:", error);
        applySiteStageTheme(getCachedSiteStage());
    }
}

function applySiteStageTheme(stage = "GROUP_STAGE") {
    const normalizedStage = stage || "GROUP_STAGE";
    const themeClass = getStageThemeClass(normalizedStage);

    document.body.classList.add("site-stage-theme");
    document.body.classList.remove(...SITE_STAGE_THEME_CLASSES);
    document.body.classList.add(themeClass);
    document.body.dataset.siteStage = normalizedStage;
}

function renderAvailableStageHeader(stage, matchCount) {
    const meta = getStageThemeMeta(stage);
    const matchWord = matchCount === 1 ? "مباراة" : "مباريات";

    return `
        <div class="available-stage-hype">
            <div class="available-stage-copy">
                <span class="available-stage-kicker">${meta.icon} ${meta.kicker}</span>
                <h4>${meta.title}</h4>
                <p>${meta.note}</p>
            </div>
            <div class="available-stage-count">
                <strong>${matchCount}</strong>
                <span>${matchWord} متاحة الآن</span>
            </div>
        </div>
    `;
}

function renderAvailableMatchCard(match, existingPrediction) {
    const stage = getPredictionStage(match);
    const meta = getStageThemeMeta(stage);
    const cardClasses = [
        "match-card",
        "available-stage-card",
        existingPrediction ? "match-card-predicted" : ""
    ].filter(Boolean).join(" ");

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

    return `
        <div class="${cardClasses}">
            <div class="match-stage-row">
                <span class="match-stage-pill">${meta.icon} ${meta.kicker}</span>
                <span class="match-stage-live">متاحة الآن</span>
            </div>

            <div class="match-title available-matchup">
                ${formatAvailableTeamBlock(match.team1, "home")}
                <span class="vs available-vs">ضد</span>
                ${formatAvailableTeamBlock(match.team2, "away")}
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
                    placeholder="${escapeHtml(match.team1)}"
                    value="${existingPrediction ? existingPrediction.predicted_team1_goals : ""}"
                />
                <input
                    id="team2-${match.id}"
                    type="number"
                    min="0"
                    placeholder="${escapeHtml(match.team2)}"
                    value="${existingPrediction ? existingPrediction.predicted_team2_goals : ""}"
                />
            </div>

            <button onclick="savePrediction('${match.id}')">
                ${existingPrediction ? "تحديث التوقع" : "حفظ التوقع"}
            </button>
        </div>
    `;
}

function getPredictionStage(match) {
    return match.stage || "GROUP_STAGE";
}

function isKnockoutStage(stage) {
    return Boolean(stage && stage !== "GROUP_STAGE");
}

function getPredictionStageMeta(stage) {
    return PREDICTION_STAGE_SECTIONS.find((section) => section.stage === stage) || {
        stage,
        title: "توقعات أخرى",
        knockout: stage !== "GROUP_STAGE"
    };
}

function groupMatchesByStage(matches) {
    return matches.reduce((groups, match) => {
        const stage = getPredictionStage(match);

        if (!groups[stage]) {
            groups[stage] = [];
        }

        groups[stage].push(match);
        return groups;
    }, {});
}

function renderPredictionTable(matches, options = {}) {
    const predictionHeader = options.predictionHeader || "توقعك";
    const pointsFormatter = options.pointsFormatter || ((points, match) => formatPointPill(points, match));

    return `
        <table class="table predictions-table predictions-table-v36">
            <thead>
                <tr>
                    <th>المباراة</th>
                    <th>${predictionHeader}</th>
                    <th>الفعلي</th>
                    <th>النقاط</th>
                </tr>
            </thead>
            <tbody>
                ${matches.map((match) => renderPredictionRow(match, pointsFormatter)).join("")}
            </tbody>
        </table>
    `;
}

function renderPredictionRow(match, pointsFormatter) {
    const prediction = getMatchPrediction(match);
    const livePoints = calculateLivePredictionPoints(prediction, match);
    const rowClass = getPredictionRowClass(livePoints, match);
    const stage = getPredictionStage(match);
    const shouldHighlightWinner = isKnockoutStage(stage) && hasActualScore(match);

    return `
        <tr class="${rowClass}">
            <td class="match-name-cell">${formatMatchCell(match.team1, match.team2)}</td>
            <td>
                ${prediction
            ? formatTeamScore(
                match.team1,
                prediction.predicted_team1_goals,
                match.team2,
                prediction.predicted_team2_goals
            )
            : `<span class="pending-score">لا توقع</span>`
        }
            </td>
            <td>
                ${hasActualScore(match)
            ? formatTeamScore(
                match.team1,
                match.actual_team1_goals,
                match.team2,
                match.actual_team2_goals,
                {
                    highlightWinner: shouldHighlightWinner,
                    winnerSide: match.winner_side
                }
            )
            : `<span class="pending-score">لم تبدأ</span>`
        }
            </td>
            <td>${pointsFormatter(livePoints, match)}</td>
        </tr>
    `;
}

function renderPredictionStageSections(matches, options = {}) {
    const groups = groupMatchesByStage(matches);
    const knockoutSections = [];
    let groupSection = "";

    PREDICTION_STAGE_SECTIONS.forEach((section) => {
        const sectionMatches = groups[section.stage];

        if (!sectionMatches || sectionMatches.length === 0) return;

        const sectionHtml = `
            <section class="predictions-stage-section predictions-stage-${section.stage.toLowerCase()}">
                <h4 class="predictions-stage-title">${section.title}</h4>
                ${renderPredictionTable(sectionMatches, options)}
            </section>
        `;

        if (section.knockout) {
            knockoutSections.push(sectionHtml);
        } else {
            groupSection = sectionHtml;
        }
    });

    return `
        <div class="predictions-stage-groups">
            ${knockoutSections.length > 0 ? `
                <div class="predictions-stage-splitter">توقعات الأدوار الإقصائية</div>
                ${knockoutSections.join("")}
            ` : ""}
            ${groupSection}
        </div>
    `;
}

function calculateLivePredictionPoints(prediction, match) {
    if (!prediction) {
        return 0;
    }

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

function getPredictionRowClass(points, match) {
    if (!hasActualScore(match)) return "prediction-row-pending";
    if (points === 50) return "prediction-row-exact";
    if (points === 10) return "prediction-row-correct";
    return "prediction-row-zero";
}

function formatPointPill(points, match) {
    if (!hasActualScore(match)) {
        return `<span class="points-pill points-pill-pending">${points}</span>`;
    }

    if (points === 50) {
        return `<span class="points-pill points-pill-exact">${points}<small>بالملّي</small></span>`;
    }

    if (points === 10) {
        return `<span class="points-pill points-pill-correct">${points}<small>صحيح</small></span>`;
    }

    return `<span class="points-pill points-pill-zero">${points}</span>`;
}

function getMatchPrediction(match) {
    return Array.isArray(match.predictions) && match.predictions.length > 0
        ? match.predictions[0]
        : null;
}

function hasParticipantPrediction(match) {
    return Boolean(getMatchPrediction(match));
}

function shouldShowInPredictionHistory(match) {
    return (
        hasParticipantPrediction(match) ||
        hasActualScore(match) ||
        match.status === "live" ||
        match.status === "completed"
    );
}

async function loadParticipantPredictionHistory(participantId) {
    const { data, error } = await db
        .from("matches")
        .select(`
            id,
            team1,
            team2,
            kickoff_at,
            status,
            stage,
            score_duration,
            winner_side,
            actual_team1_goals,
            actual_team2_goals,
            predictions (
                predicted_team1_goals,
                predicted_team2_goals,
                points,
                participant_id
            )
        `)
        .eq("predictions.participant_id", participantId)
        .order("kickoff_at", { ascending: false });

    if (error) {
        throw error;
    }

    return (data || []).filter(shouldShowInPredictionHistory);
}

async function loadMyPredictions() {
    if (!currentParticipant) return;

    let data;

    try {
        data = await loadParticipantPredictionHistory(currentParticipant.id);
    } catch (error) {
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

    const summary = sortedMatches.reduce((acc, match) => {
        const prediction = getMatchPrediction(match);
        const livePoints = calculateLivePredictionPoints(prediction, match);

        if (prediction) {
            acc.totalPredictions += 1;
        }

        acc.totalPoints += livePoints;

        if (hasActualScore(match)) {
            acc.finished += 1;

            if (livePoints === 50) {
                acc.exact += 1;
            }

            if (livePoints === 10) {
                acc.correct += 1;
            }
        }

        return acc;
    }, { totalPredictions: 0, totalPoints: 0, finished: 0, exact: 0, correct: 0 });

    myPredictions.innerHTML = `
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

    ${renderPredictionStageSections(sortedMatches)}
  `;
}

async function loadAdminParticipantPredictions(participantId) {
    const selectedName =
        adminParticipantSelect.options[adminParticipantSelect.selectedIndex]?.textContent || "";

    let data;

    try {
        data = await loadParticipantPredictionHistory(participantId);
    } catch (error) {
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
        <h4>توقعات ${escapeHtml(selectedName)}</h4>
        ${renderPredictionStageSections(sortedMatches, {
        predictionHeader: "التوقع"
    })}
    `;
}

const LEADERBOARD_STAGE_PRIORITY = [
    "FINAL",
    "THIRD_PLACE",
    "SEMI_FINALS",
    "QUARTER_FINALS",
    "LAST_16",
    "LAST_32",
    "GROUP_STAGE"
];

const LEADERBOARD_STAGE_LABELS = {
    FINAL: "النهائي",
    THIRD_PLACE: "المركز الثالث",
    SEMI_FINALS: "نصف النهائي",
    QUARTER_FINALS: "ربع النهائي",
    LAST_16: "دور الـ16",
    LAST_32: "دور الـ32",
    GROUP_STAGE: "دور المجموعات"
};

const MISSING_PREDICTION_TOTAL_GOAL_ERROR = 3;
const MISSING_PREDICTION_GOAL_DIFFERENCE_ERROR = 3;

const TIE_BREAKER_RULES = {
    2: {
        title: "قاعدة ٢: عدد التوقعات الصحيحة",
        description: "عند تساوي النقاط، يتقدم من لديه عدد أكبر من توقعات 10 أو 50."
    },
    3: {
        title: "قاعدة ٣: أقل خطأ في مجموع الأهداف",
        description: "نحسب مدى قرب توقع أهداف الفريقين من النتيجة الفعلية. الأقل خطأ يتقدم."
    },
    4: {
        title: "قاعدة ٤: أقل خطأ في فارق الأهداف",
        description: "نقارن مدى قرب توقع هامش الفوز أو التعادل من الواقع. الأقل خطأ يتقدم."
    },
    5: {
        title: "قاعدة ٥: الأفضل في المراحل المتأخرة",
        description: "نقارن نقاط النهائي ثم المركز الثالث ثم نصف النهائي ثم ربع النهائي ثم دور الـ16 ثم دور الـ32 ثم المجموعات."
    },
    6: {
        title: "قاعدة ٦: أطول سلسلة صحيحة",
        description: "تحتسب كل توقعات 50 و10 كسلسلة صحيحة، وأي 0 أو لا توقع يقطع السلسلة."
    },
    7: {
        title: "قاعدة ٧: الأسبق للوصول للنقاط الحالية",
        description: "إذا استمر التعادل، يتقدم من وصل إلى نفس مجموع النقاط أولاً."
    },
    8: {
        title: "قاعدة ٨: الاسم",
        description: "تستخدم فقط كحل أخير إذا تساوت كل قواعد كسر التعادل."
    }
};

async function loadLeaderboard() {
    const [participantsResult, matchesResult] = await Promise.all([
        db
            .from("participants")
            .select(`
                id,
                name,
                predictions(
                    match_id,
                    predicted_team1_goals,
                    predicted_team2_goals,
                    points
                )
            `)
            .eq("active", true),
        db
            .from("matches")
            .select(`
                id,
                kickoff_at,
                stage,
                actual_team1_goals,
                actual_team2_goals
            `)
            .not("actual_team1_goals", "is", null)
            .not("actual_team2_goals", "is", null)
            .order("kickoff_at", { ascending: true })
    ]);

    if (participantsResult.error || matchesResult.error) {
        console.error(participantsResult.error || matchesResult.error);
        leaderboard.innerHTML = `<p>تعذر تحميل الترتيب.</p>`;
        return;
    }

    const completedMatches = (matchesResult.data || [])
        .filter(hasActualScore)
        .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

    const rows = (participantsResult.data || [])
        .map((participant) => buildLeaderboardRow(participant, completedMatches))
        .sort(compareLeaderboardRows);

    applyTieBreakerMarkers(rows);

    const leader = rows[0];
    const second = rows[1];
    const leaderGap = leader && second ? leader.points - second.points : 0;
    const totalPredictions = rows.reduce((sum, row) => sum + row.predictionCount, 0);

    const podiumItems = [
        rows[2] ? { rank: 3, icon: "🥉", row: rows[2] } : null,
        rows[0] ? { rank: 1, icon: "🥇", row: rows[0] } : null,
        rows[1] ? { rank: 2, icon: "🥈", row: rows[1] } : null,
    ].filter(Boolean);

    leaderboard.innerHTML = `
    <div class="leaderboard-stage leaderboard-stage-v38-tiebreaks">
      ${leader ? `
        <div class="leaderboard-story-card leaderboard-story-hype">
          <div class="leaderboard-story-visual" aria-hidden="true">
            <img src="assets/world-cup-2026-mark-v24.jpg" alt="" loading="lazy" />
          </div>

          <div class="leaderboard-story-copy">
            <p class="eyebrow">قصة المنافسة الآن</p>
            <h4>${escapeHtml(leader.name)} في الصدارة</h4>
            <p>${leaderGap > 0 ? `الفارق عن أقرب منافس: ${leaderGap} نقطة.` : "الصدارة مشتعلة والفارق صفر."}</p>
          </div>

          <div class="story-metrics">
            <span><strong>${leader.points}</strong><small>نقطة المتصدر</small></span>
            <span><strong>${totalPredictions}</strong><small>إجمالي التوقعات</small></span>
          </div>
        </div>
      ` : ""}

      ${podiumItems.length > 0 ? `
        <div class="leaderboard-podium">
          ${podiumItems.map((item) => `
            <div class="podium-card podium-rank-${item.rank}">
              <span class="podium-medal">${item.icon}</span>
              <span class="podium-name">${escapeHtml(item.row.name)}</span>
              <span class="podium-points">${formatLeaderboardPointsDisplay(item.row, "podium")}</span>
              <span class="podium-label">نقطة</span>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <table class="table leaderboard-table leaderboard-table-v38-tiebreaks">
        <thead>
          <tr>
            <th>المركز</th>
            <th>المشارك</th>
            <th>النقاط</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr class="leaderboard-row leaderboard-rank-${index + 1}">
              <td><span class="rank-badge">${index + 1}</span></td>
              <td class="leaderboard-name">${escapeHtml(row.name)}</td>
              <td class="leaderboard-points">${formatLeaderboardPointsDisplay(row, "table")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildLeaderboardRow(participant, completedMatches) {
    const predictions = participant.predictions || [];
    const predictionMap = new Map();

    predictions.forEach((prediction) => {
        if (prediction.match_id) {
            predictionMap.set(prediction.match_id, prediction);
        }
    });

    const completedPredictions = completedMatches.map((match) => {
        const prediction = predictionMap.get(match.id);
        const kickoffTime = new Date(match.kickoff_at).getTime();
        const stage = getPredictionStage(match);

        if (!prediction) {
            return {
                points: 0,
                kickoffTime,
                stage,
                totalGoalError: MISSING_PREDICTION_TOTAL_GOAL_ERROR,
                goalDifferenceError: MISSING_PREDICTION_GOAL_DIFFERENCE_ERROR,
                isExactScore: false,
                isWinningPrediction: false,
                missingPrediction: true,
            };
        }

        const points = calculatePoints(
            prediction.predicted_team1_goals,
            prediction.predicted_team2_goals,
            match.actual_team1_goals,
            match.actual_team2_goals
        );

        return {
            points,
            kickoffTime,
            stage,
            totalGoalError: calculateTotalGoalError(prediction, match),
            goalDifferenceError: calculateGoalDifferenceError(prediction, match),
            isExactScore: points === 50,
            isWinningPrediction: points > 0,
            missingPrediction: false,
        };
    }).sort((a, b) => a.kickoffTime - b.kickoffTime);

    const totalPoints = completedPredictions.reduce((sum, prediction) => sum + prediction.points, 0);
    const exactScoreCount = completedPredictions.filter((prediction) => prediction.isExactScore).length;
    const correctPredictionCount = completedPredictions.filter((prediction) => prediction.isWinningPrediction).length;
    const bestCorrectStreak = getBestScoringPredictionStreak(completedPredictions);
    const totalGoalError = completedPredictions.reduce((sum, prediction) => sum + prediction.totalGoalError, 0);
    const goalDifferenceError = completedPredictions.reduce((sum, prediction) => sum + prediction.goalDifferenceError, 0);
    const laterStagePoints = getLaterStagePoints(completedPredictions);
    const scoreReachedTime = getScoreReachedTime(completedPredictions, totalPoints);

    return {
        id: participant.id,
        name: participant.name,
        points: totalPoints,
        predictionCount: predictions.length,
        completedPredictionCount: completedPredictions.filter((prediction) => !prediction.missingPrediction).length,
        exactScoreCount,
        correctPredictionCount,
        bestCorrectStreak,
        totalGoalError,
        goalDifferenceError,
        laterStagePoints,
        scoreReachedTime,
        tieBreakerRuleNumber: null,
    };
}

function calculateTotalGoalError(prediction, match) {
    return (
        Math.abs(Number(prediction.predicted_team1_goals) - Number(match.actual_team1_goals)) +
        Math.abs(Number(prediction.predicted_team2_goals) - Number(match.actual_team2_goals))
    );
}

function calculateGoalDifferenceError(prediction, match) {
    const predictedDifference = Number(prediction.predicted_team1_goals) - Number(prediction.predicted_team2_goals);
    const actualDifference = Number(match.actual_team1_goals) - Number(match.actual_team2_goals);

    return Math.abs(predictedDifference - actualDifference);
}

function getLaterStagePoints(completedPredictions) {
    const stagePoints = LEADERBOARD_STAGE_PRIORITY.reduce((acc, stage) => {
        acc[stage] = 0;
        return acc;
    }, {});

    completedPredictions.forEach((prediction) => {
        const stage = prediction.stage || "GROUP_STAGE";
        stagePoints[stage] = (stagePoints[stage] || 0) + prediction.points;
    });

    return stagePoints;
}

function getScoreReachedTime(completedPredictions, totalPoints) {
    if (totalPoints <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    let runningPoints = 0;
    const chronologicalPredictions = [...completedPredictions].sort((a, b) => {
        return a.kickoffTime - b.kickoffTime;
    });

    for (const prediction of chronologicalPredictions) {
        runningPoints += prediction.points;

        if (runningPoints >= totalPoints) {
            return prediction.kickoffTime;
        }
    }

    return Number.POSITIVE_INFINITY;
}

function compareLeaderboardRows(a, b) {
    return (
        b.points - a.points ||
        b.correctPredictionCount - a.correctPredictionCount ||
        a.totalGoalError - b.totalGoalError ||
        a.goalDifferenceError - b.goalDifferenceError ||
        compareLaterStagePoints(a, b) ||
        b.bestCorrectStreak - a.bestCorrectStreak ||
        a.scoreReachedTime - b.scoreReachedTime ||
        a.name.localeCompare(b.name, "ar")
    );
}

function compareLaterStagePoints(a, b) {
    for (const stage of LEADERBOARD_STAGE_PRIORITY) {
        const difference = (b.laterStagePoints[stage] || 0) - (a.laterStagePoints[stage] || 0);

        if (difference !== 0) {
            return difference;
        }
    }

    return 0;
}

function getBestScoringPredictionStreak(completedPredictions) {
    let currentStreak = 0;
    let bestStreak = 0;
    const chronologicalPredictions = [...completedPredictions].sort((a, b) => {
        return a.kickoffTime - b.kickoffTime;
    });

    chronologicalPredictions.forEach((prediction) => {
        if (prediction.isWinningPrediction) {
            currentStreak += 1;
            bestStreak = Math.max(bestStreak, currentStreak);
            return;
        }

        currentStreak = 0;
    });

    return bestStreak;
}

function applyTieBreakerMarkers(rows) {
    rows.forEach((row) => {
        row.tieBreakerRuleNumber = null;
    });

    rows.forEach((row, index) => {
        const previousRow = rows[index - 1];
        const nextRow = rows[index + 1];

        if (previousRow && previousRow.points === row.points) {
            row.tieBreakerRuleNumber = getTieBreakerRuleBetweenRows(previousRow, row);
            return;
        }

        if (nextRow && nextRow.points === row.points) {
            row.tieBreakerRuleNumber = getTieBreakerRuleBetweenRows(row, nextRow);
        }
    });
}

function getTieBreakerRuleBetweenRows(a, b) {
    if (!a || !b || a.points !== b.points) return null;
    if (a.correctPredictionCount !== b.correctPredictionCount) return 2;
    if (a.totalGoalError !== b.totalGoalError) return 3;
    if (a.goalDifferenceError !== b.goalDifferenceError) return 4;
    if (getLaterStagePointsSignature(a) !== getLaterStagePointsSignature(b)) return 5;
    if (a.bestCorrectStreak !== b.bestCorrectStreak) return 6;
    if (a.scoreReachedTime !== b.scoreReachedTime) return 7;
    return 8;
}

function hasDifferentValues(rows, fieldName) {
    const firstValue = rows[0][fieldName];

    return rows.some((row) => row[fieldName] !== firstValue);
}

function hasDifferentLaterStagePoints(rows) {
    const firstSignature = getLaterStagePointsSignature(rows[0]);

    return rows.some((row) => getLaterStagePointsSignature(row) !== firstSignature);
}

function getLaterStagePointsSignature(row) {
    return LEADERBOARD_STAGE_PRIORITY
        .map((stage) => row.laterStagePoints[stage] || 0)
        .join("|");
}

function formatLeaderboardPointsDisplay(row, context = "table") {
    const popupId = `tie-rule-popover-${row.id}-${context}`;
    const tieBreakerBadge = context === "podium"
        ? ""
        : formatTieBreakerBadge(row, popupId);

    return `
        <span class="leaderboard-points-wrap leaderboard-points-wrap-${context}">
            <span class="leaderboard-points-number">${row.points}</span>
            ${tieBreakerBadge}
        </span>
    `;
}

function formatTieBreakerBadge(row, popupId) {
    if (!row.tieBreakerRuleNumber) return "";

    const ruleNumber = row.tieBreakerRuleNumber;
    const rule = TIE_BREAKER_RULES[ruleNumber] || TIE_BREAKER_RULES[8];

    return `
        <span class="tie-rule-anchor">
           <button
    type="button"
    class="tie-rule-badge"
    data-tie-popup-id="${escapeHtml(popupId)}"
    onclick="toggleTieRulePopup(event, this.dataset.tiePopupId)"
    aria-label="معلومة عن سبب كسر التعادل"
    title="سبب كسر التعادل"
>ℹ</button>
            <span id="${escapeHtml(popupId)}" class="tie-rule-popover hidden" role="status">
                <strong>${escapeHtml(rule.title)}</strong>
                <span>${escapeHtml(rule.description)}</span>
                <em>${escapeHtml(formatTieBreakerValue(row, ruleNumber))}</em>
            </span>
        </span>
    `;
}

function formatTieBreakerValue(row, ruleNumber) {
    if (ruleNumber === 2) {
        return `هذا المشارك لديه ${row.correctPredictionCount} توقع صحيح.`;
    }

    if (ruleNumber === 3) {
        return `إجمالي خطأ الأهداف: ${row.totalGoalError}.`;
    }

    if (ruleNumber === 4) {
        return `إجمالي خطأ فارق الأهداف: ${row.goalDifferenceError}.`;
    }

    if (ruleNumber === 5) {
        return formatLaterStagePointsValue(row);
    }

    if (ruleNumber === 6) {
        return `أطول سلسلة صحيحة لهذا المشارك: ${row.bestCorrectStreak}.`;
    }

    if (ruleNumber === 7) {
        return Number.isFinite(row.scoreReachedTime)
            ? `وصل إلى نقاطه الحالية في ${new Date(row.scoreReachedTime).toLocaleString("ar-SA")}.`
            : "لم تسجل نقطة حاسمة بعد.";
    }

    return "تم استخدام الاسم كحل أخير ونادر جداً.";
}

function formatLaterStagePointsValue(row) {
    const nonZeroStages = LEADERBOARD_STAGE_PRIORITY
        .filter((stage) => (row.laterStagePoints[stage] || 0) > 0)
        .map((stage) => `${LEADERBOARD_STAGE_LABELS[stage]}: ${row.laterStagePoints[stage]}`);

    if (nonZeroStages.length === 0) {
        return "لا توجد نقاط في المراحل المتأخرة لهذا المشارك.";
    }

    return nonZeroStages.join("، ");
}

function closeTieRulePopups(exceptPopupId = null) {
    document.querySelectorAll(".tie-rule-popover").forEach((popup) => {
        if (exceptPopupId && popup.id === exceptPopupId) return;
        popup.classList.add("hidden");
    });
}

function toggleTieRulePopup(event, popupId) {
    event.stopPropagation();

    const popup = document.getElementById(popupId);
    if (!popup) return;

    const shouldOpen = popup.classList.contains("hidden");
    closeTieRulePopups(popupId);
    popup.classList.toggle("hidden", !shouldOpen);
}

document.addEventListener("click", () => {
    closeTieRulePopups();
});

const adminPassword = document.getElementById("adminPassword");
const adminMatchSelect = document.getElementById("adminMatchSelect");
const actualTeam1Goals = document.getElementById("actualTeam1Goals");
const actualTeam2Goals = document.getElementById("actualTeam2Goals");
const saveResultBtn = document.getElementById("saveResultBtn");
const adminMessage = document.getElementById("adminMessage");
const adminParticipantSelect = document.getElementById("adminParticipantSelect");
const adminParticipantPredictions = document.getElementById("adminParticipantPredictions");
const adminPredictionParticipantSelect = document.getElementById("adminPredictionParticipantSelect");
const adminPredictionMatchSelect = document.getElementById("adminPredictionMatchSelect");
const adminPredictionCard = document.getElementById("adminPredictionCard");
const adminPredictionMessage = document.getElementById("adminPredictionMessage");

let adminPredictionMatches = [];

function isAdminPredictionMatchActive(match) {
    const status = String(match.status || "").toLowerCase();

    if (status === "live") return true;
    if (status === "completed") return false;

    const kickoffTime = new Date(match.kickoff_at).getTime();
    const now = Date.now();

    return Number.isFinite(kickoffTime) && kickoffTime <= now && !hasActualScore(match);
}

function getAdminPredictionMatchStatusLabel(match) {
    const status = String(match.status || "").toLowerCase();

    if (isAdminPredictionMatchActive(match)) return "🔴 مباشر الآن";
    if (status === "completed") return "✅ مكتملة";

    return "⏳ مجدولة";
}

function sortAdminPredictionMatches(matches = []) {
    return [...matches].sort((a, b) => {
        const activeDifference =
            Number(isAdminPredictionMatchActive(b)) - Number(isAdminPredictionMatchActive(a));

        if (activeDifference !== 0) return activeDifference;

        return new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime();
    });
}

function formatAdminPredictionMatchOptionLabel(match) {
    const kickoffLabel = new Date(match.kickoff_at).toLocaleString("ar-SA");
    return `${getAdminPredictionMatchStatusLabel(match)} — ${kickoffLabel} — ${match.team1} ضد ${match.team2}`;
}

async function loadAdminMatches() {
    const previousResultMatchId = adminMatchSelect.value;
    const previousPredictionMatchId = adminPredictionMatchSelect?.value || "";

    const { data, error } = await db
        .from("matches")
        .select("*")
        .order("kickoff_at", { ascending: false });

    if (error) return;

    adminPredictionMatches = sortAdminPredictionMatches(data || []);

    adminMatchSelect.innerHTML = "";

    if (adminPredictionMatchSelect) {
        adminPredictionMatchSelect.innerHTML = `<option value="">اختر المباراة</option>`;
    }

    adminPredictionMatches.forEach((match) => {
        const matchLabel = formatAdminPredictionMatchOptionLabel(match);

        const resultOption = document.createElement("option");
        resultOption.value = match.id;
        resultOption.textContent = matchLabel;
        adminMatchSelect.appendChild(resultOption);

        if (adminPredictionMatchSelect) {
            const predictionOption = document.createElement("option");
            predictionOption.value = match.id;
            predictionOption.textContent = matchLabel;
            adminPredictionMatchSelect.appendChild(predictionOption);
        }
    });

    if (previousResultMatchId) {
        adminMatchSelect.value = previousResultMatchId;
    }

    if (adminPredictionMatchSelect && previousPredictionMatchId) {
        adminPredictionMatchSelect.value = previousPredictionMatchId;
    }

    if (adminPredictionMatchSelect && !adminPredictionMatchSelect.value) {
        const activeMatch = adminPredictionMatches.find(isAdminPredictionMatchActive);

        if (activeMatch) {
            adminPredictionMatchSelect.value = activeMatch.id;
        }
    }
}

async function loadAdminPredictionForSelectedMatch() {
    if (!adminPredictionParticipantSelect || !adminPredictionMatchSelect || !adminPredictionCard) return;

    const participantId = adminPredictionParticipantSelect.value;
    const matchId = adminPredictionMatchSelect.value;
    const selectedParticipantName =
        adminPredictionParticipantSelect.options[adminPredictionParticipantSelect.selectedIndex]?.textContent || "";

    adminPredictionMessage.textContent = "";

    if (!participantId || !matchId) {
        adminPredictionCard.innerHTML = `<p class="admin-empty-state">اختر المشارك ثم المباراة لإدخال أو تعديل التوقع.</p>`;
        return;
    }

    let match = adminPredictionMatches.find((item) => item.id === matchId);

    if (!match) {
        const { data: fetchedMatch, error: matchError } = await db
            .from("matches")
            .select("*")
            .eq("id", matchId)
            .single();

        if (matchError || !fetchedMatch) {
            adminPredictionCard.innerHTML = `<p class="admin-empty-state">تعذر تحميل المباراة المختارة.</p>`;
            return;
        }

        match = fetchedMatch;
    }

    const { data: existingPrediction, error: predictionError } = await db
        .from("predictions")
        .select("predicted_team1_goals, predicted_team2_goals, points")
        .eq("participant_id", participantId)
        .eq("match_id", matchId)
        .maybeSingle();

    if (predictionError) {
        console.error(predictionError);
        adminPredictionCard.innerHTML = `<p class="admin-empty-state">تعذر تحميل التوقع الحالي.</p>`;
        return;
    }

    adminPredictionCard.innerHTML = renderAdminPredictionMatchCard(
        match,
        existingPrediction,
        selectedParticipantName
    );

    scheduleAvailableTeamNameFit();
}

function renderAdminPredictionMatchCard(match, existingPrediction, participantName) {
    const stage = getPredictionStage(match);
    const meta = getStageThemeMeta(stage);
    const cardClasses = [
        "match-card",
        "available-stage-card",
        "admin-manual-prediction-card",
        existingPrediction ? "match-card-predicted" : ""
    ].filter(Boolean).join(" ");

    const savedPredictionHtml = existingPrediction
        ? `
        <div class="saved-prediction-card">
            <div class="saved-prediction-row">
                <span class="saved-prediction-title">✅ التوقع الحالي</span>
                <span class="saved-score">
                    ${existingPrediction.predicted_team1_goals} - ${existingPrediction.predicted_team2_goals}
                </span>
            </div>
            <div class="saved-prediction-note">
                يوجد توقع محفوظ لهذا المشارك، ويمكنك تعديله من هنا.
            </div>
        </div>
      `
        : "";

    return `
        <div class="${cardClasses}">
            <div class="match-stage-row">
                <span class="match-stage-pill">${meta.icon} ${meta.kicker}</span>
                <span class="match-stage-live">إدخال إداري</span>
            </div>

            <p class="admin-manual-prediction-for">
                توقع عن: <strong>${escapeHtml(participantName)}</strong>
            </p>

            <div class="match-title available-matchup">
                ${formatAvailableTeamBlock(match.team1, "home")}
                <span class="vs available-vs">ضد</span>
                ${formatAvailableTeamBlock(match.team2, "away")}
            </div>

            <p class="kickoff">
                ${getAdminPredictionMatchStatusLabel(match)} — وقت المباراة: ${new Date(match.kickoff_at).toLocaleString("ar-SA")}
            </p>

            ${savedPredictionHtml}

            <div class="score-row">
                <input
                    id="adminPredictTeam1Goals"
                    type="number"
                    min="0"
                    placeholder="${escapeHtml(match.team1)}"
                    value="${existingPrediction ? existingPrediction.predicted_team1_goals : ""}"
                />
                <input
                    id="adminPredictTeam2Goals"
                    type="number"
                    min="0"
                    placeholder="${escapeHtml(match.team2)}"
                    value="${existingPrediction ? existingPrediction.predicted_team2_goals : ""}"
                />
            </div>

            <button onclick="saveAdminPrediction()">
                ${existingPrediction ? "تحديث توقع المشارك" : "حفظ توقع المشارك"}
            </button>
        </div>
    `;
}

async function saveAdminPrediction() {
    if (!adminPredictionParticipantSelect || !adminPredictionMatchSelect) return;

    if (adminPassword.value !== ADMIN_PASSWORD) {
        adminPredictionMessage.textContent = "كلمة مرور الإدارة غير صحيحة.";
        return;
    }

    const participantId = adminPredictionParticipantSelect.value;
    const matchId = adminPredictionMatchSelect.value;
    const team1Input = document.getElementById("adminPredictTeam1Goals");
    const team2Input = document.getElementById("adminPredictTeam2Goals");

    if (!participantId || !matchId || !team1Input || !team2Input) {
        adminPredictionMessage.textContent = "الرجاء اختيار المشارك والمباراة.";
        return;
    }

    const team1Goals = Number(team1Input.value);
    const team2Goals = Number(team2Input.value);

    if (
        !Number.isInteger(team1Goals) ||
        !Number.isInteger(team2Goals) ||
        team1Goals < 0 ||
        team2Goals < 0
    ) {
        adminPredictionMessage.textContent = "الرجاء إدخال توقع صحيح.";
        return;
    }

    const match = adminPredictionMatches.find((item) => item.id === matchId);
    const points = match && hasActualScore(match)
        ? calculatePoints(team1Goals, team2Goals, match.actual_team1_goals, match.actual_team2_goals)
        : 0;

    const { error } = await db.rpc("admin_upsert_prediction", {
        admin_password: adminPassword.value,
        target_participant_id: participantId,
        target_match_id: matchId,
        team1_goals: team1Goals,
        team2_goals: team2Goals,
    });

    if (error) {
        console.error(error);

        const errorMessage = String(error.message || "");
        const errorDetails = String(error.details || "");
        const rpcMissing =
            error.code === "PGRST202" ||
            errorMessage.includes("admin_upsert_prediction") ||
            errorDetails.includes("admin_upsert_prediction");

        adminPredictionMessage.textContent = rpcMissing
            ? "تعذر حفظ توقع المشارك. يجب تشغيل ملف Supabase SQL الخاص بالإدارة أولاً."
            : "تعذر حفظ توقع المشارك.";
        return;
    }

    adminPredictionMessage.textContent = "تم حفظ توقع المشارك.";

    await loadAdminPredictionForSelectedMatch();
    await loadLeaderboard();

    if (adminParticipantSelect.value === participantId) {
        await loadAdminParticipantPredictions(participantId);
    }
}

if (adminPredictionParticipantSelect) {
    adminPredictionParticipantSelect.addEventListener("change", loadAdminPredictionForSelectedMatch);
}

if (adminPredictionMatchSelect) {
    adminPredictionMatchSelect.addEventListener("change", loadAdminPredictionForSelectedMatch);
}

saveResultBtn.addEventListener("click", async () => {
    if (adminPassword.value !== ADMIN_PASSWORD) {
        adminMessage.textContent = "كلمة مرور الإدارة غير صحيحة.";
        return;
    }

    const matchId = adminMatchSelect.value;
    const team1Goals = Number(actualTeam1Goals.value);
    const team2Goals = Number(actualTeam2Goals.value);

    if (!Number.isInteger(team1Goals) || !Number.isInteger(team2Goals) || team1Goals < 0 || team2Goals < 0) {
        adminMessage.textContent = "الرجاء إدخال نتيجة صحيحة.";
        return;
    }

    const manualWinnerSide = team1Goals > team2Goals
        ? "HOME_TEAM"
        : team2Goals > team1Goals
            ? "AWAY_TEAM"
            : "DRAW";

    const { error } = await db
        .from("matches")
        .update({
            actual_team1_goals: team1Goals,
            actual_team2_goals: team2Goals,
            status: "completed",
            score_duration: "REGULAR",
            winner_side: manualWinnerSide,
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

function getVersionFromAssetUrl(assetUrl) {
    if (!assetUrl) return "";

    try {
        return new URL(assetUrl, window.location.href).searchParams.get("v") || "";
    } catch (error) {
        return "";
    }
}

function getCurrentHtmlShellVersions() {
    const appScript = Array.from(document.scripts).find((script) => {
        return /(^|\/)app\.js$/i.test(new URL(script.src || "", window.location.href).pathname);
    });

    const styleLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((link) => {
        return /(^|\/)style\.css$/i.test(new URL(link.href || "", window.location.href).pathname);
    });

    return {
        appJs: getVersionFromAssetUrl(appScript?.getAttribute("src") || appScript?.src),
        styleCss: getVersionFromAssetUrl(styleLink?.getAttribute("href") || styleLink?.href)
    };
}

function isCurrentHtmlShellVersion(latestVersion) {
    const shellVersions = getCurrentHtmlShellVersions();

    return (
        shellVersions.appJs === latestVersion &&
        shellVersions.styleCss === latestVersion
    );
}

function buildUpdateUrl(latestVersion) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}?v=${encodeURIComponent(latestVersion)}&t=${Date.now()}`;
}

async function checkForAppUpdate(forceReload = false) {
    try {
        const response = await fetch(`version.json?t=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) return;

        const data = await response.json();
        const latestVersion = String(data.version || "").trim();

        if (!latestVersion) return;

        const htmlShellIsCurrent = isCurrentHtmlShellVersion(latestVersion);

        if (latestVersion === APP_VERSION && htmlShellIsCurrent) {
            sessionStorage.removeItem("wcReloadAttemptedVersion");
            sessionStorage.removeItem("wcReloadAttemptedUpdateKey");
            localStorage.removeItem("wcNeedsRefresh");
            localStorage.setItem("wcLoadedVersion", APP_VERSION);
            return;
        }

        localStorage.setItem("wcNeedsRefresh", "true");

        const shellVersions = getCurrentHtmlShellVersions();
        const updateKey = [
            `app=${APP_VERSION}`,
            `latest=${latestVersion}`,
            `js=${shellVersions.appJs || "none"}`,
            `css=${shellVersions.styleCss || "none"}`
        ].join("|");

        const reloadAttemptedUpdateKey = sessionStorage.getItem("wcReloadAttemptedUpdateKey");
        const reloadAttemptedVersion = sessionStorage.getItem("wcReloadAttemptedVersion");

        if (forceReload || reloadAttemptedUpdateKey !== updateKey || reloadAttemptedVersion !== latestVersion) {
            sessionStorage.setItem("wcReloadAttemptedVersion", latestVersion);
            sessionStorage.setItem("wcReloadAttemptedUpdateKey", updateKey);

            window.location.replace(buildUpdateUrl(latestVersion));
            return;
        }

        showUpdateRequiredOverlay(latestVersion, shellVersions);
    } catch (error) {
        console.warn("Version check failed:", error);
    }
}

function showUpdateRequiredOverlay(latestVersion, shellVersions = getCurrentHtmlShellVersions()) {
    if (document.getElementById("updateRequiredOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "updateRequiredOverlay";
    overlay.className = "update-required-overlay";

    overlay.innerHTML = `
        <div class="update-required-card">
            <div class="update-required-icon">⚽</div>
            <h2>تم تحديث الموقع</h2>
            <p>
                يوجد إصدار جديد من المسابقة أو أن المتصفح ما زال يستخدم ملفات قديمة.
                الرجاء التحديث للمتابعة بأحدث النتائج والتصميم.
            </p>
            <p class="update-required-debug">
                الإصدار الحالي: ${APP_VERSION} — المطلوب: ${latestVersion}<br />
                الملفات: JS ${shellVersions.appJs || "غير معروف"} / CSS ${shellVersions.styleCss || "غير معروف"}
            </p>
            <button type="button" id="forceRefreshBtn">
                تحديث الآن
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("forceRefreshBtn").addEventListener("click", () => {
        sessionStorage.removeItem("wcReloadAttemptedVersion");
        localStorage.removeItem("wcNeedsRefresh");

        window.location.replace(buildUpdateUrl(latestVersion));
    });
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
    const openTime = new Date(kickoff.getTime() - 72 * 60 * 60 * 1000);

    return now >= openTime && now < kickoff;
}

