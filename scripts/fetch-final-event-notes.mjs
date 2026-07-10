const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const FOOTBALL_DATA_BASE_URL = (process.env.FOOTBALL_DATA_BASE_URL || "https://api.football-data.org/v4").replace(/\/$/, "");
const FOOTBALL_DATA_COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || "WC";
const FOOTBALL_DATA_SEASON = process.env.FOOTBALL_DATA_SEASON || "2026";

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || process.env.APISPORTS_KEY || process.env.API_SPORTS_KEY || "";
const API_FOOTBALL_BASE_URL = (process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io").replace(/\/$/, "");
const API_FOOTBALL_LEAGUE_ID = process.env.API_FOOTBALL_LEAGUE_ID || "1";
const API_FOOTBALL_SEASON = process.env.API_FOOTBALL_SEASON || "2026";

const FETCH_FOOTBALL_DATA_NOTES = String(process.env.FETCH_FOOTBALL_DATA_NOTES || (FOOTBALL_DATA_TOKEN ? "true" : "false")).toLowerCase() === "true";
const FETCH_FOOTBALL_EVENTS = String(process.env.FETCH_FOOTBALL_EVENTS || (API_FOOTBALL_KEY ? "true" : "false")).toLowerCase() === "true";
const FETCH_NEWS_EVENTS = String(process.env.FETCH_NEWS_EVENTS || "true").toLowerCase() === "true";
const NEWS_MAX_PER_MATCH = Math.max(0, Math.min(5, Number(process.env.NEWS_MAX_PER_MATCH || 2)));
const NEWS_DAYS_AFTER_MATCH = Math.max(1, Math.min(7, Number(process.env.NEWS_DAYS_AFTER_MATCH || 2)));
const TARGET_RECENT_COMPLETED_DAYS = Math.max(0, Number(process.env.TARGET_RECENT_COMPLETED_DAYS || 0));
const TARGET_STAGE = String(process.env.TARGET_STAGE || "").trim();
const DEFAULT_APPROVED = String(process.env.DEFAULT_APPROVED || "false").toLowerCase() === "true";
const DRY_RUN = String(process.env.DRY_RUN || "true").toLowerCase() === "true";
const DELETE_EXISTING_DRAFTS = String(process.env.DELETE_EXISTING_DRAFTS || "false").toLowerCase() === "true";
const MIN_NOTE_TITLE_LENGTH = 8;
const SCHEDULE_ACTIVE_FROM = process.env.SCHEDULE_ACTIVE_FROM || "";
const SCHEDULE_ACTIVE_UNTIL = process.env.SCHEDULE_ACTIVE_UNTIL || "";

const EVENT_NOTES_TABLE = "final_event_notes";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (FETCH_FOOTBALL_DATA_NOTES && !FOOTBALL_DATA_TOKEN) {
    throw new Error("FETCH_FOOTBALL_DATA_NOTES=true requires FOOTBALL_DATA_TOKEN.");
}
if (FETCH_FOOTBALL_EVENTS && !API_FOOTBALL_KEY) {
    throw new Error("FETCH_FOOTBALL_EVENTS=true requires API_FOOTBALL_KEY or APISPORTS_KEY.");
}

const TEAM_ALIASES = {
    "أمريكا": ["united states", "usa", "u s a"],
    "الولايات المتحدة": ["united states", "usa", "u s a"],
    "أستراليا": ["australia"],
    "اسكتلندا": ["scotland"],
    "المغرب": ["morocco"],
    "البرازيل": ["brazil"],
    "هايتي": ["haiti"],
    "تركيا": ["turkey", "turkiye", "türkiye"],
    "باراغواي": ["paraguay"],
    "هولندا": ["netherlands"],
    "السويد": ["sweden"],
    "ألمانيا": ["germany"],
    "ساحل العاج": ["ivory coast", "cote d ivoire", "côte d ivoire", "côte d’ivoire"],
    "الإكوادور": ["ecuador"],
    "كوراساو": ["curacao", "curaçao"],
    "تونس": ["tunisia"],
    "اليابان": ["japan"],
    "إسبانيا": ["spain"],
    "السعودية": ["saudi arabia"],
    "بلجيكا": ["belgium"],
    "إيران": ["iran"],
    "الأوروغواي": ["uruguay"],
    "الرأس الأخضر": ["cape verde", "cabo verde", "cape verde islands"],
    "نيوزيلندا": ["new zealand"],
    "مصر": ["egypt"],
    "الأرجنتين": ["argentina"],
    "النمسا": ["austria"],
    "فرنسا": ["france"],
    "العراق": ["iraq"],
    "النرويج": ["norway"],
    "السنغال": ["senegal"],
    "الأردن": ["jordan"],
    "الجزائر": ["algeria"],
    "البرتغال": ["portugal"],
    "أوزبكستان": ["uzbekistan"],
    "إنجلترا": ["england"],
    "غانا": ["ghana"],
    "بنما": ["panama"],
    "كرواتيا": ["croatia"],
    "كولومبيا": ["colombia"],
    "الكونغو الديمقراطية": ["dr congo", "congo dr", "democratic republic of the congo", "d r congo"],
    "سويسرا": ["switzerland"],
    "كندا": ["canada"],
    "البوسنة والهرسك": ["bosnia and herzegovina", "bosnia-herzegovina", "bosnia"],
    "البوسنة": ["bosnia and herzegovina", "bosnia-herzegovina", "bosnia"],
    "قطر": ["qatar"],
    "التشيك": ["czechia", "czech republic"],
    "المكسيك": ["mexico"],
    "جنوب أفريقيا": ["south africa"],
    "كوريا الجنوبية": ["south korea", "korea republic", "republic of korea"],
    "كوريا": ["south korea", "korea republic", "republic of korea"]
};

const ARABIC_STAGE_LABELS = {
    GROUP_STAGE: "دور المجموعات",
    LAST_32: "دور الـ32",
    LAST_16: "دور الـ16",
    QUARTER_FINALS: "ربع النهائي",
    SEMI_FINALS: "نصف النهائي",
    THIRD_PLACE: "المركز الثالث",
    FINAL: "النهائي"
};

async function main() {
    if (!isInsideAllowedScheduleWindow()) {
        console.log("Fetch skipped: outside SCHEDULE_ACTIVE_FROM / SCHEDULE_ACTIVE_UNTIL window.");
        return;
    }

    const [matches, existingNotes] = await Promise.all([
        loadMatches(),
        loadExistingNotes()
    ]);

    const targetMatches = filterTargetMatches(matches);
    const rows = [];
    const skipKeys = buildExistingKeySet(existingNotes);

    console.log("FINAL_EVENT_NOTES_FETCH_START");
    console.log(JSON.stringify({
        dryRun: DRY_RUN,
        defaultApproved: DEFAULT_APPROVED,
        fetchFootballDataNotes: FETCH_FOOTBALL_DATA_NOTES,
        fetchFootballEvents: FETCH_FOOTBALL_EVENTS,
        fetchNewsEvents: FETCH_NEWS_EVENTS,
        targetMatches: targetMatches.length,
        targetRecentCompletedDays: TARGET_RECENT_COMPLETED_DAYS,
        targetStage: TARGET_STAGE || null,
        newsMaxPerMatch: NEWS_MAX_PER_MATCH,
        newsDaysAfterMatch: NEWS_DAYS_AFTER_MATCH
    }, null, 2));

    if (FETCH_FOOTBALL_DATA_NOTES) {
        const officialMatchMap = await buildFootballDataMatchMap(targetMatches);
        for (const match of targetMatches) {
            const officialMatch = officialMatchMap.get(match.id);
            const officialRows = buildFootballDataNoteRows(match, officialMatch);
            rows.push(...officialRows);
        }
    }

    if (FETCH_FOOTBALL_EVENTS) {
        const fixtureMap = await buildApiFootballFixtureMap(targetMatches);
        for (const match of targetMatches) {
            const fixture = fixtureMap.get(match.id);
            if (!fixture) continue;
            const eventRows = await fetchApiFootballEventRows(match, fixture);
            rows.push(...eventRows);
            await politeDelay(180);
        }
    }

    if (FETCH_NEWS_EVENTS && NEWS_MAX_PER_MATCH > 0) {
        for (const match of targetMatches) {
            const newsRows = await fetchGdeltNewsRows(match);
            rows.push(...newsRows);
            await politeDelay(260);
        }
    }

    const normalizedRows = rows
        .map(normalizeEventNote)
        .filter(Boolean)
        .filter((row) => {
            const key = noteKey(row);
            if (skipKeys.has(key)) return false;
            skipKeys.add(key);
            return true;
        });

    console.log("FINAL_EVENT_NOTES_FETCH_RESULT");
    console.log(JSON.stringify({
        fetchedCandidateRows: rows.length,
        newRowsAfterDedupe: normalizedRows.length,
        byType: countBy(normalizedRows.map((row) => row.event_type)),
        byMood: countBy(normalizedRows.map((row) => row.mood)),
        preview: normalizedRows.slice(0, 8)
    }, null, 2));

    if (DRY_RUN) {
        console.log("Dry run only. Nothing inserted.");
        return;
    }

    if (DELETE_EXISTING_DRAFTS) {
        await supabaseFetch(`${EVENT_NOTES_TABLE}?approved=eq.false`, {
            method: "DELETE",
            headers: { Prefer: "return=minimal" }
        });
        console.log("Deleted existing unapproved final_event_notes drafts.");
    }

    await insertRows(normalizedRows);
    console.log(`Inserted ${normalizedRows.length} final_event_notes draft row(s). Review them, then set approved=true for trusted notes.`);
}

async function supabaseFetch(apiPath, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${apiPath}`, {
        ...options,
        headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase error ${response.status}: ${text}`);
    }

    if (response.status === 204) return null;

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

