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

const openSiteMenuBtn = document.getElementById("openSiteMenuBtn");
const closeSiteMenuBtn = document.getElementById("closeSiteMenuBtn");
const siteMenuDrawer = document.getElementById("siteMenuDrawer");
const siteMenuOverlay = document.getElementById("siteMenuOverlay");
const profileQuickBtn = document.getElementById("profileQuickBtn");
const menuProfileCard = document.getElementById("menuProfileCard");
const menuProfileAvatar = document.getElementById("menuProfileAvatar");
const menuProfileName = document.getElementById("menuProfileName");
const menuProfileMeta = document.getElementById("menuProfileMeta");
const profilePageTitle = document.getElementById("profilePageTitle");

const MENU_PAGE_IDS = {
    profile: "profileTab",
    highlights: "highlightsTab",
    statistics: "statisticsTab",
    seasonRecap: "seasonRecapTab",
    about: "aboutTab"
};

const MENU_PAGE_LABELS = {
    profile: "الملف الشخصي",
    highlights: "الأضواء",
    statistics: "الإحصائيات والشارات",
    seasonRecap: "ختام المسابقة",
    about: "عن المسابقة والتواصل"
};

const AI_POSTS_TABLE = "ai_posts";
const aiPostsCache = new Map();
const aiPostsLoadState = new Map();

const AI_SECTION_EMPTY_MESSAGES = {
    highlights: "ستظهر لقطات الختام هنا بعد اكتمال بيانات البطولة.",
    statistics: "ستظهر الإحصائيات والشارات هنا بعد اكتمال بيانات البطولة.",
    profile: "ملخص الملف الشخصي محسوب من بياناتك الحالية."
};

const availableMatches = document.getElementById("availableMatches");
const myPredictions = document.getElementById("myPredictions");
const leaderboard = document.getElementById("leaderboard");
const seasonRecap = document.getElementById("seasonRecap");

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

const APP_VERSION = "39.0";
const PREDICTION_OPEN_HOURS = 72;
const FINAL_RECAP_PREVIEW_PARAM = "previewFinal";
const EXPECTED_WORLD_CUP_MATCH_COUNT = 104;
const FINAL_AI_HIGHLIGHTS_SECTION = "final_highlights";
const FINAL_AI_PROFILE_SECTION = "final_profile";
const FINAL_RECAP_MAX_HIGHLIGHTS = 80;
const SHOW_LIVE_FINAL_STATS = true;
const SHOW_PUBLISHED_HIGHLIGHTS_BEFORE_FINAL = true;
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
        src: "./assets/song 2.mp3?v=39.0"
    },
    {
        title: "Dai Dai",
        src: "./assets/song.mp3?v=39.0"
    }
];

let currentMusicTrackIndex = 0;

function getCurrentMusicTrack() {
    return MUSIC_TRACKS[currentMusicTrackIndex] || MUSIC_TRACKS[0];
}

function updateMusicButtonLabel(isPlaying = false) {
    if (!musicBtn) return;

    const track = getCurrentMusicTrack();
    musicBtn.textContent = `${isPlaying ? "⏸ إيقاف" : "▶ شغّل"} ${track.title}`;
    musicBtn.title = track.title;
}

function loadCurrentMusicTrack() {
    if (!daiDaiAudio) return;

    const track = getCurrentMusicTrack();

    if (daiDaiAudio.getAttribute("src") !== track.src) {
        daiDaiAudio.setAttribute("src", track.src);
        daiDaiAudio.load();
    }

    updateMusicButtonLabel(!daiDaiAudio.paused);
}

async function playCurrentMusicTrack() {
    if (!daiDaiAudio) return;

    loadCurrentMusicTrack();
    await daiDaiAudio.play();
    updateMusicButtonLabel(true);
}

async function switchMusicTrack(direction) {
    if (!daiDaiAudio) return;

    const wasPlaying = !daiDaiAudio.paused;

    daiDaiAudio.pause();
    currentMusicTrackIndex = (currentMusicTrackIndex + direction + MUSIC_TRACKS.length) % MUSIC_TRACKS.length;
    loadCurrentMusicTrack();

    if (wasPlaying) {
        await playCurrentMusicTrack();
    }
}

loadCurrentMusicTrack();

musicBtn?.addEventListener("click", async () => {
    if (daiDaiAudio.paused) {
        await playCurrentMusicTrack();
    } else {
        daiDaiAudio.pause();
        updateMusicButtonLabel(false);
    }
});

prevMusicBtn?.addEventListener("click", () => {
    switchMusicTrack(-1);
});

nextMusicBtn?.addEventListener("click", () => {
    switchMusicTrack(1);
});

daiDaiAudio?.addEventListener("ended", () => {
    updateMusicButtonLabel(false);
});

async function init() {
    setupTabs();
    setupSiteMenu();
    setupFinalRecapClickGuards();
    setupPassiveFinalCardClickGuard();

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
    updateMenuProfileCard();

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
    "منار": { icon: "🌙", color: "#60a5fa" },
    "يوسف": { icon: "🥅", color: "#22c55e" }
};

const PARTICIPANT_LANGUAGE_PROFILE = {
    "رحاب": { gender: "female" },
    "غادة": { gender: "female" },
    "الهام": { gender: "female" },
    "إلهام": { gender: "female" },
    "تالين": { gender: "female" },
    "لمار": { gender: "female" },
    "أمل": { gender: "female" },
    "امل": { gender: "female" },
    "منار": { gender: "female" },
    "سديم": { gender: "female" }
};

function isFemaleParticipantName(name) {
    const cleanName = String(name || "").trim();
    return PARTICIPANT_LANGUAGE_PROFILE[cleanName]?.gender === "female";
}

function participantPhrase(name, maleText, femaleText) {
    return isFemaleParticipantName(name) ? femaleText : maleText;
}

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
    updateMenuProfileCard();

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
    updateMenuProfileCard();
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


function setupSiteMenu() {
    if (openSiteMenuBtn) {
        openSiteMenuBtn.addEventListener("click", openSiteMenu);
    }

    if (closeSiteMenuBtn) {
        closeSiteMenuBtn.addEventListener("click", closeSiteMenu);
    }

    if (siteMenuOverlay) {
        siteMenuOverlay.addEventListener("click", closeSiteMenu);
    }

    document.querySelectorAll("button[data-menu-tab], a[data-menu-tab], [role='button'][data-menu-tab]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            handleSiteMenuTab(button.dataset.menuTab);
        });
    });

    document.querySelectorAll("button[data-menu-page], a[data-menu-page], [role='button'][data-menu-page]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            handleSiteMenuPage(button.dataset.menuPage);
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && siteMenuDrawer && !siteMenuDrawer.classList.contains("hidden")) {
            closeSiteMenu();
        }
    });

    updateMenuProfileCard();
}

function openSiteMenu() {
    if (!siteMenuDrawer || !siteMenuOverlay) return;

    siteMenuOverlay.classList.remove("hidden");
    siteMenuDrawer.classList.remove("hidden");
    document.body.classList.add("site-menu-open");

    openSiteMenuBtn?.setAttribute("aria-expanded", "true");
    siteMenuDrawer.setAttribute("aria-hidden", "false");
    siteMenuOverlay.setAttribute("aria-hidden", "false");

    updateMenuProfileCard();
    updateSiteMenuActiveState(currentTabName);
}

function closeSiteMenu() {
    if (!siteMenuDrawer || !siteMenuOverlay) return;

    siteMenuOverlay.classList.add("hidden");
    siteMenuDrawer.classList.add("hidden");
    document.body.classList.remove("site-menu-open");

    openSiteMenuBtn?.setAttribute("aria-expanded", "false");
    siteMenuDrawer.setAttribute("aria-hidden", "true");
    siteMenuOverlay.setAttribute("aria-hidden", "true");
}

function handleSiteMenuTab(tabName) {
    if (!tabName) return;

    if (tabName === "available" || tabName === "mine") {
        if (!currentParticipant) {
            showLoginNudge("سجّل الدخول أولاً لعرض هذا القسم.");
            return;
        }
    }

    if ((tabName === "admin" || tabName === "adminPredictions") && !isAdminMode) {
        showLoginNudge("هذا القسم خاص بالإدارة.");
        return;
    }

    if (dashboard.classList.contains("hidden")) {
        showLoginNudge("سجّل الدخول أولاً لعرض هذا القسم.");
        return;
    }

    closeSiteMenu();
    goToDashboardTab(tabName);
    scrollDashboardIntoView(tabName);
}

function handleSiteMenuPage(pageName) {
    if (!pageName) return;

    if (pageName === "home") {
        closeSiteMenu();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }

    if (!MENU_PAGE_IDS[pageName]) return;

    if (dashboard.classList.contains("hidden")) {
        showLoginNudge("سجّل الدخول أولاً لعرض هذا القسم.");
        return;
    }

    closeSiteMenu();
    goToDashboardTab(pageName);
    scrollDashboardIntoView(pageName);
}

