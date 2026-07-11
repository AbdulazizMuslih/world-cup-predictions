import crypto from "node:crypto";
import fs from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AI_PROVIDER = String(process.env.AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? "openrouter" : "openai")).toLowerCase();
const USING_OPENROUTER = AI_PROVIDER === "openrouter";
const DEFAULT_AI_BASE_URL = USING_OPENROUTER ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";

// Provider-specific precedence is important.
// If AI_PROVIDER=openrouter, ignore stale Gemini/OpenAI values left in AI_BASE_URL/AI_MODEL.
// Use OPENROUTER_* first, then fall back to generic AI_* only when the provider-specific value is absent.
const AI_API_KEY = USING_OPENROUTER
    ? (process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY)
    : (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
const AI_BASE_URL = (USING_OPENROUTER
    ? (process.env.OPENROUTER_BASE_URL || DEFAULT_AI_BASE_URL)
    : (process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL)
).replace(/\/$/, "");
const AI_MODEL = USING_OPENROUTER
    ? (process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "openrouter/free")
    : (process.env.AI_MODEL || process.env.OPENAI_MODEL);
const OPENROUTER_FALLBACK_MODELS = (process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const OPENROUTER_USE_FALLBACK_MODELS = String(process.env.OPENROUTER_USE_FALLBACK_MODELS || "false").toLowerCase() === "true";
const OPENROUTER_HTTP_REFERER = process.env.OPENROUTER_HTTP_REFERER || process.env.SITE_URL || "";
const OPENROUTER_APP_TITLE = process.env.OPENROUTER_APP_TITLE || "World Cup 2026 Predictions";
const AI_RESPONSE_FORMAT = String(process.env.AI_RESPONSE_FORMAT || (USING_OPENROUTER ? "false" : "true")).toLowerCase() !== "false";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.62);
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 9000);
const AI_REQUEST_RETRIES = Math.max(1, Number(process.env.AI_REQUEST_RETRIES || 4));
const AI_RETRY_BASE_DELAY_MS = Math.max(500, Number(process.env.AI_RETRY_BASE_DELAY_MS || 3500));
const AI_FALLBACK_ON_FAILURE = String(process.env.AI_FALLBACK_ON_FAILURE || "false").toLowerCase() === "true";
const AI_BATCH_GENERATION = String(process.env.AI_BATCH_GENERATION || "true").toLowerCase() !== "false";
const AI_BATCH_HIGHLIGHT_TARGET = Math.max(4, Math.min(12, Number(process.env.AI_BATCH_HIGHLIGHT_TARGET || 8)));
const AI_EVENT_NOTE_BATCH_SIZE = Math.max(8, Math.min(30, Number(process.env.AI_EVENT_NOTE_BATCH_SIZE || 18)));
const AI_FACT_BATCH_SIZE = Math.max(10, Math.min(40, Number(process.env.AI_FACT_BATCH_SIZE || 24)));
const AI_PROFILE_BATCH_SIZE = Math.max(3, Math.min(8, Number(process.env.AI_PROFILE_BATCH_SIZE || 6)));
const AI_BATCH_CHECKPOINT_FILE = process.env.AI_BATCH_CHECKPOINT_FILE || "ai-posts-batch-checkpoint.json";
const AI_RESUME_FROM_CHECKPOINT = String(process.env.AI_RESUME_FROM_CHECKPOINT || "true").toLowerCase() !== "false";
const AI_SAVE_BATCH_CHECKPOINT = String(process.env.AI_SAVE_BATCH_CHECKPOINT || "true").toLowerCase() !== "false";
const AI_CLEAR_CHECKPOINT_AFTER_INSERT = String(process.env.AI_CLEAR_CHECKPOINT_AFTER_INSERT || "true").toLowerCase() !== "false";
const AI_BATCH_DELAY_MS = Math.max(0, Number(process.env.AI_BATCH_DELAY_MS || 1200));
const AI_MAX_RETRY_AFTER_MS = Math.max(0, Number(process.env.AI_MAX_RETRY_AFTER_MS || 90000));
const AI_MAX_BATCHES_PER_RUN = Math.max(0, Number(process.env.AI_MAX_BATCHES_PER_RUN || 0));
const AI_INSERT_PARTIAL_ON_QUOTA = String(process.env.AI_INSERT_PARTIAL_ON_QUOTA || "false").toLowerCase() === "true";
const AI_INSERT_PARTIAL_ON_MAX_BATCHES = String(process.env.AI_INSERT_PARTIAL_ON_MAX_BATCHES || "false").toLowerCase() === "true";
const AI_INSERT_PARTIAL_ON_BATCH_FAILURE = String(process.env.AI_INSERT_PARTIAL_ON_BATCH_FAILURE || "true").toLowerCase() !== "false";
const AI_CONTINUE_ON_BATCH_FAILURE = String(process.env.AI_CONTINUE_ON_BATCH_FAILURE || "false").toLowerCase() === "true";
const AI_MAX_FAILED_BATCHES = Math.max(0, Number(process.env.AI_MAX_FAILED_BATCHES || 2));
const AI_MIN_HIGHLIGHTS_FOR_PARTIAL_INSERT = Math.max(1, Number(process.env.AI_MIN_HIGHLIGHTS_FOR_PARTIAL_INSERT || 20));
const AI_DISABLE_REPAIR_CALL = String(process.env.AI_DISABLE_REPAIR_CALL || (USING_OPENROUTER ? "true" : "false")).toLowerCase() === "true";
const AI_USE_EVENT_ONLY_BATCHES = String(process.env.AI_USE_EVENT_ONLY_BATCHES || "false").toLowerCase() === "true";
const AI_ENABLE_FILL_MATCHES = String(process.env.AI_ENABLE_FILL_MATCHES || "false").toLowerCase() === "true";
const AI_REQUIRE_CONTEST_SIGNAL = String(process.env.AI_REQUIRE_CONTEST_SIGNAL || "true").toLowerCase() !== "false";
const AI_ENABLE_CONTEST_MOMENT_BATCHES = String(process.env.AI_ENABLE_CONTEST_MOMENT_BATCHES || "false").toLowerCase() === "true";
const AI_INSERT_PARTIAL_ANY_STORY_COUNT = String(process.env.AI_INSERT_PARTIAL_ANY_STORY_COUNT || "false").toLowerCase() === "true";
const AI_STORY_SEED_BATCH_SIZE = Math.max(8, Math.min(28, Number(process.env.AI_STORY_SEED_BATCH_SIZE || 14)));
const AI_POST_TITLE_MAX_CHARS = Math.max(90, Math.min(170, Number(process.env.AI_POST_TITLE_MAX_CHARS || 140)));
const AI_POST_BODY_MAX_CHARS = Math.max(700, Math.min(1600, Number(process.env.AI_POST_BODY_MAX_CHARS || 1250)));

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
const GENERATOR_VERSION = "wc-final-recap-story-seeds-v7-highlight-types";

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
if (!AI_API_KEY) throw new Error("Missing AI_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY");
if (!AI_MODEL) throw new Error("Missing AI_MODEL, OPENAI_MODEL, or OPENROUTER_MODEL");
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
        maxEventNotesForAi: MAX_EVENT_NOTES_FOR_AI,
        aiFallbackOnFailure: AI_FALLBACK_ON_FAILURE,
        aiBatchGeneration: AI_BATCH_GENERATION,
        aiUseEventOnlyBatches: AI_USE_EVENT_ONLY_BATCHES,
        aiEnableFillMatches: AI_ENABLE_FILL_MATCHES,
        aiRequireContestSignal: AI_REQUIRE_CONTEST_SIGNAL,
        aiEnableContestMomentBatches: AI_ENABLE_CONTEST_MOMENT_BATCHES,
        aiInsertPartialAnyStoryCount: AI_INSERT_PARTIAL_ANY_STORY_COUNT,
        aiStorySeedBatchSize: AI_STORY_SEED_BATCH_SIZE,
        aiPostBodyMaxChars: AI_POST_BODY_MAX_CHARS,
        aiProvider: AI_PROVIDER,
        aiBaseUrl: AI_BASE_URL,
        aiModel: AI_MODEL,
        aiOpenRouterFallbackModels: OPENROUTER_FALLBACK_MODELS,
        openRouterUseFallbackModels: OPENROUTER_USE_FALLBACK_MODELS,
        aiResponseFormat: AI_RESPONSE_FORMAT,
        aiDisableRepairCall: AI_DISABLE_REPAIR_CALL,
        aiBatchHighlightTarget: AI_BATCH_HIGHLIGHT_TARGET,
        aiRequestRetries: AI_REQUEST_RETRIES,
        generateProfiles: GENERATE_PROFILES,
        aiMaxBatchesPerRun: AI_MAX_BATCHES_PER_RUN,
        aiInsertPartialOnQuota: AI_INSERT_PARTIAL_ON_QUOTA,
        aiInsertPartialOnMaxBatches: AI_INSERT_PARTIAL_ON_MAX_BATCHES,
        aiInsertPartialOnBatchFailure: AI_INSERT_PARTIAL_ON_BATCH_FAILURE,
        aiContinueOnBatchFailure: AI_CONTINUE_ON_BATCH_FAILURE,
        aiMaxFailedBatches: AI_MAX_FAILED_BATCHES,
        aiMinHighlightsForPartialInsert: AI_MIN_HIGHLIGHTS_FOR_PARTIAL_INSERT,
        aiResumeFromCheckpoint: AI_RESUME_FROM_CHECKPOINT,
        aiBatchCheckpointFile: AI_BATCH_CHECKPOINT_FILE
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
    clearBatchCheckpointAfterInsert();

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
            candidateHighlights: factHighlights,
            integratedStorySeeds: buildIntegratedStorySeeds({
                rankedParticipants,
                matchFacts,
                stageFacts,
                activeParticipants,
                approvedEventNotes,
                allMatches
            })
        },
        strictRules: [
            "اكتب بالعربية فقط.",
            "لا تخترع نتائج أو بطاقات حمراء أو هوشات أو أحداث كرة قدم غير موجودة حرفياً في eventNotes أو match facts.",
            "أي منشور عن حدث كروي حقيقي يجب أن يعتمد على eventNotes فقط، ويفضل ذكر source_note_id في source_fact.",
            "eventNotes قد تكون approved=true أو من مصدر موثوق مثل Football-Data/API-Football/GDELT حسب إعدادات السكربت، فلا تستخدم شيئاً خارجها.",
            "الأضواء ليست شارات وليست نتائج مباريات. اكتبها كمنشورات timeline ممتعة تربط المباراة بأثرها داخل مسابقة التوقعات.",
            "ابدأ من القصة: من قرأها؟ من استفاد؟ من انصدم؟ ما الذي تغير في الجو؟ ثم اذكر نتيجة المباراة كخلفية فقط.",
            "لا تجعل القصة عن البطل فقط. كل مشارك نشط يجب أن يظهر مرة واحدة على الأقل في الأضواء.",
            "لا تفضح قلة المشاركة ولا تسخر من أحد.",
            "استخدم ضمائر صحيحة للأسماء النسائية المذكورة في participantLanguage.",
            "لا تستخدم عبارات صحفية عامة مثل الجمهور كان متحمساً أو تداولت الأحاديث، ولا تتكلم عن جمهور غير موجود في البيانات.",
            "نتيجة بالملّي = 50 نقطة، والاتجاه الصحيح فقط = 10 نقاط. لا تخترع نقاطاً إضافية.",
            "كل منشور: عنوان قصصي واضح + وصف فيه 3 إلى 6 جمل قصيرة. لا مقالات طويلة ولا كروت صغيرة.",
            "إذا لم توجد معلومة كافية عن حدث كروي خارجي، تجاهله ولا تخترعه وركز على قصة المسابقة."
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
            score_duration: match.score_duration || null,
            winner_side: match.winner_side || null,
            totalGoals: Number(match.actual_team1_goals) + Number(match.actual_team2_goals),
            goalDifference: Math.abs(Number(match.actual_team1_goals) - Number(match.actual_team2_goals)),
            isDrawScore: Number(match.actual_team1_goals) === Number(match.actual_team2_goals),
            isKnockout: (match.stage || "GROUP_STAGE") !== "GROUP_STAGE",
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


function buildIntegratedStorySeeds({ rankedParticipants, matchFacts, stageFacts, activeParticipants, approvedEventNotes, allMatches }) {
    const notesByMatch = groupBy(approvedEventNotes.filter((note) => note.match_id), "match_id");
    const candidates = [];
    const seen = new Set();

    const usefulNotesForMatch = (match) => (notesByMatch.get(match.id) || [])
        .filter(isNarrativeEventNote)
        .sort((a, b) => eventNotePriority(b) - eventNotePriority(a))
        .slice(0, 3)
        .map((note) => publicEventNote(note, allMatches));

    const addCandidate = (seed) => {
        const key = [seed.type, seed.match?.id || seed.participant?.name || seed.stage?.stage || seed.title].join("|");
        if (seen.has(key)) return;
        if (seed.match && !isStoryWorthyMatch(seed.match, seed.verified_event_context || [])) return;
        seen.add(key);
        candidates.push(seed);
    };

    const leaderboardContext = rankedParticipants.slice(0, 6).map((row) => `${row.rank}. ${row.name} (${row.points} نقطة)`).join("، ");

    for (const stage of stageFacts) {
        const isMajorStage = ["GROUP_STAGE", "LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"].includes(stage.stage);
        if (!isMajorStage) continue;
        addCandidate({
            type: "stage_mood",
            priority: 88 - stageOrder(stage.stage),
            title: `${stage.label_ar}: مزاج المرحلة`,
            stage,
            post_blueprint: {
                kind: "stage_mood",
                hook_style: "افتحها كصفحة من يوميات المسابقة، لا كملخص أرقام.",
                mood: buildStageEmotion(stage),
                story_question: "كيف كان شعور المرحلة على المشاركين: سخية، قاسية، مخادعة، أم فاتحة للشهية؟",
                must_include_facts: compactFacts([
                    `${stage.matches} مباراة في ${stage.label_ar}`,
                    `${stage.exactCount} نتيجة بالملّي في المرحلة`,
                    `${stage.awardedPoints} نقطة موزعة في المرحلة`,
                    stage.bestMatch ? `مباراة فتحت نقاطاً كثيرة: ${stage.bestMatch}` : null,
                    stage.hardestMatch ? `مباراة قاسية على التوقعات: ${stage.hardestMatch}` : null,
                    leaderboardContext ? `صورة الصدارة وقت الكتابة: ${leaderboardContext}` : null
                ]),
                avoid: COMMON_STORY_AVOID_LIST
            },
            required_participant_names: rankedParticipants.slice(0, 3).map((row) => row.name),
            verified_event_context: [],
            writing_angle: "اكتب منشور مرحلة ممتع؛ الأرقام تظهر كتوابل للقصة فقط."
        });
    }

    const sortedMatches = [...matchFacts].sort((a, b) => scoreStoryCandidate(b, usefulNotesForMatch(b)) - scoreStoryCandidate(a, usefulNotesForMatch(a)));

    for (const match of sortedMatches.slice(0, 104)) {
        const notes = usefulNotesForMatch(match);
        const worldCupContext = buildWorldCupContext(match, notes);
        const storyTypes = classifyMatchStoryTypes(match, notes, worldCupContext);
        if (!storyTypes.length) continue;

        for (const storyType of storyTypes.slice(0, 2)) {
            const names = namesForStoryType(match, storyType).slice(0, 5);
            const story = buildStoryTypeBlueprint(match, storyType, names, worldCupContext);

            addCandidate({
                type: storyType,
                priority: scoreStoryCandidate(match, notes) + story.priorityBoost,
                title: story.seedTitle,
                match: publicMatchFact(match),
                verified_event_context: [...worldCupContext, ...notes].slice(0, 4),
                post_blueprint: {
                    kind: storyType,
                    hook_style: story.hookStyle,
                    mood: story.mood,
                    story_question: story.question,
                    why_it_matters: story.reasons,
                    must_include_facts: compactFacts([
                        `المباراة: ${match.title} (${getStageLabel(match.stage)})، النتيجة ${match.score}. اذكرها مرة واحدة فقط داخل النص ولا تبدأ بها.`,
                        match.exactCount > 0 ? `${match.exactCount} نتيجة بالملّي = 50 نقطة لكل نتيجة بالملّي` : null,
                        match.exactNames.length ? `أسماء بالملّي: ${match.exactNames.slice(0, 5).join("، ")}` : null,
                        match.correctCount > 0 ? `${match.correctCount} توقع صحيح للاتجاه = 10 نقاط لكل توقع صحيح` : null,
                        names.length ? `أسماء محورية للقصة: ${names.join("، ")}` : null,
                        match.awardedPoints >= 90 ? `${match.awardedPoints} نقطة وزعتها المباراة على المشاركين` : null,
                        match.zeroOrMissingPercent >= 65 ? `${match.zeroOrMissingPercent}% خرجوا بلا نقاط أو بلا توقع؛ لا تسمّ أحداً منهم` : null,
                        match.mostCommonPrediction && !match.mostCommonPrediction.wasActual ? `التوقع الأكثر تكراراً كان ${match.mostCommonPrediction.score} عند ${match.mostCommonPrediction.count} مشاركين، لكنه لم يطابق النتيجة` : null,
                        story.specialFact
                    ]),
                    real_world_cup_context: worldCupContext,
                    real_event_notes: notes,
                    avoid: COMMON_STORY_AVOID_LIST
                },
                required_participant_names: names,
                writing_angle: story.writingAngle
            });
        }
    }

    for (const participant of rankedParticipants) {
        const lang = participantLanguageWords(participant.name, participant.gender);
        const highlightBits = [];
        if (participant.rank <= 3) highlightBits.push(participant.gender === "female" ? `ختمت في المركز ${participant.rank}` : `ختم في المركز ${participant.rank}`);
        if (participant.points > 0) highlightBits.push(`${participant.points} نقطة`);
        if (participant.exactScores > 0) highlightBits.push(`${participant.exactScores} نتيجة بالملّي`);
        if (participant.correctPredictions > 0) highlightBits.push(`${participant.correctPredictions} توقع صحيح`);
        if (participant.bestCorrectStreak > 1) highlightBits.push(`سلسلة صحيحة وصلت ${participant.bestCorrectStreak}`);
        if (participant.bestStage) highlightBits.push(`أفضل مرحلة: ${participant.bestStage.label_ar} بـ${participant.bestStage.points} نقطة`);

        addCandidate({
            type: "participant_arc",
            priority: 76 - Math.min(45, participant.rank),
            participant,
            title: `لقطة ${participant.name}`,
            post_blueprint: {
                kind: "participant_arc",
                hook_style: `اكتب لقطة شخصية محترمة عن ${participant.name} كجزء من قصة المسابقة، لا كجائزة ولا ترتيب فقط.`,
                mood: "لقطة شخصية خفيفة",
                story_question: `ما الشيء الذي يميز حضور ${participant.name} في المسابقة؟`,
                must_include_facts: [`${participant.name}: ${highlightBits.join("، ") || `${lang.wasPart} من القصة`}.`],
                avoid: [...COMMON_STORY_AVOID_LIST, "لا تذكر الغياب", "لا تقل مشاركة قليلة", "لا تسخر"]
            },
            required_participant_names: [participant.name],
            verified_event_context: [],
            writing_angle: "اكتب لقطة إنسانية خفيفة، بالضمير الصحيح، وتجنب أسلوب بطاقة إنجاز."
        });
    }

    const caps = {
        real_event_plus_contest: 10,
        knockout_pressure: 9,
        popular_trap: 10,
        lone_reader: 8,
        exact_circle: 8,
        points_swing: 8,
        hard_stop: 8,
        stage_mood: 5,
        participant_arc: Math.max(8, Math.min(18, activeParticipants.length))
    };
    const typeCounts = new Map();

    return candidates
        .sort((a, b) => b.priority - a.priority || storyTypeOrder(a.type) - storyTypeOrder(b.type))
        .filter((seed) => {
            const count = typeCounts.get(seed.type) || 0;
            const cap = caps[seed.type] || 6;
            if (count >= cap) return false;
            typeCounts.set(seed.type, count + 1);
            return true;
        })
        .slice(0, 90);
}

const COMMON_STORY_AVOID_LIST = [
    "لا تبدأ بالنتيجة ولا بجملة: عندما انتهت المباراة",
    "لا تكتب: في مباراة كذا ضد كذا، حصل كذا",
    "لا تكرر قالب: النتيجة + من حصل على نقاط + تغير الترتيب",
    "لا تستخدم لهجة مصرية: كده، ما فيهاش، بيقرأوا، فارغين",
    "لا تستخدم عبارات عامة: أعادت تشكيل المزاج، كشفت القراء الهادئين، الثقة العمياء، الجمهور كان متحمساً، تداولت الأحاديث",
    "لا تجعلها خبر رياضي. اجعلها لقطة من مسابقة توقعات فيها روح وشخصيات",
    "لا تخترع VAR أو طرد أو إصابة أو مشاجرة أو تصريحات إذا لم توجد في real_event_notes"
];

function compactFacts(items = []) {
    return items.filter(Boolean).slice(0, 8);
}

function storyTypeOrder(type) {
    const order = {
        real_event_plus_contest: 1,
        knockout_pressure: 2,
        popular_trap: 3,
        lone_reader: 4,
        exact_circle: 5,
        points_swing: 6,
        hard_stop: 7,
        stage_mood: 8,
        participant_arc: 9
    };
    return order[type] || 99;
}

function isStoryWorthyMatch(match, notes = []) {
    const hasNarrativeContext = notes.length > 0 || buildWorldCupContext(match, []).length > 0;
    return hasNarrativeContext
        || match.stage !== "GROUP_STAGE"
        || match.exactCount >= 1
        || match.awardedPoints >= 120
        || match.zeroOrMissingPercent >= 70
        || (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual && match.mostCommonPrediction.count >= 3);
}

function scoreStoryCandidate(match, notes = []) {
    const worldCupContext = buildWorldCupContext(match, notes);
    return (
        (worldCupContext.length ? 38 : 0) +
        (notes.length ? 30 : 0) +
        (match.stage !== "GROUP_STAGE" ? 24 : 0) +
        (match.exactCount === 1 ? 26 : 0) +
        (match.exactCount >= 2 ? Math.min(70, match.exactCount * 18) : 0) +
        Math.min(55, match.awardedPoints / 6) +
        (match.zeroOrMissingPercent >= 70 ? 24 : 0) +
        (match.zeroOrMissingPercent >= 85 ? 22 : 0) +
        (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual ? 26 : 0) +
        (match.uniqueCorrectNames.length > 0 ? 18 : 0) +
        Math.max(0, 12 - stageOrder(match.stage))
    );
}

function classifyMatchStoryTypes(match, notes = [], worldCupContext = []) {
    const types = [];
    if (worldCupContext.length || notes.length) types.push("real_event_plus_contest");
    if (match.stage !== "GROUP_STAGE" && (match.exactCount > 0 || match.correctCount > 0 || match.zeroOrMissingPercent >= 65)) types.push("knockout_pressure");
    if (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual && match.mostCommonPrediction.count >= 3) types.push("popular_trap");
    if (match.exactCount === 1 || (match.uniqueCorrectNames.length > 0 && match.zeroOrMissingPercent >= 72)) types.push("lone_reader");
    if (match.exactCount >= 3) types.push("exact_circle");
    if (match.awardedPoints >= 170) types.push("points_swing");
    if (match.zeroOrMissingPercent >= 84) types.push("hard_stop");
    return [...new Set(types)].slice(0, 3);
}

function namesForStoryType(match, type) {
    if (type === "popular_trap" || type === "hard_stop") {
        return [...new Set([...match.exactNames, ...match.uniqueCorrectNames, ...match.correctNames])].slice(0, 5);
    }
    if (type === "lone_reader") {
        return [...new Set([...match.exactNames, ...match.uniqueCorrectNames])].slice(0, 4);
    }
    if (type === "exact_circle") return match.exactNames.slice(0, 5);
    if (type === "points_swing") return [...new Set([...match.exactNames, ...match.correctNames])].slice(0, 5);
    return [...new Set([...match.exactNames, ...match.uniqueCorrectNames, ...match.correctNames])].slice(0, 5);
}

function buildStoryTypeBlueprint(match, type, names = [], worldCupContext = []) {
    const nameText = names.length ? names.join("، ") : "الأسماء التي قرأت اللحظة";
    const popular = match.mostCommonPrediction;
    const blueprints = {
        real_event_plus_contest: {
            seedTitle: "حين دخلت كرة القدم في دفتر التوقعات",
            hookStyle: "افتح من الحدث الكروي الحقيقي، لكن اربطه فوراً بالمسابقة. لا تجعله تقرير مباراة.",
            mood: "واقع الملعب لمس جدول التوقعات",
            question: "كيف جعلت لقطة كروية موثقة التوقعات أكثر معنى؟",
            reasons: ["فيها سياق كروي موثق أو إقصائي يمكن أن يعطي النص روحاً حقيقية", "الأثر داخل المسابقة أهم من النتيجة نفسها"],
            specialFact: worldCupContext[0]?.details_ar || null,
            writingAngle: "استخدم الحدث الكروي كخلفية سينمائية قصيرة، ثم انتقل للأسماء والنقاط والصدمة داخل المسابقة.",
            priorityBoost: 22
        },
        knockout_pressure: {
            seedTitle: "ضغط الإقصائيات لا يرحم التوقعات",
            hookStyle: "افتح من ضغط المرحلة؛ كل توقع هنا أثقل لأن المباراة تقرّب منتخباً وتقصي آخر.",
            mood: "توتر إقصائي",
            question: "من تعامل مع ضغط المرحلة بهدوء؟ ومن استفاد من مباراة لا تشبه المجموعات؟",
            reasons: [`جاءت في ${getStageLabel(match.stage)} حيث الخطأ أثقل من مباراة عادية`, names.length ? `${nameText} ظهروا في لحظة ضغط` : null].filter(Boolean),
            specialFact: match.isDrawScore && match.winner_side ? "النتيجة الأصلية كانت تعادلاً في مباراة إقصائية، والحسم جاء بفائز بعد التعادل." : null,
            writingAngle: "اكتبها كمنشور ضغط إقصائي: الجملة الأولى عن الثقل، لا عن النتيجة.",
            priorityBoost: 18
        },
        popular_trap: {
            seedTitle: "الفخ الذي دخلته الأغلبية",
            hookStyle: "افتح من فكرة التوقع المريح الذي أغرى أكثر من شخص ثم خذلهم.",
            mood: "صفعة خفيفة للأغلبية",
            question: "لماذا كان السير خلف التوقع الشائع مكلفاً؟ ومن خرج من الزحمة؟",
            reasons: [popular ? `التوقع الأكثر تكراراً كان ${popular.score} عند ${popular.count} مشاركين ولم يطابق الواقع` : null, names.length ? `${nameText} كانوا خارج الطريق المزدحم` : null].filter(Boolean),
            specialFact: popular ? `التوقع الشائع ${popular.score} لم يطابق النتيجة ${match.score}` : null,
            writingAngle: "اكتبها كلقطة عن فخ الأغلبية؛ لا تكرر كلمة أغلبية أكثر من مرتين.",
            priorityBoost: 20
        },
        lone_reader: {
            seedTitle: "القراءة التي جاءت من خارج الزحمة",
            hookStyle: "افتح من شخص أو شخصين قرأوا المباراة بهدوء بينما البقية مروا عليها كأنها واضحة.",
            mood: "ذكاء هادئ",
            question: "ما الذي جعل هذه القراءة تستحق الأضواء؟",
            reasons: [names.length ? `${nameText} كانوا أسماء القصة` : null, `${match.zeroOrMissingPercent}% لم يستفيدوا من المباراة`].filter(Boolean),
            specialFact: match.exactCount === 1 ? "نتيجة واحدة فقط بالملّي في المباراة." : null,
            writingAngle: "اكتبها كقصة اسم/اسمين، لا كقائمة أرقام.",
            priorityBoost: 24
        },
        exact_circle: {
            seedTitle: "ليلة بالملّي ما مرت بهدوء",
            hookStyle: "افتح من فرحة مجموعة صغيرة مسكت النتيجة كاملة، كأنهم دخلوا المباراة ومعهم الورقة الصحيحة.",
            mood: "فرحة جماعية",
            question: "كيف صارت النتيجة الدقيقة لقطة مشتركة بين عدة مشاركين؟",
            reasons: [`${match.exactCount} نتائج بالملّي`, names.length ? `${nameText} في قلب اللقطة` : null].filter(Boolean),
            specialFact: `${match.exactCount} exact-score predictions in one match.` ,
            writingAngle: "اكتبها كفرحة جماعية قصيرة، لا كتعداد أسماء طويل.",
            priorityBoost: 14
        },
        points_swing: {
            seedTitle: "المباراة التي فتحت الخزنة",
            hookStyle: "افتح من فكرة أن مباراة واحدة سكبت نقاطاً كثيرة في الجدول وغيرت إحساس الجولة.",
            mood: "اندفاع نقاط",
            question: "كيف تحولت المباراة إلى محطة يتغير بعدها شكل المطاردة؟",
            reasons: [`وزعت ${match.awardedPoints} نقطة`, names.length ? `أبرز المستفيدين: ${nameText}` : null].filter(Boolean),
            specialFact: `${match.awardedPoints} نقطة موزعة في مباراة واحدة.`,
            writingAngle: "اكتبها كمنعطف نقاط، لا كجدول حسابات.",
            priorityBoost: 16
        },
        hard_stop: {
            seedTitle: "الليلة التي خرج فيها الجدول صامتاً",
            hookStyle: "افتح من قسوة المباراة على معظم المشاركين؛ لا تسمّ الخاسرين ولا تسخر.",
            mood: "قسوة وهدوء بعد الصدمة",
            question: "لماذا كانت هذه المباراة كأنها زر إيقاف مؤقت للنقاط؟",
            reasons: [`${match.zeroOrMissingPercent}% بلا نقاط أو بلا توقع`, names.length ? `${nameText} نجوا من الليلة` : null].filter(Boolean),
            specialFact: `${match.zeroOrMissingPercent}% لم يحصلوا على نقاط.`,
            writingAngle: "اكتبها بلطف: صدمة على الجدول، لا شماتة في المشاركين.",
            priorityBoost: 20
        }
    };
    return blueprints[type] || blueprints.points_swing;
}

function buildWorldCupContext(match = {}, notes = []) {
    const context = [];
    const duration = String(match.score_duration || "").toUpperCase();
    const stageLabel = getStageLabel(match.stage);
    const isKnockout = match.stage && match.stage !== "GROUP_STAGE";
    const totalGoals = Number(match.totalGoals || 0);
    const goalDifference = Number(match.goalDifference || 0);

    if (duration.includes("PENAL") || (isKnockout && match.isDrawScore && match.winner_side)) {
        context.push({
            type: "penalty_shootout_context",
            stage_ar: stageLabel,
            details_ar: "المباراة احتاجت إلى حسم بعد التعادل، وهذا يعطي التوقعات طابع ضغط أعلى من نتيجة عادية.",
            source: "matches.score_duration/winner_side"
        });
    } else if (duration.includes("EXTRA")) {
        context.push({
            type: "extra_time_context",
            stage_ar: stageLabel,
            details_ar: "المباراة امتدت لما بعد الوقت الأصلي، فصار أثرها على التوقعات أقرب إلى لحظة أعصاب لا مجرد نتيجة.",
            source: "matches.score_duration"
        });
    }

    if (isKnockout) {
        context.push({
            type: "knockout_context",
            stage_ar: stageLabel,
            details_ar: `هذه مباراة من ${stageLabel}، وبالتالي نتيجتها تعني استمرار منتخب وخروج آخر من الطريق.`,
            source: "matches.stage"
        });
    }

    if (notes.length) {
        for (const note of notes.slice(0, 2)) {
            context.push({
                type: note.event_type || "verified_event",
                stage_ar: note.stage_ar || stageLabel,
                details_ar: note.details_ar || note.title_ar,
                source_note_id: note.id,
                source: note.source_name || "final_event_notes"
            });
        }
    }

    if (totalGoals >= 5 && goalDifference <= 2) {
        context.push({
            type: "open_match_context",
            stage_ar: stageLabel,
            details_ar: "الأهداف الكثيرة قربت المباراة من إحساس الفوضى، لكنها لا تكفي وحدها لصناعة الأضواء إلا إذا انعكست على التوقعات.",
            source: "matches.score"
        });
    }

    return context.slice(0, 4);
}

function isNarrativeEventNote(note = {}) {
    const type = String(note.event_type || "").toLowerCase();
    const source = String(note.source_name || "").toLowerCase();
    const title = String(note.title_ar || "");
    const details = String(note.details_ar || "");
    const text = `${title} ${details}`;
    const rawTypes = new Set(["official_result", "winner_confirmed", "clean_sheet", "close_match", "goal_fest"]);
    if (rawTypes.has(type)) return false;
    if (source.includes("football-data") && !/(penalt|extra|var|red|card|injury|controvers|news|تصريح|جدل|طرد|إصابة|ركلات|ترجيح|أشواط|إضافية)/i.test(text)) return false;
    return true;
}

function buildStageEmotion(stage) {
    if (stage.averagePointsPerPossiblePrediction >= 8) return "مرحلة سخية، كثير من الناس لقوا فيها نقاط تنعش الترتيب.";
    if (stage.averagePointsPerPossiblePrediction <= 4) return "مرحلة قاسية؛ كانت تعطي إحساس أن التوقع السهل ممكن يختفي بسرعة.";
    if (stage.exactCount >= 20) return "مرحلة فيها لحظات كثيرة بالملّي، وكأن أكثر من شخص كان يقرأ السيناريو قبل المباراة.";
    return "مرحلة متوازنة، فيها لحظات فرح صغيرة ولحظات ضاعت على ناس كثير.";
}

function buildMatchStoryReasons(match, notes = []) {
    const reasons = [];
    if (notes.length) reasons.push("فيها حدث كروي موثق يمكن استخدامه كخلفية للقصة");
    if (match.exactCount >= 3) reasons.push(`${match.exactCount} نتائج بالملّي جعلت المباراة لقطة جماعية لا مجرد نتيجة`);
    else if (match.exactCount > 0) reasons.push(`${match.exactCount} نتيجة بالملّي أعطت أسماء محددة لقطة تستحق الذكر`);
    if (match.awardedPoints >= 180) reasons.push(`وزعت ${match.awardedPoints} نقطة، رقم كبير يكفي ليغيّر إحساس الجولة`);
    else if (match.awardedPoints >= 110) reasons.push(`وزعت ${match.awardedPoints} نقطة، وكانت سخية على مجموعة واضحة`);
    if (match.zeroOrMissingPercent >= 80) reasons.push(`${match.zeroOrMissingPercent}% بلا نقاط أو بلا توقع؛ مباراة قاسية على الأغلبية`);
    else if (match.zeroOrMissingPercent >= 68) reasons.push(`أغلب المشاركين لم يستفيدوا منها، لذلك لها طعم الصدمة الصغيرة`);
    if (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual) reasons.push(`أكثر توقع متكرر لم يطابق النتيجة، وهذا يصنع قصة عن ثقة الأغلبية التي لم تنجح`);
    if (match.uniqueCorrectNames.length) reasons.push(`فيها أسماء قرأت المباراة بشكل مختلف عن البقية: ${match.uniqueCorrectNames.slice(0, 4).join("، ")}`);
    if (match.stage !== "GROUP_STAGE") reasons.push(`جاءت في ${getStageLabel(match.stage)} حيث كل نقطة أثقل من المعتاد`);
    return reasons;
}

function buildSeedTitle(match, reasons) {
    if (match.exactCount >= 3) return `ليلة ${match.exactCount} توقعات بالملّي`;
    if (match.zeroOrMissingPercent >= 80) return "المباراة التي كسرت ثقة الأغلبية";
    if (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual) return "حين خذل التوقع الأكثر شعبية أصحابه";
    if (match.awardedPoints >= 180) return "المباراة التي فتحت خزنة النقاط";
    if (match.uniqueCorrectNames.length) return "أسماء قليلة شافت الطريق قبل البقية";
    if (reasons.some((reason) => /حدث كروي/.test(reason))) return "حين دخل خبر المباراة في قصة التوقعات";
    return "لقطة تستحق مكانها في الأضواء";
}

function chooseStoryKind(match, notes = []) {
    if (notes.length) return "real_event_plus_contest";
    if (match.exactCount >= 3) return "exact_score_party";
    if (match.zeroOrMissingPercent >= 80) return "collective_shock";
    if (match.awardedPoints >= 180) return "points_swing";
    if (match.uniqueCorrectNames.length) return "contrarian_read";
    return "contest_turning_point";
}

function buildOpeningAngle(match, notes = []) {
    if (notes.length) return "ابدأ من أثر المباراة داخل المسابقة، ثم اربط الحدث الكروي الموثق بالقصة بدون اختراع تفاصيل.";
    if (match.exactCount >= 3) return "ابدأ من فرحة النتائج بالملّي، كأن المباراة أعطت أكثر من شخص لقطة خاصة في نفس الليلة.";
    if (match.zeroOrMissingPercent >= 80) return "ابدأ من صدمة الأغلبية: مباراة دخلت عادية وخرجت كدرس في أن التوقع السهل ليس مضموناً.";
    if (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual) return "ابدأ من التوقع المتكرر الذي بدا مطمئناً ثم لم يطابق الواقع.";
    if (match.awardedPoints >= 180) return "ابدأ من فكرة أن المباراة فتحت باب النقاط، لا من النتيجة نفسها.";
    return "ابدأ من لحظة المسابقة: ماذا فعلت هذه المباراة في جو المشاركين؟";
}

function buildMatchEmotion(match) {
    if (match.zeroOrMissingPercent >= 80) return "صدمة وقلق خفيف";
    if (match.exactCount >= 3) return "فرحة جماعية ودقة بالملّي";
    if (match.awardedPoints >= 180) return "اندفاع في جدول النقاط";
    if (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual) return "مفاجأة للأغلبية";
    if (match.stage !== "GROUP_STAGE") return "ضغط الأدوار الإقصائية";
    return "لقطة صغيرة غيّرت مزاج الجولة";
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
        score_duration: match.score_duration || null,
        winner_side: match.winner_side || null,
        totalGoals: match.totalGoals,
        goalDifference: match.goalDifference,
        isDrawScore: match.isDrawScore,
        isKnockout: match.isKnockout,
        worldCupContext: buildWorldCupContext(match, []),
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
    if (AI_BATCH_GENERATION) {
        return generateFinalContentInBatches(factsPack);
    }

    const prompt = buildPrompt(factsPack);
    const messages = [
        {
            role: "system",
            content: "أنت كاتب عربي خفيف الظل لمسابقة توقعات عائلية/أصدقاء. تكتب منشورات قصيرة جداً من حقائق محسوبة فقط، ولا تخترع أي واقعة. أعد JSON صحيح فقط بدون markdown."
        },
        { role: "user", content: prompt }
    ];

    let content = "";
    try {
        content = await requestAiContent(messages, {
            temperature: AI_TEMPERATURE,
            maxTokens: AI_MAX_TOKENS,
            responseFormat: true
        });

        return parseJsonContent(content);
    } catch (firstError) {
        if (content) {
            writeAiDebugFile("ai-posts-invalid-output.json", content);
            console.warn("AI returned malformed JSON. Saved raw response to ai-posts-invalid-output.json and trying one repair call...");
        } else {
            console.warn(`AI generation failed before content could be parsed: ${firstError.message}`);
        }

        if (content) {
            try {
                const repairedContent = await repairJsonWithAi(content);
                try {
                    return parseJsonContent(repairedContent);
                } catch (repairParseError) {
                    writeAiDebugFile("ai-posts-repair-output.json", repairedContent);
                    console.warn(`AI repair returned invalid JSON: ${repairParseError.message}`);
                }
            } catch (repairRequestError) {
                console.warn(`AI repair call failed: ${repairRequestError.message}`);
            }
        }

        if (!AI_FALLBACK_ON_FAILURE) {
            throw firstError;
        }

        console.warn("Using local fallback content because AI_FALLBACK_ON_FAILURE=true. Rerun later with AI_FALLBACK_ON_FAILURE=false for Gemini-only output.");
        return buildLocalFallbackAiOutput(factsPack, firstError);
    }
}

async function generateFinalContentInBatches(factsPack) {
    const checkpointKey = buildBatchCheckpointKey(factsPack);
    const checkpoint = loadBatchCheckpoint(checkpointKey);
    const output = checkpoint?.output || { highlights: [], profile_messages: [] };
    const completedBatches = new Set(checkpoint?.completedBatches || []);
    const usedHighlightKeys = new Set();
    const usedProfileNames = new Set();
    const targetHighlights = MAX_HIGHLIGHTS;

    for (const post of Array.isArray(output.highlights) ? output.highlights : []) {
        const title = cleanText(post?.title_ar || "", AI_POST_TITLE_MAX_CHARS);
        const body = cleanText(post?.body_ar || "", AI_POST_BODY_MAX_CHARS);
        if (title && body) usedHighlightKeys.add(`${title}|${body}`.toLowerCase());
    }
    for (const message of Array.isArray(output.profile_messages) ? output.profile_messages : []) {
        const participantName = cleanText(message?.participant_name || "", 80);
        if (participantName) usedProfileNames.add(participantName);
    }

    if (checkpoint) {
        console.log(
            `Resuming from ${AI_BATCH_CHECKPOINT_FILE}: ` +
            `${output.highlights.length} highlights, ${output.profile_messages.length} profiles, ` +
            `${completedBatches.size} completed batch(es).`
        );
    }

    const saveCheckpoint = () => {
        if (!AI_SAVE_BATCH_CHECKPOINT) return;
        const payload = {
            checkpoint_key: checkpointKey,
            generated_at: new Date().toISOString(),
            completedBatches: Array.from(completedBatches),
            output
        };
        writeAiDebugFile(AI_BATCH_CHECKPOINT_FILE, JSON.stringify(payload, null, 2));
    };

    let stoppedEarly = false;
    let stoppedEarlyReason = "";
    let batchesCompletedThisRun = 0;
    let failedBatchesThisRun = 0;

    const hasEnoughPartialHighlights = () => output.highlights.length >= AI_MIN_HIGHLIGHTS_FOR_PARTIAL_INSERT;

    const markStoppedEarly = (reason) => {
        stoppedEarly = true;
        stoppedEarlyReason = reason;
        saveCheckpoint();
        console.warn(`${reason}. Saved progress to ${AI_BATCH_CHECKPOINT_FILE}.`);
    };

    const addOutput = (batchName, batchOutput) => {
        const batchHighlights = Array.isArray(batchOutput?.highlights) ? batchOutput.highlights : [];
        const batchProfiles = Array.isArray(batchOutput?.profile_messages) ? batchOutput.profile_messages : [];

        for (const post of batchHighlights) {
            if (output.highlights.length >= targetHighlights) break;
            const title = cleanText(post?.title_ar || "", AI_POST_TITLE_MAX_CHARS);
            const body = cleanText(post?.body_ar || "", AI_POST_BODY_MAX_CHARS);
            if (!title || !body || isLowQualityHighlightPost(post)) continue;
            const key = `${title}|${body}`.toLowerCase();
            if (usedHighlightKeys.has(key)) continue;
            usedHighlightKeys.add(key);
            output.highlights.push({
                ...post,
                title_ar: title,
                body_ar: body
            });
        }

        for (const message of batchProfiles) {
            const participantName = cleanText(message?.participant_name || "", 80);
            if (!participantName || usedProfileNames.has(participantName)) continue;
            usedProfileNames.add(participantName);
            output.profile_messages.push({
                ...message,
                participant_name: participantName,
                title_ar: cleanText(message?.title_ar || "رسالة ختام", 90),
                body_ar: cleanText(message?.body_ar || "", 260),
                icon: cleanText(message?.icon || "✨", 8)
            });
        }

        completedBatches.add(batchName);
        batchesCompletedThisRun += 1;
        console.log(`Batch ${batchName}: total highlights=${output.highlights.length}, profiles=${output.profile_messages.length}`);
        saveCheckpoint();
    };

    const runBatch = async (batchName, batchPrompt) => {
        if (stoppedEarly) return false;
        if (completedBatches.has(batchName)) {
            console.log(`Skipping ${batchName}; already completed in checkpoint.`);
            return true;
        }
        if (AI_MAX_BATCHES_PER_RUN > 0 && batchesCompletedThisRun >= AI_MAX_BATCHES_PER_RUN) {
            markStoppedEarly(`Reached AI_MAX_BATCHES_PER_RUN=${AI_MAX_BATCHES_PER_RUN}`);
            return false;
        }
        if (AI_BATCH_DELAY_MS > 0) await sleep(AI_BATCH_DELAY_MS);
        try {
            addOutput(batchName, await runAiJsonBatch(batchPrompt, batchName));
            return true;
        } catch (error) {
            failedBatchesThisRun += 1;
            const providerLabel = USING_OPENROUTER ? "OpenRouter" : "AI";
            if (isAiQuotaError(error) && AI_INSERT_PARTIAL_ON_QUOTA && hasEnoughPartialHighlights()) {
                markStoppedEarly(`${providerLabel} quota stopped generation during ${batchName}; partial insert is enabled`);
                return false;
            }
            if (AI_INSERT_PARTIAL_ON_BATCH_FAILURE && hasEnoughPartialHighlights()) {
                markStoppedEarly(`${providerLabel} batch failure during ${batchName}; partial insert is enabled (${error.message})`);
                return false;
            }
            if (AI_CONTINUE_ON_BATCH_FAILURE && failedBatchesThisRun <= AI_MAX_FAILED_BATCHES) {
                console.warn(`${providerLabel} batch ${batchName} failed, skipping it and continuing because AI_CONTINUE_ON_BATCH_FAILURE=true: ${error.message}`);
                saveCheckpoint();
                return false;
            }
            if (AI_INSERT_PARTIAL_ON_BATCH_FAILURE && output.highlights.length > 0) {
                markStoppedEarly(`${providerLabel} batch failure limit reached during ${batchName}; partial insert is enabled (${error.message})`);
                return false;
            }
            saveCheckpoint();
            throw error;
        }
    };

    const activeNames = (factsPack.contest.activeParticipants || []).map((participant) => participant.name);
    const contextBase = {
        generator: factsPack.generator,
        audit: factsPack.audit,
        language: factsPack.language,
        strictRules: factsPack.strictRules,
        active_participant_names: activeNames,
        stages: factsPack.contest.stages,
        leaderboard_top: (factsPack.contest.leaderboard || []).slice(0, 8)
    };

    const storySeeds = factsPack.contest.integratedStorySeeds || [];
    const storyBatches = chunkArray(storySeeds, AI_STORY_SEED_BATCH_SIZE);
    const maxStoryBatches = Math.min(storyBatches.length, Math.ceil(Math.max(24, targetHighlights * 0.75) / AI_BATCH_HIGHLIGHT_TARGET));

    for (let index = 0; index < maxStoryBatches && !stoppedEarly && output.highlights.length < targetHighlights; index += 1) {
        const batchName = `story-seeds-${index + 1}`;
        const batchPrompt = buildBatchPrompt({
            batchName,
            instruction: "اكتب منشورات أضواء من story_seeds فقط. كل seed فيه نوع قصة واضح: فخ الأغلبية، قراءة مختلفة، ضغط إقصائي، خزنة نقاط، أو حدث كروي موثق. لا تكتب تقرير مباراة. ابدأ من hook_style والسؤال القصصي، واجعل النتيجة مجرد تفصيل داخل النص.",
            highlightTarget: Math.min(AI_BATCH_HIGHLIGHT_TARGET, targetHighlights - output.highlights.length),
            profileTarget: 0,
            facts: {
                ...contextBase,
                story_seeds: storyBatches[index]
            }
        });
        await runBatch(batchName, batchPrompt);
    }

    if (AI_USE_EVENT_ONLY_BATCHES) {
        const eventNotes = factsPack.contest.eventNotes || [];
        const eventBatches = chunkArray(eventNotes, AI_EVENT_NOTE_BATCH_SIZE);
        const maxEventBatches = Math.min(eventBatches.length, Math.ceil(Math.max(8, targetHighlights * 0.15) / AI_BATCH_HIGHLIGHT_TARGET));

        for (let index = 0; index < maxEventBatches && !stoppedEarly && output.highlights.length < targetHighlights; index += 1) {
            const notes = eventBatches[index];
            const batchName = `event-context-${index + 1}`;
            const batchPrompt = buildBatchPrompt({
                batchName,
                instruction: "استخدم event_notes كسياق فقط، ولا تحولها إلى قائمة نتائج. لا تكتب منشوراً إلا إذا ربطته بالمشاركين أو التوقعات أو تغير جو المسابقة.",
                highlightTarget: Math.min(Math.ceil(AI_BATCH_HIGHLIGHT_TARGET / 2), targetHighlights - output.highlights.length),
                profileTarget: 0,
                facts: {
                    ...contextBase,
                    event_notes: notes,
                    related_matches: relatedMatchesForEventNotes(notes, factsPack.contest.matches || [])
                }
            });
            await runBatch(batchName, batchPrompt);
        }
    }

    if (AI_ENABLE_CONTEST_MOMENT_BATCHES) {
        const candidateHighlights = factsPack.contest.candidateHighlights || [];
        const contestFacts = candidateHighlights.filter((fact) => !String(fact.type || "").includes("participant") && !String(fact.type || "").includes("verified_worldcup"));
        const contestBatches = chunkArray(contestFacts, AI_FACT_BATCH_SIZE);
        const maxContestBatches = Math.min(contestBatches.length, Math.ceil(Math.max(10, targetHighlights * 0.25) / AI_BATCH_HIGHLIGHT_TARGET));

        for (let index = 0; index < maxContestBatches && !stoppedEarly && output.highlights.length < Math.max(0, targetHighlights - activeNames.length); index += 1) {
            const batchName = `contest-moments-${index + 1}`;
            const batchPrompt = buildBatchPrompt({
                batchName,
                instruction: "اكتب منشورات من لحظات مسابقة التوقعات فقط عندما تكون لقطة قصصية واضحة: توقع بالملّي، صدمة للأغلبية، نقاط كثيرة لمجموعة أسماء، أو تحول في جو المنافسة. لا تجعلها إحصائية جامدة ولا نتيجة مباراة.",
                highlightTarget: Math.min(AI_BATCH_HIGHLIGHT_TARGET, targetHighlights - output.highlights.length),
                profileTarget: 0,
                facts: {
                    ...contextBase,
                    contest_moment_facts: contestBatches[index]
                }
            });
            await runBatch(batchName, batchPrompt);
        }
    }

    const participantRows = factsPack.contest.leaderboard || [];
    const participantBatches = chunkArray(participantRows, AI_PROFILE_BATCH_SIZE);
    for (let index = 0; index < participantBatches.length && !stoppedEarly; index += 1) {
        const participants = participantBatches[index];
        const remainingHighlights = Math.max(0, targetHighlights - output.highlights.length);
        const batchName = `participants-${index + 1}`;
        const highlightTarget = Math.min(participants.length, remainingHighlights);
        const profileTarget = GENERATE_PROFILES ? participants.length : 0;
        if (highlightTarget <= 0 && profileTarget <= 0) continue;
        const batchPrompt = buildBatchPrompt({
            batchName,
            instruction: GENERATE_PROFILES
                ? "اكتب لقطة highlight واحدة لكل مشارك في هذه الدفعة، واكتب رسالة profile قصيرة لكل مشارك. اجعلها إنسانية وممتعة وليست badge. لا تذكر قلة المشاركة ولا الغياب. استخدم الضمائر الصحيحة."
                : "اكتب لقطة highlight واحدة لكل مشارك في هذه الدفعة. اجعلها إنسانية وممتعة وليست badge. لا تكتب profile_messages. لا تذكر قلة المشاركة ولا الغياب. استخدم الضمائر الصحيحة.",
            highlightTarget,
            profileTarget,
            facts: {
                ...contextBase,
                participants
            }
        });
        await runBatch(batchName, batchPrompt);
    }

    if (AI_ENABLE_FILL_MATCHES && output.highlights.length < Math.min(35, targetHighlights)) {
        const remainingFacts = (factsPack.contest.matches || []).slice(0, 80);
        const fillBatches = chunkArray(remainingFacts, AI_FACT_BATCH_SIZE);
        for (let index = 0; index < fillBatches.length && !stoppedEarly && output.highlights.length < Math.min(35, targetHighlights); index += 1) {
            const batchName = `fill-matches-${index + 1}`;
            const batchPrompt = buildBatchPrompt({
                batchName,
                instruction: "أكمل الأضواء بمنشورات قصيرة من المباريات المتاحة، مع تجنب التكرار واللغة الإحصائية الباردة.",
                highlightTarget: Math.min(AI_BATCH_HIGHLIGHT_TARGET, targetHighlights - output.highlights.length),
                profileTarget: 0,
                facts: {
                    ...contextBase,
                    matches: fillBatches[index]
                }
            });
            await runBatch(batchName, batchPrompt);
        }
    }

    const missingProfileNames = GENERATE_PROFILES
        ? activeNames.filter((name) => !usedProfileNames.has(name))
        : [];
    if (missingProfileNames.length && !stoppedEarly) {
        const missingParticipants = participantRows.filter((participant) => missingProfileNames.includes(participant.name));
        const missingBatches = chunkArray(missingParticipants, AI_PROFILE_BATCH_SIZE);
        for (let index = 0; index < missingBatches.length && !stoppedEarly; index += 1) {
            const participants = missingBatches[index];
            const batchName = `missing-profiles-${index + 1}`;
            const batchPrompt = buildBatchPrompt({
                batchName,
                instruction: "اكتب رسائل profile فقط للمشاركين الناقصين. لا تكتب highlights.",
                highlightTarget: 0,
                profileTarget: participants.length,
                facts: {
                    ...contextBase,
                    participants
                }
            });
            await runBatch(batchName, batchPrompt);
        }
    }

    if (!output.highlights.length) {
        throw new Error("Gemini batch generation returned no highlights.");
    }

    if (stoppedEarly) {
        const partialAllowed = (stoppedEarlyReason.includes("quota") && AI_INSERT_PARTIAL_ON_QUOTA)
            || (stoppedEarlyReason.includes("AI_MAX_BATCHES_PER_RUN") && AI_INSERT_PARTIAL_ON_MAX_BATCHES)
            || (stoppedEarlyReason.includes("batch failure") && AI_INSERT_PARTIAL_ON_BATCH_FAILURE);
        if (!partialAllowed || (!hasEnoughPartialHighlights() && !AI_INSERT_PARTIAL_ANY_STORY_COUNT)) {
            throw new Error(`${stoppedEarlyReason}. Not inserting partial output. Rerun later to resume from ${AI_BATCH_CHECKPOINT_FILE}.`);
        }
        console.warn(`Inserting partial Gemini output: ${output.highlights.length} highlights and ${output.profile_messages.length} profiles.`);
    }

    writeAiDebugFile("ai-posts-batch-output.json", JSON.stringify(output, null, 2));
    return output;
}

function buildBatchPrompt({ batchName, instruction, highlightTarget, profileTarget, facts }) {
    return `
اكتب دفعة واحدة من محتوى "الأضواء" لمسابقة توقعات كأس العالم 2026.

اسم الدفعة: ${batchName}
المهمة: ${instruction}

أعد JSON صحيح فقط بهذا الشكل:
{
  "highlights": [
    {
      "title_ar": "عنوان قصصي جذاب 6 إلى 12 كلمة، لا يبدأ باسم مباراة ولا بنتيجة",
      "body_ar": "منشور ممتع من فقرتين قصيرتين مفصولتين بسطر فارغ، 95 إلى 150 كلمة تقريباً",
      "icon": "✨",
      "category": "timeline|match|participant|emotional|fun|stage",
      "stage_ar": "اسم المرحلة أو أضواء المسابقة",
      "participant_names": ["اسم مشارك إن وجد"],
      "source_fact": "الحقيقة المستخدمة باختصار",
      "source_note_ids": ["id من final_event_notes إذا استخدمت حدثاً كروياً"]
    }
  ],
  "profile_messages": [
    {
      "participant_name": "اسم مشارك نشط",
      "title_ar": "رسالة ختام",
      "body_ar": "جملة قصيرة جداً لهذا المشارك",
      "icon": "✨"
    }
  ]
}

عدد highlights المطلوب في هذه الدفعة: ${highlightTarget}
عدد profile_messages المطلوب في هذه الدفعة: ${profileTarget}

طريقة الكتابة المطلوبة:
- اقرأ post_blueprint في كل story_seed: kind, hook_style, story_question, mood, must_include_facts, real_world_cup_context.
- اكتب من نوع القصة، وليس من نتيجة المباراة.
- الفقرة الأولى: hook ممتع أو إحساس اللحظة. لا تبدأ بـ "عندما انتهت" ولا "في مباراة" ولا باسم الفريقين.
- الفقرة الثانية: اربط القصة بالأسماء والنقاط والتوقعات. اذكر النتيجة مرة واحدة فقط إذا احتجتها.
- استخدم real_world_cup_context فقط إذا كان موجوداً. إذا لم يوجد، لا تخترع VAR أو طرد أو إصابة أو جمهور أو تصريح.
- إذا كانت المباراة إقصائية أو فيها ركلات ترجيح/وقت إضافي من real_world_cup_context، استعملها كخلفية تزيد الضغط، ثم ارجع لأثرها في المسابقة.
- كل منشور يجب أن يشعر القارئ أنه يقرأ لقطة من مسابقة أصدقاء/عائلة، وليس خبر مباراة.

قواعد صارمة:
- JSON فقط، بدون markdown، بدون أي نص خارج JSON، وبدون trailing commas.
- لا تكتب match report. لا تجعل العنوان أو أول جملة عن "الفريق فاز" أو "المباراة انتهت".
- لا تستخدم قالب مكرر: نتيجة المباراة + من أخذ نقاط + غيرت الترتيب.
- لا تستخدم لهجة مصرية أو عامية غريبة: ما فيهاش، كده، بيقرأوا، فارغين، ما كانش.
- لا تستخدم عبارات مستهلكة أو عامة: أعادت تشكيل المزاج، أعادت تشكيل ملامح المنافسة، الثقة العمياء، القراء الهادئين، الجمهور كان متحمساً، تداولت الأحاديث، استثمروا الوقت في تحليل الفرق.
- ممنوع عناوين خام أو مكررة: "مباراة أهدافها كثيرة"، "شباك نظيفة"، "حسم ضيق"، "النجوم تتألق"، "الطاقة تتفجر"، "التحول المفاجئ"، "ليلة 3 توقعات بالملّي".
- لا تكدس الأرقام. اختر رقمين أو ثلاثة فقط تخدم القصة.
- نتيجة بالملّي = 50 نقطة. الاتجاه الصحيح فقط = 10 نقاط. لا تخترع نقاطاً إضافية ولا أرقاماً غير موجودة.
- اذكر 1 إلى 4 أسماء فقط داخل النص، حتى لو seed فيه أسماء أكثر.
- لا تسخر من أي مشارك ولا تذكر الغياب أو قلة المشاركة.
- استخدم ضمائر صحيحة للبنات حسب participantLanguage.
- لا تكتب أقل من 90 كلمة تقريباً. لا تكتب منشوراً من جملة واحدة.
- الأسلوب: عربي سعودي/خليجي خفيف أو عربي فصيح بسيط، ودود، فيه لمعة، بدون صحافة ثقيلة.

أمثلة سيئة ممنوعة:
- "عندما انتهت بنما ضد إنجلترا بنتيجة 0-2..."
- "في مباراة كرواتيا ضد غانا، أخذ ثلاثة مشاركين النتيجة بالملّي..."
- "هذه النقاط أعادت تشكيل المزاج وأظهرت أن الدقة تصنع الفارق."
- "الجمهور كان متحمساً وتداولت الأحاديث."

مثال اتجاه جيد:
"كان فيه توقع مريح يمشي بين أكثر من اسم، لكن المباراة قررت تكسر هذا الهدوء وتقول للجميع إن الطريق الأسهل مو دائماً آمن. اللقطة هنا ليست في النتيجة نفسها؛ اللقطة في الناس اللي خرجوا من الزحمة وشافوا الاحتمال الأصعب قبل ما يصير واضحاً.

رحاب وتالين كانوا في المكان الصحيح في الوقت الصحيح. قراءة بالملّي أعطت كل وحدة 50 نقطة، بينما التوقع الأكثر تكراراً ترك أصحابه بلا المكافأة الكبيرة. هذه من اللحظات اللي تخلي الأضواء تروح للجرأة الهادئة، لا للصوت الأعلى."

FACTS:
${JSON.stringify(facts, null, 2)}
`.trim();
}

async function runAiJsonBatch(prompt, batchName) {
    const messages = [
        {
            role: "system",
            content: "أنت كاتب عربي سعودي/خليجي خفيف الظل لمسابقة توقعات عائلية/أصدقاء. اكتب الأضواء كمنشورات قصصية ممتعة: hook، إحساس، أسماء، نقاط، نتائج بالملّي، صدمة أغلبية، ولقطة حقيقية من كرة القدم إذا كانت موثقة. لا تكتب match report ولا تبدأ بالنتيجة. لا تخترع أحداثاً. أعد JSON فقط."
        },
        { role: "user", content: prompt }
    ];

    let content = "";
    try {
        content = await requestAiContent(messages, {
            temperature: AI_TEMPERATURE,
            maxTokens: Math.min(AI_MAX_TOKENS, 5000),
            responseFormat: true
        });
        return parseJsonContent(content);
    } catch (firstError) {
        if (content) {
            writeAiDebugFile(`ai-posts-invalid-${safeFilePart(batchName)}.json`, content);
            if (AI_DISABLE_REPAIR_CALL) {
                const error = new Error(`Batch ${batchName} returned malformed JSON and AI_DISABLE_REPAIR_CALL=true. Saved raw output for review.`);
                error.retryable = false;
                throw error;
            }
            console.warn(`Batch ${batchName} returned malformed JSON. Trying repair call...`);
            try {
                const repairedContent = await repairJsonWithAi(content);
                try {
                    return parseJsonContent(repairedContent);
                } catch (repairParseError) {
                    writeAiDebugFile(`ai-posts-repair-${safeFilePart(batchName)}.json`, repairedContent);
                    throw repairParseError;
                }
            } catch (repairError) {
                throw new Error(`Batch ${batchName} failed after repair: ${repairError.message}`);
            }
        }
        const error = new Error(`Batch ${batchName} failed: ${firstError.message}`);
        error.quotaExhausted = firstError.quotaExhausted || isAiQuotaError(firstError);
        throw error;
    }
}


function isLowQualityHighlightPost(post = {}) {
    const title = String(post.title_ar || "").trim();
    const body = String(post.body_ar || "").trim();
    const full = `${title} ${body}`;
    const participantNames = Array.isArray(post.participant_names) ? post.participant_names.filter(Boolean) : [];
    const compactBodyLength = body.replace(/[\s.،,!؟:؛\-–—]/g, "").length;
    const bodyStart = body.trim().slice(0, 90);
    const paragraphs = body.split(/\n\s*\n/).filter((part) => part.trim().length > 0);

    const bannedTitle = /^(مباراة أهدافها كثيرة|حسم ضيق|شباك نظيفة|نتيجة موثقة|المتأهل|الفائز تم حسمه|مباراة حماسية|مباراة متقاربة|النجوم تتألق|الطاقة تتفجر|التحول المفاجئ|فارق هدف واحد|ليلة\s*\d+\s*توقعات|\d+\s*توقعات بالملّي|ثلاثية بالملّي)/i.test(title);
    const bannedPhrases = /(الجمهور كان|الجمهور|تداولت الأحاديث|أصبح الحديث يدور|الكل كان يتكلم|نقاط إضافية|حصل كل منهم على \d+ نقاط|حصلت على \d+ نتائج بالملّي موزعة|فرقة|النجاحة|البمثيلة|أعادت تشكيل المزاج|أعادت تشكيل ملامح|كشفت القراء الهادئين|الثقة العمياء|استثمروا الوقت في تحليل|مع توزيع \d+ نقطة|هذه اللحظة كشفت|كان الجميع يتوقعون|ما فيهاش|كده|بيقرأوا|فارغين|ما كانش|دارتت|واجتهد)/i.test(full);
    const titleLooksLikeResultTile = /\d+\s*[-–]\s*\d+/.test(title) || (/ضد/.test(title) && /^(مباراة|حسم|شباك|نتيجة|فوز|تعادل|ليلة|صدمة|ثلاثية)/.test(title));
    const startsWithResult = /^(عندما انتهت|لما انتهت|في مباراة|مباراة|انتهت|فاز|فازت|سجلت|سجل|أحرز|أحرزت|عندما التقت|حين التقت)/.test(bodyStart);
    const resultReportPattern = /(انتهت|فازت|فاز|تعادل).{0,45}(حصل|حصلت|حصد|حصدت|خرج|خرجت).{0,80}(نقطة|نقاط|توقع)/i.test(full);

    const hasContestSignal = participantNames.length > 0
        || /توقع|توقعات|المسابقة|مشارك|مشاركة|نقطة|نقاط|بالملّي|صحيح|صحيحة|المركز|الترتيب|فارق|أغلب|أغلبية|ناس|قرأ|قرأت|شاف|شافت|قاسية|وزعت|قفز|قفزت|تقدم|تقدمت|منصة|سلسلة|غيّرت|غيرت|قلبت|رجّعت|رجعت|صدمة|مفاجأة|exact/i.test(full);
    const hasStorySignal = /لكن|وهنا|ومن هنا|اللقطة|القصة|الجو|المرحلة|المنافسة|السباق|تحوّل|تحول|الضغط|الصدمة|الفرحة|النقطة|المنعطف|مزاج|قراءة|جرأة|فخ|زحمة|خزنة|أضواء|هدوء|خارج|نجا|نجت|أعصاب|إقصائي|إقصائية/i.test(full);
    const rawResultOnly = !hasContestSignal && /فازت|فاز|انتهت|سجلت|سجل|شباك نظيفة|فارق هدف|مباراة حماسية|مباراة متقاربة/i.test(full);
    const tooShort = compactBodyLength < 260;
    const tooFewSentences = (body.match(/[.؟!]/g) || []).length < 3;
    const tooManyScores = (body.match(/\d+\s*[-–]\s*\d+/g) || []).length > 2;

    if (bannedTitle || bannedPhrases || titleLooksLikeResultTile || rawResultOnly || tooShort || tooFewSentences || tooManyScores) return true;
    if (startsWithResult) return true;
    if (resultReportPattern && !/لكن|وهنا|اللقطة|فخ|زحمة|جرأة|ضغط|أضواء/.test(full)) return true;
    if (AI_REQUIRE_CONTEST_SIGNAL && !hasContestSignal) return true;
    if (!hasStorySignal && participantNames.length === 0) return true;
    if (paragraphs.length < 2 && compactBodyLength < 430) return true;
    return false;
}

function relatedMatchesForEventNotes(notes, matches) {
    const ids = new Set((notes || []).map((note) => note.match_id).filter(Boolean));
    return (matches || []).filter((match) => ids.has(match.id)).slice(0, 30);
}

function chunkArray(items, size) {
    const chunks = [];
    const safeSize = Math.max(1, Number(size) || 1);
    for (let index = 0; index < (items || []).length; index += safeSize) {
        chunks.push(items.slice(index, index + safeSize));
    }
    return chunks;
}

function safeFilePart(value) {
    return String(value || "batch").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "batch";
}

async function requestAiContent(messages, options = {}) {
    const requestedModels = AI_PROVIDER === "openrouter" && OPENROUTER_USE_FALLBACK_MODELS && OPENROUTER_FALLBACK_MODELS.length > 0
        ? [AI_MODEL, ...OPENROUTER_FALLBACK_MODELS].filter(Boolean)
        : [];

    const body = {
        temperature: options.temperature ?? AI_TEMPERATURE,
        max_tokens: options.maxTokens ?? AI_MAX_TOKENS,
        messages
    };

    if (requestedModels.length > 0) {
        body.models = [...new Set(requestedModels)];
    } else {
        body.model = AI_MODEL;
    }

    if (options.responseFormat !== false && AI_RESPONSE_FORMAT) {
        body.response_format = { type: "json_object" };
    }

    let lastError = null;
    for (let attempt = 1; attempt <= AI_REQUEST_RETRIES; attempt += 1) {
        try {
            const headers = {
                Authorization: `Bearer ${AI_API_KEY}`,
                "Content-Type": "application/json"
            };

            if (AI_PROVIDER === "openrouter") {
                if (OPENROUTER_HTTP_REFERER) headers["HTTP-Referer"] = OPENROUTER_HTTP_REFERER;
                if (OPENROUTER_APP_TITLE) headers["X-Title"] = OPENROUTER_APP_TITLE;
            }

            const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
                method: "POST",
                headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const text = await response.text();
                const error = new Error(`AI error ${response.status}: ${text}`);
                error.quotaExhausted = response.status === 429 && isAiQuotaError(error);
                error.retryable = !error.quotaExhausted && [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
                throw error;
            }

            const json = await response.json();
            return json.choices?.[0]?.message?.content || "";
        } catch (error) {
            lastError = error;
            if (error.quotaExhausted || isAiQuotaError(error)) {
                break;
            }
            const retryable = error.retryable === true || /\b(429|500|502|503|504|UNAVAILABLE|overloaded|high demand|fetch failed|terminated|ECONNRESET|ETIMEDOUT|AbortError)\b/i.test(error.message || "");
            if (!retryable || attempt >= AI_REQUEST_RETRIES) break;

            const retryAfterMs = extractRetryDelayMs(error.message);
            const delay = retryAfterMs && retryAfterMs <= AI_MAX_RETRY_AFTER_MS
                ? retryAfterMs
                : AI_RETRY_BASE_DELAY_MS * attempt;
            console.warn(`AI request failed on attempt ${attempt}/${AI_REQUEST_RETRIES}: ${error.message}`);
            console.warn(`Retrying in ${Math.round(delay / 1000)}s...`);
            await sleep(delay);
        }
    }

    throw lastError || new Error("AI request failed.");
}

function isAiQuotaError(error) {
    const message = String(error?.message || error || "");
    return /RESOURCE_EXHAUSTED|quota exceeded|QuotaFailure|GenerateRequestsPerDay|free_tier_requests|requests per day|daily limit|limit of \d+ requests/i.test(message);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRetryDelayMs(message) {
    const text = String(message || "");
    const retryInfoMatch = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
    if (retryInfoMatch) return Math.ceil(Number(retryInfoMatch[1]) * 1000);

    const plainMatch = text.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
    if (plainMatch) return Math.ceil(Number(plainMatch[1]) * 1000);

    return 0;
}

function buildBatchCheckpointKey(factsPack) {
    return hashObject({
        generatorVersion: GENERATOR_VERSION,
        expectedMatches: EXPECTED_WORLD_CUP_MATCH_COUNT,
        completedMatches: factsPack?.audit?.completedMatches,
        remainingExpectedMatches: factsPack?.audit?.remainingExpectedMatches,
        maxHighlights: MAX_HIGHLIGHTS,
        maxEventNotesForAi: MAX_EVENT_NOTES_FOR_AI,
        participantIds: (factsPack?.contest?.activeParticipants || []).map((participant) => participant.id),
        eventNoteIds: (factsPack?.contest?.eventNotes || []).map((note) => note.id).slice(0, MAX_EVENT_NOTES_FOR_AI)
    });
}

function loadBatchCheckpoint(expectedKey) {
    if (!AI_RESUME_FROM_CHECKPOINT || !fs.existsSync(AI_BATCH_CHECKPOINT_FILE)) return null;

    try {
        const checkpoint = JSON.parse(fs.readFileSync(AI_BATCH_CHECKPOINT_FILE, "utf8"));
        if (checkpoint?.checkpoint_key !== expectedKey) {
            console.warn(`${AI_BATCH_CHECKPOINT_FILE} exists but belongs to a different data snapshot. It will be ignored.`);
            return null;
        }
        if (!checkpoint?.output || !Array.isArray(checkpoint.completedBatches)) return null;
        return checkpoint;
    } catch (error) {
        console.warn(`Could not read ${AI_BATCH_CHECKPOINT_FILE}: ${error.message}`);
        return null;
    }
}

function clearBatchCheckpointAfterInsert() {
    if (!AI_CLEAR_CHECKPOINT_AFTER_INSERT || !fs.existsSync(AI_BATCH_CHECKPOINT_FILE)) return;
    try {
        fs.unlinkSync(AI_BATCH_CHECKPOINT_FILE);
        console.log(`Removed ${AI_BATCH_CHECKPOINT_FILE} after successful insert.`);
    } catch (error) {
        console.warn(`Could not remove ${AI_BATCH_CHECKPOINT_FILE}: ${error.message}`);
    }
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
- العنوان: 5 إلى 11 كلمة، وليس مجرد نتيجة مباراة.
- الوصف: جملتان قصيرتان، 28 إلى 55 كلمة تقريباً، ويربط الحدث بجو المسابقة أو المشاركين.
- استخدم ضمائر صحيحة. أسماء البنات موضحة في participantLanguage.
- لا تخترع أحداث كرة قدم مثل بطاقة حمراء، هوشة، إصابة، VAR، تصريح، احتفال، جدل، أو خبر بعد المباراة إلا إذا وجدت في eventNotes. إذا استخدمت eventNotes، ضع id الخاص بها داخل source_note_ids.
- لو لم توجد eventNotes، ركز على أحداث مسابقة التوقعات نفسها.
- لا تستخدم عبارة مكررة في أكثر من منشور.
- ممنوع أن تكون الأضواء مجرد "فاز/خسر/سجل". يجب أن تكون قصة مسابقة وتوقعات.
- لا تستخدم عبارات مكررة مثل "مباراة أهدافها كثيرة" أو "حسم ضيق" أو "شباك نظيفة" كعنوان مباشر.
- لا تستخدم عبارة "مو كثير كلام، بس ضربات نظيفة".

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

    const loose = parseLooseAiJsonContent(trimmed);
    if (loose) return loose;

    throw lastError || new Error("Could not parse AI JSON content.");
}

function parseLooseAiJsonContent(value) {
    const text = stripMarkdownJsonFence(String(value || "").trim());
    const highlightsText = extractArrayTextByKey(text, "highlights");
    const profilesText = extractArrayTextByKey(text, "profile_messages");
    const highlights = parseObjectsFromArrayText(highlightsText);
    const profileMessages = parseObjectsFromArrayText(profilesText);
    if (highlights.length || profileMessages.length) {
        return { highlights, profile_messages: profileMessages };
    }
    return null;
}

function extractArrayTextByKey(text, key) {
    const source = String(text || "");
    const keyIndex = source.indexOf(`"${key}"`);
    if (keyIndex === -1) return "";
    const openIndex = source.indexOf("[", keyIndex);
    if (openIndex === -1) return "";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = openIndex; index < source.length; index += 1) {
        const char = source[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') inString = true;
        else if (char === "[") depth += 1;
        else if (char === "]") {
            depth -= 1;
            if (depth === 0) return source.slice(openIndex, index + 1);
        }
    }
    return source.slice(openIndex);
}

function parseObjectsFromArrayText(arrayText) {
    const source = String(arrayText || "");
    const objects = [];
    for (let index = 0; index < source.length; index += 1) {
        if (source[index] !== "{") continue;
        const objectText = extractBalancedJsonObject(source.slice(index));
        if (!objectText) continue;
        index += Math.max(0, objectText.length - 1);
        const candidates = [objectText, lightRepairJsonText(objectText), closeOpenJsonText(lightRepairJsonText(objectText))]
            .filter(Boolean);
        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === "object") objects.push(parsed);
                break;
            } catch (_) {
                // try next candidate
            }
        }
    }
    return objects;
}

