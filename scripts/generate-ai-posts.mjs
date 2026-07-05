import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const AI_BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const AI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL;
const AI_PROVIDER_NAME = process.env.AI_PROVIDER_NAME || "openai-compatible";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.72);
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 1400);

const AI_SECTIONS = (process.env.AI_SECTIONS || "highlights,statistics,journey,awards")
    .split(",")
    .map((section) => section.trim())
    .filter(Boolean);

const GENERATE_EVERY_COMPLETED_MATCHES = Number(process.env.AI_GENERATE_EVERY_COMPLETED_MATCHES || 2);
const MAX_BACKFILL_CHECKPOINTS = Number(process.env.AI_MAX_BACKFILL_CHECKPOINTS || 8);
const POSTS_TABLE = "ai_posts";
const GENERATOR_VERSION = "wc-ai-generator-v1";

const SECTION_CONFIG = {
    highlights: {
        title: "الأضواء",
        goal: "اكتب لقطة ممتعة عن آخر مباراتين وتأثيرها على أجواء المسابقة."
    },
    statistics: {
        title: "الإحصائيات",
        goal: "حوّل الأرقام إلى ملاحظات خفيفة ومفهومة، بدون أسلوب تقارير جافة."
    },
    journey: {
        title: "رحلة البطولة",
        goal: "اكتب فقرة قصيرة كأنها صفحة من قصة البطولة حتى هذه اللحظة."
    },
    awards: {
        title: "الشارات",
        goal: "اقترح شارة أو لقباً لطيفاً مبنياً على البيانات الحالية."
    }
};

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!AI_API_KEY) throw new Error("Missing AI_API_KEY or OPENAI_API_KEY");
if (!AI_MODEL) throw new Error("Missing AI_MODEL or OPENAI_MODEL");

async function main() {
    validateSections();

    const participants = await getParticipants();
    const completedMatches = await getCompletedMatches();

    console.log(`Participants: ${participants.length}`);
    console.log(`Completed matches with scores: ${completedMatches.length}`);

    if (completedMatches.length < GENERATE_EVERY_COMPLETED_MATCHES) {
        console.log("Not enough completed matches for AI generation yet.");
        return;
    }

    const checkpointCounts = getCheckpointCounts(completedMatches.length);
    console.log(`Checkpoint counts to check: ${checkpointCounts.join(", ")}`);

    for (const checkpointCount of checkpointCounts) {
        const plannedHashes = getPlannedHashes(checkpointCount);
        const existingHashes = await getExistingHashes(plannedHashes);
        const missingSections = AI_SECTIONS.filter((section) => {
            return !existingHashes.has(buildSourceHash(section, checkpointCount));
        });

        if (missingSections.length === 0) {
            console.log(`Checkpoint ${checkpointCount}: already generated.`);
            continue;
        }

        console.log(`Checkpoint ${checkpointCount}: missing sections: ${missingSections.join(", ")}`);

        const checkpointMatches = completedMatches.slice(0, checkpointCount);
        const predictions = await getPredictionsForMatches(checkpointMatches.map((match) => match.id));
        const summary = buildCheckpointSummary({
            participants,
            completedMatches: checkpointMatches,
            previousMatches: completedMatches.slice(0, Math.max(0, checkpointCount - GENERATE_EVERY_COMPLETED_MATCHES)),
            predictions,
            checkpointCount
        });

        const aiPosts = await generatePostsWithAi(summary, missingSections);
        const rows = normalizeAiPosts(aiPosts, missingSections, summary);

        if (rows.length === 0) {
            console.log(`Checkpoint ${checkpointCount}: AI returned no valid posts.`);
            continue;
        }

        await insertPosts(rows);
        console.log(`Checkpoint ${checkpointCount}: inserted ${rows.length} AI post(s).`);
    }
}

function validateSections() {
    const invalidSections = AI_SECTIONS.filter((section) => !SECTION_CONFIG[section]);

    if (invalidSections.length > 0) {
        throw new Error(`Invalid AI_SECTIONS value(s): ${invalidSections.join(", ")}`);
    }

    if (!Number.isInteger(GENERATE_EVERY_COMPLETED_MATCHES) || GENERATE_EVERY_COMPLETED_MATCHES < 1) {
        throw new Error("AI_GENERATE_EVERY_COMPLETED_MATCHES must be a positive integer");
    }
}

function getCheckpointCounts(completedCount) {
    const counts = [];

    for (let count = GENERATE_EVERY_COMPLETED_MATCHES; count <= completedCount; count += GENERATE_EVERY_COMPLETED_MATCHES) {
        counts.push(count);
    }

    return counts.slice(-MAX_BACKFILL_CHECKPOINTS);
}