function showLoginNudge(message) {
    closeSiteMenu();

    loginMessage.textContent = message;
    loginCard.classList.remove("hidden");

    if (dashboard.classList.contains("hidden")) {
        loginCard.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
        dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function scrollDashboardIntoView(tabName = currentTabName) {
    const targetPanel = getDashboardPanelForScroll(tabName);
    const target = targetPanel || dashboard;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateMenuProfileCard() {
    if (!menuProfileName || !menuProfileMeta || !menuProfileAvatar) return;

    if (isAdminMode) {
        menuProfileAvatar.textContent = "🛠️";
        menuProfileName.textContent = "الإدارة";
        menuProfileMeta.textContent = "لوحة التحكم وإدارة التوقعات";
        profileQuickBtn?.classList.add("site-profile-ready");
        return;
    }

    if (currentParticipant) {
        const visual = getParticipantVisual(currentParticipant.name);
        menuProfileAvatar.textContent = visual.icon;
        menuProfileAvatar.style.setProperty("--participant-accent", visual.color);
        menuProfileName.textContent = currentParticipant.name;
        menuProfileMeta.textContent = "ملفك ونقاطك وملخصك الشخصي";
        profileQuickBtn?.classList.add("site-profile-ready");
        return;
    }

    menuProfileAvatar.textContent = "👤";
    menuProfileAvatar.style.removeProperty("--participant-accent");
    menuProfileName.textContent = "الملف الشخصي";
    menuProfileMeta.textContent = "سجّل الدخول لعرض النقاط والشارات";
    profileQuickBtn?.classList.remove("site-profile-ready");
}

function updateSiteMenuActiveState(activeKey) {
    document.querySelectorAll(".site-menu-link, .site-menu-profile-card").forEach((button) => {
        const isActive = button.dataset.menuTab === activeKey || button.dataset.menuPage === activeKey;
        button.classList.toggle("site-menu-link-active", isActive);
    });
}

async function renderProfilePageShell() {
    const profileSummary = document.getElementById("profileSummary");
    const profileBadges = document.getElementById("profileBadges");
    const profileAiStory = document.getElementById("profileAiStory");

    if (!profileSummary) return;

    if (profilePageTitle) {
        profilePageTitle.textContent = currentParticipant
            ? `ملف ${currentParticipant.name}`
            : isAdminMode
                ? "ملف الإدارة"
                : "ملف المشارك";
    }

    if (isAdminMode) {
        profileSummary.innerHTML = `
            <div class="placeholder-card">
                ملف الإدارة جاهز لعرض ملخصات تشغيلية عن المسابقة والمباريات المكتملة.
            </div>
        `;
        if (profileBadges) profileBadges.innerHTML = "";
        if (profileAiStory) profileAiStory.innerHTML = "";
        return;
    }

    if (!currentParticipant) {
        profileSummary.innerHTML = `<div class="placeholder-card">سجّل الدخول لعرض ملفك الشخصي.</div>`;
        if (profileBadges) profileBadges.innerHTML = "";
        if (profileAiStory) profileAiStory.innerHTML = "";
        return;
    }

    profileSummary.innerHTML = `<div class="placeholder-card">جاري تحميل ملفك الشخصي...</div>`;
    if (profileBadges) profileBadges.innerHTML = "";
    if (profileAiStory) profileAiStory.innerHTML = "";

    try {
        const [profileStats, finalProfilePosts] = await Promise.all([
            loadParticipantProfileStats(currentParticipant.id),
            loadAiPosts(FINAL_AI_PROFILE_SECTION, {
                participantId: currentParticipant.id,
                limit: 1,
                useCache: false
            })
        ]);
        const visual = getParticipantVisual(currentParticipant.name);

        profileSummary.innerHTML = renderProfileSummary(currentParticipant, visual, profileStats);

        if (profileBadges) {
            profileBadges.innerHTML = renderProfileBadges(profileStats);
        }

        if (profileAiStory) {
            profileAiStory.innerHTML = finalProfilePosts.length > 0
                ? renderAiPostCard(finalProfilePosts[0], { compact: true })
                : renderProfileClosingNote(currentParticipant, profileStats);
        }
    } catch (error) {
        console.error("Profile page load failed:", error);
        profileSummary.innerHTML = `<div class="placeholder-card">تعذر تحميل الملف الشخصي حالياً.</div>`;
    }
}

async function renderMenuPageContent(tabName) {
    if (tabName === "profile") {
        await renderProfilePageShell();
        return;
    }

    if (tabName === "highlights") {
        await renderSeasonHighlightsPage();
        return;
    }

    if (tabName === "statistics") {
        await renderStatisticsAndBadgesPage();
        return;
    }

    if (tabName === "seasonRecap") {
        await renderSeasonRecapPage();
        return;
    }

    if (tabName === "about") {
        renderAboutPage();
    }
}

function runMenuPageRenderer(tabName) {
    if (!MENU_PAGE_IDS[tabName]) return;

    renderMenuPageContent(tabName).catch((error) => {
        console.error(`Menu page render failed for ${tabName}:`, error);
    });
}

async function renderHighlightsPage() {
    const featuredContainer = document.getElementById("highlightsFeaturedPost");
    const feedContainer = document.getElementById("aiHighlightsFeed");

    if (!featuredContainer || !feedContainer) return;

    featuredContainer.innerHTML = `<div class="placeholder-card">جاري تحميل الأضواء...</div>`;
    feedContainer.innerHTML = "";

    const posts = await loadAiPosts("highlights");

    if (posts.length === 0) {
        featuredContainer.innerHTML = `<div class="placeholder-card">${AI_SECTION_EMPTY_MESSAGES.highlights}</div>`;
        return;
    }

    const [featuredPost, ...restPosts] = posts;
    featuredContainer.innerHTML = renderAiPostCard(featuredPost, { featured: true });
    feedContainer.innerHTML = restPosts.length > 0
        ? restPosts.map((post) => renderAiPostCard(post)).join("")
        : `<div class="placeholder-card">سيظهر المزيد من الأضواء مع تقدم البطولة.</div>`;
}

async function renderAiCardSection(sectionKey, containerId) {
    const container = document.getElementById(containerId);

    if (!container) return;

    container.innerHTML = `<div class="placeholder-card">جاري تحميل المحتوى...</div>`;

    const posts = await loadAiPosts(sectionKey);

    container.innerHTML = posts.length > 0
        ? renderAiPostCard(posts[0], { featured: sectionKey === "statistics" })
        : `<div class="placeholder-card">${AI_SECTION_EMPTY_MESSAGES[sectionKey] || "لا يوجد محتوى منشور حالياً."}</div>`;
}

async function renderAwardsPage() {
    const container = document.getElementById("awardsGrid");

    if (!container) return;

    container.innerHTML = `<div class="placeholder-card">جاري تحميل الشارات...</div>`;

    const posts = await loadAiPosts("awards");

    container.innerHTML = posts.length > 0
        ? renderAwardPost(posts[0])
        : `<div class="placeholder-card">${AI_SECTION_EMPTY_MESSAGES.awards}</div>`;
}

function renderAboutPage() {
    const rulesSummary = document.getElementById("rulesSummary");

    if (!rulesSummary || rulesSummary.dataset.rendered === "true") return;

    rulesSummary.dataset.rendered = "true";
    rulesSummary.innerHTML = `
        <div class="info-card rules-card">
            <strong>٥٠ نقطة</strong>
            <span>إذا كان التوقع مطابقاً للنتيجة بالضبط.</span>
        </div>
        <div class="info-card rules-card">
            <strong>١٠ نقاط</strong>
            <span>إذا كان الفائز أو التعادل صحيحاً، حتى لو اختلفت النتيجة.</span>
        </div>
        <div class="info-card rules-card">
            <strong>إغلاق التوقع</strong>
            <span>يمكن تعديل التوقع حتى بداية المباراة فقط.</span>
        </div>
        <div class="info-card rules-card">
            <strong>ملاحظة الترجيح</strong>
            <span>ركلات الترجيح لا تدخل في النتيجة المعتمدة للتوقع.</span>
        </div>
    `;
}

async function loadAiPosts(sectionKey, options = {}) {
    const participantId = options.participantId || null;
    const cacheKey = participantId ? `${sectionKey}:${participantId}` : sectionKey;

    if (options.useCache !== false && aiPostsCache.has(cacheKey)) {
        return aiPostsCache.get(cacheKey);
    }

    if (aiPostsLoadState.has(cacheKey)) {
        return aiPostsLoadState.get(cacheKey);
    }

    const loadPromise = (async () => {
        let query = db
            .from(AI_POSTS_TABLE)
            .select(`
                id,
                section_key,
                title_ar,
                subtitle_ar,
                body_ar,
                icon,
                cards_json,
                participant_id,
                source_completed_match_count,
                source_match_ids,
                display_order,
                created_at
            `)
            .eq("visible", true)
            .eq("section_key", sectionKey)
            .order("display_order", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(options.limit || 30);

        if (participantId) {
            query = query.eq("participant_id", participantId);
        }

        const { data, error } = await query;

        if (error) {
            console.warn(`AI posts table not ready or failed for ${sectionKey}:`, error.message || error);
            aiPostsCache.set(cacheKey, []);
            return [];
        }

        const posts = (data || []).map(normalizeAiPost);
        aiPostsCache.set(cacheKey, posts);
        return posts;
    })();

    aiPostsLoadState.set(cacheKey, loadPromise);

    try {
        return await loadPromise;
    } finally {
        aiPostsLoadState.delete(cacheKey);
    }
}

function normalizeAiPost(post) {
    return {
        ...post,
        icon: post.icon || "✨",
        cards: normalizeJsonArray(post.cards_json)
    };
}

function normalizeJsonArray(value) {
    if (Array.isArray(value)) return value;

    if (!value) return [];

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    return [];
}

function renderAiPostCard(post, options = {}) {
    const classes = [
        "ai-post-card",
        options.featured ? "ai-post-card-featured" : "",
        options.compact ? "ai-post-card-compact" : ""
    ].filter(Boolean).join(" ");

    const cards = post.cards || [];
    const maxCards = post.section_key === "highlights" ? 4 : (post.section_key === "statistics" ? 6 : (options.featured ? 6 : 4));
    const completedCountText = Number.isInteger(post.source_completed_match_count)
        ? `${post.source_completed_match_count} مباراة مكتملة`
        : "محتوى ذكي";

    return `
        <article class="${classes}">
            <div class="ai-post-head">
                <span class="ai-post-icon" aria-hidden="true">${escapeHtml(post.icon || "✨")}</span>
                <div>
                    <p class="ai-post-meta">${completedCountText}</p>
                    <h4>${escapeHtml(post.title_ar || "منشور ذكي")}</h4>
                </div>
            </div>

            ${post.subtitle_ar ? `<p class="ai-post-subtitle">${escapeHtml(post.subtitle_ar)}</p>` : ""}
            ${post.body_ar ? `<p class="ai-post-body">${escapeHtml(post.body_ar)}</p>` : ""}

            ${cards.length > 0 ? `
                <div class="ai-post-mini-grid">
                    ${cards.slice(0, maxCards).map((card) => renderAiMiniCard(card)).join("")}
                </div>
            ` : ""}
        </article>
    `;
}

function getAiCardValue(card, keys, fallback = "") {
    for (const key of keys) {
        if (card && card[key] !== undefined && card[key] !== null && String(card[key]).trim() !== "") {
            return card[key];
        }
    }

    return fallback;
}

function renderAiMiniCard(card) {
    const icon = getAiCardValue(card, ["icon", "icon_ar"], "•");
    const label = getAiCardValue(card, ["label_ar", "label", "title_ar", "title"], "لقطة");
    const value = getAiCardValue(card, ["value_ar", "value", "text_ar", "text"], "");
    const note = getAiCardValue(card, ["note_ar", "note", "body_ar", "body"], "");
    const type = String(card?.type || "moment").replace(/[^a-zA-Z0-9_-]/g, "");

    return `
        <div class="ai-mini-card ai-mini-card-${escapeHtml(type)}">
            <span>${escapeHtml(icon)}</span>
            <strong>${escapeHtml(label)}</strong>
            ${value ? `<small>${escapeHtml(value)}</small>` : ""}
            ${note ? `<small>${escapeHtml(note)}</small>` : ""}
        </div>
    `;
}

function renderAwardPost(post) {
    const cards = post.cards || [];

    if (cards.length > 0) {
        return cards.map((card) => renderAwardBadgeCard(card, post)).join("");
    }

    return renderAwardCard(post);
}

function renderAwardBadgeCard(card, post) {
    const icon = getAiCardValue(card, ["icon", "icon_ar"], post.icon || "🏅");
    const label = getAiCardValue(card, ["label_ar", "label", "title_ar", "title"], "شارة");
    const value = getAiCardValue(card, ["value_ar", "value", "text_ar", "text"], "");
    const note = getAiCardValue(card, ["note_ar", "note", "body_ar", "body"], "");
    const completedCountText = Number.isInteger(post.source_completed_match_count)
        ? `${post.source_completed_match_count} مباراة مكتملة`
        : "شارة ذكية";

    return `
        <article class="award-card award-card-badge">
            <div class="award-icon" aria-hidden="true">${escapeHtml(icon)}</div>
            <div>
                <p class="ai-post-meta">${completedCountText}</p>
                <h4>${escapeHtml(label)}</h4>
                ${value ? `<strong class="award-card-winner">${escapeHtml(value)}</strong>` : ""}
                ${note ? `<p>${escapeHtml(note)}</p>` : ""}
            </div>
        </article>
    `;
}

function renderAwardCard(post) {
    return `
        <article class="award-card">
            <div class="award-icon" aria-hidden="true">${escapeHtml(post.icon || "🏅")}</div>
            <div>
                <p class="ai-post-meta">شارة ذكية</p>
                <h4>${escapeHtml(post.title_ar || "جائزة")}</h4>
                <p>${escapeHtml(post.body_ar || "")}</p>
            </div>
        </article>
    `;
}

async function loadParticipantProfileStats(participantId) {
    const { data, error } = await db
        .from("matches")
        .select(`
            id,
            team1,
            team2,
            kickoff_at,
            stage,
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
        throw error;
    }

    const matches = data || [];
    const finishedMatches = matches.filter(hasActualScore);

    const stats = finishedMatches.reduce((acc, match) => {
        const prediction = match.predictions?.[0];
        const points = prediction ? calculateLivePredictionPoints(prediction, match) : 0;

        acc.totalPoints += points;
        acc.finishedPredictions += 1;

        if (points === 50) acc.exactScores += 1;
        if (points === 10) acc.correctOutcomes += 1;
        if (points > 0) acc.scoringPredictions += 1;

        const stage = getPredictionStage(match);
        const stageLabel = LEADERBOARD_STAGE_LABELS[stage] || stage;

        if (!acc.stageStats[stage]) {
            acc.stageStats[stage] = {
                stage,
                stageLabel,
                predictions: 0,
                points: 0,
                exactScores: 0,
                correctOutcomes: 0,
                scoringPredictions: 0,
                pointsPerPrediction: 0
            };
        }

        acc.stageStats[stage].predictions += 1;
        acc.stageStats[stage].points += points;
        acc.stageStats[stage].pointsPerPrediction = Number((acc.stageStats[stage].points / acc.stageStats[stage].predictions).toFixed(1));

        if (points === 50) acc.stageStats[stage].exactScores += 1;
        if (points === 10) acc.stageStats[stage].correctOutcomes += 1;
        if (points > 0) acc.stageStats[stage].scoringPredictions += 1;

        return acc;
    }, {
        totalPredictions: matches.length,
        finishedPredictions: 0,
        scoringPredictions: 0,
        exactScores: 0,
        correctOutcomes: 0,
        totalPoints: 0,
        stageStats: {}
    });

    const bestStage = Object.values(stats.stageStats)
        .sort((a, b) => (
            b.pointsPerPrediction - a.pointsPerPrediction ||
            b.points - a.points ||
            a.stageLabel.localeCompare(b.stageLabel, "ar")
        ))[0];

    stats.bestStage = bestStage
        ? `${bestStage.stageLabel} (${bestStage.pointsPerPrediction} نقطة/توقع)`
        : "بانتظار النتائج";

    return stats;
}

function renderProfileSummary(participant, visual, stats) {
    return `
        <div class="profile-hero-card" style="--participant-accent: ${visual.color}">
            <div class="profile-hero-avatar" aria-hidden="true">${visual.icon}</div>
            <div>
                <p class="eyebrow">الملف الشخصي</p>
                <h4>${escapeHtml(participant.name)}</h4>
                <p>ملخص سريع من بياناتك الحالية في المسابقة.</p>
            </div>
        </div>

        <div class="profile-stat-grid">
            <div class="profile-stat-card"><strong>${stats.totalPoints}</strong><span>نقطة</span></div>
            <div class="profile-stat-card"><strong>${stats.totalPredictions}</strong><span>توقع</span></div>
            <div class="profile-stat-card"><strong>${stats.exactScores}</strong><span>بالملّي</span></div>
            <div class="profile-stat-card"><strong>${stats.scoringPredictions}</strong><span>توقع صحيح</span></div>
            <div class="profile-stat-card profile-stat-card-wide"><strong>${escapeHtml(stats.bestStage)}</strong><span>أفضل مرحلة</span></div>
        </div>
    `;
}

function renderProfileClosingNote(participant, stats) {
    const name = participant?.name || "المشارك";
    const bestStage = stats.bestStage || "بانتظار النتائج";
    const exactText = stats.exactScores > 0
        ? `${stats.exactScores} بالملّي`
        : "لسه البالملّي ينتظر لحظته";

    return `
        <div class="profile-closing-note">
            <strong>لمحة سريعة</strong>
            <p>${escapeHtml(name)} ${participantPhrase(name, "جمع", "جمعت")} ${stats.totalPoints} نقطة حتى الآن، وأفضل مرحلة ${participantPhrase(name, "له", "لها")}: ${escapeHtml(bestStage)}. ${escapeHtml(exactText)}.</p>
        </div>
    `;
}

function renderProfileBadges(stats) {
    const badges = [];

    if (stats.exactScores > 0) {
        badges.push({ icon: "🎯", title: "عينك على النتيجة", text: `${stats.exactScores} توقع بالملّي حتى الآن.` });
    }

    if (stats.scoringPredictions >= 3) {
        badges.push({ icon: "🔥", title: "داخل المنافسة", text: `${stats.scoringPredictions} توقعات جابت نقاط.` });
    }

    if (stats.totalPredictions > 0 && stats.finishedPredictions === 0) {
        badges.push({ icon: "⏳", title: "بانتظار الحسم", text: "توقعاتك موجودة، والنتائج القادمة تحدد القصة." });
    }

    if (badges.length === 0) {
        return `<div class="placeholder-card">الشارات ستظهر هنا مع تقدم نتائجك في البطولة.</div>`;
    }

    return badges.map((badge) => `
        <div class="badge-card">
            <span aria-hidden="true">${badge.icon}</span>
            <strong>${escapeHtml(badge.title)}</strong>
            <small>${escapeHtml(badge.text)}</small>
        </div>
    `).join("");
}

function setupFinalRecapClickGuards() {
    const recapContainerIds = [
        "seasonHighlights",
        "statisticsCards",
        "statisticsBadges",
        "seasonRecap",
        "highlightsTab",
        "statisticsTab",
        "seasonRecapTab"
    ];

    recapContainerIds.forEach((containerId) => {
        const container = document.getElementById(containerId);

        if (!container) return;

        container.addEventListener("click", (event) => {
            const interactiveElement = event.target.closest(
                "a, button, input, select, textarea, label, summary, [role='button']"
            );

            if (interactiveElement) return;

            event.preventDefault();
            event.stopPropagation();
        });
    });
}


function setupPassiveFinalCardClickGuard() {
    const passiveSelectors = [
        "#highlightsTab .season-highlight-card",
        "#statisticsTab .stat-story-card",
        "#statisticsTab .recap-award-card",
        "#seasonRecapTab .season-thanks-card",
        "#seasonRecapTab .season-thanks-mini-card",
        "#profileTab .profile-hero-card",
        "#profileTab .profile-stat-card",
        "#profileTab .badge-card",
        "#profileTab .ai-post-card"
    ].join(", ");

    document.addEventListener("click", (event) => {
        const passiveCard = event.target.closest(passiveSelectors);

        if (!passiveCard) return;

        const interactiveElement = event.target.closest(
            "a, button, input, select, textarea, label, summary, [role='button']"
        );

        if (interactiveElement) return;

        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

function getDashboardPanelForScroll(tabName) {
    const panels = {
        available: document.getElementById("availableTab"),
        mine: document.getElementById("mineTab"),
        leaderboard: document.getElementById("leaderboardTab"),
        admin: document.getElementById("adminTab"),
        adminPredictions: document.getElementById("adminPredictionsTab"),
        profile: document.getElementById(MENU_PAGE_IDS.profile),
        highlights: document.getElementById(MENU_PAGE_IDS.highlights),
        statistics: document.getElementById(MENU_PAGE_IDS.statistics),
        seasonRecap: document.getElementById(MENU_PAGE_IDS.seasonRecap),
        about: document.getElementById(MENU_PAGE_IDS.about)
    };

    return panels[tabName] || dashboard;
}

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
        profile: document.getElementById(MENU_PAGE_IDS.profile),
        highlights: document.getElementById(MENU_PAGE_IDS.highlights),
        statistics: document.getElementById(MENU_PAGE_IDS.statistics),
        seasonRecap: document.getElementById(MENU_PAGE_IDS.seasonRecap),
        about: document.getElementById(MENU_PAGE_IDS.about)
    };

    if (!panels[tabName]) return;

    tabs.forEach((tab) => {
        tab.classList.remove("active");

        if (tab.dataset.tab === tabName) {
            tab.classList.add("active");
        }
    });

    Object.values(panels).filter(Boolean).forEach((panel) => {
        panel.classList.add("hidden");
    });

    panels[tabName].classList.remove("hidden");
    currentTabName = tabName;
    updateSiteMenuActiveState(tabName);

    runMenuPageRenderer(tabName);
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
    const openTime = new Date(kickoff.getTime() - PREDICTION_OPEN_HOURS * 60 * 60 * 1000);

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
        sortOrder: Number(participant.sort_order || 9999),
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
    const openTime = new Date(kickoff.getTime() - PREDICTION_OPEN_HOURS * 60 * 60 * 1000);

    return now >= openTime && now < kickoff;
}




async function renderSeasonHighlightsPage() {
    const container = document.getElementById("seasonHighlights");

    if (!container) return;

    container.innerHTML = `<div class="placeholder-card">جاري تجهيز أضواء الختام...</div>`;

    try {
        const recap = await loadFinalRecapModel();

        if (!recap || recap.completedMatches.length === 0) {
            container.innerHTML = `<div class="placeholder-card">ستظهر أضواء الختام بعد اكتمال بيانات البطولة.</div>`;
            return;
        }

        const posts = await loadAiPosts(FINAL_AI_HIGHLIGHTS_SECTION, {
            limit: FINAL_RECAP_MAX_HIGHLIGHTS,
            useCache: false
        });

        if (!isFinalRecapAvailable(recap) && (!SHOW_PUBLISHED_HIGHLIGHTS_BEFORE_FINAL || !posts.length)) {
            container.innerHTML = renderFinalRecapLockedMessage(recap, "الأضواء");
            return;
        }

        if (!posts.length) {
            container.innerHTML = renderFinalHighlightsNotGeneratedMessage(recap);
            return;
        }

        container.innerHTML = renderFinalAiHighlights(posts, recap);
    } catch (error) {
        console.error("Season highlights load failed:", error);
        container.innerHTML = `<div class="placeholder-card">تعذر تحميل أضواء الختام حالياً.</div>`;
    }
}

function renderFinalHighlightsNotGeneratedMessage(recap) {
    const completed = recap?.seasonStats?.completedMatches || 0;
    const expected = recap?.seasonStats?.expectedMatches || EXPECTED_WORLD_CUP_MATCH_COUNT;

    return `
        <div class="placeholder-card final-recap-locked-card">
            <strong>✨ الأضواء تحت التجهيز</strong>
            <span>البيانات الحالية فيها ${completed} من ${expected} مباراة. سيتم نشر أضواء الختام بعد مراجعة اللقطات النهائية واعتمادها.</span>
        </div>
    `;
}

function renderFinalAiHighlights(posts, recap) {
    const visiblePosts = posts.slice(0, FINAL_RECAP_MAX_HIGHLIGHTS);

    return `
        <section class="season-highlight-hero season-highlight-hero-ai">
            <p class="eyebrow">أضواء الختام</p>
            <h4>قصة البطولة في لقطات</h4>
            <p>${recap?.seasonStats?.isTournamentComplete ? "منشورات قصيرة بعد قفل البيانات النهائية." : "أضواء متجددة حتى الآن، وتتحدث تلقائياً بعد النتائج القادمة."} الأرقام والوقائع محسوبة من قاعدة البيانات، والنص فقط تمت صياغته بشكل ممتع.</p>
        </section>

        <div class="season-highlight-card-grid season-highlight-card-grid-ai">
            ${visiblePosts.map(renderFinalAiHighlightPost).join("")}
        </div>
    `;
}

function renderFinalAiHighlightPost(post) {
    const category = String(post.cards?.[0]?.category || post.cards?.[0]?.type || "story").replace(/[^a-zA-Z0-9_-]/g, "");
    const stageLabel = post.subtitle_ar || post.cards?.[0]?.stage_ar || post.cards?.[0]?.stage || "لقطة ختامية";

    return `
        <article class="season-highlight-card season-highlight-card-ai season-highlight-card-${category}">
            <span class="season-highlight-icon" aria-hidden="true">${escapeHtml(post.icon || "✨")}</span>
            <div>
                <small class="season-highlight-meta">${escapeHtml(stageLabel)}</small>
                <h4>${escapeHtml(post.title_ar || "لقطة من البطولة")}</h4>
                <p>${escapeHtml(post.body_ar || "")}</p>
            </div>
        </article>
    `;
}

async function renderStatisticsAndBadgesPage() {
    const statsContainer = document.getElementById("statisticsCards");
    const badgesContainer = document.getElementById("statisticsBadges");

    if (!statsContainer || !badgesContainer) return;

    statsContainer.innerHTML = `<div class="placeholder-card">جاري تجهيز الإحصائيات...</div>`;
    badgesContainer.innerHTML = `<div class="placeholder-card">جاري تجهيز الشارات...</div>`;

    try {
        const recap = await loadFinalRecapModel();

        if (!recap || recap.completedMatches.length === 0) {
            statsContainer.innerHTML = `<div class="placeholder-card">ستظهر الإحصائيات بعد اكتمال بيانات البطولة.</div>`;
            badgesContainer.innerHTML = `<div class="placeholder-card">ستظهر الشارات بعد توفر بيانات كافية.</div>`;
            return;
        }

        if (!isFinalRecapAvailable(recap) && !SHOW_LIVE_FINAL_STATS) {
            statsContainer.innerHTML = renderFinalRecapLockedMessage(recap, "الإحصائيات والشارات");
            badgesContainer.innerHTML = "";
            return;
        }

        statsContainer.innerHTML = renderStatisticsSnapshot(recap.seasonStats);
        badgesContainer.innerHTML = renderBadgeCards(recap.awards, recap.finalRows, recap.participants);
    } catch (error) {
        console.error("Statistics and badges load failed:", error);
        statsContainer.innerHTML = `<div class="placeholder-card">تعذر تحميل الإحصائيات حالياً.</div>`;
        badgesContainer.innerHTML = `<div class="placeholder-card">تعذر تحميل الشارات حالياً.</div>`;
    }
}

function renderSeasonHighlights(recap) {
    const { seasonStats } = recap;
    const cards = buildFinalHighlightCards(recap).slice(0, FINAL_RECAP_MAX_HIGHLIGHTS);

    if (!cards.length) {
        return `<div class="placeholder-card">ما فيه لقطات كافية للعرض حتى الآن.</div>`;
    }

    return `
        <section class="season-highlight-hero">
            <p class="eyebrow">أضواء الختام</p>
            <h4>كل واحد له لقطة</h4>
            <p>${escapeHtml(buildHighlightsIntro(seasonStats))}</p>
        </section>

        <div class="season-highlight-card-grid season-highlight-card-grid-compact">
            ${cards.map(renderFinalHighlightCard).join("")}
        </div>
    `;
}

function renderFinalHighlightCard(card) {
    const category = String(card.category || "moment").replace(/[^a-zA-Z0-9_-]/g, "");

    return `
        <article class="season-highlight-card season-highlight-card-compact season-highlight-card-${category}">
            <span class="season-highlight-icon" aria-hidden="true">${escapeHtml(card.icon)}</span>
            <div>
                <h4>${escapeHtml(card.title)}</h4>
                <p>${escapeHtml(card.description)}</p>
            </div>
        </article>
    `;
}

function buildFinalHighlightCards(recap) {
    const { seasonStats, awards, finalRows, matchFacts } = recap;
    const cards = [];
    const add = (icon, title, description, category = "moment") => {
        if (!title || !description) return;
        cards.push({ icon, title, description, category });
    };

    const topThree = (finalRows || []).slice(0, 3).map((row) => row.name).join("، ");
    if (topThree) {
        add("🥇", "الصورة الأخيرة", `منصة الختام: ${topThree}.`, "season");
    }

    if (seasonStats.totalPredictions > 0) {
        add("🧾", "موسم كامل في أرقام", `${seasonStats.completedMatches} مباراة، ${seasonStats.totalPredictions} توقع، و${seasonStats.totalExact} بالملّي.`, "season");
    }

    if (seasonStats.generousMatch) {
        add("🎁", "مباراة فتحت الرزق", `${seasonStats.generousMatch.title} (${seasonStats.generousMatch.score}) وزعت ${seasonStats.generousMatch.awardedPoints} نقطة.`, "season");
    }

    if (seasonStats.cruelMatch) {
        add("😅", "مباراة قالت لا", `${seasonStats.cruelMatch.title} (${seasonStats.cruelMatch.score}) كانت أثقل مطب على التوقعات.`, "season");
    }

    const participantCards = buildParticipantHighlightCards(finalRows, awards, matchFacts);
    cards.push(...participantCards);

    const byTitle = (text) => awards.find((award) => award.title.includes(text));
    const extraAwards = [
        byTitle("الذئب"),
        byTitle("الموجة"),
        byTitle("صعود"),
        byTitle("فورة"),
        byTitle("الشباك")
    ].filter(Boolean);

    extraAwards.forEach((award) => {
        if (cards.some((card) => card.description.includes(award.winner))) return;
        add(award.icon, award.title, `${award.winner}: ${award.value}.`, "award");
    });

    if (seasonStats.favoriteScore?.score) {
        add("⚽", "النتيجة اللي القروب يحبها", `${seasonStats.favoriteScore.score} ظهرت ${seasonStats.favoriteScore.count} مرة في التوقعات.`, "season");
    }

    if (seasonStats.bestStage?.label) {
        add("📊", "أكرم مرحلة", `${seasonStats.bestStage.label}: ${seasonStats.bestStage.averagePoints} نقطة لكل توقع ممكن.`, "season");
    }

    return cards.slice(0, FINAL_RECAP_MAX_HIGHLIGHTS);
}

function buildParticipantHighlightCards(finalRows = [], awards = [], matchFacts = []) {
    const awardByWinner = new Map();

    awards.forEach((award) => {
        if (!award?.winner) return;
        if (!awardByWinner.has(award.winner)) {
            awardByWinner.set(award.winner, []);
        }
        awardByWinner.get(award.winner).push(award);
    });

    return [...finalRows]
        .sort((a, b) => a.finalRank - b.finalRank || a.name.localeCompare(b.name, "ar"))
        .map((row) => buildParticipantHighlightCard(row, awardByWinner.get(row.name) || [], matchFacts));
}

function buildParticipantHighlightCard(row, awards = [], matchFacts = []) {
    const visual = getParticipantVisual(row.name);
    const bestAward = awards[0];

    if (row.finalRank === 1) {
        return {
            icon: visual.icon || "🏆",
            title: `${row.name} ${participantPhrase(row.name, "ختمها", "ختمتها")} في القمة`,
            description: `${row.points} نقطة، والمركز الأول في الصورة الأخيرة.`,
            category: "participant"
        };
    }

    if (row.finalRank <= 3) {
        return {
            icon: visual.icon || "🥇",
            title: `${row.name} على المنصة`,
            description: `المركز ${row.finalRank} بـ${row.points} نقطة. نهاية تستاهل التصفيق.`,
            category: "participant"
        };
    }

    if (bestAward) {
        return {
            icon: bestAward.icon || visual.icon || "✨",
            title: `${row.name}: ${bestAward.title}`,
            description: `${bestAward.value}. ${bestAward.note}`,
            category: "participant"
        };
    }

    if (row.exactScores > 0) {
        return {
            icon: visual.icon || "🎯",
            title: `${row.name} ${participantPhrase(row.name, "له", "لها")} توقيع بالملّي`,
            description: `${row.exactScores} نتيجة كاملة. لقطة قصيرة تستاهل التذكير.`,
            category: "participant"
        };
    }

    if (row.bestCorrectStreak > 1) {
        return {
            icon: visual.icon || "🔥",
            title: `${row.name} ${participantPhrase(row.name, "مسك", "مسكت")} خط`,
            description: `${row.bestCorrectStreak} توقعات صحيحة ورا بعض. لحظة ثبات حلوة.`,
            category: "participant"
        };
    }

    if (row.correctOutcomes > 0) {
        return {
            icon: visual.icon || "✅",
            title: `${row.name} ${participantPhrase(row.name, "يعرف", "تعرف")} طريق العشرة`,
            description: `${row.correctOutcomes} توقعات جابت نقاط. أحياناً العشرة تكفي تصنع حضور.`,
            category: "participant"
        };
    }

    if (row.predictions > 0) {
        return {
            icon: visual.icon || "⚽",
            title: `${row.name} ${participantPhrase(row.name, "حضر", "حضرت")} للنهاية`,
            description: `${row.predictions} توقع. المشاركة نفسها كانت جزء من جو المسابقة.`,
            category: "participant"
        };
    }

    return {
        icon: visual.icon || "🙂",
        title: `${row.name} ${participantPhrase(row.name, "كان", "كانت")} معنا في القائمة`,
        description: `ما ظهرت ${participantPhrase(row.name, "له", "لها")} أرقام كافية، لكن الاسم موجود في ذكرى المسابقة.`,
        category: "participant"
    };
}

function buildHighlightsIntro(seasonStats) {
    if (!seasonStats.champion) {
        return "هنا بنجمع أهم لقطات المسابقة بعد اكتمال النتائج.";
    }

    return "الأضواء هنا مو عن البطل فقط؛ هذه صفحة خفيفة تجمع لقطة لكل مشارك مع كم لحظة بارزة من الموسم.";
}

function isFinalRecapPreviewMode() {
    try {
        return new URLSearchParams(window.location.search).get(FINAL_RECAP_PREVIEW_PARAM) === "1";
    } catch (error) {
        return false;
    }
}

function isFinalRecapAvailable(recap) {
    return Boolean(recap?.seasonStats?.isTournamentComplete || isFinalRecapPreviewMode());
}

function renderFinalRecapLockedMessage(recap, sectionTitle) {
    const completed = recap?.seasonStats?.completedMatches || 0;
    const total = recap?.seasonStats?.expectedMatches || EXPECTED_WORLD_CUP_MATCH_COUNT;
    const remaining = Math.max(0, total - completed);

    return `
        <div class="placeholder-card final-recap-locked-card">
            <strong>🔒 ${escapeHtml(sectionTitle)} محفوظة للنهاية</strong>
            <span>اكتملت ${completed} من ${total} مباراة${remaining ? `، والمتبقي ${remaining}.` : "."}</span>
            <small>سيتم فتح هذا القسم بعد قفل نتائج البطولة وتجهيز المحتوى النهائي.</small>
        </div>
    `;
}

function renderStatisticsSnapshot(seasonStats) {
    const stats = [
        { icon: "🧾", label: "إجمالي التوقعات", value: seasonStats.totalPredictions, note: "كل اختيارات المشاركين خلال البطولة." },
        { icon: "✅", label: "توقعات جابت نقاط", value: seasonStats.totalCorrect, note: "تشمل 10 و50 نقطة." },
        { icon: "🎯", label: "بالملّي", value: seasonStats.totalExact, note: "أغلى لحظة في اللعبة." },
        { icon: "📊", label: "نسبة الدقة", value: `${seasonStats.accuracyPercent}%`, note: "كم توقع قدر يجيب نقاط." },
        { icon: "⚽", label: "النتيجة المحبوبة", value: seasonStats.favoriteScore?.score || "-", note: "أكثر نتيجة تكررت في التوقعات." },
        { icon: "🎁", label: "أكرم مرحلة", value: seasonStats.bestStage?.label || "-", note: "محسوبة بالتناسب، مو بعدد المباريات فقط." }
    ];

    return stats.map((stat) => `
        <article class="stat-story-card">
            <span class="stat-story-icon" aria-hidden="true">${escapeHtml(stat.icon)}</span>
            <strong>${escapeHtml(stat.value)}</strong>
            <h4>${escapeHtml(stat.label)}</h4>
            <p>${escapeHtml(stat.note)}</p>
        </article>
    `).join("");
}

function renderBadgeCards(awards = [], finalRows = [], participants = []) {
    const cards = buildParticipantBadgeCards(awards, finalRows, participants);

    if (!cards.length) {
        return `<div class="placeholder-card">لا توجد شارات كافية حتى الآن.</div>`;
    }

    return cards.map((card) => `
        <article class="recap-award-card badge-story-card participant-badge-card">
            <div class="recap-award-icon participant-badge-icon" aria-hidden="true">${escapeHtml(card.icon)}</div>
            <div class="participant-badge-content">
                <div class="participant-badge-head">
                    <strong class="participant-badge-person">${escapeHtml(card.name)}</strong>
                    <span class="participant-badge-rank">#${escapeHtml(card.rank)}</span>
                </div>
                <h4>${escapeHtml(card.title)}</h4>
                <p>${escapeHtml(card.value)}</p>
                <small>${escapeHtml(card.note)}</small>
                ${card.extra ? `<em class="participant-badge-extra">${escapeHtml(card.extra)}</em>` : ""}
            </div>
        </article>
    `).join("");
}

function buildParticipantBadgeCards(awards = [], finalRows = [], participants = []) {
    const rowsById = new Map((finalRows || []).map((row) => [String(row.id), row]));
    const rowsByName = new Map((finalRows || []).map((row) => [row.name, row]));
    const awardsByWinner = new Map();

    (awards || []).forEach((award) => {
        if (!award?.winner) return;
        if (!awardsByWinner.has(award.winner)) awardsByWinner.set(award.winner, []);
        awardsByWinner.get(award.winner).push(award);
    });

    const orderedRows = (participants || []).length
        ? participants
            .map((participant, index) => {
                const row = rowsById.get(String(participant.id)) || rowsByName.get(participant.name);
                return row ? { ...row, participantOrder: Number(participant.sort_order || index + 1) } : null;
            })
            .filter(Boolean)
        : [...(finalRows || [])].map((row, index) => ({ ...row, participantOrder: Number(row.sortOrder || index + 1) }));

    return orderedRows
        .sort((a, b) => a.participantOrder - b.participantOrder || a.name.localeCompare(b.name, "ar"))
        .map((row) => {
            const participantAwards = awardsByWinner.get(row.name) || [];
            const primaryAward = participantAwards[0];
            const fallback = buildParticipantDefaultBadge(row);
            const badge = primaryAward ? {
                icon: primaryAward.icon || fallback.icon,
                title: primaryAward.title,
                value: primaryAward.value,
                note: primaryAward.note,
                extra: participantAwards.length > 1 ? `وله أيضاً ${participantAwards.length - 1} شارة أخرى` : ""
            } : fallback;

            return {
                name: row.name,
                rank: row.finalRank || "-",
                ...badge
            };
        });
}

function buildParticipantDefaultBadge(row) {
    if (!row) {
        return { icon: "🙂", title: "حاضر معنا", value: "مشارك في المسابقة", note: "شارة مشاركة لكل اسم في القائمة." };
    }

    if (row.finalRank === 1) {
        return { icon: "🏆", title: "بطل المسابقة", value: `${row.points} نقطة`, note: "ختمها في المركز الأول." };
    }

    if (row.finalRank && row.finalRank <= 3) {
        return { icon: "🥇", title: "على المنصة", value: `المركز ${row.finalRank} بـ${row.points} نقطة`, note: "نهاية قوية بين الثلاثة الأوائل." };
    }

    if (row.exactScores > 0) {
        return { icon: "🎯", title: "عينك على النتيجة", value: `${row.exactScores} بالملّي`, note: "ضربات كاملة صنعت الحضور." };
    }

    if (row.uniqueCorrect > 0) {
        return { icon: "🐺", title: "قراءة مختلفة", value: `${row.uniqueCorrect} توقعات ما شاركه فيها أحد`, note: "اختار طريقه بعيداً عن الزحمة." };
    }

    if (row.againstCrowdPoints > 0) {
        return { icon: "⚡", title: "ضد الموجة", value: `${row.againstCrowdPoints} نقطة ضد الأغلبية`, note: "كسب نقاطاً من قراءات غير شعبية." };
    }

    if (row.bestCorrectStreak > 1) {
        return { icon: "🔥", title: "نَفَس طويل", value: `${row.bestCorrectStreak} توقعات صحيحة متتالية`, note: "سلسلة هادئة تستاهل الذكر." };
    }

    if (row.correctPredictions > 0) {
        return { icon: "✅", title: "حاضر في النقاط", value: `${row.correctPredictions} توقعات جابت نقاط`, note: "العشرة والخمسين صنعت بصمة واضحة." };
    }

    if (row.predictions > 0) {
        return { icon: "⚽", title: "حاضر للنهاية", value: `${row.predictions} توقع`, note: "المشاركة نفسها جزء من جو المسابقة." };
    }

    return { icon: "🙂", title: "اسم في القصة", value: "بدون أرقام كافية بعد", note: "الشارة موجودة حتى لو الأرقام ما خدمت اللحظة." };
}

function renderSeasonThankYouPage() {
    return `
        <section class="season-thanks-card">
            <div class="season-thanks-icon" aria-hidden="true">🏆</div>
            <p class="eyebrow">ختام المسابقة</p>
            <h2>شكراً لكل واحد خلّى البطولة أحلى</h2>
            <p>
                هذه المسابقة ما كانت بس نقاط وترتيب. كانت توقعات، ضحك، ترقب، ورسائل بعد كل مباراة.
                شكراً لكل المشاركين على الحماس الجميل اللي خلّى كأس العالم أمتع.
            </p>
            <p>
                وبإذن الله، كل المشاركين لهم تقدير وجوائز لأنكم أنتم اللي خليتوا التجربة ممتعة وتستاهل الذكرى.
            </p>
        </section>

        <div class="season-thanks-mini-grid">
            <div class="season-thanks-mini-card"><strong>❤️</strong><span>شكراً على الحماس</span></div>
            <div class="season-thanks-mini-card"><strong>🎁</strong><span>جوائز لكل المشاركين</span></div>
            <div class="season-thanks-mini-card"><strong>⚽</strong><span>ذكرى حلوة من كأس العالم</span></div>
        </div>
    `;
}

// ===== V39 Final Recap Engine: calculated facts first; optional AI wording only after final data is locked =====
async function renderSeasonRecapPage() {
    if (!seasonRecap) return;

    seasonRecap.innerHTML = renderSeasonThankYouPage();
}

async function loadFinalRecapModel() {
    const [{ data: participants, error: participantsError }, { data: matches, error: matchesError }] = await Promise.all([
        db.from("participants").select("id, name, active, sort_order").eq("active", true).order("sort_order", { ascending: true }),
        db.from("matches")
            .select("id, team1, team2, kickoff_at, status, stage, score_duration, winner_side, actual_team1_goals, actual_team2_goals")
            .order("kickoff_at", { ascending: true })
    ]);

    if (participantsError) throw participantsError;
    if (matchesError) throw matchesError;

    const activeParticipants = participants || [];
    const activeParticipantIds = new Set(activeParticipants.map((participant) => String(participant.id)));
    const allMatches = (matches || []).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    const completedMatches = allMatches.filter(hasActualScore).sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    const rawPredictions = await loadFinalRecapPredictions(completedMatches.map((match) => match.id));
    const predictions = rawPredictions.filter((prediction) => activeParticipantIds.has(String(prediction.participant_id)));
    const predictionsByMatch = groupFinalRecapBy(predictions, "match_id");
    const models = buildFinalRecapParticipantModels(activeParticipants, completedMatches, predictionsByMatch);
    const snapshots = buildFinalRecapSnapshots(activeParticipants, completedMatches, predictionsByMatch);
    applyFinalRecapRankHistory(models, snapshots);

    const finalRows = rankFinalRecapModels(models);
    finalRows.forEach((row, index) => row.finalRank = index + 1);

    const matchFacts = buildFinalRecapMatchFacts(completedMatches, predictionsByMatch, activeParticipants);
    const stageFacts = buildFinalRecapStageFacts(completedMatches, predictionsByMatch, activeParticipants);
    const seasonStats = buildFinalRecapSeasonStats(activeParticipants, completedMatches, predictions, finalRows, matchFacts, stageFacts, allMatches);
    const awards = buildFinalRecapAwards(finalRows, seasonStats, matchFacts, snapshots);
    const timeline = buildFinalRecapTimeline(finalRows, seasonStats, matchFacts, snapshots);

    return {
        participants: activeParticipants,
        allMatches,
        completedMatches,
        predictions,
        finalRows,
        matchFacts,
        stageFacts,
        seasonStats,
        awards,
        timeline
    };
}

async function loadFinalRecapPredictions(matchIds) {
    if (!matchIds.length) return [];

    const chunkSize = 80;
    const allPredictions = [];

    for (let i = 0; i < matchIds.length; i += chunkSize) {
        const chunk = matchIds.slice(i, i + chunkSize);
        const { data, error } = await db
            .from("predictions")
            .select("participant_id, match_id, predicted_team1_goals, predicted_team2_goals, points, updated_at")
            .in("match_id", chunk);

        if (error) throw error;
        allPredictions.push(...(data || []));
    }

    return allPredictions;
}

function buildFinalRecapParticipantModels(participants, completedMatches, predictionsByMatch) {
    const models = new Map(participants.map((participant) => [participant.id, {
        id: participant.id,
        name: participant.name,
        sortOrder: Number(participant.sort_order || 9999),
        points: 0,
        predictions: 0,
        missing: 0,
        exactScores: 0,
        correctOutcomes: 0,
        correctPredictions: 0,
        zeroPredictions: 0,
        individualTeamScoresExact: 0,
        cleanSheetsExact: 0,
        drawHits: 0,
        drawPredictions: 0,
        totalPredictedGoals: 0,
        oneGoalAway: 0,
        closeButWrong: 0,
        uniqueCorrect: 0,
        uniquePredictions: 0,
        crowdMatches: 0,
        crowdPredictionMatches: 0,
        againstCrowdPoints: 0,
        favoriteTeamCounts: {},
        trustedWinCounts: {},
        teamBetrayals: {},
        matchPoints: [],
        ranks: [],
        rankChanges: [],
        firstRank: null,
        finalRank: null,
        appearancesInFirst: 0,
        appearancesInTop3: 0,
        appearancesInLast: 0,
        bestCorrectStreak: 0,
        worstWrongStreak: 0,
        bestFiveMatchSpan: 0,
        worstFiveMatchSpan: 0,
        yoyoScore: 0
    }]));

    for (const match of completedMatches) {
        const matchPredictions = predictionsByMatch.get(match.id) || [];
        const predictionByParticipant = new Map(matchPredictions.map((prediction) => [prediction.participant_id, prediction]));
        const majorityScore = getFinalRecapMajorityScore(matchPredictions);
        const majorityOutcome = getFinalRecapMajorityOutcome(matchPredictions);
        const scoreCounts = countFinalRecapPredictionScores(matchPredictions);

        for (const participant of participants) {
            const model = models.get(participant.id);
            const prediction = predictionByParticipant.get(participant.id);

            if (!prediction) {
                model.missing += 1;
                model.matchPoints.push({ matchId: match.id, points: 0, correct: false, submitted: false });
                continue;
            }

            const predicted1 = Number(prediction.predicted_team1_goals);
            const predicted2 = Number(prediction.predicted_team2_goals);
            const points = calculatePoints(predicted1, predicted2, match.actual_team1_goals, match.actual_team2_goals);
            const correct = points > 0;
            const scoreKey = `${predicted1}-${predicted2}`;
            const predictionOutcome = getOutcome(predicted1, predicted2);
            const actualOutcome = getOutcome(match.actual_team1_goals, match.actual_team2_goals);
            const goalError = Math.abs(predicted1 - match.actual_team1_goals) + Math.abs(predicted2 - match.actual_team2_goals);

            model.points += points;
            model.predictions += 1;
            model.totalPredictedGoals += predicted1 + predicted2;
            model.matchPoints.push({ matchId: match.id, points, correct, submitted: true });

            if (points === 50) model.exactScores += 1;
            if (points === 10) model.correctOutcomes += 1;
            if (points > 0) model.correctPredictions += 1;
            if (points === 0) model.zeroPredictions += 1;
            if (predictionOutcome === "draw") model.drawPredictions += 1;
            if (predictionOutcome === "draw" && actualOutcome === "draw") model.drawHits += 1;
            if (predicted1 === match.actual_team1_goals) model.individualTeamScoresExact += 1;
            if (predicted2 === match.actual_team2_goals) model.individualTeamScoresExact += 1;
            if (match.actual_team1_goals === 0 && predicted1 === 0) model.cleanSheetsExact += 1;
            if (match.actual_team2_goals === 0 && predicted2 === 0) model.cleanSheetsExact += 1;
            if (points === 0 && goalError === 1) model.oneGoalAway += 1;
            if (points === 0 && goalError <= 2) model.closeButWrong += 1;
            if ((scoreCounts.get(scoreKey) || 0) === 1) model.uniquePredictions += 1;
            if ((scoreCounts.get(scoreKey) || 0) === 1 && points > 0) model.uniqueCorrect += 1;
            if (majorityScore && scoreKey === majorityScore.score) model.crowdPredictionMatches += 1;
            if (majorityOutcome && predictionOutcome !== majorityOutcome.outcome && points > 0) model.againstCrowdPoints += points;

            addFinalRecapTeamCount(model.favoriteTeamCounts, match.team1);
            addFinalRecapTeamCount(model.favoriteTeamCounts, match.team2);
            if (predictionOutcome === "team1") addFinalRecapTeamCount(model.trustedWinCounts, match.team1);
            if (predictionOutcome === "team2") addFinalRecapTeamCount(model.trustedWinCounts, match.team2);
            if (points === 0) {
                addFinalRecapTeamCount(model.teamBetrayals, match.team1);
                addFinalRecapTeamCount(model.teamBetrayals, match.team2);
            }
        }
    }

    return Array.from(models.values()).map((model) => {
        model.accuracyPercent = model.predictions > 0 ? Number(((model.correctPredictions / model.predictions) * 100).toFixed(1)) : 0;
        model.exactRatePercent = model.predictions > 0 ? Number(((model.exactScores / model.predictions) * 100).toFixed(1)) : 0;
        model.averagePredictedGoals = model.predictions > 0 ? Number((model.totalPredictedGoals / model.predictions).toFixed(2)) : 0;
        model.bestCorrectStreak = getFinalRecapBestStreak(model.matchPoints, (row) => row.correct);
        model.worstWrongStreak = getFinalRecapBestStreak(model.matchPoints, (row) => row.submitted && !row.correct);
        model.bestFiveMatchSpan = getFinalRecapBestSpan(model.matchPoints, 5, "max");
        model.worstFiveMatchSpan = getFinalRecapBestSpan(model.matchPoints, 5, "min");
        model.favoriteTeam = getFinalRecapTopEntry(model.favoriteTeamCounts);
        model.mostTrustedTeam = getFinalRecapTopEntry(model.trustedWinCounts);
        model.teamBetrayed = getFinalRecapTopEntry(model.teamBetrayals);
        return model;
    });
}

function buildFinalRecapSnapshots(participants, completedMatches, predictionsByMatch) {
    const snapshots = [];

    for (let index = 0; index < completedMatches.length; index += 1) {
        const matchesSoFar = completedMatches.slice(0, index + 1);
        const models = buildFinalRecapParticipantModels(participants, matchesSoFar, predictionsByMatch);
        const rows = rankFinalRecapModels(models);
        rows.forEach((row, rankIndex) => row.rank = rankIndex + 1);
        snapshots.push({
            match: completedMatches[index],
            completedCount: index + 1,
            rows: rows.map((row) => ({ id: row.id, name: row.name, points: row.points, rank: row.rank }))
        });
    }

    return snapshots;
}

function applyFinalRecapRankHistory(models, snapshots) {
    const modelById = new Map(models.map((model) => [model.id, model]));
    const previousRanks = new Map();

    for (const snapshot of snapshots) {
        for (const row of snapshot.rows) {
            const model = modelById.get(row.id);
            if (!model) continue;

            if (model.firstRank === null) model.firstRank = row.rank;
            model.ranks.push(row.rank);
            if (row.rank === 1) model.appearancesInFirst += 1;
            if (row.rank <= 3) model.appearancesInTop3 += 1;
            if (row.rank === snapshot.rows.length) model.appearancesInLast += 1;

            if (previousRanks.has(row.id)) {
                const previousRank = previousRanks.get(row.id);
                const change = previousRank - row.rank;
                if (change !== 0) {
                    model.rankChanges.push(change);
                    model.yoyoScore += Math.abs(change);
                }
            }

            previousRanks.set(row.id, row.rank);
        }
    }
}

function rankFinalRecapModels(models) {
    return [...models].sort((a, b) => (
        b.points - a.points ||
        b.correctPredictions - a.correctPredictions ||
        a.name.localeCompare(b.name, "ar")
    ));
}

function buildFinalRecapMatchFacts(completedMatches, predictionsByMatch, participants) {
    return completedMatches.map((match) => {
        const predictions = predictionsByMatch.get(match.id) || [];
        const pointsRows = predictions.map((prediction) => {
            const points = calculatePoints(
                Number(prediction.predicted_team1_goals),
                Number(prediction.predicted_team2_goals),
                match.actual_team1_goals,
                match.actual_team2_goals
            );
            return { prediction, points };
        });
        const awardedPoints = pointsRows.reduce((sum, row) => sum + row.points, 0);
        const exactCount = pointsRows.filter((row) => row.points === 50).length;
        const correctCount = pointsRows.filter((row) => row.points > 0).length;
        const zeroOrMissing = participants.length - correctCount;
        const majorityOutcome = getFinalRecapMajorityOutcome(predictions);
        const actualOutcome = getOutcome(match.actual_team1_goals, match.actual_team2_goals);

        return {
            match,
            title: `${match.team1} ضد ${match.team2}`,
            score: `${match.actual_team1_goals}-${match.actual_team2_goals}`,
            awardedPoints,
            exactCount,
            correctCount,
            zeroOrMissing,
            zeroOrMissingRate: participants.length > 0 ? Math.round((zeroOrMissing / participants.length) * 100) : 0,
            majorityOutcome,
            crowdWasWrong: Boolean(majorityOutcome && majorityOutcome.outcome !== actualOutcome),
            stageLabel: getFinalRecapStageLabel(match.stage)
        };
    });
}

function buildFinalRecapStageFacts(completedMatches, predictionsByMatch, participants) {
    const stages = new Map();

    for (const match of completedMatches) {
        const stage = match.stage || "GROUP_STAGE";
        if (!stages.has(stage)) {
            stages.set(stage, {
                stage,
                label: getFinalRecapStageLabel(stage),
                matches: 0,
                possiblePredictions: 0,
                points: 0,
                exactScores: 0,
                correctPredictions: 0
            });
        }

        const row = stages.get(stage);
        const predictions = predictionsByMatch.get(match.id) || [];
        row.matches += 1;
        row.possiblePredictions += participants.length;

        for (const prediction of predictions) {
            const points = calculatePoints(Number(prediction.predicted_team1_goals), Number(prediction.predicted_team2_goals), match.actual_team1_goals, match.actual_team2_goals);
            row.points += points;
            if (points === 50) row.exactScores += 1;
            if (points > 0) row.correctPredictions += 1;
        }
    }

    return Array.from(stages.values()).map((row) => ({
        ...row,
        averagePoints: row.possiblePredictions > 0 ? Number((row.points / row.possiblePredictions).toFixed(2)) : 0,
        accuracyPercent: row.possiblePredictions > 0 ? Number(((row.correctPredictions / row.possiblePredictions) * 100).toFixed(1)) : 0,
        exactRatePercent: row.possiblePredictions > 0 ? Number(((row.exactScores / row.possiblePredictions) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.averagePoints - a.averagePoints || b.points - a.points);
}

function buildFinalRecapSeasonStats(participants, completedMatches, predictions, finalRows, matchFacts, stageFacts, allMatches = completedMatches) {
    const totalPredictions = finalRows.reduce((sum, row) => sum + row.predictions, 0);
    const totalCorrect = finalRows.reduce((sum, row) => sum + row.correctPredictions, 0);
    const totalExact = finalRows.reduce((sum, row) => sum + row.exactScores, 0);
    const totalPoints = finalRows.reduce((sum, row) => sum + row.points, 0);
    const favoriteScore = getFinalRecapMostCommonScore(predictions);
    const generousMatch = [...matchFacts].sort((a, b) => b.awardedPoints - a.awardedPoints)[0] || null;
    const cruelMatch = [...matchFacts].sort((a, b) => b.zeroOrMissingRate - a.zeroOrMissingRate)[0] || null;
    const bestStage = stageFacts[0] || null;
    const champion = finalRows[0] || null;
    const runnerUp = finalRows[1] || null;

    return {
        participantCount: participants.length,
        completedMatches: completedMatches.length,
        expectedMatches: EXPECTED_WORLD_CUP_MATCH_COUNT,
        totalKnownMatches: allMatches.length || completedMatches.length,
        missingKnownMatches: Math.max(0, EXPECTED_WORLD_CUP_MATCH_COUNT - (allMatches.length || 0)),
        remainingKnownMatches: Math.max(0, (allMatches.length || completedMatches.length) - completedMatches.length),
        remainingExpectedMatches: Math.max(0, EXPECTED_WORLD_CUP_MATCH_COUNT - completedMatches.length),
        isTournamentComplete: isFinalRecapTournamentComplete(allMatches, completedMatches),
        totalPredictions,
        totalCorrect,
        totalExact,
        totalPoints,
        accuracyPercent: totalPredictions > 0 ? Number(((totalCorrect / totalPredictions) * 100).toFixed(1)) : 0,
        averagePointsPerMatch: completedMatches.length > 0 ? Number((totalPoints / completedMatches.length).toFixed(1)) : 0,
        medianPoints: getFinalRecapMedian(finalRows.map((row) => row.points)),
        favoriteScore,
        generousMatch,
        cruelMatch,
        bestStage,
        champion,
        runnerUp,
        winMargin: champion && runnerUp ? champion.points - runnerUp.points : 0
    };
}

function isFinalRecapTournamentComplete(allMatches = [], completedMatches = []) {
    if (!allMatches.length) return false;

    return (
        allMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT &&
        completedMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT &&
        allMatches.every((match) => hasActualScore(match))
    );
}

function buildFinalRecapAwards(finalRows, seasonStats, matchFacts, snapshots) {
    const champion = finalRows[0];
    const runnerUp = finalRows[1];
    const woodenSpoon = finalRows.length > 2 ? finalRows[finalRows.length - 1] : null;
    const minimumPredictionCount = Math.max(5, Math.floor(seasonStats.completedMatches * 0.35));
    const byExact = pickFinalRecapTop(finalRows.filter((row) => row.exactScores > 0), "exactScores");
    const byAccuracy = [...finalRows]
        .filter((row) => row.predictions >= minimumPredictionCount)
        .sort((a, b) => b.accuracyPercent - a.accuracyPercent || b.points - a.points)[0];
    const byOutcomes = pickFinalRecapTop(finalRows.filter((row) => row.correctOutcomes > 0), "correctOutcomes");
    const byTeamScores = pickFinalRecapTop(finalRows.filter((row) => row.individualTeamScoresExact > 0), "individualTeamScoresExact");
    const byCleanSheets = pickFinalRecapTop(finalRows.filter((row) => row.cleanSheetsExact > 0), "cleanSheetsExact");
    const byCorrectStreak = pickFinalRecapTop(finalRows.filter((row) => row.bestCorrectStreak > 1), "bestCorrectStreak");
    const byHotSpan = pickFinalRecapTop(finalRows.filter((row) => row.bestFiveMatchSpan > 0), "bestFiveMatchSpan");
    const byClimb = [...finalRows]
        .filter((row) => row.firstRank && row.finalRank && row.firstRank > row.finalRank)
        .sort((a, b) => (b.firstRank - b.finalRank) - (a.firstRank - a.finalRank) || b.points - a.points)[0];
    const byCollapse = [...finalRows]
        .filter((row) => row.firstRank && row.finalRank && row.finalRank > row.firstRank)
        .sort((a, b) => (b.finalRank - b.firstRank) - (a.finalRank - a.firstRank) || a.points - b.points)[0];
    const byTopTime = pickFinalRecapTop(finalRows.filter((row) => row.appearancesInFirst > 0), "appearancesInFirst");
    const byLoneWolf = pickFinalRecapTop(finalRows.filter((row) => row.uniqueCorrect > 0), "uniqueCorrect");
    const byAgainstCrowd = pickFinalRecapTop(finalRows.filter((row) => row.againstCrowdPoints > 0), "againstCrowdPoints");

    return [
        buildFinalRecapAward("🏆", "بطل المسابقة", champion, champion ? `${champion.points} نقطة` : "بانتظار الحسم", `الفارق: ${seasonStats.winMargin} نقطة.`),
        buildFinalRecapAward("🥈", "الوصيف", runnerUp, runnerUp ? `${runnerUp.points} نقطة` : "بانتظار الحسم", "أقرب مطارد للبطل."),
        buildFinalRecapAward("🥄", "صامد للنهاية", woodenSpoon, woodenSpoon ? `${woodenSpoon.points} نقطة` : "بانتظار الحسم", "شارة خفيفة بروح رياضية."),
        buildFinalRecapAward("👑", "كرسي الصدارة", byTopTime, byTopTime ? `${byTopTime.appearancesInFirst} مرة` : "بانتظار البيانات", "الأكثر ظهوراً في المركز الأول."),
        buildFinalRecapAward("🧙", "العراف", byAccuracy, byAccuracy ? `${byAccuracy.accuracyPercent}% دقة` : "بانتظار البيانات", "أعلى نسبة توقعات جابت نقاط."),
        buildFinalRecapAward("🎯", "ملك بالملّي", byExact, byExact ? `${byExact.exactScores} بالملّي` : "بانتظار البيانات", "أكثر نتائج كاملة."),
        buildFinalRecapAward("🗣️", "قارئ الفائز", byOutcomes, byOutcomes ? `${byOutcomes.correctOutcomes} توقع صحيح` : "بانتظار البيانات", "عرف اتجاه المباراة كثير."),
        buildFinalRecapAward("🥅", "عرّاف الأهداف", byTeamScores, byTeamScores ? `${byTeamScores.individualTeamScoresExact} هدف مضبوط` : "بانتظار البيانات", "ضبط أهداف الفرق أكثر من غيره."),
        buildFinalRecapAward("🧤", "حارس الشباك", byCleanSheets, byCleanSheets ? `${byCleanSheets.cleanSheetsExact} شباك نظيفة` : "بانتظار البيانات", "توقع الصفر في مكانه."),
        buildFinalRecapAward("🔥", "أطول سلسلة", byCorrectStreak, byCorrectStreak ? `${byCorrectStreak.bestCorrectStreak} توقعات` : "بانتظار البيانات", "توقعات صحيحة ورا بعض."),
        buildFinalRecapAward("🚀", "فورة الموسم", byHotSpan, byHotSpan ? `${byHotSpan.bestFiveMatchSpan} نقطة` : "بانتظار البيانات", "أفضل 5 مباريات متتالية."),
        buildFinalRecapAward("📈", "أقوى صعود", byClimb, byClimb ? `${byClimb.firstRank} ← ${byClimb.finalRank}` : "بانتظار البيانات", "أكبر طلعة في الترتيب."),
        buildFinalRecapAward("🎢", "قطار الملاهي", byCollapse, byCollapse ? `${byCollapse.firstRank} ← ${byCollapse.finalRank}` : "بانتظار البيانات", "أكبر نزلة بروح خفيفة."),
        buildFinalRecapAward("🐺", "الذئب الوحيد", byLoneWolf, byLoneWolf ? `${byLoneWolf.uniqueCorrect} توقعات` : "بانتظار البيانات", "صح وما أحد شاركه."),
        buildFinalRecapAward("⚡", "ضد الموجة", byAgainstCrowd, byAgainstCrowd ? `${byAgainstCrowd.againstCrowdPoints} نقطة` : "بانتظار البيانات", "كسب وهو مخالف الأغلبية.")
    ].filter((award) => award && award.winner);
}

function buildFinalRecapAward(icon, title, winner, value, note) {
    if (!winner) return null;
    return { icon, title, winner: winner.name, value, note };
}

function buildFinalRecapTimeline(finalRows, seasonStats, matchFacts, snapshots) {
    const timeline = [];
    const firstSnapshot = snapshots[0];
    const groupEndSnapshot = getFinalRecapLastSnapshotForStage(snapshots, "GROUP_STAGE");
    const biggestClimb = [...finalRows].sort((a, b) => (b.firstRank - b.finalRank) - (a.firstRank - a.finalRank))[0];
    const loneWolf = pickFinalRecapTop(finalRows, "uniqueCorrect");
    const finalSnapshot = snapshots[snapshots.length - 1];

    if (firstSnapshot?.rows?.[0]) {
        timeline.push({
            title: "البداية",
            body: `${firstSnapshot.rows[0].name} أخذ أول لقطة صدارة بعد المباراة رقم ${firstSnapshot.completedCount}.`
        });
    }

    if (groupEndSnapshot?.rows?.[0]) {
        timeline.push({
            title: "نهاية المجموعات",
            body: `${groupEndSnapshot.rows[0].name} خرج من دور المجموعات في الصدارة بـ${groupEndSnapshot.rows[0].points} نقطة.`
        });
    }

    if (seasonStats.cruelMatch) {
        timeline.push({
            title: "أقسى مطب",
            body: `${seasonStats.cruelMatch.title} (${seasonStats.cruelMatch.score}) كانت من أثقل المباريات على التوقعات.`
        });
    }

    if (biggestClimb && biggestClimb.firstRank > biggestClimb.finalRank) {
        timeline.push({
            title: "العودة من بعيد",
            body: `${biggestClimb.name} تحرك من المركز ${biggestClimb.firstRank} إلى ${biggestClimb.finalRank}.`
        });
    }

    if (loneWolf && loneWolf.uniqueCorrect > 0) {
        timeline.push({
            title: "شافها لحاله",
            body: `${loneWolf.name} عنده ${loneWolf.uniqueCorrect} توقعات صحيحة ما شاركه فيها أحد.`
        });
    }

    if (finalSnapshot?.rows?.[0]) {
        timeline.push({
            title: "النهاية",
            body: `${finalSnapshot.rows[0].name} أنهى الحكاية في المركز الأول بـ${finalSnapshot.rows[0].points} نقطة.`
        });
    }

    return timeline.slice(0, 6);
}

function renderFinalRecap(recap) {
    const { seasonStats, awards, timeline } = recap;
    const champion = seasonStats.champion;
    const runnerUp = seasonStats.runnerUp;

    return `
        <div class="season-recap-v39">
            <section class="recap-hero-card">
                <div>
                    <p class="eyebrow">Final Recap</p>
                    <h2>${champion ? "قصة المسابقة كاملة" : "ملخص الختام"}</h2>
                    <p>${escapeHtml(buildFinalRecapHeroPhrase(seasonStats))}</p>
                </div>
                <div class="recap-hero-stats">
                    <span><strong>${escapeHtml(champion?.name || "-")}</strong><small>البطل</small></span>
                    <span><strong>${seasonStats.winMargin}</strong><small>فارق اللقب</small></span>
                    <span><strong>${runnerUp ? escapeHtml(runnerUp.name) : "-"}</strong><small>الوصيف</small></span>
                </div>
            </section>

            ${renderFinalRecapFunStats(seasonStats)}
            ${renderFinalRecapAwards(awards)}
            ${renderFinalRecapTimeline(timeline)}
        </div>
    `;
}

function buildFinalRecapHeroPhrase(seasonStats) {
    if (!seasonStats.champion) return "هنا سنجمع قصة المسابقة بعد اكتمال النتائج.";

    const marginPhrase = seasonStats.winMargin <= 20
        ? "والفارق كان قريباً بما يكفي ليخلي آخر المباريات على الأعصاب."
        : `والفارق وصل إلى ${seasonStats.winMargin} نقطة.`;

    return `${seasonStats.completedMatches} مباراة، ${seasonStats.totalPredictions} توقع، و${seasonStats.totalExact} نتيجة بالملّي. البطل هو ${seasonStats.champion.name}، لكن المتعة كانت من مشاركة الجميع. ${marginPhrase}`;
}

function renderFinalRecapFunStats(seasonStats) {
    const stats = [
        { label: "التوقعات", value: seasonStats.totalPredictions },
        { label: "التوقعات الصحيحة", value: seasonStats.totalCorrect },
        { label: "بالملّي", value: seasonStats.totalExact },
        { label: "الدقة", value: `${seasonStats.accuracyPercent}%` },
        { label: "متوسط النقاط/مباراة", value: seasonStats.averagePointsPerMatch },
        { label: "النتيجة المحبوبة", value: seasonStats.favoriteScore?.score || "-" },
        { label: "أكرم مرحلة", value: seasonStats.bestStage?.label || "-" },
        { label: "Median", value: seasonStats.medianPoints }
    ];

    return `
        <section class="recap-section-card recap-fun-stats-card">
            <div class="recap-section-title"><span>📊</span><h3>أرقام لها سالفة</h3></div>
            <div class="recap-stat-grid">
                ${stats.map((stat) => `<div class="recap-stat-tile"><strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(stat.label)}</span></div>`).join("")}
            </div>
            ${seasonStats.cruelMatch ? `<p class="recap-footnote">أقسى مباراة على التوقعات: ${escapeHtml(seasonStats.cruelMatch.title)} (${escapeHtml(seasonStats.cruelMatch.score)}).</p>` : ""}
        </section>
    `;
}

function renderFinalRecapAwards(awards) {
    return `
        <section class="recap-section-card">
            <div class="recap-section-title"><span>🏆</span><h3>جوائز الموسم</h3></div>
            <div class="recap-awards-grid">
                ${awards.map((award) => `
                    <article class="recap-award-card">
                        <div class="recap-award-icon" aria-hidden="true">${escapeHtml(award.icon)}</div>
                        <div>
                            <h4>${escapeHtml(award.title)}</h4>
                            <strong>${escapeHtml(award.winner)}</strong>
                            <p>${escapeHtml(award.value)}</p>
                            <small>${escapeHtml(award.note)}</small>
                        </div>
                    </article>
                `).join("")}
            </div>
        </section>
    `;
}

function renderFinalRecapTimeline(timeline) {
    if (!timeline.length) return "";

    return `
        <section class="recap-section-card recap-timeline-card">
            <div class="recap-section-title"><span>📽️</span><h3>شريط الموسم</h3></div>
            <div class="recap-timeline-list">
                ${timeline.map((item) => `
                    <article class="recap-timeline-item">
                        <span class="recap-timeline-dot" aria-hidden="true"></span>
                        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>
                    </article>
                `).join("")}
            </div>
        </section>
    `;
}

function groupFinalRecapBy(rows, key) {
    const map = new Map();
    for (const row of rows || []) {
        const value = row[key];
        if (!map.has(value)) map.set(value, []);
        map.get(value).push(row);
    }
    return map;
}

function addFinalRecapTeamCount(object, team) {
    object[team] = (object[team] || 0) + 1;
}

function getFinalRecapTopEntry(object) {
    const [name, count] = Object.entries(object || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))[0] || [];
    return name ? { name, count } : null;
}

function getFinalRecapBestStreak(rows, predicate) {
    let best = 0;
    let current = 0;
    for (const row of rows) {
        if (predicate(row)) current += 1;
        else current = 0;
        best = Math.max(best, current);
    }
    return best;
}

function getFinalRecapBestSpan(rows, size, mode = "max") {
    if (!rows.length) return 0;
    let best = mode === "min" ? Infinity : -Infinity;
    for (let i = 0; i < rows.length; i += 1) {
        const slice = rows.slice(i, i + size);
        if (slice.length < size) continue;
        const points = slice.reduce((sum, row) => sum + row.points, 0);
        best = mode === "min" ? Math.min(best, points) : Math.max(best, points);
    }
    if (best === Infinity || best === -Infinity) return 0;
    return best;
}

function getFinalRecapMajorityScore(predictions) {
    const counts = countFinalRecapPredictionScores(predictions);
    const [score, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    return score ? { score, count } : null;
}

function countFinalRecapPredictionScores(predictions) {
    const counts = new Map();
    for (const prediction of predictions || []) {
        const key = `${prediction.predicted_team1_goals}-${prediction.predicted_team2_goals}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function getFinalRecapMajorityOutcome(predictions) {
    const counts = { team1: 0, team2: 0, draw: 0 };
    for (const prediction of predictions || []) {
        const outcome = getOutcome(Number(prediction.predicted_team1_goals), Number(prediction.predicted_team2_goals));
        counts[outcome] += 1;
    }
    const [outcome, count] = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    return count > 0 ? { outcome, count } : null;
}

function getFinalRecapMostCommonScore(predictions) {
    const counts = countFinalRecapPredictionScores(predictions);
    const [score, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    return score ? { score, count } : null;
}

function getFinalRecapMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
}

function pickFinalRecapTop(rows, field) {
    return [...rows].sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0) || b.points - a.points || a.name.localeCompare(b.name, "ar"))[0] || null;
}

function pickFinalRecapBottom(rows, field) {
    return [...rows].sort((a, b) => Number(a[field] || 0) - Number(b[field] || 0) || b.points - a.points || a.name.localeCompare(b.name, "ar"))[0] || null;
}

function getFinalRecapLastSnapshotForStage(snapshots, stage) {
    const matching = snapshots.filter((snapshot) => (snapshot.match.stage || "GROUP_STAGE") === stage);
    return matching[matching.length - 1] || null;
}

function getFinalRecapStageLabel(stage) {
    const labels = {
        GROUP_STAGE: "دور المجموعات",
        LAST_32: "دور الـ32",
        LAST_16: "دور الـ16",
        QUARTER_FINALS: "ربع النهائي",
        SEMI_FINALS: "نصف النهائي",
        THIRD_PLACE: "تحديد الثالث",
        FINAL: "النهائي"
    };
    return labels[stage] || stage || "مرحلة غير محددة";
}
