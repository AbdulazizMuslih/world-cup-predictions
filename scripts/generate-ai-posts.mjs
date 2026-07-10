import crypto from "node:crypto";
import fs from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const AI_BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const AI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL;
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.72);
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 9000);

const EXPECTED_WORLD_CUP_MATCH_COUNT = Number(process.env.EXPECTED_WORLD_CUP_MATCH_COUNT || 104);
const ALLOW_FINAL_PREVIEW = String(process.env.ALLOW_FINAL_PREVIEW || "false").toLowerCase() === "true";
const PUBLISH_VISIBLE = String(process.env.PUBLISH_VISIBLE || "false").toLowerCase() === "true";
const RESET_EXISTING_FINAL_AI = String(process.env.RESET_EXISTING_FINAL_AI || "true").toLowerCase() !== "false";
const GENERATE_PROFILES = String(process.env.GENERATE_PROFILES || "true").toLowerCase() !== "false";
const MAX_HIGHLIGHTS = Math.min(90, Math.max(20, Number(process.env.MAX_HIGHLIGHTS || 60)));
const MIN_APPROVED_EVENT_NOTES = Math.max(0, Number(process.env.MIN_APPROVED_EVENT_NOTES || 0));
const REQUIRE_EVENT_NOTES_FOR_PUBLISH = String(process.env.REQUIRE_EVENT_NOTES_FOR_PUBLISH || "false").toLowerCase() === "true";
const USE_TRUSTED_EVENT_NOTES = String(process.env.USE_TRUSTED_EVENT_NOTES || "true").toLowerCase() !== "false";
const MAX_EVENT_NOTES_FOR_AI = Math.max(30, Math.min(180, Number(process.env.MAX_EVENT_NOTES_FOR_AI || 120)));
const TRUSTED_EVENT_SOURCE_PATTERNS = (process.env.TRUSTED_EVENT_SOURCE_PATTERNS || "Football-Data.org,API-Football,GDELT")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const POSTS_TABLE = "ai_posts";
const EVENT_NOTES_TABLE = "final_event_notes";
const FINAL_HIGHLIGHTS_SECTION = "final_highlights";
const FINAL_PROFILE_SECTION = "final_profile";
const GENERATOR_VERSION = "wc-final-recap-gemini-v2-event-notes";

const FEMALE_NAMES = new Set([
    "منار",
    "أمل",
    "امل",
    "إلهام",
    "الهام",
    "رحاب",
    "غادة",
    "تالين",
    "لمار",
    "سديم"
]);

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!AI_API_KEY) throw new Error("Missing AI_API_KEY or OPENAI_API_KEY");
if (!AI_MODEL) throw new Error("Missing AI_MODEL or OPENAI_MODEL");
if (!Number.isInteger(EXPECTED_WORLD_CUP_MATCH_COUNT) || EXPECTED_WORLD_CUP_MATCH_COUNT < 1) {
    throw new Error("EXPECTED_WORLD_CUP_MATCH_COUNT must be a positive integer");
}