function getPlannedHashes(checkpointCount) {
    return AI_SECTIONS.map((section) => buildSourceHash(section, checkpointCount));
}

function buildSourceHash(sectionKey, checkpointCount) {
    return `${GENERATOR_VERSION}:${sectionKey}:completed-${checkpointCount}`;
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

async function getParticipants() {
    const participants = await supabaseFetch(
        "participants?select=id,name,active,sort_order&active=eq.true&order=sort_order.asc"
    );

    return participants || [];
}

async function getCompletedMatches() {
    const matches = await supabaseFetch(
        "matches" +
        "?select=id,team1,team2,kickoff_at,status,stage,winner_side,actual_team1_goals,actual_team2_goals" +
        "&status=eq.completed" +
        "&actual_team1_goals=not.is.null" +
        "&actual_team2_goals=not.is.null" +
        "&order=kickoff_at.asc"
    );

    return matches || [];
}

async function getPredictionsForMatches(matchIds) {
    if (matchIds.length === 0) return [];

    const filter = `match_id=in.(${matchIds.map(encodeURIComponent).join(",")})`;

    const predictions = await supabaseFetch(
        "predictions" +
        `?${filter}` +
        "&select=participant_id,match_id,predicted_team1_goals,predicted_team2_goals,points,updated_at"
    );

    return predictions || [];
}

async function getExistingHashes(sourceHashes) {
    if (sourceHashes.length === 0) return new Set();

    const filterValues = sourceHashes.map((hash) => `\"${hash.replaceAll("\"", "\\\"")}\"`).join(",");
    const rows = await supabaseFetch(
        `${POSTS_TABLE}?source_hash=in.(${encodeURIComponent(filterValues)})&select=source_hash`
    ).catch((error) => {
        if (String(error.message || "").includes(POSTS_TABLE)) {
            throw new Error("ai_posts table is missing. Run supabase-ai-posts.sql first.");
        }

        throw error;
    });

    return new Set((rows || []).map((row) => row.source_hash));
}

function buildCheckpointSummary({ participants, completedMatches, previousMatches, predictions, checkpointCount }) {
    const participantMap = new Map(participants.map((participant) => [participant.id, participant]));
    const predictionsByMatch = groupBy(predictions, "match_id");
    const currentLeaderboard = buildLeaderboard(participants, completedMatches, predictionsByMatch);
    const previousLeaderboard = buildLeaderboard(participants, previousMatches, predictionsByMatch);
    const latestMatches = completedMatches.slice(-GENERATE_EVERY_COMPLETED_MATCHES);
    const matchImpacts = latestMatches.map((match) => buildMatchImpact(match, predictionsByMatch.get(match.id) || [], participantMap, participants.length));
    const movement = buildLeaderboardMovement(currentLeaderboard, previousLeaderboard);
    const cumulative = buildCumulativeStats(currentLeaderboard, completedMatches, matchImpacts);

    return {
        language: "ar",
        checkpoint: {
            completedMatchCount: checkpointCount,
            generatedAfterEveryMatches: GENERATE_EVERY_COMPLETED_MATCHES,
            latestCompletedMatchIds: latestMatches.map((match) => match.id),
            latestCompletedMatches: latestMatches.map(formatMatchBrief)
        },
        sectionsRequested: AI_SECTIONS.map((section) => ({
            section_key: section,
            title_ar: SECTION_CONFIG[section].title,
            content_goal: SECTION_CONFIG[section].goal
        })),
        leaderboard: {
            topFive: currentLeaderboard.slice(0, 5),
            biggestPositiveMovers: movement.positive.slice(0, 3),
            biggestNegativeMovers: movement.negative.slice(0, 3),
            topChanged: movement.topChanged
        },
        matchImpacts,
        cumulative,
        strictDataRules: [
            "استخدم فقط الأسماء والنتائج والأرقام الموجودة في هذا الملخص.",
            "لا تخترع نتيجة، ترتيب، شارة، اسم مشارك، أو رقم غير موجود.",
            "إذا لم توجد معلومة كافية، اكتب بشكل عام بناءً على المتاح فقط."
        ]
    };
}

function groupBy(items, key) {
    return items.reduce((map, item) => {
        const value = item[key];
        if (!map.has(value)) map.set(value, []);
        map.get(value).push(item);
        return map;
    }, new Map());
}

function buildLeaderboard(participants, matches, predictionsByMatch) {
    const matchMap = new Map(matches.map((match) => [match.id, match]));
    const stats = new Map(participants.map((participant) => [participant.id, {
        participantId: participant.id,
        name: participant.name,
        points: 0,
        exactScores: 0,
        correctOutcomes: 0,
        zeroScores: 0,
        predictions: 0
    }]));

    for (const match of matches) {
        const predictions = predictionsByMatch.get(match.id) || [];

        for (const prediction of predictions) {
            const row = stats.get(prediction.participant_id);
            if (!row || !matchMap.has(prediction.match_id)) continue;

            const points = calculatePointsForMatch(prediction, match);
            row.points += points;
            row.predictions += 1;

            if (points === 50) row.exactScores += 1;
            else if (points === 10) row.correctOutcomes += 1;
            else row.zeroScores += 1;
        }
    }

    return Array.from(stats.values())
        .sort((a, b) => b.points - a.points || b.exactScores - a.exactScores || b.correctOutcomes - a.correctOutcomes || a.name.localeCompare(b.name, "ar"))
        .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildLeaderboardMovement(currentLeaderboard, previousLeaderboard) {
    const previousRankByParticipant = new Map(previousLeaderboard.map((row) => [row.participantId, row.rank]));

    const movement = currentLeaderboard.map((row) => {
        const previousRank = previousRankByParticipant.get(row.participantId) || row.rank;
        const change = previousRank - row.rank;

        return {
            name: row.name,
            previousRank,
            currentRank: row.rank,
            change
        };
    });

    const previousTop = previousLeaderboard[0]?.participantId || null;
    const currentTop = currentLeaderboard[0]?.participantId || null;

    return {
        topChanged: Boolean(previousTop && currentTop && previousTop !== currentTop),
        positive: movement.filter((row) => row.change > 0).sort((a, b) => b.change - a.change),
        negative: movement.filter((row) => row.change < 0).sort((a, b) => a.change - b.change)
    };
}

function buildMatchImpact(match, predictions, participantMap, participantCount) {
    const exactNames = [];
    const correctNames = [];
    const zeroNames = [];
    const predictionCounts = new Map();
    const outcomeCounts = { home: 0, away: 0, draw: 0 };

    for (const prediction of predictions) {
        const participantName = participantMap.get(prediction.participant_id)?.name || "مشارك";
        const points = calculatePointsForMatch(prediction, match);
        const scoreKey = `${prediction.predicted_team1_goals}-${prediction.predicted_team2_goals}`;
        const outcome = getOutcome(prediction.predicted_team1_goals, prediction.predicted_team2_goals);

        predictionCounts.set(scoreKey, (predictionCounts.get(scoreKey) || 0) + 1);
        outcomeCounts[outcome] += 1;

        if (points === 50) exactNames.push(participantName);
        else if (points === 10) correctNames.push(participantName);
        else zeroNames.push(participantName);
    }

    const submittedCount = predictions.length;
    const noPredictionCount = Math.max(0, participantCount - submittedCount);
    const mostCommonPrediction = Array.from(predictionCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
    const zeroRate = participantCount > 0 ? Math.round(((zeroNames.length + noPredictionCount) / participantCount) * 100) : 0;

    return {
        match: formatMatchBrief(match),
        submittedPredictions: submittedCount,
        missingPredictions: noPredictionCount,
        exactScoreNames: exactNames.slice(0, 8),
        correctOutcomeNames: correctNames.slice(0, 8),
        zeroPredictionCount: zeroNames.length,
        mostCommonPrediction: mostCommonPrediction ? { score: mostCommonPrediction[0], count: mostCommonPrediction[1] } : null,
        predictedOutcomeCounts: outcomeCounts,
        zeroOrMissingRatePercent: zeroRate
    };
}

function buildCumulativeStats(leaderboard, completedMatches, matchImpacts) {
    const exactKing = [...leaderboard].sort((a, b) => b.exactScores - a.exactScores || b.points - a.points)[0];
    const outcomeLeader = [...leaderboard].sort((a, b) => b.correctOutcomes - a.correctOutcomes || b.points - a.points)[0];
    const highestZeroRateMatch = [...matchImpacts].sort((a, b) => b.zeroOrMissingRatePercent - a.zeroOrMissingRatePercent)[0];

    return {
        completedMatches: completedMatches.length,
        leader: leaderboard[0] || null,
        exactScoreLeader: exactKing ? pickParticipantStats(exactKing) : null,
        correctOutcomeLeader: outcomeLeader ? pickParticipantStats(outcomeLeader) : null,
        latestShockMatch: highestZeroRateMatch || null
    };
}

function pickParticipantStats(row) {
    return {
        name: row.name,
        rank: row.rank,
        points: row.points,
        exactScores: row.exactScores,
        correctOutcomes: row.correctOutcomes
    };
}

function formatMatchBrief(match) {
    return {
        id: match.id,
        stage: match.stage || "GROUP_STAGE",
        kickoff_at: match.kickoff_at,
        team1: match.team1,
        team2: match.team2,
        score: `${match.actual_team1_goals}-${match.actual_team2_goals}`,
        winnerSide: match.winner_side || null
    };
}

function getOutcome(team1, team2) {
    if (team1 > team2) return "home";
    if (team2 > team1) return "away";
    return "draw";
}

function calculatePointsForMatch(prediction, match) {
    const predicted1 = Number(prediction.predicted_team1_goals);
    const predicted2 = Number(prediction.predicted_team2_goals);
    const actual1 = Number(match.actual_team1_goals);
    const actual2 = Number(match.actual_team2_goals);

    if (predicted1 === actual1 && predicted2 === actual2) return 50;

    return getOutcome(predicted1, predicted2) === getOutcome(actual1, actual2) ? 10 : 0;
}

async function generatePostsWithAi(summary, missingSections) {
    const systemPrompt = `أنت محرر محتوى عربي لمسابقة توقعات كأس العالم بين العائلة/الأصدقاء.
اكتب محتوى ممتع وخفيف مبني فقط على البيانات المقدمة.
النبرة المطلوبة: fun fun fun، لكن محترمة، ليست دراسة تحليلية، وليست كوميديا مبالغ فيها.
ممنوع اختراع أي أسماء أو نتائج أو أرقام.
ممنوع السخرية القاسية أو إحراج أي مشارك.
اكتب بالعربية فقط، وبأسلوب قصير مناسب لبطاقات داخل موقع.
أرجع JSON فقط بدون markdown.`;

    const userPrompt = `أنشئ منشورات للأقسام التالية فقط: ${missingSections.join(", ")}.

لكل قسم أنشئ منشوراً واحداً فقط بهذا الشكل:
{
  "posts": [
    {
      "section_key": "highlights|statistics|journey|awards",
      "icon": "رمز تعبيري واحد مناسب",
      "title_ar": "عنوان قصير",
      "subtitle_ar": "سطر قصير جداً",
      "body_ar": "فقرة قصيرة لا تتجاوز 280 حرفاً",
      "cards_json": [
        { "label_ar": "عنوان صغير", "value_ar": "قيمة قصيرة", "note_ar": "ملاحظة قصيرة" }
      ]
    }
  ]
}

قواعد القسم:
${missingSections.map((section) => `- ${section}: ${SECTION_CONFIG[section].goal}`).join("\n")}

البيانات المتاحة حتى هذه اللحظة فقط:
${JSON.stringify(summary, null, 2)}`;

    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: AI_MODEL,
            temperature: AI_TEMPERATURE,
            max_tokens: AI_MAX_TOKENS,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI API error ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("AI response did not include message content");
    }

    const parsed = parseJsonContent(content);

    if (!Array.isArray(parsed.posts)) {
        throw new Error("AI response JSON must include posts array");
    }

    return parsed.posts;
}

function parseJsonContent(content) {
    const cleaned = String(content)
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

    return JSON.parse(cleaned);
}

function normalizeAiPosts(aiPosts, missingSections, summary) {
    const allowedSections = new Set(missingSections);
    const latestMatchIds = summary.checkpoint.latestCompletedMatchIds;
    const sourceCompletedMatchCount = summary.checkpoint.completedMatchCount;

    return aiPosts
        .filter((post) => allowedSections.has(post.section_key))
        .map((post) => ({
            section_key: post.section_key,
            title_ar: limitText(post.title_ar, 90) || SECTION_CONFIG[post.section_key].title,
            subtitle_ar: limitText(post.subtitle_ar, 120),
            body_ar: limitText(post.body_ar, 520) || "تم توليد هذا الملخص من بيانات المسابقة الحالية.",
            icon: limitText(post.icon, 8) || "✨",
            cards_json: normalizeCards(post.cards_json),
            participant_id: null,
            source_completed_match_count: sourceCompletedMatchCount,
            source_match_ids: latestMatchIds,
            display_order: sourceCompletedMatchCount,
            visible: true,
            generated_by: AI_PROVIDER_NAME,
            model_name: AI_MODEL,
            source_hash: buildSourceHash(post.section_key, sourceCompletedMatchCount)
        }));
}

function normalizeCards(cards) {
    if (!Array.isArray(cards)) return [];

    return cards.slice(0, 4).map((card) => ({
        label_ar: limitText(card?.label_ar, 50),
        value_ar: limitText(card?.value_ar, 80),
        note_ar: limitText(card?.note_ar, 110)
    }));
}

function limitText(value, maxLength) {
    const text = String(value || "").trim();

    if (text.length <= maxLength) return text;

    return `${text.slice(0, maxLength - 1)}…`;
}

async function insertPosts(rows) {
    if (rows.length === 0) return;

    await supabaseFetch(POSTS_TABLE, {
        method: "POST",
        headers: {
            Prefer: "return=minimal"
        },
        body: JSON.stringify(rows)
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