function closeOpenJsonText(value) {
    const text = String(value || "").trim();
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escaped = false;
    for (const char of text) {
        if (inString) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') inString = true;
        else if (char === "{") braces += 1;
        else if (char === "}") braces -= 1;
        else if (char === "[") brackets += 1;
        else if (char === "]") brackets -= 1;
    }
    return text + "}".repeat(Math.max(0, braces)) + "]".repeat(Math.max(0, brackets));
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

function buildLocalFallbackAiOutput(factsPack, error) {
    const highlights = [];
    const usedTitles = new Set();
    const add = (post) => {
        const title = cleanText(post?.title_ar || "", AI_POST_TITLE_MAX_CHARS);
        const body = cleanText(post?.body_ar || "", AI_POST_BODY_MAX_CHARS);
        if (!title || !body || usedTitles.has(title)) return;
        usedTitles.add(title);
        highlights.push({
            title_ar: title,
            body_ar: body,
            icon: cleanText(post.icon || "✨", 8),
            category: cleanText(post.category || "timeline", 40),
            stage_ar: cleanText(post.stage_ar || "أضواء الختام", 80),
            participant_names: Array.isArray(post.participant_names) ? post.participant_names.slice(0, 6) : [],
            source_fact: cleanText(post.source_fact || "fallback_from_calculated_facts", 180),
            source_note_ids: Array.isArray(post.source_note_ids) ? post.source_note_ids.slice(0, 6) : []
        });
    };

    add({
        title_ar: "القصة لسه تتحرك",
        body_ar: `حتى الآن اكتملت ${factsPack.audit.completedMatches} مباراة، ومعها بدأت أضواء المسابقة تتشكل من النتائج والتوقعات.`,
        icon: "🏆",
        category: "timeline",
        stage_ar: "أضواء مباشرة",
        source_fact: "completed_matches_snapshot"
    });

    const eventNotes = factsPack.contest.eventNotes || [];
    const noteOrder = {
        penalty_shootout: 1,
        extra_time: 2,
        goal_fest: 3,
        close_match: 4,
        clean_sheet: 5,
        official_result: 8,
        winner_confirmed: 20
    };

    [...eventNotes]
        .filter((note) => note.event_type !== "winner_confirmed")
        .sort((a, b) => (noteOrder[a.event_type] || 10) - (noteOrder[b.event_type] || 10))
        .slice(0, Math.max(18, Math.floor(MAX_HIGHLIGHTS * 0.45)))
        .forEach((note) => add(eventNoteToFallbackPost(note)));

    const stages = factsPack.contest.stages || [];
    stages.forEach((stage) => {
        add({
            title_ar: `${stage.label_ar} ترك أثره`,
            body_ar: `${stage.label_ar} جمع ${stage.matches} مباراة و${stage.exactCount} نتيجة بالملّي، وكان جزءاً واضحاً من حكاية المسابقة.`,
            icon: "📍",
            category: "stage",
            stage_ar: stage.label_ar,
            source_fact: `stage:${stage.stage}`
        });
    });

    const matches = factsPack.contest.matches || [];
    [...matches]
        .sort((a, b) => b.awardedPoints - a.awardedPoints)
        .slice(0, 10)
        .forEach((match) => add({
            title_ar: "مباراة فتحت الخزنة",
            body_ar: `${match.title} انتهت ${match.score} ووزعت ${match.awardedPoints} نقطة بين المشاركين.`,
            icon: "💰",
            category: "match",
            stage_ar: match.stageLabel,
            participant_names: [...(match.exactNames || []), ...(match.correctNames || [])].slice(0, 5),
            source_fact: `match_points:${match.id}`
        }));

    [...matches]
        .filter((match) => match.exactCount > 0)
        .sort((a, b) => b.exactCount - a.exactCount)
        .slice(0, 10)
        .forEach((match) => add({
            title_ar: "بالملّي في وقتها",
            body_ar: `${match.title} كانت ${match.score}، و${match.exactCount} من المشاركين جابوها بالضبط.`,
            icon: "🎯",
            category: "match",
            stage_ar: match.stageLabel,
            participant_names: match.exactNames || [],
            source_fact: `exact_score:${match.id}`
        }));

    [...matches]
        .sort((a, b) => b.zeroOrMissingPercent - a.zeroOrMissingPercent)
        .slice(0, 8)
        .forEach((match) => add({
            title_ar: "مباراة لخبطت الحسابات",
            body_ar: `${match.title} انتهت ${match.score} وكانت من أكثر المباريات قسوة على التوقعات.`,
            icon: "🌀",
            category: "fun",
            stage_ar: match.stageLabel,
            source_fact: `hard_match:${match.id}`
        }));

    const leaderboard = factsPack.contest.leaderboard || [];
    leaderboard.forEach((participant) => add(participantToFallbackHighlight(participant)));

    while (highlights.length < Math.min(MAX_HIGHLIGHTS, 45)) {
        const match = matches[highlights.length % Math.max(1, matches.length)];
        if (!match) break;
        add({
            title_ar: `لقطة من ${match.stageLabel}`,
            body_ar: `${match.title} بنت جزءاً من جو المسابقة بنتيجتها ${match.score} وتفاعل التوقعات حولها.`,
            icon: "✨",
            category: "timeline",
            stage_ar: match.stageLabel,
            source_fact: `match_snapshot:${match.id}`
        });
        if (usedTitles.size > MAX_HIGHLIGHTS + 10) break;
    }

    const profile_messages = leaderboard.map((participant) => participantToFallbackProfile(participant));

    writeAiDebugFile("ai-posts-local-fallback-used.json", JSON.stringify({
        reason: error?.message || "AI failure",
        generated_at: new Date().toISOString(),
        highlights: highlights.length,
        profile_messages: profile_messages.length
    }, null, 2));

    return { highlights: highlights.slice(0, MAX_HIGHLIGHTS), profile_messages };
}

function eventNoteToFallbackPost(note) {
    const stage = note.stage_ar || getStageLabel(note.stage);
    const title = note.match_title || note.title_ar || "حدث موثق";
    const score = note.match_score ? ` بعد نتيجة ${note.match_score}` : "";
    const sourceId = note.id ? [note.id] : [];

    if (note.event_type === "penalty_shootout") {
        return {
            title_ar: "ركلات أعصاب حقيقية",
            body_ar: `${title}${score} وصلت للترجيح، وبهذا صارت من لقطات التوتر الواضحة في البطولة.`,
            icon: "🥶",
            category: "emotional",
            stage_ar: stage,
            source_fact: note.title_ar,
            source_note_ids: sourceId
        };
    }

    if (note.event_type === "extra_time") {
        return {
            title_ar: "أشواط زيادة وتوتر",
            body_ar: `${title}${score} امتدت لما بعد الوقت الأصلي، وهذا وحده يكفي يدخلها في الأضواء.`,
            icon: "⏱️",
            category: "match",
            stage_ar: stage,
            source_fact: note.title_ar,
            source_note_ids: sourceId
        };
    }

    if (note.event_type === "goal_fest") {
        return {
            title_ar: "مباراة فتحت العدّاد",
            body_ar: `${title}${score} كانت غنية بالأهداف، ومن النوع اللي يخلي التوقعات تنقلب بسرعة.`,
            icon: "🔥",
            category: "match",
            stage_ar: stage,
            source_fact: note.title_ar,
            source_note_ids: sourceId
        };
    }

    if (note.event_type === "close_match") {
        return {
            title_ar: "تفاصيل صغيرة جداً",
            body_ar: `${title}${score} كانت قريبة لدرجة أن التفاصيل الصغيرة صارت هي القصة.`,
            icon: "🧩",
            category: "emotional",
            stage_ar: stage,
            source_fact: note.title_ar,
            source_note_ids: sourceId
        };
    }

    if (note.event_type === "clean_sheet") {
        return {
            title_ar: "باب مقفل للنهاية",
            body_ar: `${title}${score} حملت لقطة دفاعية واضحة بشباك نظيفة تستحق الظهور في الأضواء.`,
            icon: "🧱",
            category: "match",
            stage_ar: stage,
            source_fact: note.title_ar,
            source_note_ids: sourceId
        };
    }

    return {
        title_ar: cleanText(note.title_ar || "نتيجة موثقة", 55),
        body_ar: cleanText(note.details_ar || `${title}${score} دخلت ضمن أحداث البطولة الموثقة.`, 150),
        icon: "⚽",
        category: "match",
        stage_ar: stage,
        source_fact: note.title_ar || "event_note",
        source_note_ids: sourceId
    };
}

function participantToFallbackHighlight(participant) {
    const lang = participantLanguageWords(participant.name, participant.gender);
    const stage = participant.bestStage?.label_ar ? `، وكانت أفضل مراحله${lang.taMarbuta} في ${participant.bestStage.label_ar}` : "";
    const topText = participant.rank === 1
        ? `${participant.name} ${lang.finishedTop} الصدارة بـ${participant.points} نقطة${stage}.`
        : `${participant.name} ${lang.collected} ${participant.points} نقطة و${participant.correctPredictions} توقع صحيح${stage}.`;

    return {
        title_ar: participant.rank <= 3 ? `${participant.name} على المنصة` : `لقطة ${participant.name}`,
        body_ar: topText,
        icon: participant.rank === 1 ? "👑" : "✨",
        category: "participant",
        stage_ar: "لقطات المشاركين",
        participant_names: [participant.name],
        source_fact: `participant:${participant.name}`
    };
}

function participantToFallbackProfile(participant) {
    const lang = participantLanguageWords(participant.name, participant.gender);
    return {
        participant_name: participant.name,
        title_ar: participant.rank === 1 ? "ختام في القمة" : "رسالة ختام",
        body_ar: `${participant.name} ${lang.wasPart} من جو المسابقة، ${lang.andCollected} ${participant.points} نقطة و${participant.correctPredictions} توقع صحيح.`,
        icon: participant.rank === 1 ? "👑" : "✨"
    };
}

function participantLanguageWords(name, gender) {
    const female = gender === "female" || FEMALE_NAMES.has(String(name || "").trim());
    return female
        ? {
            wasPart: "كانت جزءاً",
            andCollected: "وجمعت",
            collected: "جمعت",
            finishedTop: "ختمت",
            taMarbuta: "ا"
        }
        : {
            wasPart: "كان جزءاً",
            andCollected: "وجمع",
            collected: "جمع",
            finishedTop: "ختم",
            taMarbuta: ""
        };
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
        const title = cleanText(post.title_ar, AI_POST_TITLE_MAX_CHARS);
        const body = cleanText(post.body_ar, AI_POST_BODY_MAX_CHARS);
        if (!title || !body || isLowQualityHighlightPost(post)) return;

        rows.push({
            section_key: FINAL_HIGHLIGHTS_SECTION,
            title_ar: title,
            subtitle_ar: cleanText(post.stage_ar || "أضواء المسابقة", 80),
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
            const title = cleanText(message?.title_ar || "رسالة ختام", AI_POST_TITLE_MAX_CHARS);
            const body = cleanText(message?.body_ar || buildFallbackProfileMessage(participant.name, factsPack), 320);

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