async function loadMatches() {
    return supabaseFetch(
        "matches?select=id,external_id,team1,team2,kickoff_at,status,stage,score_duration,winner_side,actual_team1_goals,actual_team2_goals&order=kickoff_at.asc"
    );
}

async function loadExistingNotes() {
    try {
        return await supabaseFetch(
            `${EVENT_NOTES_TABLE}?select=id,match_id,event_type,title_ar,source_url,source_name,approved,created_at`
        );
    } catch (error) {
        if (String(error.message).includes(EVENT_NOTES_TABLE)) {
            throw new Error(`Could not read ${EVENT_NOTES_TABLE}. Confirm the table exists with the expected columns.`);
        }
        throw error;
    }
}

function filterTargetMatches(matches = []) {
    const now = new Date();
    return (matches || [])
        .filter(hasActualScore)
        .filter((match) => !TARGET_STAGE || match.stage === TARGET_STAGE)
        .filter((match) => {
            if (!TARGET_RECENT_COMPLETED_DAYS) return true;
            const kickoff = new Date(match.kickoff_at);
            const cutoff = new Date(now.getTime() - TARGET_RECENT_COMPLETED_DAYS * 24 * 60 * 60 * 1000);
            return kickoff >= cutoff;
        });
}

function hasActualScore(match) {
    return Number.isInteger(match.actual_team1_goals) && Number.isInteger(match.actual_team2_goals);
}

