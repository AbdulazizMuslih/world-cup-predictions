const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_MODE = (process.env.SYNC_MODE || "normal").toLowerCase();

if (!FOOTBALL_DATA_TOKEN) throw new Error("Missing FOOTBALL_DATA_TOKEN");
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const FOOTBALL_API_BASE_URL =
    "https://api.football-data.org/v4/competitions/WC/matches";

const TEAM_ARABIC_NAMES = {
    "United States": "أمريكا",
    "USA": "أمريكا",
    "Australia": "أستراليا",
    "Scotland": "اسكتلندا",
    "Morocco": "المغرب",
    "Brazil": "البرازيل",
    "Haiti": "هايتي",
    "Turkey": "تركيا",
    "Türkiye": "تركيا",
    "Paraguay": "باراغواي",
    "Netherlands": "هولندا",
    "Sweden": "السويد",
    "Germany": "ألمانيا",
    "Ivory Coast": "ساحل العاج",
    "Côte d’Ivoire": "ساحل العاج",
    "Côte d'Ivoire": "ساحل العاج",
    "Ecuador": "الإكوادور",
    "Curacao": "كوراساو",
    "Curaçao": "كوراساو",
    "Tunisia": "تونس",
    "Japan": "اليابان",
    "Spain": "إسبانيا",
    "Saudi Arabia": "السعودية",
    "Belgium": "بلجيكا",
    "Iran": "إيران",
    "Uruguay": "الأوروغواي",
    "Cape Verde": "الرأس الأخضر",
    "Cape Verde Islands": "الرأس الأخضر",
    "Cabo Verde": "الرأس الأخضر",
    "New Zealand": "نيوزيلندا",
    "Egypt": "مصر",
    "Argentina": "الأرجنتين",
    "Austria": "النمسا",
    "France": "فرنسا",
    "Iraq": "العراق",
    "Norway": "النرويج",
    "Senegal": "السنغال",
    "Jordan": "الأردن",
    "Algeria": "الجزائر",
    "Portugal": "البرتغال",
    "Uzbekistan": "أوزبكستان",
    "England": "إنجلترا",
    "Ghana": "غانا",
    "Panama": "بنما",
    "Croatia": "كرواتيا",
    "Colombia": "كولومبيا",
    "DR Congo": "الكونغو الديمقراطية",
    "Congo DR": "الكونغو الديمقراطية",
    "Democratic Republic of the Congo": "الكونغو الديمقراطية",
    "Switzerland": "سويسرا",
    "Canada": "كندا",
    "Bosnia and Herzegovina": "البوسنة والهرسك",
    "Bosnia-Herzegovina": "البوسنة والهرسك",
    "Qatar": "قطر",
    "Czechia": "التشيك",
    "Czech Republic": "التشيك",
    "Mexico": "المكسيك",
    "South Africa": "جنوب أفريقيا",
    "South Korea": "كوريا الجنوبية"
};

const MS = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000
};

function toArabicTeamName(name) {
    if (!name) return "غير محدد";
    return TEAM_ARABIC_NAMES[name] || name;
}

function mapStatus(apiStatus) {
    if (apiStatus === "FINISHED") return "completed";
    if (
        apiStatus === "IN_PLAY" ||
        apiStatus === "PAUSED" ||
        apiStatus === "EXTRA_TIME" ||
        apiStatus === "PENALTY_SHOOTOUT"
    ) return "live";
    return "scheduled";
}

function calculatePoints(predicted1, predicted2, actual1, actual2) {
    if (predicted1 === actual1 && predicted2 === actual2) return 50;

    const predictedOutcome = getOutcome(predicted1, predicted2);
    const actualOutcome = getOutcome(actual1, actual2);

    return predictedOutcome === actualOutcome ? 10 : 0;
}

function getOutcome(team1, team2) {
    if (team1 > team2) return "team1";
    if (team2 > team1) return "team2";
    return "draw";
}

function toApiDate(date) {
    return date.toISOString().slice(0, 10);
}

function buildWindowApiUrl(fromTime, toTime) {
    const apiDateFrom = toApiDate(fromTime);
    const apiDateTo = toApiDate(toTime);

    return `${FOOTBALL_API_BASE_URL}?season=2026&dateFrom=${apiDateFrom}&dateTo=${apiDateTo}`;
}

function buildFullSeasonApiUrl() {
    return `${FOOTBALL_API_BASE_URL}?season=2026`;
}

function isApiMatchInWindow(apiMatch, fromTime, toTime) {
    const kickoff = new Date(apiMatch.utcDate);
    return kickoff >= fromTime && kickoff <= toTime;
}

