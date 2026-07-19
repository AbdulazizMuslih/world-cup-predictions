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
const AI_BATCH_HIGHLIGHT_TARGET = Math.max(2, Math.min(10, Number(process.env.AI_BATCH_HIGHLIGHT_TARGET || 3)));
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
const AI_STORY_SEED_BATCH_SIZE = Math.max(4, Math.min(28, Number(process.env.AI_STORY_SEED_BATCH_SIZE || 6)));
const AI_POST_TITLE_MAX_CHARS = Math.max(90, Math.min(170, Number(process.env.AI_POST_TITLE_MAX_CHARS || 140)));
const AI_POST_BODY_MAX_CHARS = Math.max(280, Math.min(620, Number(process.env.AI_POST_BODY_MAX_CHARS || 460)));
const AI_HIGHLIGHT_MAX_WORDS = Math.max(30, Math.min(70, Number(process.env.AI_HIGHLIGHT_MAX_WORDS || 54)));
const AI_MIN_VALID_HIGHLIGHT_ROWS = Math.max(1, Number(process.env.AI_MIN_VALID_HIGHLIGHT_ROWS || AI_MIN_HIGHLIGHTS_FOR_PARTIAL_INSERT));
const MAX_HIGHLIGHTS = Math.min(70, Math.max(20, Number(process.env.MAX_HIGHLIGHTS || 40)));
const AI_PUBLIC_HIGHLIGHT_TARGET = Math.max(
    AI_MIN_VALID_HIGHLIGHT_ROWS,
    Math.min(MAX_HIGHLIGHTS, Number(process.env.AI_PUBLIC_HIGHLIGHT_TARGET || 32))
);
const AI_GROUP_STAGE_HIGHLIGHT_MAX = Math.max(4, Number(process.env.AI_GROUP_STAGE_HIGHLIGHT_MAX || 10));
const AI_PARTICIPANT_HIGHLIGHT_MAX = Math.max(2, Number(process.env.AI_PARTICIPANT_HIGHLIGHT_MAX || 6));
const AI_STAGE_SUMMARY_MAX = Math.max(0, Number(process.env.AI_STAGE_SUMMARY_MAX || 2));
const AI_STYLE_FAMILY_MAX = Math.max(2, Number(process.env.AI_STYLE_FAMILY_MAX || 3));
const AI_MAX_CALCULATED_TOP_UP = Math.max(0, Number(process.env.AI_MAX_CALCULATED_TOP_UP || 4));
const AI_TOP_UP_WITH_CALCULATED_HIGHLIGHTS = String(process.env.AI_TOP_UP_WITH_CALCULATED_HIGHLIGHTS || "true").toLowerCase() !== "false";
const AI_CALCULATED_HIGHLIGHT_TOP_UP_TO = Math.max(0, Number(process.env.AI_CALCULATED_HIGHLIGHT_TOP_UP_TO || Math.min(MAX_HIGHLIGHTS, Math.max(45, AI_MIN_VALID_HIGHLIGHT_ROWS))));
const AI_ENFORCE_UNIQUE_TITLES = String(process.env.AI_ENFORCE_UNIQUE_TITLES || "true").toLowerCase() !== "false";
const AI_TITLE_MATCH_HINT = String(process.env.AI_TITLE_MATCH_HINT || "true").toLowerCase() !== "false";
const AI_SKIP_IF_SAME_COMPLETED_COUNT_EXISTS = String(process.env.AI_SKIP_IF_SAME_COMPLETED_COUNT_EXISTS || "false").toLowerCase() === "true";
const AI_AUTO_STAGE_MODE = String(process.env.AI_AUTO_STAGE_MODE || "false").toLowerCase() === "true";
const AUTO_GENERATION_REMAINING_MATCHES = Math.max(0, Number(process.env.AUTO_GENERATION_REMAINING_MATCHES || 6));
const AI_AUTO_MIN_MATCH_AGE_HOURS = Math.max(0, Number(process.env.AI_AUTO_MIN_MATCH_AGE_HOURS || 4));
const AI_GENERATION_MODE_SETTING = String(process.env.AI_GENERATION_MODE || "auto").trim().toLowerCase();
const INCREMENTAL_BASE_COMPLETED_MATCH_COUNT = Math.max(0, Number(process.env.INCREMENTAL_BASE_COMPLETED_MATCH_COUNT || 98));
const INCREMENTAL_HIGHLIGHT_MARKER = "incremental_final_match";
const INCREMENTAL_PROFILE_MARKER = "incremental_profile_refresh";
const FULL_FINAL_RECAP_MARKER = "full_final_recap";

const EXPECTED_WORLD_CUP_MATCH_COUNT = Number(process.env.EXPECTED_WORLD_CUP_MATCH_COUNT || 104);
const ALLOW_FINAL_PREVIEW = String(process.env.ALLOW_FINAL_PREVIEW || "false").toLowerCase() === "true";
const PUBLISH_VISIBLE = String(process.env.PUBLISH_VISIBLE || "false").toLowerCase() === "true";
const RESET_EXISTING_FINAL_AI = String(process.env.RESET_EXISTING_FINAL_AI || "true").toLowerCase() !== "false";
const GENERATE_PROFILES_SETTING = String(process.env.GENERATE_PROFILES || "auto").toLowerCase();
let GENERATE_PROFILES = false;
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
const GENERATOR_VERSION = "wc-final-recap-v39-curated-highlights-v3";
const BONUS_EXACT_POINTS_BY_STAGE = { SEMI_FINALS: 100, THIRD_PLACE: 100, FINAL: 200 };
const CHAMPION_WINNER_POINTS = 50;
const CHAMPION_RUNNER_UP_POINTS = 10;

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


const HIGHLIGHT_QUALITY_SELF_TEST = String(process.env.HIGHLIGHT_QUALITY_SELF_TEST || "false").toLowerCase() === "true";

if (!HIGHLIGHT_QUALITY_SELF_TEST && !SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!HIGHLIGHT_QUALITY_SELF_TEST && !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!HIGHLIGHT_QUALITY_SELF_TEST && !AI_API_KEY) throw new Error("Missing AI_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY");
if (!HIGHLIGHT_QUALITY_SELF_TEST && !AI_MODEL) throw new Error("Missing AI_MODEL, OPENAI_MODEL, or OPENROUTER_MODEL");
if (!Number.isInteger(EXPECTED_WORLD_CUP_MATCH_COUNT) || EXPECTED_WORLD_CUP_MATCH_COUNT < 1) {
    throw new Error("EXPECTED_WORLD_CUP_MATCH_COUNT must be a positive integer");
}
if (!["auto", "incremental", "full", "full_final"].includes(AI_GENERATION_MODE_SETTING)) {
    throw new Error("AI_GENERATION_MODE must be auto, incremental, full, or full_final");
}

function shouldGenerateProfilesForRun(factsPack = {}) {
    if (GENERATE_PROFILES_SETTING === "true") return true;
    if (GENERATE_PROFILES_SETTING === "false") return false;

    /*
      "auto": refresh the participant closing messages after every result in
      the final-six window. These rows are built deterministically from the
      latest calculated participant facts, so they stay current without
      spending separate AI profile batches.
    */
    const remaining = Number(factsPack?.audit?.remainingExpectedMatches);
    return Number.isFinite(remaining)
        && remaining >= 0
        && remaining <= AUTO_GENERATION_REMAINING_MATCHES;
}

function getAutoGenerationSkipReason(factsPack = {}) {
    // Manual workflow_dispatch runs are always allowed.
    if (!AI_AUTO_STAGE_MODE) return "";

    const remaining = Number(factsPack?.audit?.remainingExpectedMatches);
    const completed = Number(factsPack?.audit?.completedMatches);

    if (!Number.isFinite(remaining) || !Number.isFinite(completed) || completed <= 0) {
        return "invalid or incomplete tournament progress data";
    }

    if (remaining < 0 || remaining > AUTO_GENERATION_REMAINING_MATCHES) {
        return `outside final-${AUTO_GENERATION_REMAINING_MATCHES} automatic window`;
    }

    /*
      Wait after the latest completed match's kickoff before the paid AI call.
      This lets result sync and final-event-note fetching settle first, so the
      single generation for that completed count includes the available notes.
    */
    const latestKickoff = factsPack?.audit?.latestCompletedMatchKickoff;
    const latestKickoffMs = latestKickoff ? new Date(latestKickoff).getTime() : NaN;

    if (Number.isFinite(latestKickoffMs) && AI_AUTO_MIN_MATCH_AGE_HOURS > 0) {
        const readyAtMs = latestKickoffMs + AI_AUTO_MIN_MATCH_AGE_HOURS * 60 * 60 * 1000;
        if (Date.now() < readyAtMs) {
            return `waiting for result/event-note stabilization until ${new Date(readyAtMs).toISOString()}`;
        }
    }

    return "";
}

function shouldGenerateHighlightsForRun(factsPack = {}) {
    return !getAutoGenerationSkipReason(factsPack);
}

async function shouldSkipBecauseSameCompletedCountExists(factsPack = {}) {
    if (!AI_SKIP_IF_SAME_COMPLETED_COUNT_EXISTS) return false;

    const completed = Number(factsPack?.audit?.completedMatches);
    if (!Number.isInteger(completed) || completed < 1) return false;

    const existing = await optionalSupabaseFetch(
        `${POSTS_TABLE}?section_key=eq.${FINAL_HIGHLIGHTS_SECTION}` +
        `&source_completed_match_count=eq.${completed}` +
        `&visible=eq.true&select=id&limit=1`
    );

    return Array.isArray(existing) && existing.length > 0;
}


function resolveGenerationMode(factsPack = {}) {
    if (["full", "full_final"].includes(AI_GENERATION_MODE_SETTING)) return "full_final";
    if (AI_GENERATION_MODE_SETTING === "incremental") return "incremental";
    return factsPack?.audit?.finalDataReady ? "full_final" : "incremental";
}

function getStoredRowCard(row = {}) {
    return Array.isArray(row.cards_json) ? (row.cards_json[0] || {}) : {};
}

function getStoredGenerationMode(row = {}) {
    return String(getStoredRowCard(row).generation_mode || "").trim();
}

function getStoredMatchId(row = {}) {
    return String(getStoredRowCard(row).source_match_id || "").trim();
}

async function loadExistingFinalAiRows() {
    const select = [
        "id", "section_key", "title_ar", "subtitle_ar", "body_ar", "icon",
        "cards_json", "participant_id", "source_completed_match_count",
        "source_match_ids", "source_hash", "display_order", "visible", "created_at"
    ].join(",");
    return optionalSupabaseFetch(
        `${POSTS_TABLE}?section_key=in.(${FINAL_HIGHLIGHTS_SECTION},${FINAL_PROFILE_SECTION})` +
        `&visible=eq.true&select=${select}&order=display_order.desc`
    );
}

function getIncrementalCandidateMatches(factsPack = {}) {
    const completed = Array.isArray(factsPack?.contest?.matches) ? factsPack.contest.matches : [];
    return completed.slice(INCREMENTAL_BASE_COMPLETED_MATCH_COUNT);
}

function hasAutomaticFullFinalRecap(existingRows = [], factsPack = {}) {
    if (!factsPack?.audit?.finalDataReady) return false;
    return existingRows.some((row) =>
        row.section_key === FINAL_HIGHLIGHTS_SECTION &&
        Number(row.source_completed_match_count) === Number(factsPack.audit.completedMatches) &&
        getStoredGenerationMode(row) === FULL_FINAL_RECAP_MARKER
    );
}

function getMissingIncrementalMatches(factsPack = {}, existingRows = []) {
    const completedIncrementalIds = new Set(
        existingRows
            .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
            .filter((row) => [INCREMENTAL_HIGHLIGHT_MARKER, FULL_FINAL_RECAP_MARKER].includes(getStoredGenerationMode(row)))
            .map(getStoredMatchId)
            .filter(Boolean)
    );
    return getIncrementalCandidateMatches(factsPack)
        .filter((match) => match?.id && !completedIncrementalIds.has(String(match.id)));
}

function profilesNeedRefresh(existingRows = [], factsPack = {}) {
    const profileRows = existingRows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
    if (profileRows.length < Number(factsPack?.audit?.activeParticipants || 0)) return true;
    return profileRows.some((row) => Number(row.source_completed_match_count) !== Number(factsPack?.audit?.completedMatches));
}

function sanitizeStoredRowForInsert(row = {}) {
    return {
        section_key: row.section_key,
        title_ar: row.title_ar,
        subtitle_ar: row.subtitle_ar,
        body_ar: row.body_ar,
        icon: row.icon,
        cards_json: row.cards_json,
        participant_id: row.participant_id || null,
        source_completed_match_count: row.source_completed_match_count,
        source_match_ids: row.source_match_ids,
        source_hash: row.source_hash,
        display_order: row.display_order,
        visible: row.visible !== false
    };
}

function markRowGenerationMode(row, generationMode) {
    const cards = Array.isArray(row.cards_json) && row.cards_json.length
        ? row.cards_json.map((card, index) => index === 0 ? { ...card, generation_mode: generationMode } : card)
        : [{ generation_mode: generationMode }];
    return {
        ...row,
        cards_json: cards,
        source_hash: `${GENERATOR_VERSION}:${generationMode}:${String(row.source_hash || hashObject([row.title_ar, row.body_ar]))}`
    };
}

function buildIncrementalSeedForMatch(match = {}, factsPack = {}) {
    const seeds = (factsPack?.contest?.integratedStorySeeds || [])
        .filter((seed) => String(seed?.match?.id || "") === String(match.id))
        .filter((seed) => !["participant_arc", "stage_mood"].includes(seed.type))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    if (seeds.length) return seeds[0];

    const notes = (factsPack?.contest?.eventNotes || []).filter((note) => String(note.match_id || "") === String(match.id));
    return {
        type: "knockout_pressure",
        priority: 1000 + stageDisplayScore(match.stageLabel || match.stage),
        title: `${match.title}: لقطة الحسم`,
        match,
        verified_event_context: notes.slice(0, 3).map((note) => ({ ...note, source_note_id: note.id })),
        story_key: `incremental:${match.id}`,
        post_blueprint: {
            kind: "knockout_pressure",
            hook_style: "ابدأ من ضغط المباراة وأثرها في توقعات المشاركين.",
            story_question: "من قرأ المباراة بشكل أدق، وكيف انعكس ذلك على النقاط؟",
            mood: "حسم إقصائي",
            must_include_facts: [match.title, match.score]
        }
    };
}

function buildGuaranteedIncrementalFallback(seed = {}, match = {}, index = 0) {
    const exactNames = Array.isArray(match.exactNames) ? match.exactNames.slice(0, 3) : [];
    const correctNames = Array.isArray(match.correctNames) ? match.correctNames.filter((name) => !exactNames.includes(name)).slice(0, 2) : [];
    const score = match.score || "النتيجة المسجلة";
    const exactPoints = ["SEMI_FINALS", "THIRD_PLACE"].includes(match.stage) ? 100 : (match.stage === "FINAL" ? 200 : 50);
    let body = "";
    if (exactNames.length) {
        body = `ضغط ${match.stageLabel || "الأدوار الإقصائية"} لم يترك مساحة كبيرة للخطأ. انتهت ${match.title} بنتيجة ${score}، وأصاب ${exactNames.join(" و")} النتيجة بالملّي ليحصل كل اسم على ${exactPoints} نقطة${correctNames.length ? `، بينما اكتفى ${correctNames.join(" و")} بالاتجاه الصحيح` : ""}.`;
    } else if (correctNames.length) {
        body = `كانت ${match.title} اختباراً صعباً في ${match.stageLabel || "الأدوار الإقصائية"}. انتهت المواجهة ${score}، ولم تظهر نتيجة بالملّي، لكن توقعات ${correctNames.join(" و")} جاءت في الاتجاه الصحيح، وحصل كل اسم على 10 نقاط في لحظة حسم واضحة.`;
    } else {
        body = `رفعت ${match.title} ضغط المسابقة مع اقتراب النهاية. انتهت المواجهة ${score} من دون قراءة بالملّي بين المشاركين، فصارت قيمتها في صعوبة التوقع نفسها وفي أثرها المباشر على طريق البطولة.`;
    }
    return {
        title_ar: `${String(match.title || "مباراة الحسم").replace(/ ضد /g, " × ")}: لقطة من طريق النهاية`,
        body_ar: body,
        icon: "🏆",
        category: "knockout_pressure",
        stage_ar: match.stageLabel || getStageLabel(match.stage),
        participant_names: [...exactNames, ...correctNames].slice(0, 4),
        source_fact: `${match.title} | ${seed.title || match.title}`,
        source_note_ids: (seed.verified_event_context || []).map((item) => item.source_note_id || item.id).filter(Boolean).slice(0, 4),
        source_key: seed.story_key || `incremental:${match.id}`,
        source_match_id: match.id,
        generated_by: "guaranteed_incremental_fallback"
    };
}