async function main() {
    const factsPack = await buildFactsPack();

    console.log("FINAL AI GENERATION FACT SUMMARY");
    console.log(JSON.stringify({
        expectedMatches: EXPECTED_WORLD_CUP_MATCH_COUNT,
        totalMatchesInDb: factsPack.audit.totalMatchesInDb,
        completedMatches: factsPack.audit.completedMatches,
        remainingExpectedMatches: factsPack.audit.remainingExpectedMatches,
        activeParticipants: factsPack.audit.activeParticipants,
        publishVisible: PUBLISH_VISIBLE,
        allowPreview: ALLOW_FINAL_PREVIEW,
        resetExisting: RESET_EXISTING_FINAL_AI,
        maxHighlights: MAX_HIGHLIGHTS,
        approvedEventNotes: factsPack.audit.approvedEventNotes,
        draftEventNotes: factsPack.audit.draftEventNotes,
        eventNotesRequiredForPublish: REQUIRE_EVENT_NOTES_FOR_PUBLISH,
        useTrustedEventNotes: USE_TRUSTED_EVENT_NOTES,
        maxEventNotesForAi: MAX_EVENT_NOTES_FOR_AI
    }, null, 2));

    if (!factsPack.audit.finalDataReady && !ALLOW_FINAL_PREVIEW) {
        throw new Error(
            `Final data is not ready. Completed ${factsPack.audit.completedMatches}/${EXPECTED_WORLD_CUP_MATCH_COUNT}. ` +
            `Use ALLOW_FINAL_PREVIEW=true only for private testing, not publishing.`
        );
    }

    if (PUBLISH_VISIBLE && REQUIRE_EVENT_NOTES_FOR_PUBLISH && factsPack.audit.approvedEventNotes < Math.max(1, MIN_APPROVED_EVENT_NOTES)) {
        throw new Error(
            `Publishing is blocked: approved final_event_notes=${factsPack.audit.approvedEventNotes}. ` +
            `Add/review real event notes first, or keep PUBLISH_VISIBLE=false for drafts.`
        );
    }

    if (factsPack.audit.approvedEventNotes < MIN_APPROVED_EVENT_NOTES) {
        console.warn(
            `Only ${factsPack.audit.approvedEventNotes} approved final_event_notes found; ` +
            `requested minimum is ${MIN_APPROVED_EVENT_NOTES}. Contest-data highlights can still be drafted.`
        );
    }

    const aiOutput = await generateFinalContent(factsPack);
    const rows = normalizeAiOutputToRows(aiOutput, factsPack);

    if (rows.length === 0) {
        throw new Error("AI returned no valid rows to save.");
    }

    if (RESET_EXISTING_FINAL_AI) {
        await clearExistingFinalAiRows();
    }

    await insertRows(rows);

    console.log(`Inserted ${rows.length} row(s) into ${POSTS_TABLE}.`);
    console.log(PUBLISH_VISIBLE
        ? "Rows were inserted as visible=true. They can appear on the site."
        : "Rows were inserted as visible=false. Review/correct them in Supabase, then publish by setting visible=true."
    );
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

async function optionalSupabaseFetch(path) {
    try {
        return await supabaseFetch(path);
    } catch (error) {
        console.warn(`Optional Supabase read skipped for ${path}: ${error.message}`);
        return [];
    }
}
async function loadFinalEventNotes() {
    const select = [
        "id",
        "match_id",
        "stage",
        "event_type",
        "mood",
        "title_ar",
        "details_ar",
        "source_url",
        "source_name",
        "approved",
        "created_at"
    ].join(",");

    return optionalSupabaseFetch(
        `${EVENT_NOTES_TABLE}?select=${select}&order=created_at.asc`
    );
}

function isTrustedEventSource(note = {}) {
    if (note.approved === true) return true;
    if (!USE_TRUSTED_EVENT_NOTES) return false;

    const sourceName = String(note.source_name || "").toLowerCase();
    const sourceUrl = String(note.source_url || "").toLowerCase();

    return TRUSTED_EVENT_SOURCE_PATTERNS.some((pattern) => {
        return sourceName.includes(pattern) || sourceUrl.includes(pattern);
    });
}

function eventNotePriority(note = {}) {
    const type = String(note.event_type || "").toLowerCase();
    const mood = String(note.mood || "").toLowerCase();
    const priorityByType = {
        news: 120,
        red_card: 116,
        var: 114,
        penalty_shootout: 112,
        extra_time: 110,
        missed_penalty: 108,
        penalty: 104,
        goal: 100,
        goal_fest: 94,
        close_match: 88,
        clean_sheet: 78,
        official_result: 42,
        winner_confirmed: 24
    };
    let priority = priorityByType[type] || 60;
    if (["controversial", "dramatic", "sad", "proud", "exciting"].includes(mood)) priority += 8;
    if (note.source_url) priority += 4;
    return priority;
}

function selectTrustedEventNotes(notes = [], matches = []) {
    const seen = new Set();
    const sorted = (notes || [])
        .filter(isTrustedEventSource)
        .map((note) => ({
            ...note,
            _stageOrder: stageOrder(note.stage || getStageForEventNote(note, matches)),
            _priority: eventNotePriority(note)
        }))
        .sort((a, b) => a._stageOrder - b._stageOrder || b._priority - a._priority || String(a.created_at || "").localeCompare(String(b.created_at || "")));

    const selected = [];
    for (const note of sorted) {
        const key = [note.match_id || "general", note.event_type || "event", note.title_ar || ""].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        selected.push(note);
        if (selected.length >= MAX_EVENT_NOTES_FOR_AI) break;
    }
    return selected;
}

function countBy(values) {
    return values.reduce((acc, value) => {
        const key = value || "unspecified";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function getStageForEventNote(note, matches) {
    if (note.stage) return note.stage;
    if (!note.match_id) return null;
    return matches.find((match) => match.id === note.match_id)?.stage || null;
}

function publicEventNote(note, matches = []) {
    const linkedMatch = note.match_id
        ? matches.find((match) => match.id === note.match_id)
        : null;

    return {
        id: note.id,
        match_id: note.match_id || null,
        match_title: linkedMatch ? `${linkedMatch.team1} ضد ${linkedMatch.team2}` : null,
        match_score: linkedMatch && hasActualScore(linkedMatch)
            ? `${linkedMatch.actual_team1_goals}-${linkedMatch.actual_team2_goals}`
            : null,
        stage: note.stage || linkedMatch?.stage || null,
        stage_ar: getStageLabel(note.stage || linkedMatch?.stage),
        event_type: note.event_type || "event",
        mood: note.mood || "story",
        title_ar: note.title_ar,
        details_ar: note.details_ar,
        source_name: note.source_name || null,
        has_source_url: Boolean(note.source_url)
    };
}


function hasActualScore(match) {
    return Number.isInteger(match.actual_team1_goals) && Number.isInteger(match.actual_team2_goals);
}

function getOutcome(a, b) {
    if (a > b) return "team1";
    if (b > a) return "team2";
    return "draw";
}

function calculatePoints(prediction, match) {
    const p1 = Number(prediction.predicted_team1_goals);
    const p2 = Number(prediction.predicted_team2_goals);

    if (p1 === match.actual_team1_goals && p2 === match.actual_team2_goals) return 50;

    return getOutcome(p1, p2) === getOutcome(match.actual_team1_goals, match.actual_team2_goals) ? 10 : 0;
}

function groupBy(rows, key) {
    const map = new Map();
    for (const row of rows || []) {
        const value = row[key];
        if (!map.has(value)) map.set(value, []);
        map.get(value).push(row);
    }
    return map;
}

function percent(value, total) {
    return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}

async function loadPredictionsForMatches(matchIds) {
    if (!matchIds.length) return [];

    const all = [];
    const chunkSize = 80;

    for (let i = 0; i < matchIds.length; i += chunkSize) {
        const chunk = matchIds.slice(i, i + chunkSize);
        const rows = await supabaseFetch(
            "predictions" +
            `?match_id=in.(${chunk.map(encodeURIComponent).join(",")})` +
            "&select=id,participant_id,match_id,predicted_team1_goals,predicted_team2_goals,points,updated_at"
        );
        all.push(...(rows || []));
    }

    return all;
}

async function buildFactsPack() {
    const [participants, matches, allEventNotes] = await Promise.all([
        supabaseFetch("participants?select=id,name,active,sort_order&order=sort_order.asc"),
        supabaseFetch("matches?select=id,team1,team2,kickoff_at,status,stage,score_duration,winner_side,actual_team1_goals,actual_team2_goals&order=kickoff_at.asc"),
        loadFinalEventNotes()
    ]);

    const allParticipants = participants || [];
    const activeParticipants = allParticipants.filter((participant) => participant.active !== false);
    const activeParticipantIds = new Set(activeParticipants.map((participant) => String(participant.id)));
    const participantMap = new Map(activeParticipants.map((participant) => [String(participant.id), participant]));
    const allMatches = matches || [];
    const allEventNoteRows = allEventNotes || [];
    const trustedEventNotes = selectTrustedEventNotes(allEventNoteRows, allMatches);
    const approvedEventNotes = trustedEventNotes;
    const draftEventNotes = allEventNoteRows.filter((note) => note.approved !== true);
    const completedMatches = allMatches.filter(hasActualScore);
    const completedIds = completedMatches.map((match) => match.id);
    const rawPredictions = await loadPredictionsForMatches(completedIds);
    const predictions = rawPredictions.filter((prediction) => activeParticipantIds.has(String(prediction.participant_id)));
    const predictionsByMatch = groupBy(predictions, "match_id");
    const predictionsByParticipant = groupBy(predictions, "participant_id");
    const participantRows = buildParticipantFacts(activeParticipants, completedMatches, predictionsByParticipant);
    const rankedParticipants = rankParticipants(participantRows);
    const matchFacts = buildMatchFacts(completedMatches, predictionsByMatch, participantMap, activeParticipants.length);
    const stageFacts = buildStageFacts(completedMatches, matchFacts, activeParticipants.length);
    const eventNotesByMatch = groupBy(approvedEventNotes.filter((note) => note.match_id), "match_id");
    const eventNotesWithoutMatch = approvedEventNotes.filter((note) => !note.match_id);
    const factHighlights = buildCandidateHighlightFacts({
        rankedParticipants,
        matchFacts,
        stageFacts,
        activeParticipants,
        eventNotesByMatch,
        eventNotesWithoutMatch
    });

    return {
        generator: {
            version: GENERATOR_VERSION,
            rule: "Numbers and facts are calculated in code. AI writes only short Arabic wording from this pack."
        },
        audit: {
            expectedMatches: EXPECTED_WORLD_CUP_MATCH_COUNT,
            totalMatchesInDb: allMatches.length,
            completedMatches: completedMatches.length,
            remainingExpectedMatches: Math.max(0, EXPECTED_WORLD_CUP_MATCH_COUNT - completedMatches.length),
            missingFixtureRows: Math.max(0, EXPECTED_WORLD_CUP_MATCH_COUNT - allMatches.length),
            activeParticipants: activeParticipants.length,
            inactiveParticipants: allParticipants.filter((p) => p.active === false).map((p) => p.name),
            approvedEventNotes: approvedEventNotes.length,
            rawEventNotes: allEventNoteRows.length,
            draftEventNotes: draftEventNotes.length,
            trustedEventNotesUsed: approvedEventNotes.length,
            approvedEventNotesWithSource: approvedEventNotes.filter((note) => Boolean(note.source_url || note.source_name)).length,
            approvedEventNotesByStage: countBy(approvedEventNotes.map((note) => note.stage || getStageForEventNote(note, allMatches) || "unspecified")),
            approvedEventNotesByMood: countBy(approvedEventNotes.map((note) => note.mood || "unspecified")),
            finalDataReady: allMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT && completedMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT && allMatches.every(hasActualScore)
        },
        language: {
            femaleNames: [...FEMALE_NAMES],
            participantLanguage: activeParticipants.map((participant) => ({
                name: participant.name,
                gender: FEMALE_NAMES.has(String(participant.name).trim()) ? "female" : "male"
            }))
        },
        contest: {
            activeParticipants: activeParticipants.map((participant) => ({ id: participant.id, name: participant.name })),
            leaderboard: rankedParticipants.map(publicParticipantFact),
            stages: stageFacts,
            matches: matchFacts.map(publicMatchFact),
            eventNotes: approvedEventNotes.map((note) => publicEventNote(note, allMatches)),
            candidateHighlights: factHighlights
        },
        strictRules: [
            "اكتب بالعربية فقط.",
            "لا تخترع نتائج أو بطاقات حمراء أو هوشات أو أحداث كرة قدم غير موجودة حرفياً في eventNotes أو match facts.",
            "أي منشور عن حدث كروي حقيقي يجب أن يعتمد على eventNotes فقط، ويفضل ذكر source_note_id في source_fact.",
            "eventNotes قد تكون approved=true أو من مصدر موثوق مثل Football-Data/API-Football/GDELT حسب إعدادات السكربت، فلا تستخدم شيئاً خارجها.",
            "الأضواء ليست شارات. اكتبها كمنشورات/لقطات timeline ممتعة، حزينة، فخورة، مثيرة للجدل، حماسية، أو مفاجئة.",
            "لا تجعل القصة عن البطل فقط. كل مشارك نشط يجب أن يظهر مرة واحدة على الأقل في الأضواء.",
            "لا تفضح قلة المشاركة ولا تسخر من أحد.",
            "استخدم ضمائر صحيحة للأسماء النسائية المذكورة في participantLanguage.",
            "كل منشور: عنوان قصير جداً + وصف قصير. لا مقالات.",
            "إذا لم توجد معلومة كافية عن حدث كروي خارجي، تجاهله ولا تخترعه."
        ]
    };
}

function buildParticipantFacts(participants, completedMatches, predictionsByParticipant) {
    return participants.map((participant) => {
        const rows = predictionsByParticipant.get(participant.id) || [];
        let points = 0;
        let exactScores = 0;
        let correctOutcomes = 0;
        let correctPredictions = 0;
        let bestCorrectStreak = 0;
        let currentCorrectStreak = 0;
        const stageStats = new Map();

        for (const match of completedMatches) {
            const prediction = rows.find((row) => row.match_id === match.id);
            const stage = match.stage || "GROUP_STAGE";
            if (!stageStats.has(stage)) {
                stageStats.set(stage, { stage, points: 0, predictions: 0, exactScores: 0, correctPredictions: 0 });
            }

            if (!prediction) {
                currentCorrectStreak = 0;
                continue;
            }

            const earned = calculatePoints(prediction, match);
            const stageRow = stageStats.get(stage);
            points += earned;
            stageRow.points += earned;
            stageRow.predictions += 1;

            if (earned === 50) {
                exactScores += 1;
                correctPredictions += 1;
                stageRow.exactScores += 1;
                stageRow.correctPredictions += 1;
                currentCorrectStreak += 1;
            } else if (earned === 10) {
                correctOutcomes += 1;
                correctPredictions += 1;
                stageRow.correctPredictions += 1;
                currentCorrectStreak += 1;
            } else {
                currentCorrectStreak = 0;
            }

            bestCorrectStreak = Math.max(bestCorrectStreak, currentCorrectStreak);
        }

        const bestStage = [...stageStats.values()]
            .filter((stage) => stage.predictions > 0)
            .sort((a, b) => b.points - a.points || b.correctPredictions - a.correctPredictions)[0] || null;

        return {
            id: participant.id,
            name: participant.name,
            gender: FEMALE_NAMES.has(String(participant.name).trim()) ? "female" : "male",
            points,
            predictions: rows.length,
            missing: Math.max(0, completedMatches.length - rows.length),
            exactScores,
            correctOutcomes,
            correctPredictions,
            accuracyPercent: percent(correctPredictions, rows.length),
            bestCorrectStreak,
            bestStage
        };
    });
}

function rankParticipants(rows) {
    return [...rows]
        .sort((a, b) => (
            b.points - a.points ||
            b.correctPredictions - a.correctPredictions ||
            b.exactScores - a.exactScores ||
            a.name.localeCompare(b.name, "ar")
        ))
        .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildMatchFacts(matches, predictionsByMatch, participantMap, participantCount) {
    return matches.map((match, index) => {
        const rows = predictionsByMatch.get(match.id) || [];
        const score = `${match.actual_team1_goals}-${match.actual_team2_goals}`;
        const scoreCounts = new Map();
        const exactNames = [];
        const correctNames = [];
        const zeroNames = [];
        let awardedPoints = 0;

        for (const prediction of rows) {
            const participant = participantMap.get(String(prediction.participant_id));
            if (!participant) continue;
            const predictedScore = `${prediction.predicted_team1_goals}-${prediction.predicted_team2_goals}`;
            scoreCounts.set(predictedScore, (scoreCounts.get(predictedScore) || 0) + 1);
            const points = calculatePoints(prediction, match);
            awardedPoints += points;
            if (points === 50) exactNames.push(participant.name);
            else if (points === 10) correctNames.push(participant.name);
            else zeroNames.push(participant.name);
        }

        const mostCommonPrediction = [...scoreCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        const uniqueCorrectNames = [...exactNames, ...correctNames].filter((name) => {
            return [...exactNames, ...correctNames].filter((item) => item === name).length === 1;
        });

        return {
            id: match.id,
            number: index + 1,
            title: `${match.team1} ضد ${match.team2}`,
            stage: match.stage || "GROUP_STAGE",
            kickoff_at: match.kickoff_at,
            score,
            predictions: rows.length,
            missing: Math.max(0, participantCount - rows.length),
            coveragePercent: percent(rows.length, participantCount),
            awardedPoints,
            exactCount: exactNames.length,
            exactNames,
            correctCount: correctNames.length,
            correctNames,
            zeroCount: zeroNames.length,
            zeroOrMissingPercent: percent(zeroNames.length + Math.max(0, participantCount - rows.length), participantCount),
            mostCommonPrediction: mostCommonPrediction ? { score: mostCommonPrediction[0], count: mostCommonPrediction[1], wasActual: mostCommonPrediction[0] === score } : null,
            uniqueCorrectNames: uniqueCorrectNames.slice(0, 6)
        };
    });
}

function buildStageFacts(matches, matchFacts, participantCount) {
    const groups = groupBy(matchFacts, "stage");
    return [...groups.entries()].map(([stage, rows]) => {
        const awardedPoints = rows.reduce((sum, row) => sum + row.awardedPoints, 0);
        const predictions = rows.reduce((sum, row) => sum + row.predictions, 0);
        const exactCount = rows.reduce((sum, row) => sum + row.exactCount, 0);
        const possible = rows.length * participantCount;
        return {
            stage,
            label_ar: getStageLabel(stage),
            matches: rows.length,
            predictions,
            awardedPoints,
            exactCount,
            averagePointsPerPossiblePrediction: possible > 0 ? Number((awardedPoints / possible).toFixed(2)) : 0,
            bestMatch: rows.sort((a, b) => b.awardedPoints - a.awardedPoints)[0]?.title || null,
            hardestMatch: rows.sort((a, b) => b.zeroOrMissingPercent - a.zeroOrMissingPercent)[0]?.title || null
        };
    }).sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));
}

function buildCandidateHighlightFacts({ rankedParticipants, matchFacts, stageFacts, activeParticipants, eventNotesByMatch, eventNotesWithoutMatch = [] }) {
    const facts = [];
    const add = (type, title, data) => facts.push({ type, title, data });

    add("season_open", "افتتاح القصة", { matches: matchFacts.length, participants: activeParticipants.length });

    for (const note of eventNotesWithoutMatch) {
        add("verified_worldcup_event", note.title_ar || "حدث موثق", {
            note: publicEventNote(note),
            source_note_id: note.id
        });
    }

    for (const stage of stageFacts) {
        add("stage_summary", `مرحلة ${stage.label_ar}`, stage);
    }

    for (const match of [...matchFacts].sort((a, b) => b.awardedPoints - a.awardedPoints).slice(0, 12)) {
        add("generous_match", "مباراة وزعت نقاط", publicMatchFact(match));
    }

    for (const match of [...matchFacts].sort((a, b) => b.zeroOrMissingPercent - a.zeroOrMissingPercent).slice(0, 12)) {
        add("hard_match", "مباراة صعبة على التوقعات", publicMatchFact(match));
    }

    for (const match of matchFacts.filter((row) => row.exactCount >= 2).slice(0, 16)) {
        add("exact_score_moment", "بالملّي الجماعي", publicMatchFact(match));
    }

    for (const match of matchFacts.filter((row) => row.uniqueCorrectNames.length > 0).slice(0, 16)) {
        add("unique_correct_moment", "واحد شافها صح", publicMatchFact(match));
    }

    for (const participant of rankedParticipants) {
        add("participant_spotlight", `لقطة ${participant.name}`, publicParticipantFact(participant));
    }

    for (const match of matchFacts) {
        const notes = eventNotesByMatch.get(match.id) || [];
        for (const note of notes) {
            add("verified_worldcup_match_event", note.title_ar || "حدث في المباراة", {
                match: publicMatchFact(match),
                note: publicEventNote(note),
                source_note_id: note.id
            });
        }
    }

    return facts.slice(0, 140);
}

function publicParticipantFact(row) {
    return {
        name: row.name,
        gender: row.gender,
        rank: row.rank,
        points: row.points,
        predictions: row.predictions,
        exactScores: row.exactScores,
        correctOutcomes: row.correctOutcomes,
        correctPredictions: row.correctPredictions,
        accuracyPercent: row.accuracyPercent,
        bestCorrectStreak: row.bestCorrectStreak,
        bestStage: row.bestStage ? {
            stage: row.bestStage.stage,
            label_ar: getStageLabel(row.bestStage.stage),
            points: row.bestStage.points,
            predictions: row.bestStage.predictions
        } : null
    };
}

function publicMatchFact(match) {
    return {
        id: match.id,
        number: match.number,
        title: match.title,
        stage: match.stage,
        stageLabel: getStageLabel(match.stage),
        score: match.score,
        predictions: match.predictions,
        missing: match.missing,
        coveragePercent: match.coveragePercent,
        awardedPoints: match.awardedPoints,
        exactCount: match.exactCount,
        exactNames: match.exactNames.slice(0, 8),
        correctCount: match.correctCount,
        correctNames: match.correctNames.slice(0, 8),
        zeroOrMissingPercent: match.zeroOrMissingPercent,
        mostCommonPrediction: match.mostCommonPrediction,
        uniqueCorrectNames: match.uniqueCorrectNames.slice(0, 6)
    };
}

function getStageLabel(stage) {
    const labels = {
        GROUP_STAGE: "دور المجموعات",
        LAST_32: "دور الـ32",
        LAST_16: "دور الـ16",
        QUARTER_FINALS: "ربع النهائي",
        SEMI_FINALS: "نصف النهائي",
        THIRD_PLACE: "المركز الثالث",
        FINAL: "النهائي"
    };
    return labels[stage] || stage || "مرحلة غير محددة";
}

function stageOrder(stage) {
    const index = ["GROUP_STAGE", "LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"].indexOf(stage);
    return index === -1 ? 999 : index;
}

async function generateFinalContent(factsPack) {
    const prompt = buildPrompt(factsPack);
    const messages = [
        {
            role: "system",
            content: "أنت كاتب عربي خفيف الظل لمسابقة توقعات عائلية/أصدقاء. تكتب منشورات قصيرة جداً من حقائق محسوبة فقط، ولا تخترع أي واقعة. أعد JSON صحيح فقط بدون markdown."
        },
        { role: "user", content: prompt }
    ];

    const content = await requestAiContent(messages, {
        temperature: AI_TEMPERATURE,
        maxTokens: AI_MAX_TOKENS,
        responseFormat: true
    });

    try {
        return parseJsonContent(content);
    } catch (firstError) {
        writeAiDebugFile("ai-posts-invalid-output.json", content);
        console.warn("AI returned malformed JSON. Saved raw response to ai-posts-invalid-output.json and trying one repair call...");

        const repairedContent = await repairJsonWithAi(content);
        try {
            return parseJsonContent(repairedContent);
        } catch (repairError) {
            writeAiDebugFile("ai-posts-repair-output.json", repairedContent);
            throw new Error(
                `AI returned malformed JSON and the repair attempt also failed. ` +
                `Raw response saved to ai-posts-invalid-output.json. Repair response saved to ai-posts-repair-output.json. ` +
                `Original error: ${firstError.message}. Repair error: ${repairError.message}`
            );
        }
    }
}

async function requestAiContent(messages, options = {}) {
    const body = {
        model: AI_MODEL,
        temperature: options.temperature ?? AI_TEMPERATURE,
        max_tokens: options.maxTokens ?? AI_MAX_TOKENS,
        messages
    };

    if (options.responseFormat !== false) {
        body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI error ${response.status}: ${text}`);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
}

async function repairJsonWithAi(badContent) {
    const repairPrompt = `
حوّل النص التالي إلى JSON صحيح فقط.
لا تضف أي شرح.
لا تغير المعنى.
لا تضف حقائق جديدة.
يجب أن يكون الشكل النهائي كائناً فيه highlights و profile_messages فقط.

النص المراد إصلاحه:
${String(badContent || "").slice(0, 45000)}
`.trim();

    return requestAiContent([
        {
            role: "system",
            content: "أنت أداة إصلاح JSON. مهمتك الوحيدة تحويل النص إلى JSON صالح فقط، بدون markdown وبدون شرح."
        },
        { role: "user", content: repairPrompt }
    ], {
        temperature: 0,
        maxTokens: AI_MAX_TOKENS,
        responseFormat: true
    });
}

function writeAiDebugFile(filename, content) {
    try {
        fs.writeFileSync(filename, String(content || ""), "utf8");
    } catch (error) {
        console.warn(`Could not write ${filename}: ${error.message}`);
    }
}

function buildPrompt(factsPack) {
    return `
اكتب محتوى ختام مسابقة توقعات كأس العالم 2026 من هذه البيانات فقط.

المطلوب JSON فقط بهذا الشكل:
{
  "highlights": [
    {
      "title_ar": "عنوان قصير",
      "body_ar": "وصف قصير جداً",
      "icon": "✨",
      "category": "timeline|match|participant|emotional|fun|stage",
      "stage_ar": "دور المجموعات أو غيره",
      "participant_names": ["اسم"],
      "source_fact": "وصف مختصر للحقيقة المستخدمة",
      "source_note_ids": ["id من final_event_notes إذا كان المنشور عن حدث كروي حقيقي"]
    }
  ],
  "profile_messages": [
    {
      "participant_name": "اسم مشارك نشط",
      "title_ar": "رسالة ختام",
      "body_ar": "رسالة قصيرة جداً لهذا المشارك",
      "icon": "✨"
    }
  ]
}

قواعد مهمة:
- أنشئ بين ${Math.min(45, MAX_HIGHLIGHTS)} و ${MAX_HIGHLIGHTS} منشور highlights إذا كانت البيانات تكفي.
- الأضواء ليست شارات ولا جوائز. لا تكتبها كـ "فلان أخذ شارة". اكتبها كمنشورات timeline: لقطة، مشهد، تحول، مفاجأة، لحظة جماعية، لحظة فخر، لحظة حزينة، أو حدث كروي موثق.
- وزّع المنشورات على المراحل بقدر الإمكان، ولا تجعل أول 10 منشورات عن المتصدر أو الفائز فقط.
- كل مشارك نشط يجب أن يظهر مرة واحدة على الأقل في highlights أو profile_messages، ويفضل في الاثنين.
- لا تجعل الصفحة عن صاحب المركز الأول فقط.
- لا تذكر أن أحدهم لم يشارك كثيراً أو فاته مباريات كثيرة.
- العنوان: 3 إلى 7 كلمات.
- الوصف: جملة واحدة، 12 إلى 24 كلمة تقريباً.
- استخدم ضمائر صحيحة. أسماء البنات موضحة في participantLanguage.
- لا تخترع أحداث كرة قدم مثل بطاقة حمراء، هوشة، إصابة، VAR، تصريح، احتفال، جدل، أو خبر بعد المباراة إلا إذا وجدت في eventNotes. إذا استخدمت eventNotes، ضع id الخاص بها داخل source_note_ids.
- لو لم توجد eventNotes، ركز على أحداث مسابقة التوقعات نفسها.
- لا تستخدم عبارة مكررة في أكثر من منشور.
- لا تستخدم كلام كثير. لا تستخدم عبارات مكررة. لا تستخدم عبارة "مو كثير كلام، بس ضربات نظيفة".

FACTS_JSON:
${JSON.stringify(factsPack, null, 2)}
`.trim();
}

function parseJsonContent(content) {
    const trimmed = stripMarkdownJsonFence(String(content || "").trim());
    const candidates = [
        trimmed,
        extractBalancedJsonObject(trimmed),
        lightRepairJsonText(trimmed),
        lightRepairJsonText(extractBalancedJsonObject(trimmed))
    ].filter(Boolean);

    let lastError = null;
    const seen = new Set();
    for (const candidate of candidates) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        try {
            return JSON.parse(candidate);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Could not parse AI JSON content.");
}

function stripMarkdownJsonFence(value) {
    return String(value || "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function extractBalancedJsonObject(value) {
    const text = String(value || "");
    const start = text.indexOf("{");
    if (start === -1) return "";

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
        const char = text[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === "{") {
            depth += 1;
        } else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, index + 1);
            }
        }
    }

    return text.slice(start);
}

function lightRepairJsonText(value) {
    return String(value || "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/}\s*\n\s*{/g, "},{")
        .replace(/]\s*\n\s*"profile_messages"/g, '],"profile_messages"')
        .trim();
}

function normalizeAiOutputToRows(output, factsPack) {
    const rows = [];
    const activeParticipants = factsPack.contest.activeParticipants || [];
    const participantByName = new Map(activeParticipants.map((participant) => [participant.name, participant]));
    const sourceCompletedMatchCount = factsPack.audit.completedMatches;
    const sourceMatchIds = (factsPack.contest.matches || []).map((match) => match.id);
    const sourceHashBase = hashObject({
        generator: GENERATOR_VERSION,
        completed: sourceCompletedMatchCount,
        leaderboard: factsPack.contest.leaderboard,
        stages: factsPack.contest.stages,
        matches: factsPack.contest.matches,
        eventNotes: factsPack.contest.eventNotes
    });

    const highlights = Array.isArray(output?.highlights) ? output.highlights : [];
    highlights.slice(0, MAX_HIGHLIGHTS).forEach((post, index) => {
        const title = cleanText(post.title_ar, 90);
        const body = cleanText(post.body_ar, 220);
        if (!title || !body) return;

        rows.push({
            section_key: FINAL_HIGHLIGHTS_SECTION,
            title_ar: title,
            subtitle_ar: cleanText(post.stage_ar || post.category || "أضواء الختام", 80),
            body_ar: body,
            icon: cleanText(post.icon || "✨", 8),
            cards_json: [{
                type: cleanText(post.category || "timeline", 40),
                stage_ar: cleanText(post.stage_ar || "", 80),
                participant_names: Array.isArray(post.participant_names) ? post.participant_names.slice(0, 6) : [],
                source_fact: cleanText(post.source_fact || "", 180),
                source_note_ids: Array.isArray(post.source_note_ids) ? post.source_note_ids.slice(0, 6) : []
            }],
            participant_id: null,
            source_completed_match_count: sourceCompletedMatchCount,
            source_match_ids: sourceMatchIds,
            source_hash: `${GENERATOR_VERSION}:${sourceHashBase}:highlight:${String(index + 1).padStart(2, "0")}`,
            display_order: 1000 - index,
            visible: PUBLISH_VISIBLE
        });
    });

    if (GENERATE_PROFILES) {
        const profileMessages = Array.isArray(output?.profile_messages) ? output.profile_messages : [];
        for (const participant of activeParticipants) {
            const message = profileMessages.find((item) => String(item.participant_name || "").trim() === participant.name);
            const title = cleanText(message?.title_ar || "رسالة ختام", 90);
            const body = cleanText(message?.body_ar || buildFallbackProfileMessage(participant.name, factsPack), 220);

            rows.push({
                section_key: FINAL_PROFILE_SECTION,
                title_ar: title,
                subtitle_ar: "رسالة شخصية قصيرة",
                body_ar: body,
                icon: cleanText(message?.icon || "✨", 8),
                cards_json: [{ type: "profile_final", participant_name: participant.name }],
                participant_id: participant.id,
                source_completed_match_count: sourceCompletedMatchCount,
                source_match_ids: sourceMatchIds,
                source_hash: `${GENERATOR_VERSION}:${sourceHashBase}:profile:${participant.id}`,
                display_order: 500,
                visible: PUBLISH_VISIBLE
            });
        }
    }

    return rows;
}

function buildFallbackProfileMessage(participantName, factsPack) {
    const row = factsPack.contest.leaderboard.find((item) => item.name === participantName);
    if (!row) return `${participantName} كان جزءاً من جو المسابقة، وهذا أهم من أي رقم.`;
    return `${participantName} ختم المسابقة بـ${row.points} نقطة و${row.correctPredictions} توقع صحيح. مشاركة تستاهل الذكر.`;
}

function cleanText(value, maxLength) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
        .trim();
}

function hashObject(value) {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

async function clearExistingFinalAiRows() {
    const sections = `${FINAL_HIGHLIGHTS_SECTION},${FINAL_PROFILE_SECTION}`;
    await supabaseFetch(`${POSTS_TABLE}?section_key=in.(${sections})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
    });
    console.log("Cleared existing final AI rows.");
}

async function insertRows(rows) {
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await supabaseFetch(POSTS_TABLE, {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(chunk)
        });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