async function buildFootballDataMatchMap(matches) {
    const url = `${FOOTBALL_DATA_BASE_URL}/competitions/${encodeURIComponent(FOOTBALL_DATA_COMPETITION)}/matches?season=${encodeURIComponent(FOOTBALL_DATA_SEASON)}`;
    const response = await fetch(url, {
        headers: { "X-Auth-Token": FOOTBALL_DATA_TOKEN }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Football-Data error ${response.status}: ${text}`);
    }

    const json = await response.json();
    const apiMatches = Array.isArray(json?.matches) ? json.matches : [];
    const officialMap = new Map();
    let matched = 0;

    for (const match of matches) {
        const officialMatch = findFootballDataMatch(match, apiMatches);
        if (officialMatch) {
            officialMap.set(match.id, officialMatch);
            matched += 1;
        }
    }

    console.log(JSON.stringify({
        footballDataMatches: apiMatches.length,
        targetMatches: matches.length,
        matchedFootballDataMatches: matched,
        unmatchedMatches: matches.length - matched
    }, null, 2));

    return officialMap;
}

function findFootballDataMatch(match, apiMatches) {
    if (match.external_id) {
        const byExternalId = apiMatches.find((apiMatch) => String(apiMatch.id) === String(match.external_id));
        if (byExternalId) return byExternalId;
    }

    const dbKickoff = new Date(match.kickoff_at).getTime();
    const candidates = apiMatches
        .map((apiMatch) => {
            const home = apiMatch?.homeTeam?.name || "";
            const away = apiMatch?.awayTeam?.name || "";
            const apiTime = new Date(apiMatch?.utcDate || 0).getTime();
            const timeDiffHours = Math.abs(apiTime - dbKickoff) / (60 * 60 * 1000);
            const directTeams = teamMatches(match.team1, home) && teamMatches(match.team2, away);
            const reverseTeams = teamMatches(match.team1, away) && teamMatches(match.team2, home);
            const score = (directTeams || reverseTeams ? 100 : 0) - timeDiffHours;
            return { apiMatch, timeDiffHours, score };
        })
        .filter((candidate) => candidate.score > 80 && candidate.timeDiffHours <= 12)
        .sort((a, b) => b.score - a.score);

    return candidates[0]?.apiMatch || null;
}

function buildFootballDataNoteRows(match, officialMatch) {
    const rows = [];
    const duration = String(officialMatch?.score?.duration || match.score_duration || "REGULAR").toUpperCase();
    const winner = officialMatch?.score?.winner || match.winner_side || null;
    const officialId = officialMatch?.id || match.external_id || match.id;
    const totalGoals = Number(match.actual_team1_goals || 0) + Number(match.actual_team2_goals || 0);
    const goalDiff = Math.abs(Number(match.actual_team1_goals || 0) - Number(match.actual_team2_goals || 0));
    const baseDetails = `${stageLabel(match.stage)}: ${match.team1} ضد ${match.team2} انتهت ${match.actual_team1_goals}-${match.actual_team2_goals}.`;
    const sourceUrl = `football-data://match/${officialId}`;

    rows.push({
        match_id: match.id,
        stage: match.stage || null,
        event_type: "official_result",
        mood: goalDiff === 0 ? "tense" : totalGoals >= 5 ? "exciting" : "result",
        title_ar: cleanText(`نتيجة موثقة: ${match.team1} ${match.actual_team1_goals}-${match.actual_team2_goals} ${match.team2}`, 140),
        details_ar: cleanText(`${baseDetails} النتيجة مأخوذة من Football-Data ومن قاعدة بيانات المسابقة.`, 700),
        source_url: sourceUrl,
        source_name: "Football-Data.org",
        approved: DEFAULT_APPROVED
    });

    if (duration === "PENALTY_SHOOTOUT") {
        rows.push({
            match_id: match.id,
            stage: match.stage || null,
            event_type: "penalty_shootout",
            mood: "dramatic",
            title_ar: cleanText(`حسم بركلات الترجيح: ${match.team1} ضد ${match.team2}`, 140),
            details_ar: cleanText(`${baseDetails} المباراة احتاجت ركلات ترجيح لتحديد المتأهل. لا تُستخدم ركلات الترجيح في نتيجة التوقع، لكنها مهمة كحدث في قصة البطولة.`, 700),
            source_url: `${sourceUrl}/penalties`,
            source_name: "Football-Data.org",
            approved: DEFAULT_APPROVED
        });
    }

    if (duration === "EXTRA_TIME") {
        rows.push({
            match_id: match.id,
            stage: match.stage || null,
            event_type: "extra_time",
            mood: "dramatic",
            title_ar: cleanText(`مباراة امتدت للأشواط الإضافية: ${match.team1} ضد ${match.team2}`, 140),
            details_ar: cleanText(`${baseDetails} المباراة امتدت لما بعد الوقت الأصلي قبل الحسم.`, 700),
            source_url: `${sourceUrl}/extra-time`,
            source_name: "Football-Data.org",
            approved: DEFAULT_APPROVED
        });
    }

    if (totalGoals >= 5) {
        rows.push({
            match_id: match.id,
            stage: match.stage || null,
            event_type: "goal_fest",
            mood: "exciting",
            title_ar: cleanText(`مباراة أهدافها كثيرة: ${match.team1} ضد ${match.team2}`, 140),
            details_ar: cleanText(`${baseDetails} مجموع الأهداف وصل إلى ${totalGoals}، وهذا يجعلها من المباريات الغنية بالأهداف في بيانات المسابقة.`, 700),
            source_url: `${sourceUrl}/goal-fest`,
            source_name: "Football-Data.org",
            approved: DEFAULT_APPROVED
        });
    }

    if (goalDiff <= 1) {
        rows.push({
            match_id: match.id,
            stage: match.stage || null,
            event_type: "close_match",
            mood: "tense",
            title_ar: cleanText(`حسم ضيق: ${match.team1} ضد ${match.team2}`, 140),
            details_ar: cleanText(`${baseDetails} الفارق كان ${goalDiff}، لذلك تصلح كلقطة توتر وتقارب في الأضواء.`, 700),
            source_url: `${sourceUrl}/close-match`,
            source_name: "Football-Data.org",
            approved: DEFAULT_APPROVED
        });
    }

    if ((match.actual_team1_goals === 0 && match.actual_team2_goals > 0) || (match.actual_team2_goals === 0 && match.actual_team1_goals > 0)) {
        rows.push({
            match_id: match.id,
            stage: match.stage || null,
            event_type: "clean_sheet",
            mood: "proud",
            title_ar: cleanText(`شباك نظيفة: ${match.team1} ضد ${match.team2}`, 140),
            details_ar: cleanText(`${baseDetails} أحد الفريقين خرج بشباك نظيفة، وهذه لقطة دفاعية واضحة من النتيجة الرسمية.`, 700),
            source_url: `${sourceUrl}/clean-sheet`,
            source_name: "Football-Data.org",
            approved: DEFAULT_APPROVED
        });
    }

    if (winner) {
        rows.push({
            match_id: match.id,
            stage: match.stage || null,
            event_type: "winner_confirmed",
            mood: "result",
            title_ar: cleanText(`المتأهل/الفائز تم حسمه: ${match.team1} ضد ${match.team2}`, 140),
            details_ar: cleanText(`${baseDetails} جهة الفائز في المصدر: ${winner}.`, 700),
            source_url: `${sourceUrl}/winner`,
            source_name: "Football-Data.org",
            approved: DEFAULT_APPROVED
        });
    }

    return rows;
}

async function buildApiFootballFixtureMap(matches) {
    const fixtures = await apiFootballFetch(`/fixtures?league=${encodeURIComponent(API_FOOTBALL_LEAGUE_ID)}&season=${encodeURIComponent(API_FOOTBALL_SEASON)}`);
    const responseRows = Array.isArray(fixtures?.response) ? fixtures.response : [];
    const fixtureMap = new Map();
    let matched = 0;

    for (const match of matches) {
        const fixture = findBestFixture(match, responseRows);
        if (fixture) {
            fixtureMap.set(match.id, fixture);
            matched += 1;
        }
    }

    console.log(JSON.stringify({
        apiFootballFixtures: responseRows.length,
        targetMatches: matches.length,
        matchedFixtures: matched,
        unmatchedMatches: matches.length - matched
    }, null, 2));

    return fixtureMap;
}

async function apiFootballFetch(path) {
    const response = await fetch(`${API_FOOTBALL_BASE_URL}${path}`, {
        headers: { "x-apisports-key": API_FOOTBALL_KEY }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API-Football error ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json?.errors && Object.keys(json.errors).length > 0) {
        console.warn("API-Football returned errors:", JSON.stringify(json.errors));
    }
    return json;
}

function findBestFixture(match, fixtures) {
    const dbKickoff = new Date(match.kickoff_at).getTime();
    const candidates = fixtures
        .map((fixture) => {
            const home = fixture?.teams?.home?.name || "";
            const away = fixture?.teams?.away?.name || "";
            const fixtureTime = new Date(fixture?.fixture?.date || 0).getTime();
            const timeDiffHours = Math.abs(fixtureTime - dbKickoff) / (60 * 60 * 1000);
            const directTeams = teamMatches(match.team1, home) && teamMatches(match.team2, away);
            const reverseTeams = teamMatches(match.team1, away) && teamMatches(match.team2, home);
            const score = (directTeams || reverseTeams ? 100 : 0) - timeDiffHours;
            return { fixture, timeDiffHours, score, directTeams, reverseTeams };
        })
        .filter((candidate) => candidate.score > 80 && candidate.timeDiffHours <= 12)
        .sort((a, b) => b.score - a.score);

    return candidates[0]?.fixture || null;
}

function teamMatches(arabicName, apiName) {
    const normalizedApi = normalizeName(apiName);
    const aliases = TEAM_ALIASES[arabicName] || [arabicName];
    return aliases.map(normalizeName).some((alias) => alias === normalizedApi || normalizedApi.includes(alias) || alias.includes(normalizedApi));
}

function normalizeName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’']/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .toLowerCase();
}

async function fetchApiFootballEventRows(match, fixture) {
    const fixtureId = fixture?.fixture?.id;
    if (!fixtureId) return [];

    const json = await apiFootballFetch(`/fixtures/events?fixture=${encodeURIComponent(fixtureId)}`);
    const events = Array.isArray(json?.response) ? json.response : [];
    const rows = [];

    for (const event of events) {
        if (!isInterestingApiFootballEvent(event)) continue;
        rows.push(apiFootballEventToNote(match, fixtureId, event));
    }

    return rows.filter(Boolean);
}

function isInterestingApiFootballEvent(event) {
    const type = String(event?.type || "").toLowerCase();
    const detail = String(event?.detail || "").toLowerCase();
    const comments = String(event?.comments || "").toLowerCase();
    if (type === "goal") return true;
    if (type === "card" && (detail.includes("red") || detail.includes("yellow"))) return true;
    if (type === "var") return true;
    if (detail.includes("penalty") || detail.includes("missed penalty")) return true;
    if (comments.includes("var") || comments.includes("penalty")) return true;
    return false;
}

function apiFootballEventToNote(match, fixtureId, event) {
    const type = String(event.type || "event");
    const detail = String(event.detail || "").trim();
    const team = event.team?.name || "";
    const player = event.player?.name || "";
    const comments = String(event.comments || "").trim();
    const minute = formatMinute(event.time);
    const eventType = classifyFootballEventType(type, detail, comments);
    const mood = classifyFootballMood(eventType, detail, comments);
    const title = buildFootballEventTitle(match, eventType, team, minute);
    const details = [
        `${stageLabel(match.stage)}: ${match.team1} ضد ${match.team2} انتهت ${match.actual_team1_goals}-${match.actual_team2_goals}.`,
        minute ? `الحدث في الدقيقة ${minute}.` : "",
        player ? `اللاعب: ${player}.` : "",
        team ? `الفريق: ${team}.` : "",
        detail ? `نوع الحدث: ${type} - ${detail}.` : `نوع الحدث: ${type}.`,
        comments ? `تعليق المصدر: ${comments}.` : ""
    ].filter(Boolean).join(" ");

    return {
        match_id: match.id,
        stage: match.stage || null,
        event_type: eventType,
        mood,
        title_ar: title,
        details_ar: details,
        source_url: `api-football://fixture/${fixtureId}/event/${encodeURIComponent([minute, team, player, type, detail].join("|"))}`,
        source_name: "API-Football",
        approved: DEFAULT_APPROVED
    };
}

function classifyFootballEventType(type, detail, comments) {
    const text = `${type} ${detail} ${comments}`.toLowerCase();
    if (text.includes("var")) return "var";
    if (text.includes("red")) return "red_card";
    if (text.includes("yellow")) return "yellow_card";
    if (text.includes("missed penalty")) return "missed_penalty";
    if (text.includes("penalty")) return "penalty";
    if (String(type).toLowerCase() === "goal") return "goal";
    return "match_event";
}

function classifyFootballMood(eventType, detail, comments) {
    const text = `${eventType} ${detail} ${comments}`.toLowerCase();
    if (["red_card", "var", "missed_penalty"].includes(eventType)) return "controversial";
    if (text.includes("own goal")) return "sad";
    if (["goal", "penalty"].includes(eventType)) return "exciting";
    return "dramatic";
}

function buildFootballEventTitle(match, eventType, team, minute) {
    const prefix = {
        goal: "هدف حرّك المباراة",
        penalty: "ركلة جزاء مهمة",
        missed_penalty: "ركلة ضاعت في لحظة حساسة",
        red_card: "بطاقة قلبت الجو",
        yellow_card: "بطاقة زادت التوتر",
        var: "VAR دخل على الخط",
        match_event: "لقطة مهمة في المباراة"
    }[eventType] || "لقطة موثقة";

    const teamPart = team ? ` - ${team}` : "";
    const minutePart = minute ? ` (${minute})` : "";
    return cleanText(`${prefix}${teamPart}${minutePart}`, 140);
}

function formatMinute(time = {}) {
    const elapsed = Number.isInteger(time.elapsed) ? time.elapsed : null;
    const extra = Number.isInteger(time.extra) ? time.extra : null;
    if (elapsed === null) return "";
    return extra ? `${elapsed}+${extra}` : String(elapsed);
}

async function fetchGdeltNewsRows(match) {
    const team1Aliases = TEAM_ALIASES[match.team1] || [match.team1];
    const team2Aliases = TEAM_ALIASES[match.team2] || [match.team2];
    const team1 = toSearchName(team1Aliases[0]);
    const team2 = toSearchName(team2Aliases[0]);
    if (!team1 || !team2) return [];

    const kickoff = new Date(match.kickoff_at);
    const start = toGdeltDateTime(new Date(kickoff.getTime() - 3 * 60 * 60 * 1000));
    const end = toGdeltDateTime(new Date(kickoff.getTime() + NEWS_DAYS_AFTER_MATCH * 24 * 60 * 60 * 1000));
    const query = `"World Cup 2026" "${team1}" "${team2}"`;
    const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
    url.searchParams.set("query", query);
    url.searchParams.set("mode", "ArtList");
    url.searchParams.set("format", "json");
    url.searchParams.set("maxrecords", String(Math.max(1, NEWS_MAX_PER_MATCH * 3)));
    url.searchParams.set("sort", "HybridRel");
    url.searchParams.set("startdatetime", start);
    url.searchParams.set("enddatetime", end);

    let json;
    try {
        const response = await fetch(url.toString(), {
            headers: { "User-Agent": "world-cup-private-recap/1.0" }
        });
        if (!response.ok) {
            console.warn(`GDELT error ${response.status} for ${match.team1} ضد ${match.team2}`);
            return [];
        }
        json = await response.json();
    } catch (error) {
        console.warn(`GDELT fetch failed for ${match.team1} ضد ${match.team2}: ${error.message}`);
        return [];
    }

    const articles = Array.isArray(json?.articles) ? json.articles : [];
    return articles
        .filter((article) => article?.url && article?.title)
        .slice(0, NEWS_MAX_PER_MATCH)
        .map((article) => gdeltArticleToNote(match, article));
}

function gdeltArticleToNote(match, article) {
    const title = cleanText(article.title, 180);
    const domain = cleanText(article.domain || article.sourceCommonName || "GDELT", 120);
    const seenDate = cleanText(article.seendate || "", 40);
    const mood = classifyNewsMood(title);
    return {
        match_id: match.id,
        stage: match.stage || null,
        event_type: "news",
        mood,
        title_ar: cleanText(`خبر موثق: ${title}`, 140),
        details_ar: cleanText(`${stageLabel(match.stage)}: ${match.team1} ضد ${match.team2} (${match.actual_team1_goals}-${match.actual_team2_goals}). مصدر الخبر ${domain}${seenDate ? `، تاريخ الظهور ${seenDate}` : ""}. عنوان الخبر الأصلي: ${title}`, 700),
        source_url: cleanText(article.url, 900),
        source_name: cleanText(`GDELT / ${domain}`, 180),
        approved: DEFAULT_APPROVED
    };
}

function classifyNewsMood(title) {
    const text = normalizeName(title);
    if (/(controvers|var|red card|fight|brawl|furious|anger|rage|chaos|scandal|critic)/i.test(text)) return "controversial";
    if (/(injury|tears|heartbreak|crash|knocked out|devastat|sad)/i.test(text)) return "sad";
    if (/(stun|shock|upset|surprise|historic|dramatic)/i.test(text)) return "dramatic";
    if (/(celebrat|proud|hero|glory|dream|emotional)/i.test(text)) return "proud";
    return "news";
}

function toSearchName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function toGdeltDateTime(date) {
    const iso = date.toISOString();
    return iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13) + iso.slice(14, 16) + iso.slice(17, 19);
}

function normalizeEventNote(row) {
    const title = cleanText(row.title_ar, 140);
    const details = cleanText(row.details_ar, 700);
    if (!title || title.length < MIN_NOTE_TITLE_LENGTH || !details) return null;
    return {
        match_id: row.match_id || null,
        stage: cleanText(row.stage, 60) || null,
        event_type: cleanText(row.event_type || "event", 80),
        mood: cleanText(row.mood || "story", 80),
        title_ar: title,
        details_ar: details,
        source_url: cleanText(row.source_url, 900) || null,
        source_name: cleanText(row.source_name, 180) || null,
        approved: row.approved === true
    };
}

function noteKey(row) {
    return [
        row.match_id || "",
        row.event_type || "",
        row.source_url || "",
        normalizeName(row.title_ar || "")
    ].join("|");
}

function buildExistingKeySet(existingRows = []) {
    return new Set((existingRows || []).map((row) => noteKey({
        match_id: row.match_id || null,
        event_type: row.event_type || "",
        source_url: row.source_url || "",
        title_ar: row.title_ar || ""
    })));
}

async function insertRows(rows) {
    if (!rows.length) return;
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await supabaseFetch(EVENT_NOTES_TABLE, {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(chunk)
        });
    }
}

function countBy(values) {
    return values.reduce((acc, value) => {
        const key = value || "unspecified";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function cleanText(value, maxLength) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
        .trim();
}

function stageLabel(stage) {
    return ARABIC_STAGE_LABELS[stage] || stage || "مرحلة غير محددة";
}

function politeDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isInsideAllowedScheduleWindow() {
    const now = new Date();

    if (SCHEDULE_ACTIVE_FROM) {
        const from = new Date(SCHEDULE_ACTIVE_FROM);
        if (!Number.isNaN(from.getTime()) && now < from) return false;
    }

    if (SCHEDULE_ACTIVE_UNTIL) {
        const until = new Date(SCHEDULE_ACTIVE_UNTIL);
        if (!Number.isNaN(until.getTime()) && now > until) return false;
    }

    return true;
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
