const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FOOTBALL_DATA_TOKEN) throw new Error("Missing FOOTBALL_DATA_TOKEN");
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const FOOTBALL_API_URL =
    "https://api.football-data.org/v4/competitions/WC/matches?season=2026";

const STALE_LIVE_MATCH_MS = 3 * 60 * 60 * 1000;

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

function toArabicTeamName(name) {
    if (!name) return "غير محدد";
    return TEAM_ARABIC_NAMES[name] || name;
}

function mapStatus(apiStatus) {
    if (apiStatus === "FINISHED") return "completed";
    if (apiStatus === "IN_PLAY" || apiStatus === "PAUSED") return "live";
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

async function fetchFootballMatches() {
    const response = await fetch(FOOTBALL_API_URL, {
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

function normalizeMatch(apiMatch) {
    const actualHome = apiMatch.score?.fullTime?.home;
    const actualAway = apiMatch.score?.fullTime?.away;

    const actualTeam1Goals = Number.isInteger(actualHome) ? actualHome : null;
    const actualTeam2Goals = Number.isInteger(actualAway) ? actualAway : null;

    const mappedStatus = mapStatus(apiMatch.status);
    const kickoffTime = new Date(apiMatch.utcDate).getTime();

    const hasActualScore =
        actualTeam1Goals !== null &&
        actualTeam2Goals !== null;

    const isStaleLiveMatch =
        mappedStatus === "live" &&
        hasActualScore &&
        Number.isFinite(kickoffTime) &&
        Date.now() - kickoffTime > STALE_LIVE_MATCH_MS;

    const finalStatus = isStaleLiveMatch ? "completed" : mappedStatus;

    if (isStaleLiveMatch) {
        console.log(
            `Treating stale live match as completed: ${apiMatch.homeTeam?.name} vs ${apiMatch.awayTeam?.name}`
        );
    }

    return {
        external_id: String(apiMatch.id),
        team1: toArabicTeamName(apiMatch.homeTeam?.name),
        team2: toArabicTeamName(apiMatch.awayTeam?.name),
        kickoff_at: apiMatch.utcDate,
        status: finalStatus,
        actual_team1_goals: actualTeam1Goals,
        actual_team2_goals: actualTeam2Goals,
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

async function recalculatePointsForCompletedMatch(match) {
    if (
        match.status !== "completed" ||
        match.actual_team1_goals === null ||
        match.actual_team2_goals === null
    ) {
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

async function main() {
    console.log("Starting World Cup sync...");

    const apiMatches = await fetchFootballMatches();

    const normalizedMatches = apiMatches
        .map(normalizeMatch)
        .filter((match) => match.team1 !== "غير محدد" && match.team2 !== "غير محدد");

    console.log(`Fetched ${normalizedMatches.length} matches.`);

    await upsertMatches(normalizedMatches);

    const matchesToScore = normalizedMatches.filter(
        (match) => match.status === "completed"
    );

    console.log(`Matches ready for scoring: ${matchesToScore.length}`);

    for (const match of matchesToScore) {
        await recalculatePointsForCompletedMatch(match);
    }

    console.log("World Cup sync completed.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});