function normalizeIncrementalHighlightPost(post, seed, match, factsPack, index, displayOrder) {
    const sourceNoteIds = (seed?.verified_event_context || [])
        .map((item) => item?.source_note_id || item?.id)
        .filter(Boolean)
        .slice(0, 6);
    const forcedPost = {
        ...post,
        category: seed?.type || post?.category || "knockout_pressure",
        stage_ar: match.stageLabel || getStageLabel(match.stage),
        source_fact: `${match.title} | ${seed?.title || post?.source_fact || match.title}`,
        source_note_ids: sourceNoteIds,
        source_key: seed?.story_key || post?.source_key || `incremental:${match.id}`,
        source_match_id: match.id
    };
    const presentation = resolveHighlightPresentation(forcedPost, factsPack);
    const polishedPost = {
        ...forcedPost,
        stage_ar: presentation.stage,
        icon: presentation.icon,
        body_ar: polishHighlightArabicText(forcedPost.body_ar),
        title_ar: polishHighlightArabicText(forcedPost.title_ar)
    };
    const body = formatHighlightBody(polishedPost.body_ar);
    const title = cleanText(buildDisplayHighlightTitle(polishedPost, index, factsPack), AI_POST_TITLE_MAX_CHARS);
    if (!title || !body || isLowQualityHighlightPost({ ...polishedPost, title_ar: title, body_ar: body })) return null;

    const sourceCompletedMatchCount = factsPack.audit.completedMatches;
    const sourceMatchIds = (factsPack.contest.matches || []).map((item) => item.id);
    return markRowGenerationMode({
        section_key: FINAL_HIGHLIGHTS_SECTION,
        title_ar: title,
        subtitle_ar: cleanText(presentation.stage, 80),
        body_ar: body,
        icon: cleanText(presentation.icon || forcedPost.icon || "🏆", 8),
        cards_json: [{
            type: cleanText(forcedPost.category || "knockout_pressure", 40),
            stage_ar: cleanText(presentation.stage, 80),
            participant_names: Array.isArray(forcedPost.participant_names) ? forcedPost.participant_names.slice(0, 6) : [],
            source_fact: cleanText(forcedPost.source_fact || match.title, 180),
            source_note_ids: sourceNoteIds,
            source_key: cleanText(forcedPost.source_key || `incremental:${match.id}`, 180),
            source_match_id: String(match.id)
        }],
        participant_id: null,
        source_completed_match_count: sourceCompletedMatchCount,
        source_match_ids: sourceMatchIds,
        source_hash: `${GENERATOR_VERSION}:incremental:${match.id}:${hashObject([title, body, sourceCompletedMatchCount])}`,
        display_order: displayOrder,
        visible: PUBLISH_VISIBLE
    }, INCREMENTAL_HIGHLIGHT_MARKER);
}

async function generateIncrementalHighlightRows(factsPack, missingMatches, existingRows) {
    const existingTitles = existingRows
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
        .map((row) => row.title_ar)
        .filter(Boolean)
        .slice(0, 40);
    const maxOrder = Math.max(2000, ...existingRows.map((row) => Number(row.display_order || 0)));
    const rows = [];

    for (let index = 0; index < missingMatches.length; index += 1) {
        const match = missingMatches[index];
        const seed = buildIncrementalSeedForMatch(match, factsPack);
        const prompt = buildBatchPrompt({
            batchName: `incremental-${match.id}`,
            instruction: "اكتب منشوراً واحداً فقط لهذه المباراة المكتملة. المباراة من آخر ست مباريات، لذلك وجودها في الأضواء إلزامي. لا تعيد كتابة أي عنوان قديم، ولا تكتب profile_messages. حافظ على الدقة واللغة، وركز على أثر المباراة في مسابقة التوقعات.",
            highlightTarget: 1,
            profileTarget: 0,
            facts: {
                generator: factsPack.generator,
                audit: factsPack.audit,
                language: factsPack.language,
                strictRules: factsPack.strictRules,
                active_participant_names: (factsPack.contest.activeParticipants || []).map((participant) => participant.name),
                leaderboard_top: (factsPack.contest.leaderboard || []).slice(0, 8),
                existing_highlight_titles: existingTitles,
                story_seeds: [seed],
                match,
                event_notes: (factsPack.contest.eventNotes || []).filter((note) => String(note.match_id || "") === String(match.id))
            }
        });

        let post = null;
        try {
            const batch = await runAiJsonBatch(prompt, `incremental-${match.id}`);
            post = Array.isArray(batch?.highlights) ? batch.highlights[0] : null;
        } catch (error) {
            console.warn(`Incremental AI wording failed for ${match.title}; using guaranteed factual fallback: ${error.message}`);
        }

        let row = post ? normalizeIncrementalHighlightPost(post, seed, match, factsPack, index, maxOrder + missingMatches.length - index) : null;
        if (!row) {
            row = normalizeIncrementalHighlightPost(
                buildCalculatedHighlightPost(seed, index) || buildGuaranteedIncrementalFallback(seed, match, index),
                seed,
                match,
                factsPack,
                index,
                maxOrder + missingMatches.length - index
            );
        }
        if (!row) {
            row = normalizeIncrementalHighlightPost(
                buildGuaranteedIncrementalFallback(seed, match, index),
                seed,
                match,
                factsPack,
                index,
                maxOrder + missingMatches.length - index
            );
        }
        if (!row) throw new Error(`Could not build a valid incremental highlight for completed match ${match.title}. Existing rows were not changed.`);
        rows.push(row);
        existingTitles.push(row.title_ar);
    }

    assertHighlightsUseCompletedMatches(rows, factsPack);
    assertNoDuplicateFinalHighlights(rows, factsPack);
    return rows;
}

function buildIncrementalProfileRows(factsPack) {
    return rebuildSafeProfileRows([], factsPack)
        .filter((row) => row.section_key === FINAL_PROFILE_SECTION)
        .map((row) => markRowGenerationMode(row, INCREMENTAL_PROFILE_MARKER));
}

async function deleteRowsByIds(ids = []) {
    const cleanIds = [...new Set(ids.map(String).filter(Boolean))];
    const chunkSize = 40;
    for (let index = 0; index < cleanIds.length; index += chunkSize) {
        const chunk = cleanIds.slice(index, index + chunkSize);
        await supabaseFetch(`${POSTS_TABLE}?id=in.(${chunk.map(encodeURIComponent).join(",")})`, {
            method: "DELETE",
            headers: { Prefer: "return=minimal" }
        });
    }
}