async function supabaseFetch(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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

async function fetchFootballMatches(apiUrl) {
    const response = await fetch(apiUrl, {
        headers: {
            "X-Auth-Token": FOOTBALL_DATA_TOKEN
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Football API error ${response.status}: ${text}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.matches)) {
        throw new Error("Football API response does not contain matches array");
    }

    return data.matches;
}

function getScorePart(scorePart) {
    return {
        home: Number.isInteger(scorePart?.home) ? scorePart.home : null,
        away: Number.isInteger(scorePart?.away) ? scorePart.away : null
    };
}

function hasCompleteScorePart(scorePart) {
    return Number.isInteger(scorePart?.home) && Number.isInteger(scorePart?.away);
}

function addScoreParts(first, second) {
    if (!hasCompleteScorePart(first)) {
        return { home: null, away: null };
    }

    if (!hasCompleteScorePart(second)) {
        return first;
    }

    return {
        home: first.home + second.home,
        away: first.away + second.away
    };
}

function subtractScoreParts(total, partToRemove) {
    if (!hasCompleteScorePart(total) || !hasCompleteScorePart(partToRemove)) {
        return { home: null, away: null };
    }

    const home = total.home - partToRemove.home;
    const away = total.away - partToRemove.away;

    if (home < 0 || away < 0) {
        return { home: null, away: null };
    }

    return { home, away };
}

function getScoringResultForPredictions(apiMatch) {
    const score = apiMatch.score || {};
    const duration = score.duration || "REGULAR";
    const fullTime = getScorePart(score.fullTime);

    if (duration === "EXTRA_TIME") {
        if (hasCompleteScorePart(fullTime)) {
            return fullTime;
        }

        return addScoreParts(
            getScorePart(score.regularTime),
            getScorePart(score.extraTime)
        );
    }

    if (duration === "PENALTY_SHOOTOUT") {
        const regularAndExtraTimeScore = addScoreParts(
            getScorePart(score.regularTime),
            getScorePart(score.extraTime)
        );

        if (hasCompleteScorePart(regularAndExtraTimeScore)) {
            return regularAndExtraTimeScore;
        }

        if (hasCompleteScorePart(fullTime) && fullTime.home === fullTime.away) {
            return fullTime;
        }

        const scoreWithoutPenalties = subtractScoreParts(
            fullTime,
            getScorePart(score.penalties)
        );

        if (hasCompleteScorePart(scoreWithoutPenalties)) {
            return scoreWithoutPenalties;
        }
    }

    return fullTime;
}

function normalizeMatch(apiMatch) {
    const scoringResult = getScoringResultForPredictions(apiMatch);

    return {
        external_id: String(apiMatch.id),
        team1: toArabicTeamName(apiMatch.homeTeam?.name),
        team2: toArabicTeamName(apiMatch.awayTeam?.name),
        kickoff_at: apiMatch.utcDate,
        status: mapStatus(apiMatch.status),
        stage: apiMatch.stage || "GROUP_STAGE",
        score_duration: apiMatch.score?.duration || "REGULAR",
        winner_side: apiMatch.score?.winner || null,
        actual_team1_goals: Number.isInteger(scoringResult.home) ? scoringResult.home : null,
        actual_team2_goals: Number.isInteger(scoringResult.away) ? scoringResult.away : null,
        competition: "FIFA World Cup 2026",
        last_synced_at: new Date().toISOString()
    };
}

async function upsertMatches(matches) {
    if (matches.length === 0) return;

    await supabaseFetch("matches?on_conflict=external_id", {
        method: "POST",
        headers: {
            Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(matches)
    });
}

async function recalculatePointsForScoredMatch(match) {
    const matchHasStarted =
        match.status === "live" ||
        match.status === "completed";

    const hasActualScore =
        match.actual_team1_goals !== null &&
        match.actual_team2_goals !== null;

    if (!matchHasStarted || !hasActualScore) {
        return;
    }

    const dbMatches = await supabaseFetch(
        `matches?external_id=eq.${encodeURIComponent(match.external_id)}&select=id`
    );

    const dbMatch = dbMatches?.[0];

    if (!dbMatch) return;

    const predictions = await supabaseFetch(
        `predictions?match_id=eq.${dbMatch.id}&select=id,predicted_team1_goals,predicted_team2_goals`
    );

    if (!predictions || predictions.length === 0) return;

    for (const prediction of predictions) {
        const points = calculatePoints(
            prediction.predicted_team1_goals,
            prediction.predicted_team2_goals,
            match.actual_team1_goals,
            match.actual_team2_goals
        );

        await supabaseFetch(`predictions?id=eq.${prediction.id}`, {
            method: "PATCH",
            headers: {
                Prefer: "return=minimal"
            },
            body: JSON.stringify({ points })
        });
    }
}

async function normalizeUpsertAndScore(apiMatches, exactFilter, label) {
    const filteredApiMatches = exactFilter
        ? apiMatches.filter(exactFilter)
        : apiMatches;

    console.log(`${label}: API matches after exact filter: ${filteredApiMatches.length}`);

    const normalizedMatches = filteredApiMatches
        .map(normalizeMatch)
        .filter((match) => match.team1 !== "غير محدد" && match.team2 !== "غير محدد");

    console.log(`${label}: Normalized matches: ${normalizedMatches.length}`);

    await upsertMatches(normalizedMatches);

    const scoredMatches = normalizedMatches.filter((match) => {
        const matchHasStarted =
            match.status === "live" ||
            match.status === "completed";

        const hasActualScore =
            match.actual_team1_goals !== null &&
            match.actual_team2_goals !== null;

        return matchHasStarted && hasActualScore;
    });

    console.log(`${label}: Live/completed matches with scores found: ${scoredMatches.length}`);

    for (const match of scoredMatches) {
        await recalculatePointsForScoredMatch(match);
    }
}

async function runNormalSync() {
    const now = new Date();
    const fromTime = new Date(now.getTime() - 8 * MS.hour);
    const toTime = new Date(now.getTime() + 24 * MS.hour);
    const apiUrl = buildWindowApiUrl(fromTime, toTime);

    console.log("Running normal sync.");
    console.log(`Exact window: ${fromTime.toISOString()} to ${toTime.toISOString()}`);
    console.log(`Football API URL: ${apiUrl}`);

    const apiMatches = await fetchFootballMatches(apiUrl);
    console.log(`Normal sync: Fetched ${apiMatches.length} matches from API date window.`);

    await normalizeUpsertAndScore(
        apiMatches,
        (apiMatch) => isApiMatchInWindow(apiMatch, fromTime, toTime),
        "Normal sync"
    );
}

async function getActiveMatches() {
    const now = new Date();
    const fromTime = new Date(now.getTime() - 8 * MS.hour);

    const path =
        "matches" +
        `?kickoff_at=gte.${encodeURIComponent(fromTime.toISOString())}` +
        `&kickoff_at=lte.${encodeURIComponent(now.toISOString())}` +
        "&select=id,external_id,kickoff_at,status,actual_team1_goals,actual_team2_goals";

    const matches = await supabaseFetch(path);

    return {
        now,
        fromTime,
        matches: matches || []
    };
}

async function runCorrectionSync() {
    console.log("Running active match correction sync.");

    const { now, fromTime, matches } = await getActiveMatches();

    console.log(`Active match window: ${fromTime.toISOString()} to ${now.toISOString()}`);
    console.log(`Active matches found in Supabase: ${matches.length}`);

    if (matches.length === 0) {
        console.log("No active matches. Skipping football-data API call.");
        return;
    }

    const apiUrl = buildWindowApiUrl(fromTime, now);

    console.log(`Football API URL: ${apiUrl}`);

    const apiMatches = await fetchFootballMatches(apiUrl);
    console.log(`Correction sync: Fetched ${apiMatches.length} matches from API date window.`);

    await normalizeUpsertAndScore(
        apiMatches,
        (apiMatch) => isApiMatchInWindow(apiMatch, fromTime, now),
        "Correction sync"
    );
}

async function runFullFixtureSync() {
    const apiUrl = buildFullSeasonApiUrl();

    console.log("Running full fixture discovery sync.");
    console.log(`Football API URL: ${apiUrl}`);

    const apiMatches = await fetchFootballMatches(apiUrl);
    console.log(`Full fixture sync: Fetched ${apiMatches.length} matches.`);

    await normalizeUpsertAndScore(
        apiMatches,
        null,
        "Full fixture sync"
    );
}

async function main() {
    console.log("Starting World Cup sync...");
    console.log(`SYNC_MODE=${SYNC_MODE}`);

    if (SYNC_MODE === "normal") {
        await runNormalSync();
    } else if (SYNC_MODE === "correction") {
        await runCorrectionSync();
    } else if (SYNC_MODE === "full") {
        await runFullFixtureSync();
    } else {
        throw new Error(`Invalid SYNC_MODE: ${SYNC_MODE}`);
    }

    console.log("World Cup sync completed.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