async function clearExistingSection(sectionKey) {
    await supabaseFetch(`${POSTS_TABLE}?section_key=eq.${encodeURIComponent(sectionKey)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
    });
}

async function runIncrementalGeneration(factsPack, existingRows) {
    const missingMatches = getMissingIncrementalMatches(factsPack, existingRows);
    const refreshProfiles = GENERATE_PROFILES && profilesNeedRefresh(existingRows, factsPack);

    if (!missingMatches.length && !refreshProfiles) {
        console.log(`INCREMENTAL AI SKIPPED: no missing final-six match highlights and profiles already reflect ${factsPack.audit.completedMatches} completed matches.`);
        return;
    }

    console.log("INCREMENTAL FINAL-STAGE UPDATE");
    console.log(JSON.stringify({
        baselineCompletedMatches: INCREMENTAL_BASE_COMPLETED_MATCH_COUNT,
        completedMatches: factsPack.audit.completedMatches,
        missingMatches: missingMatches.map((match) => ({ id: match.id, title: match.title, stage: match.stage })),
        refreshProfiles
    }, null, 2));

    const newHighlightRows = missingMatches.length
        ? await generateIncrementalHighlightRows(factsPack, missingMatches, existingRows)
        : [];
    const profileRows = refreshProfiles ? buildIncrementalProfileRows(factsPack) : [];

    // Re-read immediately before writing, then remove only obsolete rows for the same newly completed matches.
    const currentRows = await loadExistingFinalAiRows();
    const targetMatchIds = new Set(missingMatches.map((match) => String(match.id)));
    const obsoleteMatchRowIds = currentRows
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
        .filter((row) => targetMatchIds.has(getStoredMatchId(row)))
        .map((row) => row.id)
        .filter(Boolean);

    if (obsoleteMatchRowIds.length) {
        await deleteRowsByIds(obsoleteMatchRowIds);
        console.log(`Removed ${obsoleteMatchRowIds.length} obsolete/previous highlight row(s) for the newly completed match(es).`);
    }
    if (refreshProfiles) {
        await clearExistingSection(FINAL_PROFILE_SECTION);
        console.log("Refreshed final_profile rows without rewriting historical highlights.");
    }

    const rowsToInsert = [...newHighlightRows, ...profileRows];
    if (rowsToInsert.length) await insertRows(rowsToInsert);
    clearBatchCheckpointAfterInsert();
    console.log(`Incremental update inserted ${newHighlightRows.length} new highlight(s) and ${profileRows.length} refreshed profile row(s). Existing unrelated highlights were untouched.`);
}

function mergeExistingHighlightsForFinalFallback(rows, existingRows, factsPack) {
    const generatedProfiles = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
    const generatedHighlights = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
    const completedIds = new Set((factsPack.contest.matches || []).map((match) => String(match.id)));
    const safeExisting = existingRows
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
        .filter((row) => {
            const matchId = getStoredMatchId(row);
            return !matchId || completedIds.has(matchId);
        })
        .map(sanitizeStoredRowForInsert);
    let merged = dedupeFinalHighlightRows([...generatedHighlights, ...safeExisting], factsPack, "final fallback merge")
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
        .sort(compareHighlightRows)
        .slice(0, AI_PUBLIC_HIGHLIGHT_TARGET);
    merged = merged.map((row) => markRowGenerationMode(row, FULL_FINAL_RECAP_MARKER));
    return [...merged, ...generatedProfiles];
}


function ensureMandatoryFinalSixHighlights(rows, existingRows, factsPack) {
    if (!factsPack?.audit?.finalDataReady) return rows;

    const profiles = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
    let highlights = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
    const mandatoryMatches = getIncrementalCandidateMatches(factsPack);
    const represented = new Set(highlights.map(getStoredMatchId).filter(Boolean));
    const existingByMatch = new Map(
        existingRows
            .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
            .map((row) => [getStoredMatchId(row), row])
            .filter(([matchId]) => Boolean(matchId))
    );
    let maxOrder = Math.max(2000, ...highlights.map((row) => Number(row.display_order || 0)));

    for (const match of mandatoryMatches) {
        const matchId = String(match.id || "");
        if (!matchId || represented.has(matchId)) continue;

        let row = existingByMatch.get(matchId)
            ? sanitizeStoredRowForInsert(existingByMatch.get(matchId))
            : null;

        if (!row) {
            const seed = buildIncrementalSeedForMatch(match, factsPack);
            row = normalizeIncrementalHighlightPost(
                buildCalculatedHighlightPost(seed, highlights.length) || buildGuaranteedIncrementalFallback(seed, match, highlights.length),
                seed,
                match,
                factsPack,
                highlights.length,
                ++maxOrder
            );
            if (!row) {
                row = normalizeIncrementalHighlightPost(
                    buildGuaranteedIncrementalFallback(seed, match, highlights.length),
                    seed,
                    match,
                    factsPack,
                    highlights.length,
                    ++maxOrder
                );
            }
        }

        if (!row) throw new Error(`Automatic final recap could not guarantee a highlight for ${match.title}. Existing rows were not cleared.`);
        highlights.push(markRowGenerationMode(row, FULL_FINAL_RECAP_MARKER));
        represented.add(matchId);
        console.warn(`Automatic final recap guaranteed mandatory final-six highlight: ${match.title}`);
    }

    highlights = dedupeFinalHighlightRows(highlights, factsPack, "mandatory final-six protection")
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);

    const mandatoryIds = new Set(mandatoryMatches.map((match) => String(match.id)));
    const mandatoryRows = highlights.filter((row) => mandatoryIds.has(getStoredMatchId(row))).sort(compareHighlightRows);
    const otherRows = highlights.filter((row) => !mandatoryIds.has(getStoredMatchId(row))).sort(compareHighlightRows);
    highlights = [...mandatoryRows, ...otherRows.slice(0, Math.max(0, AI_PUBLIC_HIGHLIGHT_TARGET - mandatoryRows.length))];

    return [...highlights, ...profiles];
}

async function main() {
    const factsPack = await buildFactsPack();
    GENERATE_PROFILES = shouldGenerateProfilesForRun(factsPack);
    const generationMode = resolveGenerationMode(factsPack);
    const existingRows = await loadExistingFinalAiRows();

    if (!shouldGenerateHighlightsForRun(factsPack)) {
        console.log(`AUTO AI GENERATION SKIPPED: ${getAutoGenerationSkipReason(factsPack) || "not ready"}.`);
        console.log(JSON.stringify({
            generationMode,
            completedMatches: factsPack.audit.completedMatches,
            quarterFinalsComplete: factsPack.audit.quarterFinalsComplete,
            semiFinalsComplete: factsPack.audit.semiFinalsComplete,
            thirdPlaceComplete: factsPack.audit.thirdPlaceComplete,
            tournamentComplete: factsPack.audit.finalDataReady
        }, null, 2));
        return;
    }

    if (generationMode === "incremental") {
        await runIncrementalGeneration(factsPack, existingRows);
        return;
    }

    if (AI_AUTO_STAGE_MODE && hasAutomaticFullFinalRecap(existingRows, factsPack)) {
        console.log(`AUTO FULL FINAL RECAP SKIPPED: a ${FULL_FINAL_RECAP_MARKER} snapshot already exists for ${factsPack.audit.completedMatches} completed matches.`);
        return;
    }

    console.log("FINAL AI GENERATION FACT SUMMARY");
    console.log(JSON.stringify({
        generationMode,
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
        aiMinValidHighlightRows: AI_MIN_VALID_HIGHLIGHT_ROWS,
        aiTopUpWithCalculatedHighlights: AI_TOP_UP_WITH_CALCULATED_HIGHLIGHTS,
        aiCalculatedHighlightTopUpTo: AI_CALCULATED_HIGHLIGHT_TOP_UP_TO,
        aiResumeFromCheckpoint: AI_RESUME_FROM_CHECKPOINT,
        aiBatchCheckpointFile: AI_BATCH_CHECKPOINT_FILE,
        publicHighlightTarget: AI_PUBLIC_HIGHLIGHT_TARGET,
        groupStageHighlightMax: AI_GROUP_STAGE_HIGHLIGHT_MAX,
        participantHighlightMax: AI_PARTICIPANT_HIGHLIGHT_MAX,
        stageSummaryMax: AI_STAGE_SUMMARY_MAX,
        styleFamilyMax: AI_STYLE_FAMILY_MAX,
        maxCalculatedTopUp: AI_MAX_CALCULATED_TOP_UP,
        autoMinMatchAgeHours: AI_AUTO_MIN_MATCH_AGE_HOURS,
        latestCompletedMatchKickoff: factsPack.audit.latestCompletedMatchKickoff,
        liveMatchesWithScoreIgnored: factsPack.audit.liveMatchesWithScoreIgnored,
        ignoredTrustedNotesForNonCompletedMatches: factsPack.audit.ignoredTrustedNotesForNonCompletedMatches
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
    let rows = normalizeAiOutputToRows(aiOutput, factsPack);
    rows = dedupeFinalHighlightRows(rows, factsPack, "normalized AI rows");
    rows = curateHighlightRows(rows, factsPack, AI_PUBLIC_HIGHLIGHT_TARGET);
    let highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
    let profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);

    console.log(`Prepared curated rows for ${POSTS_TABLE}: ${highlightRows.length} final_highlights, ${profileRows.length} final_profile.`);

    if (AI_TOP_UP_WITH_CALCULATED_HIGHLIGHTS && highlightRows.length < AI_PUBLIC_HIGHLIGHT_TARGET) {
        const before = highlightRows.length;
        const topUpTarget = Math.min(
            MAX_HIGHLIGHTS,
            Math.max(AI_MIN_VALID_HIGHLIGHT_ROWS, AI_PUBLIC_HIGHLIGHT_TARGET, AI_CALCULATED_HIGHLIGHT_TOP_UP_TO)
        );
        rows = addCalculatedHighlightRowsToRows(rows, factsPack, topUpTarget);
        rows = dedupeFinalHighlightRows(rows, factsPack, "rows after calculated top-up");
        rows = curateHighlightRows(rows, factsPack, AI_PUBLIC_HIGHLIGHT_TARGET);
        highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
        profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
        console.warn(`Curated top-up: final_highlights ${before} -> ${highlightRows.length}.`);
    }

    if (rows.length === 0) {
        throw new Error("AI returned no valid rows to save, and calculated top-up could not create safe rows.");
    }

    if (highlightRows.length < AI_MIN_VALID_HIGHLIGHT_ROWS && generationMode === "full_final" && existingRows.length) {
        const before = highlightRows.length;
        rows = mergeExistingHighlightsForFinalFallback(rows, existingRows, factsPack);
        highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
        profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
        console.warn(`Automatic final recap fallback merged the frozen baseline: ${before} -> ${highlightRows.length} highlights.`);
    }

    if (highlightRows.length < AI_MIN_VALID_HIGHLIGHT_ROWS) {
        throw new Error(
            `Only ${highlightRows.length} valid final_highlights rows are available; minimum is ${AI_MIN_VALID_HIGHLIGHT_ROWS}. ` +
            `Nothing was cleared or inserted. The next automatic cycle will retry.`
        );
    }

    if (GENERATE_PROFILES && profileRows.length < factsPack.audit.activeParticipants) {
        console.warn(`Profile rows are ${profileRows.length}/${factsPack.audit.activeParticipants}; rebuilding safe calculated profile rows.`);
        rows = rebuildSafeProfileRows(rows, factsPack);
        highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
        profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
    }

    rows = dedupeFinalHighlightRows(rows, factsPack, "pre-insert rows");
    rows = curateHighlightRows(rows, factsPack, AI_PUBLIC_HIGHLIGHT_TARGET);
    rows = sortAndRenumberAiRows(rows, factsPack);
    highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
    profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);

    if (highlightRows.length < AI_MIN_VALID_HIGHLIGHT_ROWS && generationMode === "full_final" && existingRows.length) {
        rows = mergeExistingHighlightsForFinalFallback(rows, existingRows, factsPack);
        highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
        profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
    }

    if (generationMode === "full_final") {
        rows = ensureMandatoryFinalSixHighlights(rows, existingRows, factsPack);
        highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
        profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);
    }

    if (highlightRows.length < AI_MIN_VALID_HIGHLIGHT_ROWS) {
        throw new Error(
            `Only ${highlightRows.length} unique final_highlights remained after final duplicate protection; ` +
            `minimum is ${AI_MIN_VALID_HIGHLIGHT_ROWS}. Existing database rows were not cleared; the automatic cycle will retry.`
        );
    }

    rows = rows.map((row) => markRowGenerationMode(row, FULL_FINAL_RECAP_MARKER));
    highlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
    profileRows = rows.filter((row) => row.section_key === FINAL_PROFILE_SECTION);

    assertHighlightsUseCompletedMatches(rows, factsPack);
    assertNoDuplicateFinalHighlights(rows, factsPack);
    console.log(`Validated ${generationMode} AI rows: ${highlightRows.length} unique final_highlights, ${profileRows.length} final_profile.`);

    if (RESET_EXISTING_FINAL_AI) {
        await clearExistingFinalAiRows();
    }

    await insertRows(rows);
    clearBatchCheckpointAfterInsert();

    console.log(`Inserted ${rows.length} row(s) into ${POSTS_TABLE}: ${highlightRows.length} final_highlights, ${profileRows.length} final_profile.`);
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
        match_score: linkedMatch && isCompletedMatch(linkedMatch)
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

function isCompletedMatch(match) {
    return String(match?.status || "").toLowerCase() === "completed" && hasActualScore(match);
}

function getOutcome(a, b) {
    if (a > b) return "team1";
    if (b > a) return "team2";
    return "draw";
}

function calculatePoints(prediction, match) {
    const p1 = Number(prediction.predicted_team1_goals);
    const p2 = Number(prediction.predicted_team2_goals);

    if (p1 === match.actual_team1_goals && p2 === match.actual_team2_goals) return getExactScorePointsForStage(match);

    return getOutcome(p1, p2) === getOutcome(match.actual_team1_goals, match.actual_team2_goals) ? 10 : 0;
}

function getExactScorePointsForStage(matchOrStage = null) {
    const stage = typeof matchOrStage === "string" ? matchOrStage : (matchOrStage?.stage || "");
    return BONUS_EXACT_POINTS_BY_STAGE[stage] || 50;
}

function isExactScorePrediction(prediction, match) {
    if (!prediction || !match) return false;
    return Number(prediction.predicted_team1_goals) === Number(match.actual_team1_goals)
        && Number(prediction.predicted_team2_goals) === Number(match.actual_team2_goals);
}

function normalizeTeamName(value) {
    return String(value || "").trim();
}

function getWinnerTeamFromMatch(match) {
    if (!match || !isCompletedMatch(match)) return null;
    const winnerSide = String(match.winner_side || "").toUpperCase();
    if (winnerSide === "HOME_TEAM") return match.team1;
    if (winnerSide === "AWAY_TEAM") return match.team2;
    if (Number(match.actual_team1_goals) > Number(match.actual_team2_goals)) return match.team1;
    if (Number(match.actual_team2_goals) > Number(match.actual_team1_goals)) return match.team2;
    return null;
}

function getLoserTeamFromMatch(match) {
    const winner = getWinnerTeamFromMatch(match);
    if (!winner) return null;
    if (normalizeTeamName(winner) === normalizeTeamName(match.team1)) return match.team2;
    if (normalizeTeamName(winner) === normalizeTeamName(match.team2)) return match.team1;
    return null;
}

function getChampionResult(matches = []) {
    const finalMatch = [...matches].filter((match) => match.stage === "FINAL" && isCompletedMatch(match)).sort((a, b) => new Date(b.kickoff_at || 0) - new Date(a.kickoff_at || 0))[0];
    if (!finalMatch) return null;
    const champion = getWinnerTeamFromMatch(finalMatch);
    return champion ? { champion, runnerUp: getLoserTeamFromMatch(finalMatch), finalMatch } : null;
}

function calculateChampionPredictionPoints(predictedTeam, championResult) {
    if (!predictedTeam || !championResult?.champion) return 0;
    const normalized = normalizeTeamName(predictedTeam);
    if (normalized === normalizeTeamName(championResult.champion)) return CHAMPION_WINNER_POINTS;
    if (championResult.runnerUp && normalized === normalizeTeamName(championResult.runnerUp)) return CHAMPION_RUNNER_UP_POINTS;
    return 0;
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

function isStageComplete(matches = [], stage) {
    const stageMatches = matches.filter((match) => match.stage === stage);
    return stageMatches.length > 0 && stageMatches.every(isCompletedMatch);
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
    const [participants, matches, allEventNotes, championPredictions] = await Promise.all([
        supabaseFetch("participants?select=id,name,active,sort_order&order=sort_order.asc"),
        supabaseFetch("matches?select=id,team1,team2,kickoff_at,status,stage,score_duration,winner_side,actual_team1_goals,actual_team2_goals&order=kickoff_at.asc"),
        loadFinalEventNotes(),
        optionalSupabaseFetch("champion_predictions?select=participant_id,predicted_team,points")
    ]);

    const allParticipants = participants || [];
    const activeParticipants = allParticipants.filter((participant) => participant.active !== false);
    const activeParticipantIds = new Set(activeParticipants.map((participant) => String(participant.id)));
    const participantMap = new Map(activeParticipants.map((participant) => [String(participant.id), participant]));
    const allMatches = matches || [];
    const allEventNoteRows = allEventNotes || [];
    const completedMatches = allMatches.filter(isCompletedMatch);
    const completedIds = completedMatches.map((match) => match.id);
    const completedIdSet = new Set(completedIds.map(String));
    const trustedEventNotes = selectTrustedEventNotes(allEventNoteRows, allMatches);
    const approvedEventNotes = trustedEventNotes.filter((note) => {
        return !note.match_id || completedIdSet.has(String(note.match_id));
    });
    const ignoredTrustedNotesForNonCompletedMatches = trustedEventNotes.length - approvedEventNotes.length;
    const draftEventNotes = allEventNoteRows.filter((note) => note.approved !== true);
    const rawPredictions = await loadPredictionsForMatches(completedIds);
    const predictions = rawPredictions.filter((prediction) => activeParticipantIds.has(String(prediction.participant_id)));
    const predictionsByMatch = groupBy(predictions, "match_id");
    const predictionsByParticipant = groupBy(predictions, "participant_id");
    const championResult = getChampionResult(completedMatches);
    const championPredictionMap = new Map((championPredictions || []).map((row) => [String(row.participant_id), row]));
    const participantRows = buildParticipantFacts(activeParticipants, completedMatches, predictionsByParticipant, championPredictionMap, championResult);
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
            latestCompletedMatchKickoff: completedMatches.length
                ? completedMatches[completedMatches.length - 1].kickoff_at
                : null,
            missingFixtureRows: Math.max(0, EXPECTED_WORLD_CUP_MATCH_COUNT - allMatches.length),
            activeParticipants: activeParticipants.length,
            inactiveParticipants: allParticipants.filter((p) => p.active === false).map((p) => p.name),
            approvedEventNotes: approvedEventNotes.length,
            rawEventNotes: allEventNoteRows.length,
            draftEventNotes: draftEventNotes.length,
            trustedEventNotesUsed: approvedEventNotes.length,
            ignoredTrustedNotesForNonCompletedMatches,
            liveMatchesWithScoreIgnored: allMatches.filter((match) => String(match?.status || "").toLowerCase() !== "completed" && hasActualScore(match)).length,
            approvedEventNotesWithSource: approvedEventNotes.filter((note) => Boolean(note.source_url || note.source_name)).length,
            approvedEventNotesByStage: countBy(approvedEventNotes.map((note) => note.stage || getStageForEventNote(note, allMatches) || "unspecified")),
            approvedEventNotesByMood: countBy(approvedEventNotes.map((note) => note.mood || "unspecified")),
            finalDataReady: allMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT && completedMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT && allMatches.every(isCompletedMatch),
            quarterFinalsComplete: isStageComplete(allMatches, "QUARTER_FINALS"),
            semiFinalsComplete: isStageComplete(allMatches, "SEMI_FINALS"),
            thirdPlaceComplete: isStageComplete(allMatches, "THIRD_PLACE")
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
            championPrediction: championResult ? { champion: championResult.champion, runnerUp: championResult.runnerUp } : null,
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
            "لا تجعل القصة عن البطل فقط، لكن لا تجبر كل مشارك على منشور مستقل؛ صفحات الملف الشخصي تغطي الجميع، والأضواء تختار القصص الأقوى فقط.",
            "لا تفضح قلة المشاركة ولا تسخر من أحد.",
            "استخدم ضمائر صحيحة للأسماء النسائية المذكورة في participantLanguage.",
            "لا تستخدم عبارات صحفية عامة مثل الجمهور كان متحمساً أو تداولت الأحاديث، ولا تتكلم عن جمهور غير موجود في البيانات.",
            "نتيجة بالملّي = 50 نقطة، وفي نصف النهائي والمركز الثالث = 100، وفي النهائي = 200. الاتجاه الصحيح فقط = 10 نقاط. لا تخترع نقاطاً إضافية.",
            "كل منشور: عنوان محدد + وصف من جملتين أو ثلاث، بين 28 و54 كلمة تقريباً. لا مقالات طويلة ولا حشو.",
            "كل منشور مرتبط بمباراة يجب أن يذكر الفريقين في العنوان أو أول جملة.",
            "لا تكرر هذه الصيغ أكثر من مرة أو مرتين في كامل المجموعة: قراءة هادئة، الزحمة، الضجيج، الثبات، التوقع المريح، اللقطة هنا.",
            "لا تستخدم كلمة أهداف بالملّي؛ الصحيح نتائج بالملّي أو توقعات بالملّي.",
            "إذا لم توجد معلومة كافية عن حدث كروي خارجي، تجاهله ولا تخترعه وركز على قصة المسابقة.",
            "ممنوع إنشاء أي منشور لمباراة حالتها live أو scheduled؛ استخدم فقط مباراة status=completed ونتيجتها النهائية محفوظة.",
            "إذا ذكرت عدداً للمشاركين مثل خمسة مشاركين، يجب أن تسرد داخل النص نفس عدد الأسماء بالضبط؛ وإلا استخدم عبارة مجموعة من المشاركين دون رقم.",
            "لا تختصر أو تحرّف أسماء المشاركين؛ انسخ الاسم حرفياً من participantLanguage أو source facts."
        ]
    };
}

function buildParticipantFacts(participants, completedMatches, predictionsByParticipant, championPredictionMap = new Map(), championResult = null) {
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

            if (isExactScorePrediction(prediction, match)) {
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

        const championPrediction = championPredictionMap.get(String(participant.id)) || null;
        const championPredictionPoints = calculateChampionPredictionPoints(
            championPrediction?.predicted_team,
            championResult
        );
        points += championPredictionPoints;

        return {
            id: participant.id,
            name: participant.name,
            gender: FEMALE_NAMES.has(String(participant.name).trim()) ? "female" : "male",
            points,
            championPredictionTeam: championPrediction?.predicted_team || null,
            championPredictionPoints,
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
            if (isExactScorePrediction(prediction, match)) exactNames.push(participant.name);
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



const HIGHLIGHT_DEDUPE_STOP_WORDS = new Set([
    "في", "من", "على", "الى", "إلى", "عن", "مع", "ما", "لا", "لم", "لن", "هو", "هي", "كان", "كانت",
    "هذا", "هذه", "ذلك", "التي", "الذي", "اللي", "بعد", "قبل", "بين", "كل", "لكن", "ثم", "او", "أو",
    "ان", "أن", "إن", "داخل", "عند", "حتى", "فقط", "هنا", "هناك", "مرة", "اكثر", "أكثر", "اقل", "أقل",
    "المباراة", "المسابقة", "التوقع", "التوقعات", "النتيجة", "النقاط", "نقطة", "لقطة", "الأضواء", "اضواء"
]);

function normalizeHighlightDedupeText(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function highlightDedupeTokenSet(value) {
    return new Set(
        normalizeHighlightDedupeText(value)
            .split(" ")
            .filter((token) => token.length >= 3 && !HIGHLIGHT_DEDUPE_STOP_WORDS.has(token))
    );
}

function tokenSetJaccard(first, second) {
    if (!first.size || !second.size) return 0;
    let intersection = 0;
    for (const token of first) {
        if (second.has(token)) intersection += 1;
    }
    return intersection / (first.size + second.size - intersection);
}

function getHighlightCard(post = {}) {
    return Array.isArray(post.cards_json) ? (post.cards_json[0] || {}) : {};
}

function getHighlightSourceNoteIds(post = {}) {
    const card = getHighlightCard(post);
    const raw = Array.isArray(post.source_note_ids)
        ? post.source_note_ids
        : (Array.isArray(card.source_note_ids) ? card.source_note_ids : []);
    return [...new Set(raw.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function getHighlightSourceKey(post = {}) {
    const card = getHighlightCard(post);
    return cleanText(post.source_key || card.source_key || "", 180).toLowerCase();
}

function getHighlightExplicitMatchId(post = {}) {
    const card = getHighlightCard(post);
    return String(post.source_match_id || card.source_match_id || "").trim();
}

function getHighlightCategory(post = {}) {
    const card = getHighlightCard(post);
    return String(post.category || card.type || "timeline").trim().toLowerCase();
}

function getHighlightParticipantNames(post = {}) {
    const card = getHighlightCard(post);
    const raw = Array.isArray(post.participant_names)
        ? post.participant_names
        : (Array.isArray(card.participant_names) ? card.participant_names : []);
    return [...new Set(raw.map((name) => cleanText(name, 80)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

function inferHighlightMatchId(post = {}, factsPack = {}) {
    const explicit = getHighlightExplicitMatchId(post);
    if (explicit) return explicit;

    const card = getHighlightCard(post);
    const haystack = normalizeHighlightDedupeText([
        post.title_ar,
        post.subtitle_ar,
        post.body_ar,
        post.source_fact,
        card.source_fact
    ].filter(Boolean).join(" "));

    if (!haystack) return "";

    for (const match of factsPack?.contest?.matches || []) {
        const matchId = String(match?.id || "").trim();
        const matchTitle = normalizeHighlightDedupeText(match?.title || "");
        if (matchId && matchTitle && haystack.includes(matchTitle)) return matchId;

        const titleParts = String(match?.title || "").split(/\s+ضد\s+/).map(normalizeHighlightDedupeText).filter(Boolean);
        if (matchId && titleParts.length === 2 && titleParts.every((part) => haystack.includes(part))) return matchId;
    }

    return "";
}

function getHighlightTextParts(post = {}) {
    const card = getHighlightCard(post);
    return {
        title: normalizeHighlightDedupeText(post.title_ar || ""),
        body: normalizeHighlightDedupeText(post.body_ar || ""),
        sourceFact: normalizeHighlightDedupeText(post.source_fact || card.source_fact || "")
    };
}

function getHighlightDuplicateReason(first, second, factsPack = {}) {
    const firstNotes = getHighlightSourceNoteIds(first);
    const secondNotes = new Set(getHighlightSourceNoteIds(second));
    const sharedNote = firstNotes.find((id) => secondNotes.has(id));
    if (sharedNote) return `same source note ${sharedNote}`;

    const firstSourceKey = getHighlightSourceKey(first);
    const secondSourceKey = getHighlightSourceKey(second);
    if (firstSourceKey && secondSourceKey && firstSourceKey === secondSourceKey) {
        return `same source key ${firstSourceKey}`;
    }

    const firstCategory = getHighlightCategory(first);
    const secondCategory = getHighlightCategory(second);
    const participantCategories = new Set(["participant", "participant_arc", "profile"]);

    if (participantCategories.has(firstCategory) && participantCategories.has(secondCategory)) {
        const firstNames = getHighlightParticipantNames(first);
        const secondNames = getHighlightParticipantNames(second);
        if (firstNames.length === 1 && secondNames.length === 1 && firstNames[0] === secondNames[0]) {
            return `same participant story ${firstNames[0]}`;
        }
    }

    const firstText = getHighlightTextParts(first);
    const secondText = getHighlightTextParts(second);
    const firstMatchId = inferHighlightMatchId(first, factsPack);
    const secondMatchId = inferHighlightMatchId(second, factsPack);
    const sameMatch = firstMatchId && secondMatchId && firstMatchId === secondMatchId;
    const clearlyDifferentMatches = firstMatchId && secondMatchId && firstMatchId !== secondMatchId;

    if (firstText.title && firstText.title === secondText.title && !clearlyDifferentMatches) {
        return "same normalized title";
    }
    if (
        firstText.sourceFact
        && firstText.sourceFact.length >= 12
        && firstText.sourceFact === secondText.sourceFact
        && !clearlyDifferentMatches
    ) {
        return "same source fact";
    }

    const titleSimilarity = tokenSetJaccard(
        highlightDedupeTokenSet(firstText.title),
        highlightDedupeTokenSet(secondText.title)
    );
    const bodySimilarity = tokenSetJaccard(
        highlightDedupeTokenSet(firstText.body),
        highlightDedupeTokenSet(secondText.body)
    );
    const combinedSimilarity = tokenSetJaccard(
        highlightDedupeTokenSet(`${firstText.title} ${firstText.body} ${firstText.sourceFact}`),
        highlightDedupeTokenSet(`${secondText.title} ${secondText.body} ${secondText.sourceFact}`)
    );

    const firstParticipants = new Set(getHighlightParticipantNames(first));
    const secondParticipants = new Set(getHighlightParticipantNames(second));
    const sharedParticipants = [...firstParticipants].filter((name) => secondParticipants.has(name));
    const sourceFactSimilarity = tokenSetJaccard(
        highlightDedupeTokenSet(firstText.sourceFact),
        highlightDedupeTokenSet(secondText.sourceFact)
    );

    /*
      Final-feed rule: one highlight per match. The user considers two differently
      worded posts about the same match/event duplicates, so keep only the
      strongest story for that match.
    */
    if (sameMatch) {
        return `same match ${firstMatchId}`;
    }

    const clearlyDifferentSources = (
        firstSourceKey && secondSourceKey && firstSourceKey !== secondSourceKey
    ) || (
        firstMatchId && secondMatchId && firstMatchId !== secondMatchId
    );

    // Text similarity alone must never collapse two clearly different matches
    // or two explicitly different story sources. It is only a fallback when
    // source identity is missing or ambiguous.
    if (
        !clearlyDifferentSources
        && (combinedSimilarity >= 0.86 || (titleSimilarity >= 0.78 && bodySimilarity >= 0.58))
    ) {
        return `high semantic similarity (${combinedSimilarity.toFixed(2)})`;
    }

    return "";
}

function dedupeRawHighlightPosts(posts = [], factsPack = {}, label = "AI output") {
    const kept = [];
    const removed = [];

    for (const post of posts) {
        const duplicateOf = kept.find((candidate) => getHighlightDuplicateReason(post, candidate, factsPack));
        if (duplicateOf) {
            removed.push({
                title: post?.title_ar || "بدون عنوان",
                keptTitle: duplicateOf?.title_ar || "بدون عنوان",
                reason: getHighlightDuplicateReason(post, duplicateOf, factsPack)
            });
            continue;
        }
        kept.push(post);
    }

    if (removed.length) {
        console.warn(`${label}: removed ${removed.length} semantic duplicate highlight(s).`);
        for (const item of removed.slice(0, 20)) {
            console.warn(`Duplicate removed [${item.reason}]: ${item.title} -> kept ${item.keptTitle}`);
        }
    }

    return kept;
}

function highlightKeeperScore(row) {
    const noteCount = getHighlightSourceNoteIds(row).length;
    const sourceKeyBonus = getHighlightSourceKey(row) ? 16 : 0;
    const bodyLength = String(row?.body_ar || "").length;
    return highlightRowScore(row) + noteCount * 30 + sourceKeyBonus + Math.min(15, bodyLength / 100);
}

function dedupeFinalHighlightRows(rows = [], factsPack = {}, label = "final rows") {
    const profiles = rows.filter((row) => row.section_key !== FINAL_HIGHLIGHTS_SECTION);
    const candidates = rows
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
        .sort((a, b) => highlightKeeperScore(b) - highlightKeeperScore(a) || compareHighlightRows(a, b));
    const kept = [];
    const removed = [];

    for (const row of candidates) {
        const duplicateOf = kept.find((candidate) => getHighlightDuplicateReason(row, candidate, factsPack));
        if (duplicateOf) {
            removed.push({
                title: row.title_ar,
                keptTitle: duplicateOf.title_ar,
                reason: getHighlightDuplicateReason(row, duplicateOf, factsPack)
            });
            continue;
        }
        kept.push(row);
    }

    if (removed.length) {
        console.warn(`${label}: removed ${removed.length} semantic duplicate final_highlights row(s).`);
        for (const item of removed.slice(0, 20)) {
            console.warn(`Final duplicate removed [${item.reason}]: ${item.title} -> kept ${item.keptTitle}`);
        }
    }

    return [...kept, ...profiles];
}

function assertHighlightsUseCompletedMatches(rows = [], factsPack = {}) {
    const completedIds = new Set((factsPack?.contest?.matches || []).map((match) => String(match.id)));
    const invalid = [];

    for (const row of rows) {
        if (row.section_key !== FINAL_HIGHLIGHTS_SECTION) continue;
        const card = Array.isArray(row.cards_json) ? row.cards_json[0] || {} : {};
        const category = String(card.type || "").toLowerCase();
        const matchId = String(card.source_match_id || "").trim();
        const matchBased = [
            "match", "real_event_plus_contest", "popular_trap", "lone_reader",
            "exact_circle", "knockout_pressure", "points_swing", "hard_stop",
            "emotional", "fun"
        ].includes(category);

        if (matchId && !completedIds.has(matchId)) {
            invalid.push(`${row.title_ar || "Untitled"} -> ${matchId}`);
        } else if (matchBased && !matchId) {
            invalid.push(`${row.title_ar || "Untitled"} -> missing completed source_match_id`);
        }
    }

    if (invalid.length) {
        throw new Error(
            `Blocked ${invalid.length} highlight(s) linked to a live/scheduled/unknown match: ${invalid.slice(0, 8).join(" | ")}`
        );
    }
}

function assertNoDuplicateFinalHighlights(rows = [], factsPack = {}) {
    const highlights = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
    const conflicts = [];

    for (let i = 0; i < highlights.length; i += 1) {
        for (let j = i + 1; j < highlights.length; j += 1) {
            const reason = getHighlightDuplicateReason(highlights[i], highlights[j], factsPack);
            if (!reason) continue;
            conflicts.push({
                first: highlights[i].title_ar,
                second: highlights[j].title_ar,
                reason
            });
        }
    }

    if (conflicts.length) {
        const preview = conflicts.slice(0, 8)
            .map((item) => `- ${item.first} <> ${item.second} [${item.reason}]`)
            .join("\n");
        throw new Error(
            `Duplicate final_highlights remained after deduplication. Existing database rows were not cleared.\n${preview}`
        );
    }
}

function buildHighlightSemanticKey(post = {}, factsPack = {}, fallbackIndex = 0) {
    const noteIds = getHighlightSourceNoteIds(post);
    if (noteIds.length) return `notes:${noteIds.join(",")}`;

    const sourceKey = getHighlightSourceKey(post);
    if (sourceKey) return sourceKey;

    const matchId = inferHighlightMatchId(post, factsPack);
    const category = getHighlightCategory(post);
    if (matchId && !["participant", "participant_arc", "profile", "stage", "stage_mood"].includes(category)) {
        return `match:${matchId}:${category}`;
    }

    const participantNames = getHighlightParticipantNames(post);
    if (["participant", "participant_arc", "profile"].includes(category) && participantNames.length === 1) {
        return `participant:${normalizeHighlightDedupeText(participantNames[0])}`;
    }

    const text = getHighlightTextParts(post);
    const fallbackText = `${text.title}|${text.sourceFact}|${text.body}`;
    return `text:${hashObject(fallbackText || String(fallbackIndex))}`;
}

function buildStorySeedKey(seed = {}) {
    const noteIds = (seed.verified_event_context || [])
        .map((item) => item?.source_note_id || item?.id)
        .filter(Boolean)
        .map(String)
        .sort();

    // A verified event note is a stable real-world event identity. Do not let
    // the same event produce several differently worded posts.
    if (noteIds.length && seed.type === "real_event_plus_contest") {
        return `notes:${noteIds.join(",")}`;
    }

    // One match may legitimately have different contest stories, such as an
    // exact-score celebration and an upset of the popular prediction.
    if (seed.match?.id) return `match:${seed.match.id}:${seed.type || "story"}`;
    if (seed.participant?.id) return `participant:${seed.participant.id}`;
    if (seed.participant?.name) return `participant:${normalizeHighlightDedupeText(seed.participant.name)}`;
    if (seed.stage?.stage) return `stage:${seed.stage.stage}`;
    if (noteIds.length) return `notes:${noteIds.join(",")}:${seed.type || "story"}`;
    return `seed:${hashObject([seed.type, seed.title].filter(Boolean))}`;
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
        const storyKey = seed.story_key || buildStorySeedKey(seed);
        if (seen.has(storyKey)) return;
        if (seed.match && !isStoryWorthyMatch(seed.match, seed.verified_event_context || [])) return;
        seen.add(storyKey);
        candidates.push({ ...seed, story_key: storyKey });
    };

    const leaderboardContext = rankedParticipants.slice(0, 6).map((row) => `${row.rank}. ${row.name} (${row.points} نقطة)`).join("، ");

    for (const stage of stageFacts) {
        const isMajorStage = ["GROUP_STAGE", "LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"].includes(stage.stage);
        if (!isMajorStage) continue;
        addCandidate({
            type: "stage_mood",
            priority: 62 + stageOrder(stage.stage) * 8,
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

        for (const storyType of storyTypes.slice(0, 1)) {
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
                        match.exactCount > 0 ? `${match.exactCount} نتيجة بالملّي، وقيمتها تعتمد على المرحلة` : null,
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
        if (participant.rank <= 3) highlightBits.push(`حالياً في المركز ${participant.rank}`);
        if (participant.points > 0) highlightBits.push(`${participant.points} نقطة`);
        if (participant.exactScores > 0) highlightBits.push(`${participant.exactScores} نتيجة بالملّي`);
        if (participant.correctPredictions > 0) highlightBits.push(`${participant.correctPredictions} توقع صحيح`);
        if (participant.bestCorrectStreak > 1) highlightBits.push(`سلسلة صحيحة وصلت ${participant.bestCorrectStreak}`);
        if (participant.bestStage) highlightBits.push(`أفضل مرحلة: ${participant.bestStage.label_ar} بـ${participant.bestStage.points} نقطة`);

        addCandidate({
            type: "participant_arc",
            priority: participantSpotlightPriority(participant, rankedParticipants),
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
        stage_mood: AI_STAGE_SUMMARY_MAX,
        participant_arc: Math.min(AI_PARTICIPANT_HIGHLIGHT_MAX, activeParticipants.length)
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


function participantSpotlightPriority(participant = {}, rankedParticipants = []) {
    const exactLeader = Math.max(...rankedParticipants.map((row) => Number(row.exactScores || 0)), 0);
    const streakLeader = Math.max(...rankedParticipants.map((row) => Number(row.bestCorrectStreak || 0)), 0);
    const accuracyLeader = Math.max(...rankedParticipants.map((row) => Number(row.accuracyPercent || 0)), 0);

    let score = 48 - Math.min(20, Number(participant.rank || 20));
    if ((participant.rank || 999) <= 3) score += 28;
    if (Number(participant.exactScores || 0) >= Math.max(2, exactLeader - 1)) score += 20;
    if (Number(participant.bestCorrectStreak || 0) >= Math.max(3, streakLeader - 1)) score += 16;
    if (Number(participant.accuracyPercent || 0) >= Math.max(45, accuracyLeader - 6)) score += 14;
    if (Number(participant.predictions || 0) < 12) score -= 10;
    return score;
}

const COMMON_STORY_AVOID_LIST = [
    "لا تبدأ بالنتيجة ولا بجملة: عندما انتهت المباراة",
    "لا تكتب: في مباراة كذا ضد كذا، حصل كذا",
    "لا تكرر قالب: النتيجة + من حصل على نقاط + تغير الترتيب",
    "لا تستخدم لهجة مصرية: كده، ما فيهاش، بيقرأوا، فارغين",
    "لا تستخدم عبارات عامة: أعادت تشكيل المزاج، كشفت القراء الهادئين، الثقة العمياء، الجمهور كان متحمساً، تداولت الأحاديث",
    "لا تجعلها خبر رياضي. اجعلها لقطة من مسابقة توقعات فيها روح وشخصيات",
    "لا تخترع VAR أو طرد أو إصابة أو مشاجرة أو تصريحات إذا لم توجد في real_event_notes",
    "لا تكرر: قراءة هادئة، بعيداً عن الزحمة، الضجيج، التوقع المريح، الثبات يصنع الفارق، اللقطة هنا مو في",
    "لا تستخدم يا ساتر أو استعارات مبالغ فيها",
    "لا تقل أهداف بالملّي؛ قل نتائج بالملّي"
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
        (match.stage !== "GROUP_STAGE" ? 30 : 0) +
        (stageOrder(match.stage) * 20) +
        (match.exactCount === 1 ? 26 : 0) +
        (match.exactCount >= 2 ? Math.min(70, match.exactCount * 18) : 0) +
        Math.min(55, match.awardedPoints / 6) +
        (match.zeroOrMissingPercent >= 70 ? 24 : 0) +
        (match.zeroOrMissingPercent >= 85 ? 22 : 0) +
        (match.mostCommonPrediction && !match.mostCommonPrediction.wasActual ? 26 : 0) +
        (match.uniqueCorrectNames.length > 0 ? 18 : 0) +
        0
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
    output.highlights = dedupeRawHighlightPosts(
        Array.isArray(output.highlights) ? output.highlights : [],
        factsPack,
        "checkpoint"
    );
    const completedBatches = new Set(checkpoint?.completedBatches || []);
    const usedHighlightKeys = new Set();
    const usedProfileNames = new Set();
    const targetHighlights = AI_PUBLIC_HIGHLIGHT_TARGET;

    for (const post of Array.isArray(output.highlights) ? output.highlights : []) {
        const title = cleanText(post?.title_ar || "", AI_POST_TITLE_MAX_CHARS);
        const body = formatHighlightBody(post?.body_ar || "");
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
            const body = formatHighlightBody(post?.body_ar || "");
            const normalizedPost = {
                ...post,
                title_ar: title,
                body_ar: body
            };
            if (!title || !body || isLowQualityHighlightPost(normalizedPost)) continue;
            const key = `${title}|${body}`.toLowerCase();
            if (usedHighlightKeys.has(key)) continue;
            const duplicateOf = output.highlights.find((candidate) => getHighlightDuplicateReason(normalizedPost, candidate, factsPack));
            if (duplicateOf) {
                console.warn(
                    `Batch ${batchName}: skipped semantic duplicate "${title}" because it overlaps with "${duplicateOf.title_ar || "بدون عنوان"}" ` +
                    `(${getHighlightDuplicateReason(normalizedPost, duplicateOf, factsPack)}).`
                );
                continue;
            }
            usedHighlightKeys.add(key);
            output.highlights.push(normalizedPost);
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
            if (AI_CONTINUE_ON_BATCH_FAILURE && failedBatchesThisRun <= AI_MAX_FAILED_BATCHES) {
                console.warn(`${providerLabel} batch ${batchName} failed, skipping it and continuing because AI_CONTINUE_ON_BATCH_FAILURE=true: ${error.message}`);
                saveCheckpoint();
                return false;
            }
            if (AI_INSERT_PARTIAL_ON_BATCH_FAILURE && hasEnoughPartialHighlights()) {
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
    const participantStorySeeds = storySeeds
        .filter((seed) => seed.type === "participant_arc")
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .slice(0, AI_PARTICIPANT_HIGHLIGHT_MAX);
    const primaryStorySeeds = storySeeds.filter((seed) => seed.type !== "participant_arc");

    if (participantStorySeeds.length > 0 && !stoppedEarly && output.highlights.length < targetHighlights) {
        const batchName = "participant-spotlights";
        const batchPrompt = buildBatchPrompt({
            batchName,
            instruction: "اكتب لقطة شخصية واحدة لكل seed مختار. ركز على بصمة مختلفة ومحددة، لا على سرد كل الأرقام. استخدم stage_ar = أضواء المشاركين. لا تقل ختم أو أنهى قبل اكتمال 104 مباراة، ولا تجعلها بطاقة إحصائية.",
            highlightTarget: Math.min(participantStorySeeds.length, targetHighlights - output.highlights.length),
            profileTarget: 0,
            facts: {
                ...contextBase,
                story_seeds: participantStorySeeds
            }
        });
        await runBatch(batchName, batchPrompt);
    }

    const storyBatches = chunkArray(primaryStorySeeds, AI_STORY_SEED_BATCH_SIZE);
    const maxStoryBatches = Math.min(storyBatches.length, Math.ceil(Math.max(24, targetHighlights * 0.82) / AI_BATCH_HIGHLIGHT_TARGET));

    for (let index = 0; index < maxStoryBatches && !stoppedEarly && output.highlights.length < targetHighlights; index += 1) {
        const batchName = `story-seeds-${index + 1}`;
        const batchPrompt = buildBatchPrompt({
            batchName,
            instruction: "اكتب منشوراً واحداً لكل story_seed في هذه الدفعة، لأن هذه البذور اختيرت مسبقاً لوجود أثر حقيقي وممتع داخل المسابقة. لا تخترع منشوراً لبذرة ضعيفة، لكن لا تتجاهل بذرة قوية لمجرد الاختصار. كل seed فيه نوع قصة واضح: فخ الأغلبية، قراءة مختلفة، ضغط إقصائي، خزنة نقاط، أو حدث كروي موثق. لا تكتب تقرير مباراة. ابدأ من hook_style والسؤال القصصي، واجعل النتيجة مجرد تفصيل داخل النص.",
            highlightTarget: Math.min(storyBatches[index].length, targetHighlights - output.highlights.length),
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
                    event_notes: notes.map((note) => ({
                        ...note,
                        source_key: `note:${note.id}`,
                        source_match_id: note.match_id || null
                    })),
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

    /*
      Participant spotlights are already represented by the curated participant_arc
      story seeds. Do not run a second "one post per participant" pass: it created
      repetitive stat cards and pushed stronger knockout stories out of the feed.
      Every participant still receives an updated final_profile row.
    */
    const participantRows = factsPack.contest.leaderboard || [];

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
                    matches: fillBatches[index].map((match) => ({
                        ...match,
                        source_key: `match:${match.id}`,
                        source_match_id: match.id
                    }))
                }
            });
            await runBatch(batchName, batchPrompt);
        }
    }

    // Profile messages are generated safely from calculated participant facts,
    // so no AI recovery batches are needed here.
    const missingProfileNames = [];
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

    if (AI_TOP_UP_WITH_CALCULATED_HIGHLIGHTS) {
        const topUpTarget = Math.min(MAX_HIGHLIGHTS, Math.max(AI_MIN_VALID_HIGHLIGHT_ROWS, AI_CALCULATED_HIGHLIGHT_TOP_UP_TO));
        topUpHighlightsWithCalculatedStories(output, factsPack, topUpTarget, usedHighlightKeys);
    }

    if (!output.highlights.length) {
        throw new Error("AI generation returned no highlights and calculated top-up could not build safe story highlights.");
    }

    if (stoppedEarly) {
        const partialAllowed = (stoppedEarlyReason.includes("quota") && AI_INSERT_PARTIAL_ON_QUOTA)
            || (stoppedEarlyReason.includes("AI_MAX_BATCHES_PER_RUN") && AI_INSERT_PARTIAL_ON_MAX_BATCHES)
            || (stoppedEarlyReason.includes("batch failure") && AI_INSERT_PARTIAL_ON_BATCH_FAILURE);
        if (!partialAllowed || (!hasEnoughPartialHighlights() && !AI_INSERT_PARTIAL_ANY_STORY_COUNT)) {
            throw new Error(`${stoppedEarlyReason}. Not inserting partial output. Rerun later to resume from ${AI_BATCH_CHECKPOINT_FILE}.`);
        }
        console.warn(`Inserting partial AI output: ${output.highlights.length} highlights and ${output.profile_messages.length} profiles.`);
    }

    writeAiDebugFile("ai-posts-batch-output.json", JSON.stringify(output, null, 2));
    return output;
}


function isHighSignalStorySeed(seed = {}) {
    if (!seed) return false;
    if (seed.type === "participant_arc") return false;
    if (seed.type === "stage_mood") return true;

    const match = seed.match || {};
    const notes = Array.isArray(seed.verified_event_context)
        ? seed.verified_event_context.filter((item) => item?.source_note_id || item?.id)
        : [];
    const popular = match.mostCommonPrediction || null;
    const uniqueCorrect = Array.isArray(match.uniqueCorrectNames) ? match.uniqueCorrectNames : [];

    return (
        notes.length > 0 ||
        (match.stage && match.stage !== "GROUP_STAGE") ||
        Number(match.exactCount || 0) >= 1 ||
        Number(match.awardedPoints || 0) >= 140 ||
        Number(match.zeroOrMissingPercent || 0) >= 75 ||
        Boolean(popular && !popular.wasActual && Number(popular.count || 0) >= 3) ||
        uniqueCorrect.length > 0
    );
}

function topUpHighlightsWithCalculatedStories(output, factsPack, targetCount, usedHighlightKeys = new Set()) {
    if (!AI_TOP_UP_WITH_CALCULATED_HIGHLIGHTS) return;
    if (!Array.isArray(output.highlights)) output.highlights = [];
    if (output.highlights.length >= targetCount) return;

    const seeds = factsPack.contest.integratedStorySeeds || [];
    const rankedSeeds = [...seeds]
        .filter(isHighSignalStorySeed)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || storyTypeOrder(a.type) - storyTypeOrder(b.type));

    let added = 0;
    for (const seed of rankedSeeds) {
        if (output.highlights.length >= targetCount || added >= AI_MAX_CALCULATED_TOP_UP) break;
        const post = buildCalculatedHighlightPost(seed, output.highlights.length + 1);
        if (!post) continue;
        const title = cleanText(post.title_ar || "", AI_POST_TITLE_MAX_CHARS);
        const body = formatHighlightBody(post.body_ar || "");
        if (!title || !body || isLowQualityHighlightPost({ ...post, title_ar: title, body_ar: body })) continue;
        const normalizedPost = { ...post, title_ar: title, body_ar: body, generated_by: "calculated_top_up" };
        const key = `${title}|${body}`.toLowerCase();
        if (usedHighlightKeys.has(key)) continue;
        if (output.highlights.some((candidate) => getHighlightDuplicateReason(normalizedPost, candidate, factsPack))) continue;
        usedHighlightKeys.add(key);
        output.highlights.push(normalizedPost);
        added += 1;
    }

    if (added > 0) {
        console.warn(`Added ${added} calculated safe highlight top-up row(s). AI highlights now=${output.highlights.length}.`);
    }
}

function buildVariedMatchStoryTitle(match = {}, fallback = "لقطة تستحق الأضواء", category = "story", index = 0) {
    const matchTitle = String(match.title || "").replace(/ ضد /g, " × ").trim();
    const score = match.score ? ` ${match.score}` : "";
    const prefixes = {
        real_event_plus_contest: ["حين دخلت الكرة دفتر التوقعات", "لقطة كروية صارت قصة في الجدول", "ما حدث في الملعب وصل إلى المسابقة"],
        knockout_pressure: ["اختبار أعصاب لا يشبه المجموعات", "قراءة تحت ضغط الخروج", "الهدوء يكسب في وقت صعب"],
        popular_trap: ["الطريق المزدحم لم ينفع", "الأغلبية راحت للاتجاه الخطأ", "الفخ الهادئ الذي غيّر اللقطة"],
        lone_reader: ["قراءة خارج الزحمة", "عين شافت ما فاتها الآخرون", "هدوء قليل ونقاط كثيرة"],
        exact_circle: ["بالملّي في توقيت ثمين", "نتيجة كاملة رفعت الأسماء", "فرحة الخمسين بنكهة خاصة"],
        points_swing: ["خزنة النقاط انفتحت", "مباراة حرّكت السباق", "نقاط كثيرة في ليلة واحدة"],
        hard_stop: ["ليلة قاسية على التوقعات", "حين توقف عداد النقاط", "مطب صغير بصوت كبير"]
    };
    const choices = prefixes[category] || [fallback];
    const phrase = choices[Math.abs(index) % choices.length] || fallback;
    return matchTitle ? `${matchTitle}${score}: ${phrase}` : phrase;
}

function calculatedHighlightIcon(category) {
    const icons = {
        real_event_plus_contest: "⚽",
        knockout_pressure: "🔥",
        popular_trap: "🌪️",
        lone_reader: "🎯",
        exact_circle: "✨",
        points_swing: "⚡",
        hard_stop: "🧱",
        stage_mood: "🏟️"
    };
    return icons[category] || "✨";
}

function buildCalculatedStoryTitle(match = {}, phrase = "لقطة تستحق الأضواء") {
    const shortMatch = cleanText(match.title || "", 54).replace(/\s+ضد\s+/g, " × ");
    return cleanText(shortMatch ? `${shortMatch}: ${phrase}` : phrase, AI_POST_TITLE_MAX_CHARS);
}


function exactCountArabic(count) {
    const value = Number(count || 0);
    if (value === 0) return "من دون نتيجة بالملّي";
    if (value === 1) return "بنتيجة واحدة بالملّي";
    if (value === 2) return "بنتيجتين بالملّي";
    if (value >= 3 && value <= 10) return `بـ${value} نتائج بالملّي`;
    return `بـ${value} نتيجة بالملّي`;
}

function stageSummaryTitle(stageLabel = "") {
    const titles = {
        "دور المجموعات": "المجموعات: البداية التي فتحت كل الاحتمالات",
        "دور الـ32": "دور الـ32: أول ضغط حقيقي",
        "دور الـ16": "دور الـ16: المساحة صارت أضيق",
        "ربع النهائي": "ربع النهائي: كل توقع صار أغلى",
        "نصف النهائي": "نصف النهائي: خطوة واحدة عن الكأس",
        "المركز الثالث": "المركز الثالث: آخر فرصة للنقاط",
        "النهائي": "النهائي: اللقطة التي تحسم كل شيء"
    };
    return titles[stageLabel] || `${stageLabel}: لقطة المرحلة`;
}

function buildCalculatedHighlightPost(seed, index) {
    const match = seed.match || {};
    const stage = match.stageLabel || seed.stage?.label_ar || "أضواء المسابقة";
    const names = Array.isArray(seed.required_participant_names)
        ? seed.required_participant_names.filter(Boolean).slice(0, 5)
        : [];
    const nameText = names.length ? names.join("، ") : "الأسماء التي قرأت اللحظة";
    const common = match.mostCommonPrediction;
    const exactNames = Array.isArray(match.exactNames) ? match.exactNames.slice(0, 5) : [];
    const context = Array.isArray(seed.verified_event_context) ? seed.verified_event_context : [];
    const contextText = cleanText(
        context.map((item) => item.details_ar || item.title_ar).filter(Boolean)[0] || "",
        170
    );
    const matchTitle = match.title || "إحدى مباريات البطولة";
    const resultText = match.score ? `${matchTitle} انتهت ${match.score}` : matchTitle;
    const category = seed.type || "timeline";

    let title = "لقطة من قلب المسابقة";
    let body = "";

    if (category === "real_event_plus_contest") {
        title = buildCalculatedStoryTitle(match, "لقطة كروية وصلت للتوقعات");
        const eventLead = contextText || "الملعب قدّم لحظة لها وزن أكبر من النتيجة وحدها";
        body = `${eventLead}. ${resultText}، وظهر أثرها مباشرة في توقعات ${nameText}. هكذا تحولت لقطة كروية موثقة إلى جزء خفيف وواضح من حكاية المسابقة.`;
    } else if (category === "knockout_pressure") {
        title = buildCalculatedStoryTitle(match, "اختبار أعصاب في الإقصائيات");
        const pointsText = match.exactCount
            ? `${match.exactCount} توقع بالملّي جعل المكافأة أثقل`
            : "حتى الاتجاه الصحيح كان له وزن واضح";
        body = `ضغط الإقصائيات رفع قيمة كل اختيار. ${resultText}، وبرز ${nameText} لأن ${pointsText}. هنا صار الخطأ أغلى، وصارت الإصابة الدقيقة أوضح في سباق النقاط.`;
    } else if (category === "popular_trap") {
        title = buildCalculatedStoryTitle(match, "الطريق المزدحم لم يكسب");
        const commonText = common
            ? `التوقع الأكثر تكراراً كان ${common.score} عند ${common.count} مشاركين لكنه لم يصب`
            : "الاختيار الأكثر شيوعاً لم ينجح";
        body = `الاختيار الشائع بدا آمناً، لكنه لم يكمل الطريق. ${resultText}؛ ${commonText}، بينما التقط ${nameText} السيناريو الصحيح. الفارق هنا كان قراراً واحداً قبل البداية.`;
    } else if (category === "lone_reader") {
        title = buildCalculatedStoryTitle(match, "قراءة منفردة سبقت البقية");
        const readers = exactNames.length ? exactNames.join("، ") : nameText;
        body = `قلة فقط التقطت السيناريو الصحيح قبل البداية. ${resultText}، وكان ${readers} ضمن الأسماء التي استفادت، بينما خرج ${match.zeroOrMissingPercent || 0}% بلا نقاط أو بلا توقع. قراءة نادرة استحقت مكانها في الأضواء.`;
    } else if (category === "exact_circle") {
        title = buildCalculatedStoryTitle(match, "بالملّي في توقيت ثمين");
        const readers = exactNames.length ? exactNames.join("، ") : nameText;
        body = `هذه المرة كانت الدقة جماعية. ${resultText}، وكتب ${readers} النتيجة كاملة قبل البداية. إصابة بالملّي واضحة، من النوع الذي يختصر القصة في رقمين صحيحين.`;
    } else if (category === "points_swing") {
        title = buildCalculatedStoryTitle(match, "خزنة النقاط انفتحت");
        const pointsText = match.awardedPoints
            ? `وزعت ${match.awardedPoints} نقطة`
            : "حرّكت النقاط بوضوح";
        body = `هذه المباراة حرّكت الجدول أكثر من غيرها. ${resultText} و${pointsText}، فاستفاد ${nameText} واقتربت المسافات في السباق. أثرها ظهر مباشرة في النقاط، لا في النتيجة وحدها.`;
    } else if (category === "hard_stop") {
        title = buildCalculatedStoryTitle(match, "ليلة قاسية على التوقعات");
        const difficulty = match.zeroOrMissingPercent
            ? `${match.zeroOrMissingPercent}% خرجوا بلا نقاط أو بلا توقع`
            : "أغلب التوقعات لم تستفد";
        body = `كانت من أصعب مباريات الجولة على التوقعات. ${resultText}؛ ${difficulty}، لذلك ارتفعت قيمة قراءة ${nameText}. كل نقطة هنا جاءت بعد اختبار حقيقي، لا نتيجة سهلة.`;
    } else if (category === "stage_mood") {
        const stageLabel = seed.stage?.label_ar || stage;
        title = stageSummaryTitle(stageLabel);
        body = `${stageLabel} ضم ${seed.stage?.matches ?? "عدة"} مباريات وخرج ${exactCountArabic(seed.stage?.exactCount)}، مع ${seed.stage?.awardedPoints ?? 0} نقطة موزعة. ملخص سريع لمرحلة ضيّقت الخيارات ورفعت قيمة كل توقع.`;
    } else {
        title = buildCalculatedStoryTitle(match, seed.title || "لقطة تستحق مكانها في الأضواء");
        body = `${resultText}، وظهر أثرها في قراءة ${nameText}. قصة قصيرة من المسابقة: اختيار واضح، نتيجة محسوبة، ونقاط وجدت طريقها إلى أصحابها.`;
    }

    return {
        title_ar: title,
        body_ar: formatHighlightBody(body),
        icon: calculatedHighlightIcon(category),
        category: category === "real_event_plus_contest" ? "match" : category,
        stage_ar: stage,
        participant_names: names,
        source_fact: seed.title || matchTitle,
        source_note_ids: context.map((item) => item.source_note_id || item.id).filter(Boolean).slice(0, 4),
        source_key: seed.story_key || buildStorySeedKey(seed),
        source_match_id: match.id || null
    };
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
      "title_ar": "عنوان قصصي جذاب ومحدد من 6 إلى 12 كلمة، يلمح للحظة بدون أن يكون تقرير مباراة",
      "body_ar": "وصف خفيف من جملتين إلى ثلاث جمل قصيرة، بين 28 و54 كلمة تقريباً",
      "icon": "✨",
      "category": "timeline|match|participant|emotional|fun|stage",
      "stage_ar": "اسم المرحلة أو أضواء المسابقة",
      "participant_names": ["اسم مشارك إن وجد"],
      "source_fact": "الحقيقة المستخدمة باختصار",
      "source_note_ids": ["id من final_event_notes إذا استخدمت حدثاً كروياً"],
      "source_key": "انسخ story_key/source_key من المصدر المستخدم حرفياً",
      "source_match_id": "id المباراة إذا كان المنشور مرتبطاً بمباراة"
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
- لكل منشور استخدم مصدراً واحداً فقط، وانسخ story_key أو source_key منه حرفياً إلى source_key.
- لا تنشئ أكثر من منشور لنفس story_key أو source_key أو source_note_id أو source_match_id داخل الدفعة.
- اكتب من نوع القصة، وليس من نتيجة المباراة.
- الجملة الأولى: hook ممتع أو إحساس اللحظة. لا تبدأ بـ "عندما انتهت" ولا "في مباراة" ولا باسم الفريقين.
- الجملة الثانية أو الثالثة: اربط القصة بالأسماء والنقاط والتوقعات. اذكر المباراة ونتيجتها مرة واحدة بشكل طبيعي إذا كانت seed تحتوي مباراة.
- اجعل النص سريع القراءة على الجوال: من 28 إلى 54 كلمة، ولا تكرر الفكرة نفسها بصياغتين.
- استخدم real_world_cup_context فقط إذا كان موجوداً. إذا لم يوجد، لا تخترع VAR أو طرد أو إصابة أو جمهور أو تصريح.
- إذا كانت المباراة إقصائية أو فيها ركلات ترجيح/وقت إضافي من real_world_cup_context، استعملها كخلفية تزيد الضغط، ثم ارجع لأثرها في المسابقة.
- كل منشور يجب أن يشعر القارئ أنه يقرأ لقطة من مسابقة أصدقاء/عائلة، وليس خبر مباراة.

قواعد صارمة:
- JSON فقط، بدون markdown، بدون أي نص خارج JSON، وبدون trailing commas.
- لا تكتب match report. لا تجعل العنوان أو أول جملة عن "الفريق فاز" أو "المباراة انتهت".
- لا تستخدم قالب مكرر: نتيجة المباراة + من أخذ نقاط + غيرت الترتيب.
- ممنوع تكرار الحدث نفسه أو زاوية القصة نفسها بصياغة أخرى. يمكن ظهور المباراة مرة ثانية فقط إذا كانت القصة مختلفة فعلاً ومصدرها مختلف، مثل حدث موثق مقابل لقطة توقع خاصة بمشارك.
- لا تستخدم لهجة مصرية أو عامية غريبة: ما فيهاش، كده، بيقرأوا، فارغين، ما كانش.
- لا تستخدم عبارات مستهلكة أو عامة: أعادت تشكيل المزاج، أعادت تشكيل ملامح المنافسة، الثقة العمياء، القراء الهادئين، الجمهور كان متحمساً، تداولت الأحاديث، استثمروا الوقت في تحليل الفرق.
- ممنوع عناوين خام أو مكررة: "مباراة أهدافها كثيرة"، "شباك نظيفة"، "حسم ضيق"، "النجوم تتألق"، "الطاقة تتفجر"، "التحول المفاجئ"، "ليلة 3 توقعات بالملّي".
- لا تكدس الأرقام. اختر رقمين أو ثلاثة فقط تخدم القصة.
- نتيجة بالملّي = 50 نقطة قبل نصف النهائي، و100 في نصف النهائي/المركز الثالث، و200 في النهائي. الاتجاه الصحيح فقط = 10 نقاط. توقع بطل كأس العالم له نقاطه الخاصة ولا يُحسب بالملّي.
- اذكر 1 إلى 4 أسماء فقط داخل النص، حتى لو seed فيه أسماء أكثر.
- إذا اجتمعت أسماء من الذكور والإناث، تجنب ضمير الجمع المذكر أو المؤنث؛ استخدم صياغة محايدة مثل: وكان نصيب كل اسم 50 نقطة.
- كل قصة مرتبطة بمباراة يجب أن تذكر الفريقين في العنوان أو أول جملة.
- لا تستخدم أكثر من واحدة من هذه العبارات داخل المنشور: قراءة هادئة، الزحمة، الضجيج، التوقع المريح، الثبات، التفاصيل الصغيرة.
- لا تستخدم عبارة أهداف بالملّي؛ الصحيح نتائج بالملّي.
- لا تسخر من أي مشارك ولا تذكر الغياب أو قلة المشاركة.
- استخدم ضمائر صحيحة للبنات حسب participantLanguage.
- لا تتجاوز 54 كلمة تقريباً، ولا تقل عن 28 كلمة. اكتب جملتين أو ثلاثاً فقط.
- الأسلوب اللغوي مهم جداً: عربي واضح وسليم أولاً، وفقط لمسات سعودية خفيفة عند الحاجة مثل: مو، لقطة، اللي، بدون تكسير القواعد. تجنب يا ساتر في الأضواء.
- لا تستخدم لهجات مصرية أو شامية أو مغاربية أو خليط عاميات. ممنوع: مش، دي، ده، زي، كده، بتوقع، خلات، ما فيهاش، شافوا بمعنى غريب.
- لا تخترع اقتباسات أو كلام على لسان مشارك. ممنوع: قال/قالت بين علامات تنصيص إلا إذا كانت موجودة في البيانات.
- لا تكتب جملة لا معنى لها أو استعارات غريبة مثل: السحابة اللي فاتت الفرصة، حكرت الوقت، من اليد إلى الخلف.
- اجعل كل جملة مفهومة ومباشرة؛ المتعة تأتي من زاوية القصة، لا من كلمات غريبة.
- الأسلوب: عربي فصيح بسيط مع لمسة سعودية خفيفة جداً، ودود، فيه لمعة، بدون صحافة ثقيلة.

أمثلة سيئة ممنوعة:
- "عندما انتهت بنما ضد إنجلترا بنتيجة 0-2..."
- "في مباراة كرواتيا ضد غانا، أخذ ثلاثة مشاركين النتيجة بالملّي..."
- "هذه النقاط أعادت تشكيل المزاج وأظهرت أن الدقة تصنع الفارق."
- "الجمهور كان متحمساً وتداولت الأحاديث."

مثال اتجاه جيد:
"إسبانيا × بلجيكا: دقة تحت ضغط ربع النهائي

كان ربع النهائي أقصر طريق إلى الخطأ، لكن عبدالرحمن ولمار وعبدالمجيد أصابوا 2-1 بالملّي. حصل كل اسم على 50 نقطة، بينما اكتفت غادة بالاتجاه الصحيح؛ لقطة واضحة، بلا مبالغة ولا حشو."

FACTS:
${JSON.stringify(facts, null, 2)}
`.trim();
}

async function runAiJsonBatch(prompt, batchName) {
    const messages = [
        {
            role: "system",
            content: "أنت كاتب عربي سعودي/خليجي خفيف الظل لمسابقة توقعات عائلية/أصدقاء. اكتب الأضواء بلغة عربية سليمة وممتعة: عنوان متنوع ومحدد، hook واضح، أسماء، نقاط، نتائج بالملّي، صدمة أغلبية، ولقطة كروية موثقة إذا وجدت. لا تكتب match report ولا تخلط لهجات. ممنوع المصرية والشامية والمغاربية. لا تخترع أحداثاً أو اقتباسات. أعد JSON فقط."
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



function buildDisplayHighlightTitle(post = {}, index = 0, factsPack = {}) {
    const rawTitle = cleanText(post.title_ar || "", AI_POST_TITLE_MAX_CHARS);
    if (!AI_TITLE_MATCH_HINT) return rawTitle;

    const source = String(post.source_fact || "");
    const body = String(post.body_ar || "");
    const stage = String(post.stage_ar || "");
    const matchFromSource = extractMatchAndScoreHint(source) || extractMatchAndScoreHint(body);
    const generic = isGenericHighlightTitle(rawTitle);
    const explicitMatchId = getHighlightExplicitMatchId(post);
    const explicitMatch = (factsPack?.contest?.matches || []).find(
        (match) => String(match.id) === String(explicitMatchId)
    );

    if (explicitMatch?.title) {
        const [team1, team2] = String(explicitMatch.title).split(/\s+ضد\s+/);
        const normalizedRaw = normalizeHighlightDedupeText(rawTitle);
        const hasBothTeams = team1 && team2
            && normalizedRaw.includes(normalizeHighlightDedupeText(team1))
            && normalizedRaw.includes(normalizeHighlightDedupeText(team2));
        if (!hasBothTeams) {
            const shortMatch = String(explicitMatch.title).replace(/\s+ضد\s+/g, " × ");
            return cleanText(`${shortMatch}: ${stripGenericTitle(rawTitle)}`, AI_POST_TITLE_MAX_CHARS);
        }
    }

    if (matchFromSource && (generic || /^(الفخ|حين دخلت|ضغط الإقصائيات|ليلة|خزنة|قراءة مختلفة|لقطة من)/.test(rawTitle))) {
        return cleanText(`${matchFromSource}: ${stripGenericTitle(rawTitle)}`, AI_POST_TITLE_MAX_CHARS);
    }

    if (generic) {
        const alternatives = [
            "لقطة ما كانت على البال",
            "هنا بان الفرق في القراءة",
            "توقع واحد غيّر نبرة الجولة",
            "مو كل طريق مزدحم يوصل",
            "الهدوء أحياناً يكسب أكثر",
            "نقاط صغيرة صنعت حكاية كبيرة"
        ];
        return alternatives[index % alternatives.length];
    }

    return rawTitle;
}

function buildMatchHintTitle(match = {}, baseTitle = "لقطة من المسابقة") {
    const title = cleanText(baseTitle, 90);
    const matchTitle = cleanText(match.title || "", 70);
    const score = cleanText(match.score || "", 20);
    if (!matchTitle || !score) return title;
    const shortMatch = matchTitle.replace(/\s+ضد\s+/g, " × ");
    return cleanText(`${shortMatch} ${score}: ${stripGenericTitle(title)}`, AI_POST_TITLE_MAX_CHARS);
}

function extractMatchAndScoreHint(value = "") {
    const text = String(value || "").replace(/\s+/g, " ");
    const match = text.match(/([؀-ۿA-Za-z ]{2,24})\s+(?:ضد|×)\s+([؀-ۿA-Za-z ]{2,24})\s*(?:\(|،|,|\s|:)*(?:النتيجة|انتهت|وانتهت|كانت)?\s*([0-9٠-٩]+\s*[-–]\s*[0-9٠-٩]+)/);
    if (!match) return "";
    const t1 = cleanText(match[1], 18);
    const t2 = cleanText(match[2], 18);
    const score = cleanText(match[3], 10);
    if (!t1 || !t2 || !score) return "";
    return `${t1} × ${t2} ${score}`;
}

function isGenericHighlightTitle(title = "") {
    return /^(الفخ الذي مشى معه كثيرون|حين دخلت أجواء الملعب|ضغط الإقصائيات|قراءة مختلفة وسط الزحمة|ليلة بالملّي|خزنة النقاط|المباراة التي|لقطة من يوميات|أين يخلق المشاركون|قصة البطولة|لقطة تستحق|صفحة من مزاج|مباراة فتحت|بالملّي في وقتها|لخبطة على الورق)/.test(String(title || ""));
}

function stripGenericTitle(title = "") {
    return String(title || "")
        .replace(/^حين دخلت أجواء الملعب في دفتر التوقعات$/, "كرة القدم دخلت دفتر التوقعات")
        .replace(/^الفخ الذي مشى معه كثيرون$/, "الطريق المزدحم ما نفع")
        .replace(/^ضغط الإقصائيات لا يترك مساحة للتوقع السهل$/, "ضغط الإقصائيات ما يرحم")
        .replace(/^المباراة التي فتحت خزنة النقاط$/, "خزنة النقاط انفتحت")
        .replace(/^الليلة التي أوقفت الجدول للحظة$/, "الجدول وقف للحظة")
        .replace(/^قراءة مختلفة وسط الزحمة$/, "قراءة خارج الزحمة")
        .replace(/^ليلة بالملّي لم تمر بهدوء$/, "بالملّي وسط الزحمة")
        .trim() || "لقطة تستحق الأضواء";
}

function isLowQualityHighlightPost(post = {}) {
    const title = String(post.title_ar || "").trim();
    const body = String(post.body_ar || "").trim();
    const full = `${title} ${body}`;
    const participantNames = Array.isArray(post.participant_names) ? post.participant_names.filter(Boolean) : [];
    const compactBodyLength = body.replace(/[\s.،,!؟:؛\-–—]/g, "").length;
    const bodyStart = body.trim().slice(0, 90);
    const paragraphs = body.split(/\n\s*\n/).filter((part) => part.trim().length > 0);

    const bannedTitle = /^(مباراة أهدافها كثيرة|حسم ضيق|شباك نظيفة|نتيجة موثقة|المتأهل|الفائز تم حسمه|مباراة حماسية|مباراة متقاربة|النجوم تتألق|الطاقة تتفجر|التحول المفاجئ|فارق هدف واحد|ليلة\s*\d+\s*توقعات|\d+\s*توقعات بالملّي|ثلاثية بالملّي|الفخ الذي مشى معه كثيرون$|حين دخلت أجواء الملعب في دفتر التوقعات$|ضغط الإقصائيات لا يترك مساحة للتوقع السهل$)/i.test(title);
    const bannedPhrases = /(الجمهور كان|الجمهور|تداولت الأحاديث|أصبح الحديث يدور|الكل كان يتكلم|نقاط إضافية|حصل كل منهم على \d+ نقاط|حصلت على \d+ نتائج بالملّي موزعة|فرقة|النجاحة|البمثيلة|أعادت تشكيل المزاج|أعادت تشكيل ملامح|كشفت القراء الهادئين|الثقة العمياء|استثمروا الوقت في تحليل|مع توزيع \d+ نقطة|هذه اللحظة كشفت|كان الجميع يتوقعون|ما فيهاش|كده|بيقرأوا|فارغين|ما كانش|دارتت|واجتهد|\bمش\b|\bدي\b|\bده\b|\bزي\b|بتوقع|خلات|حكرت|السحابة اللي فاتت|من اليد إلى الخلف|انفجرت بضحكة|اللي ما ينجح ما يصير|✨\s*(emotional|timeline|fun|match|stage)|\[\s*\"|source_note|participant_names)/i.test(full);
    const titleLooksLikeResultTile = /\d+\s*[-–]\s*\d+/.test(title) || (/ضد/.test(title) && /^(مباراة|حسم|شباك|نتيجة|فوز|تعادل|ليلة|صدمة|ثلاثية)/.test(title));
    const startsWithResult = /^(عندما انتهت|لما انتهت|في مباراة|مباراة|انتهت|فاز|فازت|سجلت|سجل|أحرز|أحرزت|عندما التقت|حين التقت)/.test(bodyStart);
    const resultReportPattern = /(انتهت|فازت|فاز|تعادل).{0,45}(حصل|حصلت|حصد|حصدت|خرج|خرجت).{0,80}(نقطة|نقاط|توقع)/i.test(full);
    const metadataLeak = /(✨\s*(emotional|timeline|fun|match|stage)|\[[^\]]*\]|source_note|source_fact|participant_names|دور المجموعات \[|دور الـ32 \[)/i.test(full);
    const inventedQuote = /(قال|قالت|يقول|تقول)[:：]?\s*[«"][^»"]+[»"]/i.test(full);
    const repeatedSameSentence = body.split(/[.؟!]/).map((part) => part.trim()).filter(Boolean).some((part, index, arr) => part.length > 25 && arr.indexOf(part) !== index);
    const tooMuchMatchReport = ((full.match(/المباراة/g) || []).length >= 5) && ((full.match(/النتيجة/g) || []).length >= 2);

    const hasContestSignal = participantNames.length > 0
        || /توقع|توقعات|المسابقة|مشارك|مشاركة|نقطة|نقاط|بالملّي|صحيح|صحيحة|المركز|الترتيب|فارق|أغلب|أغلبية|ناس|قرأ|قرأت|شاف|شافت|قاسية|وزعت|قفز|قفزت|تقدم|تقدمت|منصة|سلسلة|غيّرت|غيرت|قلبت|رجّعت|رجعت|صدمة|مفاجأة|exact/i.test(full);
    const hasStorySignal = /لكن|وهنا|ومن هنا|اللقطة|القصة|الجو|المرحلة|المنافسة|السباق|تحوّل|تحول|الضغط|الصدمة|الفرحة|النقطة|المنعطف|مزاج|قراءة|جرأة|فخ|زحمة|خزنة|أضواء|هدوء|خارج|نجا|نجت|أعصاب|إقصائي|إقصائية/i.test(full);
    const rawResultOnly = !hasContestSignal && /فازت|فاز|انتهت|سجلت|سجل|شباك نظيفة|فارق هدف|مباراة حماسية|مباراة متقاربة/i.test(full);
    const tooShort = compactBodyLength < 115;
    const tooFewSentences = (body.match(/[.؟!]/g) || []).length < 2;
    const tooManyScores = (body.match(/\d+\s*[-–]\s*\d+/g) || []).length > 2;

    if (bannedTitle || bannedPhrases || metadataLeak || inventedQuote || repeatedSameSentence || tooMuchMatchReport || titleLooksLikeResultTile || rawResultOnly || tooShort || tooFewSentences || tooManyScores) return true;
    if (startsWithResult) return true;
    if (resultReportPattern && !/لكن|وهنا|اللقطة|فخ|زحمة|جرأة|ضغط|أضواء/.test(full)) return true;
    if (AI_REQUIRE_CONTEST_SIGNAL && !hasContestSignal) return true;
    if (!hasStorySignal && participantNames.length === 0) return true;
    if (paragraphs.length < 1) return true;
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
      "source_note_ids": ["id من final_event_notes إذا كان المنشور عن حدث كروي حقيقي"],
      "source_key": "معرف المصدر الثابت",
      "source_match_id": "id المباراة إن وجد"
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
- الوصف: جملتان إلى ثلاث جمل قصيرة، 28 إلى 54 كلمة تقريباً، ويربط الحدث بجو المسابقة أو المشاركين. لا حشو ولا فقرتان طويلتان.
- استخدم ضمائر صحيحة. أسماء البنات موضحة في participantLanguage.
- لا تخترع أحداث كرة قدم مثل بطاقة حمراء، هوشة، إصابة، VAR، تصريح، احتفال، جدل، أو خبر بعد المباراة إلا إذا وجدت في eventNotes. إذا استخدمت eventNotes، ضع id الخاص بها داخل source_note_ids.
- لو لم توجد eventNotes، ركز على أحداث مسابقة التوقعات نفسها.
- لا تستخدم عبارة مكررة في أكثر من منشور.
- لا تكتب منشورين عن نفس eventNote أو نفس زاوية القصة. يمكن استخدام المباراة مرة أخرى فقط لقصة مختلفة فعلاً ومصدر مختلف، وليس إعادة صياغة الحدث نفسه.
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
        const body = formatHighlightBody(post?.body_ar || "");
        if (!title || !body || usedTitles.has(title)) return;
        usedTitles.add(title);
        highlights.push({
            title_ar: title,
            body_ar: body,
            icon: cleanText(presentation.icon, 8),
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
            title_ar: buildMatchHintTitle(match, "خزنة النقاط انفتحت"),
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
            title_ar: buildMatchHintTitle(match, "بالملّي في وقتها"),
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
            title_ar: buildMatchHintTitle(match, "لخبطة على الورق"),
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


function polishHighlightArabicText(value = "") {
    return String(value || "")
        .replace(/(\d+)\.\s+(\d+)\s*%/g, "$1.$2%")
        .replace(/(\d+)\s+%/g, "$1%")
        .replace(/([3-9]|10)\s+نتيجة بالملّي/g, "$1 نتائج بالملّي")
        .replace(/أهداف بالملّي/g, "نتائج بالملّي")
        .replace(/إصابات بالملّي/g, "نتائج بالملّي")
        .replace(/\bومار\b/g, "ولمار")
        .replace(/\bنال إلهام\b/g, "نالت إلهام")
        .replace(/\bحصد إلهام\b/g, "حصدت إلهام")
        .replace(/\bاستلمت\b/g, "حصدت")
        .replace(/\bاستلم\b/g, "حصد")
        .replace(/يا ساتر[،,!]?\s*/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function resolveHighlightPresentation(post = {}, factsPack = {}) {
    const category = getHighlightCategory(post);
    const participantCategories = new Set(["participant", "participant_arc", "profile"]);
    const explicitMatchId = getHighlightExplicitMatchId(post);
    const match = (factsPack?.contest?.matches || []).find(
        (item) => String(item.id) === String(explicitMatchId)
    );

    let stage = cleanText(post.stage_ar || post.subtitle_ar || "أضواء المسابقة", 80);
    if (participantCategories.has(category)) {
        stage = "أضواء المشاركين";
    } else if (match?.stageLabel) {
        stage = match.stageLabel;
    }

    let icon = cleanText(post.icon || "", 8);
    const storyText = `${post.title_ar || ""} ${post.body_ar || ""}`;
    if (!icon || icon === "✨" || icon === "⚽") {
        if (/ترجيح|ركلات/.test(storyText)) icon = "🥅";
        else if (/فخ|التوقع الشائع|الأغلبية|خالف التخمين/.test(storyText)) icon = "🌪️";
        else if (/بالملّي|النتيجة كاملة|دقة|دقيق/.test(storyText)) icon = "🎯";
        else {
        const iconByCategory = {
            popular_trap: "🌪️",
            lone_reader: "🎯",
            exact_circle: "🎯",
            knockout_pressure: "🔥",
            real_event_plus_contest: "⚽",
            match: "⚽",
            points_swing: "📈",
            hard_stop: "🧱",
            participant: "🌟",
            participant_arc: "🌟",
            stage: "🏟️",
            stage_mood: "🏟️",
            emotional: "💫",
            fun: "🎉"
        };
        icon = iconByCategory[category] || "✨";
        }
    }

    return { stage, icon, match };
}

const HIGHLIGHT_STYLE_FAMILIES = [
    { key: "quiet_read", pattern: /قراءة هادئة|هدوء القراءة|بهدوء قبل|الهدوء يجمع/ },
    { key: "crowd", pattern: /الزحمة|الطريق المزدحم|خارج القطيع|الأغلبية/ },
    { key: "noise", pattern: /الضجيج|الصوت العالي|الصوت الأعلى/ },
    { key: "steady", pattern: /الثبات|خطوات ثابتة|بخطى ثابتة|الاستمرارية/ },
    { key: "comfortable", pattern: /التوقع المريح|الطريق الآمن|الطريق الأسهل/ },
    { key: "the_point", pattern: /اللقطة هنا مو في|اللقطة هنا ليست في/ },
    { key: "small_details", pattern: /التفاصيل الصغيرة|تفاصيل صغيرة/ }
];

function highlightStyleFamilies(row = {}) {
    const text = `${row.title_ar || ""} ${row.body_ar || ""}`;
    return HIGHLIGHT_STYLE_FAMILIES.filter((family) => family.pattern.test(text)).map((family) => family.key);
}

function rowHighlightCategory(row = {}) {
    return getHighlightCategory(row);
}

function rowHighlightStageKey(row = {}) {
    const text = `${row.subtitle_ar || ""} ${getHighlightCard(row).stage_ar || ""}`;
    if (/النهائي|FINAL/i.test(text)) return "FINAL";
    if (/المركز الثالث|THIRD/i.test(text)) return "THIRD_PLACE";
    if (/نصف|SEMI/i.test(text)) return "SEMI_FINALS";
    if (/ربع|QUARTER/i.test(text)) return "QUARTER_FINALS";
    if (/16/.test(text)) return "LAST_16";
    if (/32/.test(text)) return "LAST_32";
    if (/المجموعات|GROUP/i.test(text)) return "GROUP_STAGE";
    if (/المشاركين/.test(text)) return "PARTICIPANT";
    return "OTHER";
}

function stageHighlightCap(stageKey) {
    const caps = {
        GROUP_STAGE: AI_GROUP_STAGE_HIGHLIGHT_MAX,
        LAST_32: 8,
        LAST_16: 6,
        QUARTER_FINALS: 5,
        SEMI_FINALS: 3,
        THIRD_PLACE: 2,
        FINAL: 2,
        PARTICIPANT: AI_PARTICIPANT_HIGHLIGHT_MAX,
        OTHER: 3
    };
    return caps[stageKey] ?? 3;
}

const PARTICIPANT_COUNT_WORDS = new Map([
    ["اثنان", 2], ["اثنين", 2], ["ثلاثة", 3], ["ثلاث", 3],
    ["أربعة", 4], ["أربع", 4], ["خمسة", 5], ["خمس", 5],
    ["ستة", 6], ["ست", 6]
]);

function hasParticipantCountMismatch(row = {}, factsPack = {}) {
    const text = `${row.title_ar || ""} ${row.body_ar || ""}`;
    const names = (factsPack?.contest?.activeParticipants || []).map((item) => item.name).filter(Boolean);
    const mentioned = names.filter((name) => text.includes(name));
    const claim = text.match(/(?:^|\s)(\d+|اثنان|اثنين|ثلاثة|ثلاث|أربعة|أربع|خمسة|خمس|ستة|ست)\s+(?:مشارك(?:ين|ون|ات)?|أسماء)/);
    if (!claim) return false;
    const expected = /^\d+$/.test(claim[1]) ? Number(claim[1]) : PARTICIPANT_COUNT_WORDS.get(claim[1]);
    return Number.isInteger(expected) && expected >= 2 && expected <= 6 && mentioned.length > 0 && mentioned.length < expected;
}

function hasMalformedHighlightLanguage(row = {}, factsPack = {}) {
    const text = `${row.title_ar || ""} ${row.body_ar || ""}`;
    if (/(?:غادر|خرج|بقي|بينما)\s+\d+(?:\.\d+)?[%٪]?\s*[.!؟]?(?:\s|$)/.test(text)) return true;
    if (/\d+\.\s+\d+\s*%/.test(text)) return true;
    if (/أهداف بالملّي|إصابات بالملّي/.test(text)) return true;
    const names = getHighlightParticipantNames(row);
    const hasFemale = names.some((name) => FEMALE_NAMES.has(String(name).trim()));
    const hasMale = names.some((name) => !FEMALE_NAMES.has(String(name).trim()));
    if (/(?:حصدت|حصلت|أخذت) كل منهن/.test(text) && hasMale) return true;
    if (/(?:حصد|حصل|أخذ) كل منهم/.test(text) && hasFemale && !hasMale) return true;
    if (/ختم(?:ت|ه)?\s+(?:في|المسابقة)/.test(text) && Number(row.source_completed_match_count || 0) < EXPECTED_WORLD_CUP_MATCH_COUNT) return true;
    if (hasParticipantCountMismatch(row, factsPack)) return true;
    return false;
}

function highlightCurationScore(row = {}) {
    const card = getHighlightCard(row);
    const matchId = getHighlightExplicitMatchId(row);
    const noteCount = getHighlightSourceNoteIds(row).length;
    const participantCount = getHighlightParticipantNames(row).length;
    const words = String(row.body_ar || "").split(/\s+/).filter(Boolean).length;
    const concreteTitle = /×|ضد/.test(String(row.title_ar || "")) ? 18 : 0;
    const compactBonus = words >= 28 && words <= 54 ? 18 : 0;
    const sourceBonus = matchId ? 18 : 0;
    const noteBonus = Math.min(24, noteCount * 12);
    const participantBonus = Math.min(10, participantCount * 3);
    const genericPenalty = /صفحة من مزاج|قراءة هادئة|الثبات يصنع|لقطة تستحق/.test(`${row.title_ar} ${row.body_ar}`) ? 18 : 0;
    return highlightRowScore(row) + concreteTitle + compactBonus + sourceBonus + noteBonus + participantBonus - genericPenalty;
}

function curateHighlightRows(rows = [], factsPack = {}, targetCount = AI_PUBLIC_HIGHLIGHT_TARGET) {
    const profiles = rows.filter((row) => row.section_key !== FINAL_HIGHLIGHTS_SECTION);
    const prepared = rows
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
        .map((row) => {
            const card = getHighlightCard(row);
            const originalCategory = String(card.type || "").toLowerCase();
            const explicitMatchId = getHighlightExplicitMatchId({ ...row, ...card });
            const participantNames = getHighlightParticipantNames({ ...row, ...card });
            const looksMatchCentered = Boolean(
                explicitMatchId &&
                ["participant", "participant_arc", "profile"].includes(originalCategory) &&
                (participantNames.length !== 1 || /×|ضد/.test(`${row.title_ar || ""} ${row.body_ar || ""}`))
            );
            const normalizedCard = looksMatchCentered ? { ...card, type: "match" } : card;
            const presentation = resolveHighlightPresentation({ ...row, ...normalizedCard }, factsPack);
            const title = polishHighlightArabicText(
                buildDisplayHighlightTitle({ ...row, ...normalizedCard, stage_ar: presentation.stage }, 0, factsPack)
            );
            const body = formatHighlightBody(polishHighlightArabicText(row.body_ar));
            return {
                ...row,
                title_ar: title,
                subtitle_ar: presentation.stage,
                body_ar: body,
                icon: presentation.icon,
                cards_json: [{
                    ...normalizedCard,
                    stage_ar: presentation.stage
                }]
            };
        })
        .filter((row) => row.title_ar && row.body_ar)
        .filter((row) => !hasMalformedHighlightLanguage(row, factsPack))
        .filter((row) => !isLowQualityHighlightPost({
            ...row,
            category: rowHighlightCategory(row),
            participant_names: getHighlightParticipantNames(row)
        }))
        .sort((a, b) => highlightCurationScore(b) - highlightCurationScore(a) || compareHighlightRows(a, b));

    const kept = [];
    const seenMatches = new Set();
    const seenParticipants = new Set();
    const stageCounts = new Map();
    const styleCounts = new Map();
    const stageSummaryStages = new Set();
    let stageSummaryCount = 0;

    for (const row of prepared) {
        if (kept.length >= targetCount) break;

        const category = rowHighlightCategory(row);
        const matchId = getHighlightExplicitMatchId(row) || inferHighlightMatchId(row, factsPack);
        const matchBasedCategories = new Set([
            "match", "real_event_plus_contest", "popular_trap", "lone_reader",
            "exact_circle", "knockout_pressure", "points_swing", "hard_stop",
            "emotional", "fun"
        ]);
        if (matchBasedCategories.has(category) && !matchId) continue;
        const stageKey = rowHighlightStageKey(row);
        const stageCount = stageCounts.get(stageKey) || 0;
        if (stageCount >= stageHighlightCap(stageKey)) continue;

        if (matchId) {
            if (seenMatches.has(matchId)) continue;
        }

        if (["participant", "participant_arc", "profile"].includes(category)) {
            const names = getHighlightParticipantNames(row);
            const mainName = names[0] || "";
            if (!mainName || seenParticipants.has(mainName)) continue;
            if (seenParticipants.size >= AI_PARTICIPANT_HIGHLIGHT_MAX) continue;
        }

        if (["stage", "stage_mood"].includes(category)) {
            if (stageSummaryCount >= AI_STAGE_SUMMARY_MAX) continue;
            if (stageSummaryStages.has(stageKey)) continue;
        }

        const families = highlightStyleFamilies(row);
        if (families.some((family) => (styleCounts.get(family) || 0) >= AI_STYLE_FAMILY_MAX)) continue;

        kept.push(row);
        stageCounts.set(stageKey, stageCount + 1);
        if (matchId) seenMatches.add(matchId);

        if (["participant", "participant_arc", "profile"].includes(category)) {
            const mainName = getHighlightParticipantNames(row)[0];
            if (mainName) seenParticipants.add(mainName);
        }

        if (["stage", "stage_mood"].includes(category)) {
            stageSummaryCount += 1;
            stageSummaryStages.add(stageKey);
        }

        for (const family of families) {
            styleCounts.set(family, (styleCounts.get(family) || 0) + 1);
        }
    }

    console.log("Highlight curation summary:");
    console.log(JSON.stringify({
        inputHighlights: prepared.length,
        keptHighlights: kept.length,
        targetHighlights: targetCount,
        byStage: Object.fromEntries([...stageCounts.entries()]),
        participantSpotlights: seenParticipants.size,
        stageSummaries: stageSummaryCount,
        uniqueMatches: seenMatches.size,
        repeatedStyleFamilies: Object.fromEntries([...styleCounts.entries()])
    }, null, 2));

    return [...kept, ...profiles];
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
        const presentation = resolveHighlightPresentation(post, factsPack);
        const polishedPost = {
            ...post,
            stage_ar: presentation.stage,
            icon: presentation.icon,
            body_ar: polishHighlightArabicText(post.body_ar),
            title_ar: polishHighlightArabicText(post.title_ar)
        };
        const body = formatHighlightBody(polishedPost.body_ar);
        const title = cleanText(buildDisplayHighlightTitle(polishedPost, index, factsPack), AI_POST_TITLE_MAX_CHARS);
        if (!title || !body || isLowQualityHighlightPost({ ...polishedPost, title_ar: title, body_ar: body })) return;

        rows.push({
            section_key: FINAL_HIGHLIGHTS_SECTION,
            title_ar: title,
            subtitle_ar: cleanText(presentation.stage, 80),
            body_ar: body,
            icon: cleanText(post.icon || "✨", 8),
            cards_json: [{
                type: cleanText(post.category || "timeline", 40),
                stage_ar: cleanText(presentation.stage, 80),
                participant_names: Array.isArray(post.participant_names) ? post.participant_names.slice(0, 6) : [],
                source_fact: cleanText(post.source_fact || "", 180),
                source_note_ids: Array.isArray(post.source_note_ids) ? post.source_note_ids.slice(0, 6) : [],
                source_key: cleanText(post.source_key || "", 180),
                source_match_id: cleanText(post.source_match_id || "", 80) || null
            }],
            participant_id: null,
            source_completed_match_count: sourceCompletedMatchCount,
            source_match_ids: sourceMatchIds,
            source_hash: `${GENERATOR_VERSION}:${sourceHashBase}:highlight:${hashObject(buildHighlightSemanticKey({ ...post, title_ar: title, body_ar: body }, factsPack, index))}`,
            display_order: 1000 - index,
            visible: PUBLISH_VISIBLE
        });
    });

    if (GENERATE_PROFILES) {
        const profileMessages = Array.isArray(output?.profile_messages) ? output.profile_messages : [];
        for (const participant of activeParticipants) {
            const row = factsPack.contest.leaderboard.find((item) => item.name === participant.name);
            const title = cleanText(row?.rank === 1
                ? (factsPack.audit.finalDataReady ? "لمحة البطل" : "لمحة المتصدر")
                : "لمحة شخصية", AI_POST_TITLE_MAX_CHARS);
            const body = cleanBodyText(buildFallbackProfileMessage(participant.name, factsPack), 950);

            rows.push({
                section_key: FINAL_PROFILE_SECTION,
                title_ar: title,
                subtitle_ar: "بصمة المشارك",
                body_ar: body,
                icon: cleanText(row?.rank === 1 ? "👑" : "✨", 8),
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

function buildRowsSourceContext(factsPack) {
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
    return { sourceCompletedMatchCount, sourceMatchIds, sourceHashBase };
}

function addCalculatedHighlightRowsToRows(existingRows, factsPack, targetCount) {
    const rows = [...existingRows];
    const { sourceCompletedMatchCount, sourceMatchIds, sourceHashBase } = buildRowsSourceContext(factsPack);
    const existingHighlightRows = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION);
    const used = new Set(existingHighlightRows.map((row) => `${row.title_ar}|${row.body_ar}`.toLowerCase()));

    const seeds = [...(factsPack.contest.integratedStorySeeds || [])]
        .filter(isHighSignalStorySeed)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || storyTypeOrder(a.type) - storyTypeOrder(b.type));

    let added = 0;
    for (const seed of seeds) {
        const currentCount = rows.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION).length;
        if (currentCount >= targetCount || currentCount >= MAX_HIGHLIGHTS || added >= AI_MAX_CALCULATED_TOP_UP) break;

        const post = buildCalculatedHighlightPost(seed, currentCount + 1);
        if (!post) continue;

        const presentation = resolveHighlightPresentation(post, factsPack);
        const polishedPost = {
            ...post,
            stage_ar: presentation.stage,
            icon: presentation.icon,
            title_ar: polishHighlightArabicText(post.title_ar),
            body_ar: polishHighlightArabicText(post.body_ar)
        };
        const title = cleanText(buildDisplayHighlightTitle(polishedPost, currentCount, factsPack), AI_POST_TITLE_MAX_CHARS);
        const body = formatHighlightBody(polishedPost.body_ar);
        const key = `${title}|${body}`.toLowerCase();
        const candidatePost = { ...polishedPost, title_ar: title, body_ar: body };
        if (!title || !body || used.has(key) || isUnsafeCalculatedHighlightPost(candidatePost)) continue;
        if (rows.some((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION && getHighlightDuplicateReason(candidatePost, row, factsPack))) continue;
        used.add(key);

        rows.push({
            section_key: FINAL_HIGHLIGHTS_SECTION,
            title_ar: title,
            subtitle_ar: cleanText(presentation.stage, 80),
            body_ar: body,
            icon: cleanText(presentation.icon, 8),
            cards_json: [{
                type: cleanText(post.category || "timeline", 40),
                stage_ar: cleanText(presentation.stage, 80),
                participant_names: Array.isArray(post.participant_names) ? post.participant_names.slice(0, 6) : [],
                source_fact: cleanText(post.source_fact || "calculated_story_top_up", 180),
                source_note_ids: Array.isArray(post.source_note_ids) ? post.source_note_ids.slice(0, 6) : [],
                source_key: cleanText(post.source_key || "", 180),
                source_match_id: cleanText(post.source_match_id || "", 80) || null
            }],
            participant_id: null,
            source_completed_match_count: sourceCompletedMatchCount,
            source_match_ids: sourceMatchIds,
            source_hash: `${GENERATOR_VERSION}:${sourceHashBase}:highlight:${hashObject(buildHighlightSemanticKey({ ...post, title_ar: title, body_ar: body }, factsPack, currentCount))}`,
            display_order: 900 - currentCount,
            visible: PUBLISH_VISIBLE
        });
        added += 1;
    }

    if (added > 0) {
        console.warn(`Added ${added} calculated final_highlights row(s) after AI quality filtering.`);
    }

    return rows
        .sort((a, b) => {
            if (a.section_key !== b.section_key) return a.section_key.localeCompare(b.section_key);
            return (b.display_order || 0) - (a.display_order || 0);
        })
        .slice(0, MAX_HIGHLIGHTS + (GENERATE_PROFILES ? (factsPack.audit.activeParticipants || 0) : 0));
}


function sortAndRenumberAiRows(rows, factsPack) {
    const highlightRows = rows
        .filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION)
        .sort((a, b) => compareHighlightRows(a, b));

    const profileRankById = new Map((factsPack.contest.leaderboard || []).map((row) => [String(row.participant_id || row.id || row.participantId || ""), row.rank || 999]));
    const profileRankByName = new Map((factsPack.contest.leaderboard || []).map((row) => [row.name, row.rank || 999]));

    const profileRows = rows
        .filter((row) => row.section_key === FINAL_PROFILE_SECTION)
        .sort((a, b) => {
            const aName = a.cards_json?.[0]?.participant_name || "";
            const bName = b.cards_json?.[0]?.participant_name || "";
            const aRank = profileRankById.get(String(a.participant_id || "")) || profileRankByName.get(aName) || 999;
            const bRank = profileRankById.get(String(b.participant_id || "")) || profileRankByName.get(bName) || 999;
            return aRank - bRank || String(aName).localeCompare(String(bName), "ar");
        });

    highlightRows.forEach((row, index) => {
        row.display_order = 2000 - index;
    });

    profileRows.forEach((row, index) => {
        row.display_order = 1000 - index;
    });

    return [...highlightRows, ...profileRows];
}

function compareHighlightRows(a, b) {
    return (highlightRowScore(b) - highlightRowScore(a))
        || ((b.display_order || 0) - (a.display_order || 0))
        || String(b.created_at || "").localeCompare(String(a.created_at || ""))
        || String(a.title_ar || "").localeCompare(String(b.title_ar || ""), "ar");
}

function highlightRowScore(row) {
    const card = Array.isArray(row.cards_json) ? row.cards_json[0] || {} : {};
    const type = String(card.type || row.category || "").toLowerCase();
    const stageText = `${row.subtitle_ar || ""} ${card.stage_ar || ""} ${card.stage || ""}`;

    const typeScores = {
        match: 95,
        real_event_plus_contest: 95,
        emotional: 90,
        fun: 86,
        knockout_pressure: 84,
        popular_trap: 78,
        lone_reader: 74,
        exact_circle: 70,
        points_swing: 66,
        hard_stop: 62,
        participant: 58,
        timeline: 54,
        stage: 44,
        stage_mood: 44
    };

    return stageDisplayScore(stageText) + (typeScores[type] || 50);
}

function stageDisplayScore(value = "") {
    const text = String(value || "").toLowerCase();
    if (/final|النهائي/.test(text)) return 700;
    if (/third|المركز الثالث/.test(text)) return 650;
    if (/semi|نصف/.test(text)) return 600;
    if (/quarter|ربع/.test(text)) return 500;
    if (/last_16|round of 16|دور الـ?16|دور 16/.test(text)) return 400;
    if (/last_32|round of 32|دور الـ?32|دور 32/.test(text)) return 300;
    if (/group|المجموعات/.test(text)) return 200;
    return 100;
}

function isUnsafeCalculatedHighlightPost(post = {}) {
    const title = String(post.title_ar || "").trim();
    const body = String(post.body_ar || "").trim();
    const full = `${title} ${body}`;
    const compactLength = body.replace(/[\s.،,!؟:؛\-–—]/g, "").length;

    if (compactLength < 105) return true;
    if (/ما فيهاش|كده|بيقرأوا|فارغين|ما كانش|دارتت|النجاحة|البمثيلة|واجتهد/i.test(full)) return true;
    if (/^(مباراة أهدافها كثيرة|حسم ضيق|شباك نظيفة|نتيجة موثقة|مباراة حماسية|مباراة متقاربة)$/i.test(title)) return true;
    if (/^\d+\s*[-–]\s*\d+/.test(title)) return true;
    if (/الجمهور كان|تداولت الأحاديث|أصبح الحديث يدور/i.test(full)) return true;
    return false;
}

function rebuildSafeProfileRows(existingRows, factsPack) {
    const rowsWithoutProfiles = existingRows.filter((row) => row.section_key !== FINAL_PROFILE_SECTION);
    const { sourceCompletedMatchCount, sourceMatchIds, sourceHashBase } = buildRowsSourceContext(factsPack);
    const activeParticipants = factsPack.contest.activeParticipants || [];

    for (const participant of activeParticipants) {
        const row = factsPack.contest.leaderboard.find((item) => item.name === participant.name);
        rowsWithoutProfiles.push({
            section_key: FINAL_PROFILE_SECTION,
            title_ar: cleanText(
                buildFallbackProfileTitle(row || {}, factsPack),
                AI_POST_TITLE_MAX_CHARS
            ),
            subtitle_ar: "بصمة المشارك",
            body_ar: cleanBodyText(buildFallbackProfileMessage(participant.name, factsPack), 950),
            icon: cleanText(row?.rank === 1 ? "👑" : "✨", 8),
            cards_json: [{ type: "profile_final", participant_name: participant.name }],
            participant_id: participant.id,
            source_completed_match_count: sourceCompletedMatchCount,
            source_match_ids: sourceMatchIds,
            source_hash: `${GENERATOR_VERSION}:${sourceHashBase}:profile:${participant.id}`,
            display_order: 500,
            visible: PUBLISH_VISIBLE
        });
    }

    return rowsWithoutProfiles;
}

function buildFallbackProfileTitle(row = {}, factsPack = {}) {
    const leaderboard = factsPack.contest.leaderboard || [];
    const exactLeader = Math.max(...leaderboard.map((item) => item.exactScores || 0), 0);
    const accuracyLeader = Math.max(...leaderboard.map((item) => item.accuracyPercent || 0), 0);
    const streakLeader = Math.max(...leaderboard.map((item) => item.bestCorrectStreak || 0), 0);
    const bestStageLabel = row.bestStage?.label_ar || "";

    if (row.rank === 1) {
        return factsPack.audit.finalDataReady
            ? "الكرسي الأول تعوّد على الاسم"
            : "الصدارة تقول: لا تستعجلوا";
    }

    if ((row.rank || 999) <= 3) return "المنصة قالت: أهلاً";
    if ((row.exactScores || 0) >= Math.max(4, exactLeader - 2)) return "موعد متكرر مع «بالملّي»";
    if ((row.uniqueCorrect || 0) > 0 || (row.againstCrowdPoints || 0) > 0) return "طريق مختلف… ونقاط حقيقية";
    if ((row.accuracyPercent || 0) >= Math.max(50, accuracyLeader - 8)) return "هدوء يجمع النقاط";
    if ((row.bestCorrectStreak || 0) >= Math.max(4, streakLeader - 1)) return "دخل مود السلسلة";
    if (bestStageLabel) return `${bestStageLabel}: هنا ظهرت البصمة`;
    return "الحضور له لقطة";
}

function buildFallbackProfileMessage(participantName, factsPack) {
    const row = factsPack.contest.leaderboard.find((item) => item.name === participantName);
    if (!row) {
        return `${participantName}: هذا الاسم كان جزءاً من جو المسابقة، والجدول يرفع القبعة لكل من حضر الرحلة حتى النهاية.`;
    }

    const leaderboard = factsPack.contest.leaderboard || [];
    const exactLeader = Math.max(...leaderboard.map((item) => item.exactScores || 0), 0);
    const accuracyLeader = Math.max(...leaderboard.map((item) => item.accuracyPercent || 0), 0);
    const streakLeader = Math.max(...leaderboard.map((item) => item.bestCorrectStreak || 0), 0);
    const topThree = row.rank <= 3;
    const bestStageLabel = row.bestStage?.label_ar || "مرحلة من البطولة";
    const bestStagePoints = row.bestStage?.points || 0;
    const badges = buildProfileBadgeLabels(row).slice(0, 3);
    const badgeText = badges.length
        ? `أبرز الشارات: ${badges.join("، ")}.`
        : "حتى من دون شارة لامعة، الاسم حاضر في حكاية المسابقة.";

    let opening = "";
    let second = "";

    if (row.rank === 1) {
        opening = factsPack.audit.finalDataReady
            ? `${row.name} في الصدارة النهائية بعد رحلة طويلة من النقاط والتوقعات. كرسي المركز الأول تعوّد على الاسم وقرر الاكتفاء به.`
            : `${row.name} في الصدارة حالياً، لكن الجدول يرفض الاحتفال مبكراً ويقول: انتظروا صافرة النهاية.`;

        second = `المحصلة ${row.points} نقطة، ${row.correctPredictions} توقعاً جاب نقاط، و${row.exactScores} بالملّي. لا سحر ولا VAR في الجدول؛ فقط أرقام محسوبة جيداً.`;
    } else if (topThree) {
        opening = factsPack.audit.finalDataReady
            ? `${row.name} ضمن الثلاثة الأوائل، والمنصة قالت باختصار: الصورة الجماعية ناقصة من دون هذا الاسم.`
            : `${row.name} في المركز ${row.rank} حالياً، والمنصة قريبة بما يكفي لتجعل كل مباراة ترفع النبض قليلاً.`;

        second = `المحصلة ${row.points} نقطة، مع ${row.exactScores} بالملّي و${row.correctPredictions} توقعاً جاب نقاط. ${badgeText}`;
    } else if ((row.exactScores || 0) >= Math.max(4, exactLeader - 2)) {
        opening = `لدى ${row.name} موعد متكرر مع كلمة «بالملّي». كأن خانتي النتيجة كانتا ترسلان تلميحاً قبل البداية، لكن لا تقلقوا: كل شيء محفوظ في قاعدة البيانات.`;

        second = `${row.exactScores} نتائج كاملة و${row.points} نقطة جعلت بصمة ${row.name} أوضح من مجرد مركز في الجدول. الدقة هنا ليست مزحة؛ المزحة فقط أنها تكررت أكثر من اللازم.`;
    } else if ((row.uniqueCorrect || 0) > 0 || (row.againstCrowdPoints || 0) > 0) {
        opening = `${row.name} لم يلتزم دائماً بالطريق المزدحم. كلما اتجهت الزحمة إلى اختيار واحد، كان هناك فضول للنظر في الاتجاه الآخر—وأحياناً كانت النقاط هناك.`;

        second = `${row.uniqueCorrect || 0} قراءة منفردة و${row.againstCrowdPoints || 0} نقطة ضد الموجة تقول إن أجمل لقطات ${row.name} جاءت من قرارات لا تشبه توقع الأغلبية.`;
    } else if ((row.accuracyPercent || 0) >= Math.max(50, accuracyLeader - 8)) {
        opening = `ملف ${row.name} يقول: دراما أقل، نقاط أكثر. نسبة الدقة كانت تقوم بالمهمة بهدوء، من دون حاجة إلى مؤثرات صوتية.`;

        second = `دقة ${row.accuracyPercent}% مع ${row.correctPredictions} توقعاً جاب نقاط و${row.points} نقطة؛ أسلوب ثابت، والجدول يحب هذا النوع من الهدوء.`;
    } else if ((row.bestCorrectStreak || 0) >= Math.max(4, streakLeader - 1)) {
        opening = `${row.name} دخل فترة كان عنوانها: لا تقاطعوا السلسلة. كل توقع صحيح كان يسلّم الكرة للتوقع الذي بعده.`;

        second = `${row.bestCorrectStreak} توقعات صحيحة متتالية و${row.points} نقطة تعني أن الإيقاع استمر أكثر من مباراة، وهذه وحدها لقطة تستحق التذكر.`;
    } else if (bestStagePoints > 0) {
        opening = `${bestStageLabel} كانت المرحلة التي ظهرت فيها بصمة ${row.name} بأوضح صورة. بعض المشاركين يحتاجون بطولة كاملة، وبعضهم تكفيه مرحلة تقول: هنا كانت اللقطة.`;

        second = `أفضل حصيلة مرحلية كانت ${bestStagePoints} نقطة، والمجموع النهائي ${row.points} نقطة مع ${row.correctPredictions} توقعاً جاب نقاط. ${badgeText}`;
    } else {
        opening = `${row.name} جزء من قصة المسابقة، والترتيب ليس كل الحكاية. أحياناً يكفي أن تفتح النتيجة بعد المباراة وتقول: كنت قريباً… قريباً جداً.`;

        second = `الأرقام تقول ${row.points} نقطة و${row.correctPredictions} توقعاً جاب نقاط. الخلاصة: صفحة الختام تسع الجميع، والذكريات لا تطلب مركزاً أولاً للدخول.`;
    }

    return `${opening}\n\n${second}`;
}

function buildProfileBadgeLabels(row) {
    const labels = [];
    if (row.finalRank === 1 || row.rank === 1) labels.push("بطل المسابقة");
    else if ((row.finalRank || row.rank) <= 3) labels.push("على المنصة");
    if ((row.exactScores || 0) > 0) labels.push(`${row.exactScores} بالملّي`);
    if ((row.bestCorrectStreak || 0) > 1) labels.push(`سلسلة ${row.bestCorrectStreak}`);
    if ((row.uniqueCorrect || 0) > 0) labels.push("قراءة منفردة");
    if ((row.againstCrowdPoints || 0) > 0) labels.push("ضد الموجة");
    if ((row.cleanSheetsExact || 0) > 0) labels.push("صفر في مكانه");
    if ((row.appearancesInFirst || 0) > 0) labels.push("لمس الصدارة");
    return labels;
}

function arabicCountWord(count, one, two, many) {
    if (count === 1) return one;
    if (count === 2) return two;
    return many;
}

function formatHighlightBody(value) {
    const raw = String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    if (!raw) return "";

    const sentenceParts = raw.match(/[^.!؟]+[.!؟]?/g) || [raw];
    const selected = [];
    let wordCount = 0;

    for (const part of sentenceParts) {
        const sentence = part.replace(/\s+/g, " ").trim();
        if (!sentence) continue;

        const words = sentence.split(/\s+/).filter(Boolean);
        const remainingWords = AI_HIGHLIGHT_MAX_WORDS - wordCount;
        if (remainingWords <= 0 || selected.length >= 3) break;

        if (words.length > remainingWords) {
            if (selected.length === 0) {
                selected.push(`${words.slice(0, remainingWords).join(" ").replace(/[،,:؛-]+$/, "")}…`);
                wordCount += remainingWords;
            }
            break;
        }

        selected.push(sentence);
        wordCount += words.length;
    }

    let result = selected.join(" ").replace(/\s+/g, " ").trim();
    if (!result) result = raw;

    if (result.length > AI_POST_BODY_MAX_CHARS) {
        const sliced = result.slice(0, AI_POST_BODY_MAX_CHARS + 1);
        const safeEnd = Math.max(
            sliced.lastIndexOf("."),
            sliced.lastIndexOf("؟"),
            sliced.lastIndexOf("!"),
            sliced.lastIndexOf("،"),
            sliced.lastIndexOf(" ")
        );
        result = `${sliced.slice(0, safeEnd > 120 ? safeEnd : AI_POST_BODY_MAX_CHARS).trim().replace(/[،,:؛-]+$/, "")}…`;
    }

    return result;
}

function cleanBodyText(value, maxLength) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, maxLength);
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


function runHighlightQualitySelfTest() {
    const assert = (condition, message) => {
        if (!condition) throw new Error(`Highlight quality self-test failed: ${message}`);
    };

    assert(
        polishHighlightArabicText("دقة 55. 9% مع 4 نتيجة بالملّي وأهداف بالملّي") ===
            "دقة 55.9% مع 4 نتائج بالملّي ونتائج بالملّي",
        "Arabic numeric/football terminology normalization"
    );

    const sameMatchA = {
        title_ar: "إسبانيا × بلجيكا: لقطة أولى",
        body_ar: "قصة مختلفة شكلاً.",
        category: "match",
        source_match_id: "match-1",
        source_key: "story:a"
    };
    const sameMatchB = {
        title_ar: "ربع النهائي يرفع الضغط",
        body_ar: "صياغة ثانية عن الحدث نفسه.",
        category: "popular_trap",
        source_match_id: "match-1",
        source_key: "story:b"
    };
    assert(
        getHighlightDuplicateReason(sameMatchA, sameMatchB, { contest: { matches: [] } }) === "same match match-1",
        "one final highlight per match"
    );

    const differentExtraTimeMatchA = {
        title_ar: "النرويج × إنجلترا: وقت إضافي",
        body_ar: "قصة المباراة الأولى.",
        category: "knockout_pressure",
        source_match_id: "match-england",
        source_key: "incremental:match-england",
        source_fact: "مباراة امتدت للأشواط الإضافية"
    };
    const differentExtraTimeMatchB = {
        title_ar: "الأرجنتين × سويسرا: وقت إضافي",
        body_ar: "قصة المباراة الثانية.",
        category: "knockout_pressure",
        source_match_id: "match-argentina",
        source_key: "incremental:match-argentina",
        source_fact: "مباراة امتدت للأشواط الإضافية"
    };
    assert(
        getHighlightDuplicateReason(
            differentExtraTimeMatchA,
            differentExtraTimeMatchB,
            { contest: { matches: [] } }
        ) === "",
        "different matches may share the same event type without becoming duplicates"
    );

    assert(
        hasMalformedHighlightLanguage({
            title_ar: "عنوان",
            body_ar: "القراءة كانت جيدة، بينما غادر 87.",
            cards_json: [{ participant_names: [] }],
            source_completed_match_count: 98
        }),
        "broken bare-number sentence rejection"
    );

    const participantPresentation = resolveHighlightPresentation({
        category: "participant_arc",
        stage_ar: "دور المجموعات",
        participant_names: ["تالين"]
    }, { contest: { matches: [] } });
    assert(participantPresentation.stage === "أضواء المشاركين", "participant stage label");

    const syntheticMatches = Array.from({ length: 12 }, (_, index) => ({
        id: `group-${index + 1}`,
        title: `فريق ${index + 1} ضد خصم ${index + 1}`,
        stage: "GROUP_STAGE",
        stageLabel: "دور المجموعات"
    }));
    const syntheticGroupRows = syntheticMatches.map((match, index) => ({
        section_key: FINAL_HIGHLIGHTS_SECTION,
        title_ar: `${match.title.replace(" ضد ", " × ")}: اختبار الجولة`,
        subtitle_ar: "دور المجموعات",
        body_ar: `اللقطة في هذه المباراة كانت مرتبطة مباشرة بمسابقة التوقعات وباختيارات المشاركين قبل البداية. ${match.title} انتهت 1-0، وظهرت النقاط عند من قرأ الاتجاه الصحيح من دون مبالغة أو حشو.`,
        icon: "⚽",
        cards_json: [{
            type: "match",
            stage_ar: "دور المجموعات",
            participant_names: [],
            source_key: `story:${match.id}`,
            source_match_id: match.id
        }],
        source_completed_match_count: 98,
        display_order: 1000 - index
    }));
    const curatedSynthetic = curateHighlightRows(
        syntheticGroupRows,
        { contest: { matches: syntheticMatches } },
        20
    );
    assert(
        curatedSynthetic.filter((row) => row.section_key === FINAL_HIGHLIGHTS_SECTION).length <= AI_GROUP_STAGE_HIGHLIGHT_MAX,
        "group-stage curation cap"
    );

    assert(resolveGenerationMode({ audit: { finalDataReady: false } }) === (AI_GENERATION_MODE_SETTING === "auto" ? "incremental" : resolveGenerationMode({ audit: { finalDataReady: false } })), "generation mode resolves");
    if (AI_GENERATION_MODE_SETTING === "auto") {
        assert(resolveGenerationMode({ audit: { finalDataReady: true } }) === "full_final", "automatic final recap mode");
    }

    console.log("Highlight quality self-test passed.");
}

if (HIGHLIGHT_QUALITY_SELF_TEST) {
    runHighlightQualitySelfTest();
} else {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
