import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const AI_BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const AI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL;
const AI_PROVIDER_NAME = process.env.AI_PROVIDER_NAME || "openai-compatible";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.64);
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 1800);
const AI_REPAIR_MAX_TOKENS = Number(process.env.AI_REPAIR_MAX_TOKENS || 1800);
const AI_FALLBACK_MODELS = (process.env.AI_FALLBACK_MODELS || process.env.AI_FALLBACK_MODEL || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
const AI_MODELS = [...new Set([AI_MODEL, ...AI_FALLBACK_MODELS].filter(Boolean))];
const AI_RETRY_ATTEMPTS = Number(process.env.AI_RETRY_ATTEMPTS || 4);
const AI_RETRY_BASE_DELAY_MS = Number(process.env.AI_RETRY_BASE_DELAY_MS || 2500);

const AI_SECTIONS = (process.env.AI_SECTIONS || "highlights,statistics,awards")
    .split(",")
    .map((section) => section.trim())
    .filter(Boolean);

const GENERATE_EVERY_COMPLETED_MATCHES = Number(process.env.AI_GENERATE_EVERY_COMPLETED_MATCHES || 2);
const MAX_BACKFILL_CHECKPOINTS = Number(process.env.AI_MAX_BACKFILL_CHECKPOINTS || 8);
const POSTS_TABLE = "ai_posts";
const GENERATOR_VERSION = "wc-ai-generator-v9-stats-awards-snapshot";

const SECTION_CONFIG = {
    highlights: {
        title: "الأضواء",
        icon: "✨",
        goal: "منشور قصير جداً عن آخر مباراتين، لكنه ليس ملخص نتائج. هو لقطة اجتماعية من المسابقة: 3 سوالف مختارة فقط، فيها أسماء قليلة ومعلومة لها طرافة أو قيمة.",
        style: "مثل كرت واتساب خفيف بين العائلة/الأصدقاء: سريع، قريب، فيه ابتسامة، ولا يشرح كل شيء. لا يوجد تحليل مطوّل ولا تعداد أسماء.",
        cardCount: 4,
        cardGuidance: [
            "البطاقة الأولى ثابتة للمباراتين ونتيجتهما فقط",
            "بعدها ثلاث سوالف فقط مختارة بالكود من أكثر الأشياء قابلية للقراءة والضحك",
            "كل سالفة لا تتجاوز سطرين: حقيقة قصيرة + تعليق خفيف",
            "لا تذكر أكثر من 3 أسماء في البطاقة الواحدة، ولا تحوّل المنشور إلى كشف حساب"
        ]
    },
    statistics: {
        title: "الإحصائيات",
        icon: "📊",
        goal: "لقطة حالية ممتعة من أرقام المسابقة. ليست تقريراً ولا جدولاً طويلاً؛ هي أرقام مختارة لأن وراءها سالفة: صدارة قريبة، بالملّي، نتيجة يحبها القروب، مرحلة كريمة، مباراة قاسية.",
        style: "أرقام لها شخصية. كل بطاقة فيها رقم واحد واضح وتعليق قصير ذكي. لا تشرح كثيراً ولا تكرر نفس المعلومة. اجعل القارئ يقول: أوه فعلاً.",
        cardCount: 6,
        cardGuidance: [
            "الحسبة العامة",
            "الكرسي الأمامي",
            "صياد بالملّي",
            "الرقم اللي القروب يحبه",
            "أكرم مرحلة بالتناسب",
            "أقسى مطب في التوقعات"
        ]
    },
    awards: {
        title: "الشارات",
        icon: "🏅",
        goal: "ألقاب ودية مؤقتة مبنية على البيانات الحالية. كل شارة تذهب لشخص محدد بسبب رقم واضح، وكأنها إنجاز داخل لعبة عائلية.",
        style: "خفيف، لطيف، وفيه ابتسامة. لا تجعل الشارات رسمية أو محرجة. الفائز والسبب محسوبان بالكود؛ أنت فقط تضيف عبارة قصيرة مناسبة للشارة.",
        cardCount: 6,
        cardGuidance: [
            "ملك بالملّي",
            "جامع العشرات",
            "ماسك الحسبة",
            "نَفَس طويل",
            "متخصص المرحلة",
            "ضد الموجة"
        ]
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
        const previousMatches = completedMatches.slice(0, Math.max(0, checkpointCount - GENERATE_EVERY_COMPLETED_MATCHES));
        const predictions = await getPredictionsForMatches(checkpointMatches.map((match) => match.id));
        const factsPack = buildFactsPack({
            participants,
            completedMatches: checkpointMatches,
            previousMatches,
            predictions,
            checkpointCount
        });

        let insertedCount = 0;

        for (const section of missingSections) {
            console.log(`Checkpoint ${checkpointCount}: generating section ${section} from calculated facts...`);

            try {
                const aiPost = await generateSectionPostWithAi(section, factsPack);
                const row = normalizeAiPostRow(aiPost, section, factsPack);

                if (!row) {
                    console.log(`Checkpoint ${checkpointCount}: AI returned no valid post for ${section}.`);
                    continue;
                }

                await insertPosts([row]);
                insertedCount += 1;
                console.log(`Checkpoint ${checkpointCount}: inserted ${section}.`);
            } catch (error) {
                console.error(`Checkpoint ${checkpointCount}: AI generation failed for ${section}. Skipping this section.`);
                console.error(error);
            }
        }

        console.log(`Checkpoint ${checkpointCount}: inserted ${insertedCount} AI post(s).`);
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

function buildFactsPack({ participants, completedMatches, previousMatches, predictions, checkpointCount }) {
    const participantMap = new Map(participants.map((participant) => [participant.id, participant]));
    const predictionsByMatch = groupBy(predictions, "match_id");
    const latestMatches = completedMatches.slice(-GENERATE_EVERY_COMPLETED_MATCHES);
    const latestMatchIds = latestMatches.map((match) => match.id);
    const latestPredictions = predictions.filter((prediction) => latestMatchIds.includes(prediction.match_id));

    const currentStats = buildParticipantStats(participants, completedMatches, predictionsByMatch);
    const previousStats = buildParticipantStats(participants, previousMatches, predictionsByMatch);
    const updateStats = buildParticipantStats(participants, latestMatches, groupBy(latestPredictions, "match_id"));

    const leaderboardByPoints = rankStats(currentStats);
    const previousLeaderboardByPoints = rankStats(previousStats);
    const updateLeaderboard = rankStats(updateStats).filter((row) => row.points > 0 || row.exactScores > 0 || row.correctOutcomes > 0);
    const pointMovement = buildPointMovement(leaderboardByPoints, previousLeaderboardByPoints);
    const latestMatchImpacts = latestMatches.map((match) => buildMatchImpact(match, predictionsByMatch.get(match.id) || [], participantMap, participants.length));
    const allMatchImpacts = completedMatches.map((match) => buildMatchImpact(match, predictionsByMatch.get(match.id) || [], participantMap, participants.length));
    const stageContestStats = buildStageContestStats(completedMatches, predictionsByMatch, participants.length);

    const contestFacts = buildContestFacts({
        participants,
        completedMatches,
        predictions,
        currentStats,
        leaderboardByPoints,
        latestMatchImpacts,
        allMatchImpacts,
        stageContestStats,
        updateLeaderboard
    });

    const updateFacts = buildUpdateFacts({
        latestMatches,
        latestMatchImpacts,
        updateLeaderboard,
        pointMovement,
        participants
    });

    return {
        generator: {
            version: GENERATOR_VERSION,
            rule: "Code calculates facts. AI only writes fun wording from the calculated facts."
        },
        language: "ar",
        checkpoint: {
            completedMatchCount: checkpointCount,
            generatedAfterEveryCompletedMatches: GENERATE_EVERY_COMPLETED_MATCHES,
            latestCompletedMatchIds: latestMatchIds,
            latestCompletedMatches: latestMatches.map(formatMatchBrief)
        },
        contestFacts,
        updateFacts,
        latestMatchImpacts,
        allMatchImpacts: summarizeAllMatchImpactsForAi(allMatchImpacts),
        leaderboard: {
            topFiveByPoints: leaderboardByPoints.slice(0, 5).map(pickPublicStats),
            pointMovement: pointMovement.slice(0, 6)
        },
        awardCandidates: buildAwardCandidates({
            contestFacts,
            currentStats,
            updateFacts,
            leaderboardByPoints,
            updateLeaderboard,
            latestMatchImpacts,
            allMatchImpacts
        }),
        strictDataRules: [
            "المحتوى يجب أن يكون عن مسابقة التوقعات والمشاركين والنقاط، وليس خبراً رياضياً عاماً عن المنتخبات.",
            "استخدم فقط الأسماء والنتائج والأرقام الموجودة في هذا الملخص.",
            "لا تخترع نتيجة، ترتيب، شارة، اسم مشارك، أو رقم غير موجود.",
            "إذا لم توجد معلومة كافية، استخدم صياغة عامة مبنية على المتاح فقط.",
            "لا تذكر تفاصيل تقنية أو SQL أو AI أو JSON للمستخدمين.",
            "النبرة: مرحة وخفيفة ومناسبة للعائلة/الأصدقاء، ليست دراسة وليست ستاند أب كوميدي."
        ]
    };
}

function buildParticipantStats(participants, matches, predictionsByMatch) {
    const stats = new Map(participants.map((participant) => [participant.id, {
        participantId: participant.id,
        name: participant.name,
        points: 0,
        exactScores: 0,
        correctOutcomes: 0,
        correctPredictions: 0,
        zeroScores: 0,
        predictions: 0,
        missingPredictions: 0,
        totalGoalError: 0,
        goalDifferenceError: 0,
        bestCorrectStreak: 0,
        currentCorrectStreak: 0,
        stageStats: {}
    }]));

    for (const match of matches) {
        const predictions = predictionsByMatch.get(match.id) || [];
        const predictionByParticipant = new Map(predictions.map((prediction) => [prediction.participant_id, prediction]));

        for (const participant of participants) {
            const row = stats.get(participant.id);
            const prediction = predictionByParticipant.get(participant.id);
            const stage = match.stage || "GROUP_STAGE";

            if (!row.stageStats[stage]) {
                row.stageStats[stage] = {
                    stage,
                    stageLabel: getStageLabel(stage),
                    completedMatches: 0,
                    predictions: 0,
                    points: 0,
                    exactScores: 0,
                    correctOutcomes: 0,
                    scoringPredictions: 0,
                    pointsPerCompletedMatch: 0
                };
            }

            row.stageStats[stage].completedMatches += 1;

            if (!prediction) {
                row.missingPredictions += 1;
                row.totalGoalError += 3;
                row.goalDifferenceError += 3;
                row.currentCorrectStreak = 0;
                continue;
            }

            const points = calculatePointsForMatch(prediction, match);
            const goalError = calculateGoalError(prediction, match);
            const diffError = calculateGoalDifferenceError(prediction, match);

            row.points += points;
            row.predictions += 1;
            row.totalGoalError += goalError;
            row.goalDifferenceError += diffError;
            row.stageStats[stage].predictions += 1;
            row.stageStats[stage].points += points;
            row.stageStats[stage].pointsPerCompletedMatch = Number((row.stageStats[stage].points / row.stageStats[stage].completedMatches).toFixed(2));

            if (points === 50) {
                row.exactScores += 1;
                row.correctPredictions += 1;
                row.currentCorrectStreak += 1;
                row.stageStats[stage].exactScores += 1;
                row.stageStats[stage].scoringPredictions += 1;
            } else if (points === 10) {
                row.correctOutcomes += 1;
                row.correctPredictions += 1;
                row.currentCorrectStreak += 1;
                row.stageStats[stage].correctOutcomes += 1;
                row.stageStats[stage].scoringPredictions += 1;
            } else {
                row.zeroScores += 1;
                row.currentCorrectStreak = 0;
            }

            row.bestCorrectStreak = Math.max(row.bestCorrectStreak, row.currentCorrectStreak);
        }
    }

    return Array.from(stats.values()).map((row) => {
        const stages = Object.values(row.stageStats || {}).map((stageRow) => ({
            ...stageRow,
            pointsPerCompletedMatch: stageRow.completedMatches > 0
                ? Number((stageRow.points / stageRow.completedMatches).toFixed(2))
                : 0
        }));

        const bestStageByAverage = stages
            .filter((stageRow) => stageRow.completedMatches > 0)
            .sort((a, b) => (
                b.pointsPerCompletedMatch - a.pointsPerCompletedMatch ||
                b.points - a.points ||
                a.stageLabel.localeCompare(b.stageLabel, "ar")
            ))[0] || null;

        return {
            ...row,
            stageStats: stages,
            bestStageByAverage: bestStageByAverage ? {
                stage: bestStageByAverage.stage,
                stageLabel: bestStageByAverage.stageLabel,
                points: bestStageByAverage.points,
                completedMatches: bestStageByAverage.completedMatches,
                pointsPerCompletedMatch: bestStageByAverage.pointsPerCompletedMatch
            } : null
        };
    });
}

function rankStats(stats) {
    return [...stats]
        .sort((a, b) => (
            b.points - a.points ||
            b.correctPredictions - a.correctPredictions ||
            a.totalGoalError - b.totalGoalError ||
            a.goalDifferenceError - b.goalDifferenceError ||
            b.bestCorrectStreak - a.bestCorrectStreak ||
            a.name.localeCompare(b.name, "ar")
        ))
        .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildPointMovement(currentLeaderboard, previousLeaderboard) {
    const previousByParticipant = new Map(previousLeaderboard.map((row) => [row.participantId, row]));

    return currentLeaderboard.map((row) => {
        const previous = previousByParticipant.get(row.participantId);
        const pointsGained = row.points - (previous?.points || 0);
        const rankChange = previous ? previous.rank - row.rank : 0;

        return {
            name: row.name,
            pointsGained,
            previousPoints: previous?.points || 0,
            currentPoints: row.points,
            previousRank: previous?.rank || row.rank,
            currentRank: row.rank,
            rankChange
        };
    }).sort((a, b) => b.pointsGained - a.pointsGained || b.rankChange - a.rankChange || a.name.localeCompare(b.name, "ar"));
}

function buildMatchImpact(match, predictions, participantMap, participantCount) {
    const actualOutcome = getOutcome(match.actual_team1_goals, match.actual_team2_goals);
    const actualScore = `${match.actual_team1_goals}-${match.actual_team2_goals}`;
    const exactNames = [];
    const correctNames = [];
    const zeroNames = [];
    const farErrorNames = [];
    const reversedNames = [];
    const oneGoalAwayNames = [];
    const closeButZeroNames = [];
    const pointsByParticipant = [];
    const predictionCounts = new Map();
    const outcomeCounts = { home: 0, away: 0, draw: 0 };
    const pointsDistribution = { exact50: 0, correct10: 0, zero0: 0, missing: 0 };

    for (const prediction of predictions) {
        const participantName = participantMap.get(prediction.participant_id)?.name || "مشارك";
        const predicted1 = Number(prediction.predicted_team1_goals);
        const predicted2 = Number(prediction.predicted_team2_goals);
        const points = calculatePointsForMatch(prediction, match);
        const goalError = calculateGoalError(prediction, match);
        const diffError = calculateGoalDifferenceError(prediction, match);
        const scoreKey = `${predicted1}-${predicted2}`;
        const predictedOutcome = getOutcome(predicted1, predicted2);

        predictionCounts.set(scoreKey, (predictionCounts.get(scoreKey) || 0) + 1);
        outcomeCounts[predictedOutcome] += 1;
        pointsByParticipant.push({
            participantId: prediction.participant_id,
            name: participantName,
            points,
            prediction: scoreKey,
            goalError,
            diffError,
            predictedOutcome
        });

        if (points === 50) {
            exactNames.push(participantName);
            pointsDistribution.exact50 += 1;
        } else if (points === 10) {
            correctNames.push(participantName);
            pointsDistribution.correct10 += 1;
        } else {
            zeroNames.push(participantName);
            pointsDistribution.zero0 += 1;
        }

        if (goalError >= 4) farErrorNames.push(participantName);
        if (points === 0 && goalError === 1) oneGoalAwayNames.push(participantName);
        if (points === 0 && goalError <= 2) closeButZeroNames.push(participantName);

        if (
            actualOutcome !== "draw" &&
            predictedOutcome !== "draw" &&
            predictedOutcome !== actualOutcome
        ) {
            reversedNames.push(participantName);
        }
    }

    const submittedCount = predictions.length;
    const missingPredictions = Math.max(0, participantCount - submittedCount);
    pointsDistribution.missing = missingPredictions;

    const scorePopularity = Array.from(predictionCounts.entries())
        .map(([score, count]) => ({ score, count, hit: score === actualScore }))
        .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score));
    const outcomePopularity = Object.entries(outcomeCounts)
        .map(([outcome, count]) => ({ outcome, count, label: getOutcomeLabel(outcome), hit: outcome === actualOutcome }))
        .sort((a, b) => b.count - a.count || a.outcome.localeCompare(b.outcome));

    const mostCommonPrediction = scorePopularity[0] || null;
    const mostCommonOutcome = outcomePopularity[0] || null;
    const actualOutcomePopularity = outcomePopularity.findIndex((row) => row.outcome === actualOutcome) + 1;
    const crowdFavoriteWasWrong = Boolean(mostCommonOutcome && mostCommonOutcome.outcome !== actualOutcome && mostCommonOutcome.count >= 3);
    const popularPredictionMissed = Boolean(mostCommonPrediction && !mostCommonPrediction.hit && mostCommonPrediction.count >= 2);
    const zeroOrMissingCount = zeroNames.length + missingPredictions;
    const zeroOrMissingRatePercent = participantCount > 0 ? Math.round((zeroOrMissingCount / participantCount) * 100) : 0;
    const awardedPoints = exactNames.length * 50 + correctNames.length * 10;
    const bestPointWinners = pointsByParticipant
        .filter((row) => row.points > 0)
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ar"));
    const contrarianWinners = pointsByParticipant
        .filter((row) => row.points > 0 && crowdFavoriteWasWrong && row.predictedOutcome === actualOutcome)
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ar"));
    const sharedWrongScores = scorePopularity
        .filter((row) => !row.hit && row.count >= 3)
        .slice(0, 3);

    return {
        match: formatMatchBrief(match),
        matchTitle: `${match.team1} ضد ${match.team2}`,
        actualScore,
        actualOutcome,
        actualOutcomeLabel: getOutcomeLabel(actualOutcome),
        submittedPredictions: submittedCount,
        missingPredictions,
        awardedPoints,
        participantsWithPointsCount: exactNames.length + correctNames.length,
        exactScoreCount: exactNames.length,
        exactScoreNames: exactNames.slice(0, 12),
        correctOutcomeCount: correctNames.length,
        correctOutcomeNames: correctNames.slice(0, 12),
        zeroPredictionCount: zeroNames.length,
        zeroNames: zeroNames.slice(0, 12),
        zeroOrMissingCount,
        zeroOrMissingRatePercent,
        shockLevel: getShockLevel(zeroOrMissingRatePercent),
        farErrorCount: farErrorNames.length,
        farErrorNames: farErrorNames.slice(0, 12),
        reversedOutcomeCount: reversedNames.length,
        reversedOutcomeNames: reversedNames.slice(0, 12),
        oneGoalAwayCount: oneGoalAwayNames.length,
        oneGoalAwayNames: oneGoalAwayNames.slice(0, 12),
        closeButZeroCount: closeButZeroNames.length,
        closeButZeroNames: closeButZeroNames.slice(0, 12),
        mostCommonPrediction: mostCommonPrediction ? { score: mostCommonPrediction.score, count: mostCommonPrediction.count, hit: mostCommonPrediction.hit } : null,
        mostCommonOutcome: mostCommonOutcome ? { outcome: mostCommonOutcome.outcome, count: mostCommonOutcome.count, label: mostCommonOutcome.label, hit: mostCommonOutcome.hit } : null,
        actualOutcomePopularity,
        crowdFavoriteWasWrong,
        popularPredictionMissed,
        sharedWrongScores,
        predictedOutcomeCounts: outcomeCounts,
        pointsDistribution,
        pointsByParticipant: pointsByParticipant.slice(0, 30),
        bestPointWinners: bestPointWinners.slice(0, 12),
        contrarianWinners: contrarianWinners.slice(0, 12)
    };
}
function buildContestFacts({ participants, completedMatches, predictions, currentStats, leaderboardByPoints, latestMatchImpacts, allMatchImpacts, stageContestStats, updateLeaderboard }) {
    const favoriteScore = getMostCommonScore(predictions);
    const exactLeader = [...currentStats].sort((a, b) => b.exactScores - a.exactScores || b.points - a.points || a.name.localeCompare(b.name, "ar"))[0];
    const correctOutcomeLeader = [...currentStats].sort((a, b) => b.correctOutcomes - a.correctOutcomes || b.points - a.points || a.name.localeCompare(b.name, "ar"))[0];
    const streakLeader = [...currentStats].sort((a, b) => b.bestCorrectStreak - a.bestCorrectStreak || b.points - a.points || a.name.localeCompare(b.name, "ar"))[0];
    const leader = leaderboardByPoints[0] || null;
    const second = leaderboardByPoints[1] || null;
    const latestShockMatch = [...latestMatchImpacts].sort((a, b) => b.zeroOrMissingRatePercent - a.zeroOrMissingRatePercent)[0] || null;
    const strongestMatchOverall = [...(allMatchImpacts || [])].sort((a, b) => b.awardedPoints - a.awardedPoints || a.matchTitle.localeCompare(b.matchTitle, "ar"))[0] || null;
    const cruelestMatchOverall = [...(allMatchImpacts || [])].sort((a, b) => b.zeroOrMissingRatePercent - a.zeroOrMissingRatePercent || a.matchTitle.localeCompare(b.matchTitle, "ar"))[0] || null;
    const crowdWrongMatch = [...(allMatchImpacts || [])]
        .filter((impact) => impact.crowdFavoriteWasWrong && impact.mostCommonOutcome)
        .sort((a, b) => (b.mostCommonOutcome?.count || 0) - (a.mostCommonOutcome?.count || 0) || b.zeroOrMissingRatePercent - a.zeroOrMissingRatePercent)[0] || null;
    const bestStageByAverage = [...(stageContestStats || [])]
        .filter((stage) => stage.completedMatches > 0)
        .sort((a, b) => b.averagePointsPerPossiblePrediction - a.averagePointsPerPossiblePrediction || b.points - a.points)[0] || null;
    const totalPointsAwarded = currentStats.reduce((sum, row) => sum + row.points, 0);
    const totalExactScores = currentStats.reduce((sum, row) => sum + row.exactScores, 0);
    const totalCorrectOutcomes = currentStats.reduce((sum, row) => sum + row.correctOutcomes, 0);
    const possiblePredictions = Math.max(0, participants.length * completedMatches.length);
    const predictionCoveragePercent = possiblePredictions > 0 ? Math.round((predictions.length / possiblePredictions) * 100) : 0;

    return {
        participantCount: participants.length,
        completedMatches: completedMatches.length,
        totalPredictionsSubmitted: predictions.length,
        possiblePredictions,
        predictionCoveragePercent,
        totalPointsAwarded,
        totalExactScores,
        totalCorrectOutcomes,
        pointsLeader: leader ? pickPublicStats(leader) : null,
        secondByPoints: second ? pickPublicStats(second) : null,
        topTwoPointGap: leader && second ? leader.points - second.points : null,
        exactScoreLeader: exactLeader ? pickPublicStats(exactLeader) : null,
        correctOutcomeLeader: correctOutcomeLeader ? pickPublicStats(correctOutcomeLeader) : null,
        streakLeader: streakLeader ? pickPublicStats(streakLeader) : null,
        favoritePredictedScore: favoriteScore,
        latestShockMatch,
        strongestMatchOverall: strongestMatchOverall ? pickMatchImpactSummary(strongestMatchOverall) : null,
        cruelestMatchOverall: cruelestMatchOverall ? pickMatchImpactSummary(cruelestMatchOverall) : null,
        crowdWrongMatch: crowdWrongMatch ? pickMatchImpactSummary(crowdWrongMatch) : null,
        bestStageByAverage,
        stageContestStats: (stageContestStats || []).slice(0, 8)
    };
}

function buildStageContestStats(completedMatches, predictionsByMatch, participantCount) {
    const stages = new Map();

    for (const match of completedMatches) {
        const stage = match.stage || "GROUP_STAGE";
        if (!stages.has(stage)) {
            stages.set(stage, {
                stage,
                stageLabel: getStageLabel(stage),
                completedMatches: 0,
                possiblePredictions: 0,
                submittedPredictions: 0,
                points: 0,
                exactScores: 0,
                correctOutcomes: 0,
                zeroScores: 0,
                missingPredictions: 0
            });
        }

        const row = stages.get(stage);
        const matchPredictions = predictionsByMatch.get(match.id) || [];
        row.completedMatches += 1;
        row.possiblePredictions += participantCount;
        row.submittedPredictions += matchPredictions.length;
        row.missingPredictions += Math.max(0, participantCount - matchPredictions.length);

        for (const prediction of matchPredictions) {
            const points = calculatePointsForMatch(prediction, match);
            row.points += points;
            if (points === 50) row.exactScores += 1;
            else if (points === 10) row.correctOutcomes += 1;
            else row.zeroScores += 1;
        }
    }

    return Array.from(stages.values())
        .map((row) => ({
            ...row,
            averagePointsPerPossiblePrediction: row.possiblePredictions > 0
                ? Number((row.points / row.possiblePredictions).toFixed(2))
                : 0,
            averagePointsPerCompletedMatch: row.completedMatches > 0
                ? Number((row.points / row.completedMatches).toFixed(1))
                : 0,
            coveragePercent: row.possiblePredictions > 0
                ? Math.round((row.submittedPredictions / row.possiblePredictions) * 100)
                : 0,
            exactRatePercent: row.possiblePredictions > 0
                ? Number(((row.exactScores / row.possiblePredictions) * 100).toFixed(1))
                : 0
        }))
        .sort((a, b) => b.averagePointsPerPossiblePrediction - a.averagePointsPerPossiblePrediction || b.points - a.points);
}

function pickMatchImpactSummary(impact) {
    return {
        matchTitle: impact.matchTitle,
        shortMatchTitle: shortMatchName(impact.matchTitle),
        actualScore: impact.actualScore,
        awardedPoints: impact.awardedPoints,
        participantsWithPointsCount: impact.participantsWithPointsCount,
        exactScoreCount: impact.exactScoreCount,
        correctOutcomeCount: impact.correctOutcomeCount,
        zeroOrMissingRatePercent: impact.zeroOrMissingRatePercent,
        zeroOrMissingCount: impact.zeroOrMissingCount,
        mostCommonPrediction: impact.mostCommonPrediction,
        mostCommonOutcome: impact.mostCommonOutcome,
        crowdFavoriteWasWrong: impact.crowdFavoriteWasWrong,
        contrarianWinners: (impact.contrarianWinners || []).slice(0, 3).map((row) => ({ name: row.name, points: row.points }))
    };
}

function summarizeAllMatchImpactsForAi(allMatchImpacts) {
    return {
        strongestMatches: [...(allMatchImpacts || [])]
            .sort((a, b) => b.awardedPoints - a.awardedPoints)
            .slice(0, 5)
            .map(pickMatchImpactSummary),
        cruelestMatches: [...(allMatchImpacts || [])]
            .sort((a, b) => b.zeroOrMissingRatePercent - a.zeroOrMissingRatePercent)
            .slice(0, 5)
            .map(pickMatchImpactSummary),
        crowdWrongMatches: [...(allMatchImpacts || [])]
            .filter((impact) => impact.crowdFavoriteWasWrong)
            .sort((a, b) => (b.mostCommonOutcome?.count || 0) - (a.mostCommonOutcome?.count || 0))
            .slice(0, 5)
            .map(pickMatchImpactSummary)
    };
}

function buildUpdateFacts({ latestMatches, latestMatchImpacts, updateLeaderboard, pointMovement, participants }) {
    const exactNames = unique(latestMatchImpacts.flatMap((impact) => impact.exactScoreNames));
    const correctNames = unique(latestMatchImpacts.flatMap((impact) => impact.correctOutcomeNames));
    const bestGainers = updateLeaderboard
        .filter((row) => row.points > 0)
        .slice(0, 5)
        .map(pickPublicStats);
    const totalExactScores = latestMatchImpacts.reduce((sum, impact) => sum + impact.exactScoreCount, 0);
    const totalCorrectOutcomes = latestMatchImpacts.reduce((sum, impact) => sum + impact.correctOutcomeCount, 0);
    const totalPointsAwarded = updateLeaderboard.reduce((sum, row) => sum + row.points, 0);
    const quietCount = Math.max(0, participants.length - updateLeaderboard.filter((row) => row.points > 0).length);
    const shockMatch = [...latestMatchImpacts].sort((a, b) => b.zeroOrMissingRatePercent - a.zeroOrMissingRatePercent)[0] || null;
    const strongestMatch = [...latestMatchImpacts].sort((a, b) => (b.exactScoreCount * 50 + b.correctOutcomeCount * 10) - (a.exactScoreCount * 50 + a.correctOutcomeCount * 10))[0] || null;

    return {
        latestMatches: latestMatches.map(formatMatchBrief),
        totalPointsAwardedInUpdate: totalPointsAwarded,
        totalExactScoresInUpdate: totalExactScores,
        totalCorrectOutcomesInUpdate: totalCorrectOutcomes,
        exactScoreHeroesInUpdate: exactNames.slice(0, 10),
        correctOutcomeNamesInUpdate: correctNames.slice(0, 10),
        bestGainersInUpdate: bestGainers,
        participantsWithoutPointsInUpdate: quietCount,
        biggestPointMovements: pointMovement.filter((row) => row.pointsGained > 0).slice(0, 5),
        shockMatch,
        strongestMatch
    };
}

function buildAwardCandidates({ contestFacts, currentStats, updateFacts, leaderboardByPoints, updateLeaderboard, latestMatchImpacts, allMatchImpacts }) {
    const shockSurvivors = latestMatchImpacts
        .filter((impact) => impact.zeroOrMissingRatePercent >= 55)
        .flatMap((impact) => [
            ...impact.exactScoreNames.map((name) => ({ name, match: impact.matchTitle, type: "exact" })),
            ...impact.correctOutcomeNames.map((name) => ({ name, match: impact.matchTitle, type: "correct" }))
        ]);
    const contrarianWinners = [...(allMatchImpacts || [])]
        .filter((impact) => impact.crowdFavoriteWasWrong && (impact.contrarianWinners || []).length > 0)
        .flatMap((impact) => impact.contrarianWinners.map((row) => ({
            name: row.name,
            points: row.points,
            match: impact.matchTitle,
            popularOutcome: impact.mostCommonOutcome?.label || "رأي الأغلبية"
        })))
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ar"));
    const stageSpecialist = [...(currentStats || [])]
        .map((row) => ({
            name: row.name,
            points: row.bestStageByAverage?.points || 0,
            stageLabel: row.bestStageByAverage?.stageLabel || "",
            pointsPerCompletedMatch: row.bestStageByAverage?.pointsPerCompletedMatch || 0,
            completedMatches: row.bestStageByAverage?.completedMatches || 0
        }))
        .filter((row) => row.completedMatches >= 2 && row.pointsPerCompletedMatch > 0)
        .sort((a, b) => b.pointsPerCompletedMatch - a.pointsPerCompletedMatch || b.points - a.points || a.name.localeCompare(b.name, "ar"))[0] || null;
    const biggestRankJump = [...(updateFacts.biggestPointMovements || [])]
        .filter((row) => row.rankChange > 0)
        .sort((a, b) => b.rankChange - a.rankChange || b.pointsGained - a.pointsGained)[0] || null;

    return {
        exactKing: contestFacts.exactScoreLeader,
        outcomeCollector: contestFacts.correctOutcomeLeader,
        currentLeader: contestFacts.pointsLeader,
        updateStar: updateLeaderboard[0] ? pickPublicStats(updateLeaderboard[0]) : null,
        streakLeader: contestFacts.streakLeader,
        shockSurvivor: shockSurvivors[0] || null,
        favoriteScore: contestFacts.favoritePredictedScore,
        closeRace: contestFacts.topTwoPointGap !== null && contestFacts.topTwoPointGap <= 30,
        topFiveByPoints: leaderboardByPoints.slice(0, 5).map(pickPublicStats),
        stageSpecialist,
        contrarianWinner: contrarianWinners[0] || null,
        biggestRankJump
    };
}

function pickPublicStats(row) {
    return {
        name: row.name,
        rank: row.rank,
        points: row.points,
        exactScores: row.exactScores,
        correctOutcomes: row.correctOutcomes,
        correctPredictions: row.correctPredictions,
        bestCorrectStreak: row.bestCorrectStreak,
        predictions: row.predictions,
        bestStageByAverage: row.bestStageByAverage || null
    };
}

function getMostCommonScore(predictions) {
    const counts = new Map();

    for (const prediction of predictions) {
        const score = `${prediction.predicted_team1_goals}-${prediction.predicted_team2_goals}`;
        counts.set(score, (counts.get(score) || 0) + 1);
    }

    const [score, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    return score ? { score, count } : null;
}

function formatMatchBrief(match) {
    return {
        id: match.id,
        stage: match.stage || "GROUP_STAGE",
        stageLabel: getStageLabel(match.stage),
        kickoff_at: match.kickoff_at,
        team1: match.team1,
        team2: match.team2,
        matchTitle: `${match.team1} ضد ${match.team2}`,
        score: `${match.actual_team1_goals}-${match.actual_team2_goals}`,
        winnerSide: match.winner_side || null
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

    return labels[stage] || "مرحلة البطولة";
}

function getShockLevel(rate) {
    if (rate >= 80) return "التوقعات راحت فيها";
    if (rate >= 65) return "اللخبطة عالية";
    if (rate >= 45) return "المباراة ما دلّعت أحد";
    if (rate >= 25) return "فيها مناوشات خفيفة";
    return "مباراة ماشية على المتوقع";
}

function groupBy(items, key) {
    return items.reduce((map, item) => {
        const value = item[key];
        if (!map.has(value)) map.set(value, []);
        map.get(value).push(item);
        return map;
    }, new Map());
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function getOutcome(team1, team2) {
    if (team1 > team2) return "home";
    if (team2 > team1) return "away";
    return "draw";
}

function getOutcomeLabel(outcome) {
    const labels = {
        home: "فوز الفريق الأول",
        away: "فوز الفريق الثاني",
        draw: "تعادل"
    };

    return labels[outcome] || "غير معروف";
}

function calculatePointsForMatch(prediction, match) {
    const predicted1 = Number(prediction.predicted_team1_goals);
    const predicted2 = Number(prediction.predicted_team2_goals);
    const actual1 = Number(match.actual_team1_goals);
    const actual2 = Number(match.actual_team2_goals);

    if (predicted1 === actual1 && predicted2 === actual2) return 50;

    return getOutcome(predicted1, predicted2) === getOutcome(actual1, actual2) ? 10 : 0;
}

function calculateGoalError(prediction, match) {
    return Math.abs(Number(prediction.predicted_team1_goals) - Number(match.actual_team1_goals)) +
        Math.abs(Number(prediction.predicted_team2_goals) - Number(match.actual_team2_goals));
}

function calculateGoalDifferenceError(prediction, match) {
    const predictedDiff = Number(prediction.predicted_team1_goals) - Number(prediction.predicted_team2_goals);
    const actualDiff = Number(match.actual_team1_goals) - Number(match.actual_team2_goals);
    return Math.abs(predictedDiff - actualDiff);
}

async function generateSectionPostWithAi(sectionKey, factsPack) {
    const config = SECTION_CONFIG[sectionKey];
    const sectionFacts = buildSectionFacts(sectionKey, factsPack);

    const systemPrompt = `أنت كاتب محتوى عربي داخل موقع خاص لمسابقة توقعات كأس العالم بين العائلة/الأصدقاء.
الموقع ليس موقع أخبار رياضية. لا تكتب كصحيفة، ولا كتعليق مباراة، ولا كعنوان رياضي كبير.
اكتب حسب القسم: في الأضواء هي سوالف آخر مباراتين، وفي الإحصائيات والشارات هي لقطة حالية من وضع المسابقة. الأسلوب دائماً خفيف، قريب من الناس، ومبني على نقاط المسابقة.
المرح المطلوب: ابتسامة وضحكة خفيفة من وضع التوقعات، لا كوميديا مبالغ فيها ولا سخرية جارحة من الأشخاص.
الموضوع دائماً: المشاركون، التوقعات، النقاط، بالملّي، العشرة نقاط، الحسبة، والشارات. في قسم الأضواء تحديداً لا تتكلم عن الصدارة أو الترتيب إلا إذا كانت موجودة نصاً في البطاقات المقفلة.
ممنوع اختراع أي اسم أو نتيجة أو رقم. استخدم الحقائق المقدمة فقط.
ممنوع إحراج مشارك أو وصفه بالخسارة بطريقة قاسية. المزاح يكون على التوقعات والجو العام، لا على الشخص.
ابتعد تماماً عن أسلوب الصحف والرياضة: لا تستخدم كلمات مثل زلزال، ملحمة، إثارة، مفاجآت بالجملة، ينجو، يشتعل، نار، صدمة نرويجية، الفراعنة، الأسود، الصقور، أو عناوين المنتخبات.
تجنب كلمة "تحديث" في العناوين والبطاقات قدر الإمكان. استخدم بدلاً منها: الأضواء، آخر مباراتين، السالفة، وش صار، الجو، الحسبة.
لا تبدأ كل منشور بعبارة "أهلاً يا جماعة". استخدمها نادراً فقط.
اكتب بالعربية فقط.
أرجع JSON صالح فقط بدون markdown.`;

    const userPrompt = `أنشئ محتوى واحداً لقسم: ${sectionKey} (${config.title}).

مهم جداً:
الحقائق محسوبة بالكود. أنت لا تحسب ولا تخترع. أنت تختار أفضل طريقة لعرضها بأسلوب ممتع داخل الموقع.
هذا ليس خبر رياضي عن المنتخبات. هذا محتوى عن مسابقة التوقعات الخاصة بالمشاركين.

هوية هذا القسم:
${config.goal}

أسلوب هذا القسم:
${config.style}

أفكار البطاقات المناسبة لهذا القسم:
${JSON.stringify(config.cardGuidance, null, 2)}

الشكل المطلوب بالضبط:
{
  "post": {
    "section_key": "${sectionKey}",
    "icon": "رمز تعبيري واحد مناسب",
    "title_ar": "عنوان قصير جداً، كاجوال، عن المسابقة لا عن المنتخبات ولا يبدو كخبر رياضي",
    "subtitle_ar": "سطر صغير بلغة خفيفة عن الجو العام، بدون كلمة تحديث إن أمكن",
    "body_ar": "${sectionKey === "highlights" ? "جملة واحدة فقط من 70 إلى 140 حرفاً. لا تكرر النتائج أو الأسماء أو أرقام البطاقات." : "فقرة قصيرة من 100 إلى 220 حرفاً. واضحة وخفيفة."}",
    "cards_json": [
      {
        "type": "كلمة انجليزية قصيرة بدون مسافات مثل update_mood",
        "icon": "رمز تعبيري واحد",
        "label_ar": "عنوان بطاقة قصير وممتع",
        "value_ar": "الحقيقة الأساسية: اسم، نقاط، نتيجة، عدد، أو حالة",
        "note_ar": "تعليق خفيف يشرح لماذا هذه البطاقة ممتعة"
      }
    ]
  }
}

قواعد العنوان:
- يجب أن يشعر المستخدم أنه داخل مسابقة توقعات عائلية/ودية، لا يقرأ صحيفة رياضية.
- لا تجعل العنوان عن منتخب أو مباراة فقط. اجعله عن النقاط أو التوقعات أو البالملّي أو الجو العام.
- تجنب كلمة "تحديث" لأنها رسمية. استخدم: الأضواء، السالفة، آخر مباراتين، النقاط، الحسبة.
- أمثلة جيدة للأضواء:
  - "الأضواء: النقاط داخلة بالقطّارة"
  - "آخر مباراتين: ناس جمعت وناس تقول خيرها بغيرها"
  - "الأضواء بعد ${factsPack.checkpoint.completedMatchCount}: البالملّي مأخذ إجازة"
- أمثلة جيدة للإحصائيات:
  - "الإحصائيات: الأرقام تقول سالفتها"
  - "الحسبة بدأت تتكلم"
  - "أرقام المسابقة بدون محاضرة"
- أمثلة جيدة للشارات:
  - "الشارات الحالية: كل واحد ولقبه"
  - "ألقاب مؤقتة… لكنها محسوبة"
  - "شارات المسابقة: المزح بالأرقام"
- أمثلة ممنوعة:
  - "زلزال نرويجي يهز البطولة"
  - "إثارة الدقائق الأخيرة"
  - "مفاجآت بالجملة في دور الـ16"
  - "صدمة نرويجية جماعية"
  - "عبدالرحمن ينجو بالصدارة"
  - "الصدارة تشتعل"

قواعد البطاقات:
- ${sectionKey === "highlights" ? "قسم الأضواء مختلف: لا تحاول تحليل أو اختيار البطاقات. البطاقات الأربع محسوبة ومقفلة في cardBriefs، واكتب title_ar وbody_ar فقط. إذا كتبت cards_json سيتم تجاهل تفاصيلها." : "اكتب من 5 إلى 6 بطاقات."}
- لا تجعل كل البطاقات بنفس الفكرة.
- لا تستخدم أسماء بطاقات رسمية مثل: "حركة النقاط" أو "لقطة التحديث" أو "نجم التحديث".
- استخدم أسماء بطاقات تشبه الموقع: "وش صار؟"، "مين طلع بشي؟"، "بالملّي وينك؟"، "اللي انتظروا الفرج"، "تعليق القروب"، "خلاصة السالفة".
- value_ar مقفول ومحسوب بالكود. اكتبه كما هو من cardBriefs ولا تغيّر الأسماء أو الأرقام أو النتائج.
- note_ar يجب أن يكون قصيراً جداً. في قسم الأضواء بالذات سيتم استخدام note_ar المحسوب من الكود حتى لا تتكرر أو تخطئ الأرقام.
- إذا لم توجد معلومة قوية، لا تخترع معلومة. خلك خفيفاً واكتب على الجو العام فقط.
- لا تستخدم markdown.

الحقائق المتاحة، وفيها cardBriefs مقفلة يجب احترامها:
${JSON.stringify(sectionFacts, null, 2)}`;

    const completion = await requestAiChatCompletion(
        {
            temperature: AI_TEMPERATURE,
            max_tokens: AI_MAX_TOKENS,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        },
        `section ${sectionKey}`
    );

    const data = completion.data;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("AI response did not include message content");
    }

    const parsedContent = await parseJsonContent(content);
    const post = parsedContent.post || parsedContent.posts?.[0] || parsedContent;

    if (!post || typeof post !== "object") {
        throw new Error("AI response JSON must include a post object");
    }

    post.__modelName = completion.modelName;

    return polishAiPost(post, sectionKey, factsPack, sectionFacts);
}

function buildSectionFacts(sectionKey, factsPack) {
    const base = {
        checkpoint: factsPack.checkpoint,
        cardBriefs: buildSectionCardBriefs(sectionKey, factsPack),
        strictDataRules: factsPack.strictDataRules
    };

    if (sectionKey === "highlights") {
        return {
            ...base,
            updateFacts: factsPack.updateFacts,
            latestMatchImpacts: factsPack.latestMatchImpacts
        };
    }

    if (sectionKey === "statistics") {
        return {
            ...base,
            contestFacts: factsPack.contestFacts,
            updateFacts: factsPack.updateFacts,
            latestMatchImpacts: factsPack.latestMatchImpacts,
            leaderboardTopFiveByPoints: factsPack.leaderboard.topFiveByPoints
        };
    }

    if (sectionKey === "awards") {
        return {
            ...base,
            awardCandidates: factsPack.awardCandidates,
            contestFacts: factsPack.contestFacts,
            updateFacts: factsPack.updateFacts,
            latestMatchImpacts: factsPack.latestMatchImpacts
        };
    }

    return { ...base, factsPack };
}

function buildSectionCardBriefs(sectionKey, factsPack) {
    const update = factsPack.updateFacts || {};
    const contest = factsPack.contestFacts || {};
    const awards = factsPack.awardCandidates || {};
    const topFive = factsPack.leaderboard?.topFiveByPoints || [];
    const bestGainer = update.bestGainersInUpdate?.[0] || update.biggestPointMovements?.[0] || null;
    const exactNames = update.exactScoreHeroesInUpdate || [];
    const shockMatch = update.shockMatch || contest.latestShockMatch || null;
    const leader = contest.pointsLeader || topFive[0] || null;
    const exactKing = contest.exactScoreLeader || awards.exactKing || null;
    const outcomeCollector = contest.correctOutcomeLeader || awards.outcomeCollector || null;
    const streakLeader = contest.streakLeader || awards.streakLeader || null;
    const favoriteScore = contest.favoritePredictedScore || awards.favoriteScore || null;

    if (sectionKey === "highlights") {
        return buildHighlightsBriefs(factsPack);
    }

    if (sectionKey === "statistics") {
        const totalPoints = contest.totalPointsAwarded || 0;
        const totalExact = contest.totalExactScores || 0;
        const strongestMatch = contest.strongestMatchOverall;
        const cruelestMatch = contest.cruelestMatchOverall || shockMatch;
        const bestStage = contest.bestStageByAverage;
        const leaderGapText = leader && contest.topTwoPointGap !== null
            ? `${leader.name} — ${leader.points} نقطة، الفارق ${contest.topTwoPointGap}`
            : (leader ? `${leader.name} — ${leader.points} نقطة` : "بانتظار الصدارة");

        return [
            makeBrief("contest_total", "🧮", "الحسبة العامة", `${totalPoints} نقطة • ${totalExact} بالملّي`, "رقمين يكفون: كم نقطة توزعت، وكم مرة دخل الباب السري."),
            makeBrief("points_leader", "👑", "الكرسي الأمامي", leaderGapText, "المركز الأول حلو، بس الفارق هو اللي يحدد هل الجلسة مريحة أو فيها قلق."),
            makeBrief("exact_king", "🎯", "صياد بالملّي", exactKing ? `${exactKing.name} — ${exactKing.exactScores} بالملّي` : "لا يوجد متصدر واضح", "الخمسين ما تجي كل يوم؛ اللي يكررها يستاهل كرت لحاله."),
            makeBrief("favorite_score", "🔢", "الرقم المفضل", favoriteScore ? `${favoriteScore.score} تكررت ${favoriteScore.count} مرة` : "بانتظار التوقعات", "كل قروب عنده رقم يحبه… حتى لو الملعب ما يبادله نفس الشعور."),
            makeBrief("best_stage_ratio", "⚖️", "أكرم مرحلة", bestStage ? `${bestStage.stageLabel} — ${bestStage.averagePointsPerPossiblePrediction} نقطة لكل مشارك/مباراة` : "بانتظار مراحل أكثر", "الحسبة هنا عادلة: نقسم على عدد المباريات والمشاركين، مو على كثرة مباريات المرحلة."),
            makeBrief("cruelest_match", "🧊", "أقسى مطب", cruelestMatch ? `${cruelestMatch.shortMatchTitle || shortMatchName(cruelestMatch.matchTitle)} — ${cruelestMatch.zeroOrMissingRatePercent}% بلا نقاط أو توقع` : "لا يوجد مطب واضح", "هذه مو للشماتة؛ بس بعض المباريات تدخل وتطفي اللمبات.")
        ];
    }

    if (sectionKey === "awards") {
        const stageSpecialist = awards.stageSpecialist;
        const contrarianWinner = awards.contrarianWinner;
        const rankJump = awards.biggestRankJump;
        const flexibleFifth = stageSpecialist
            ? makeBrief("stage_specialist", "⚖️", "متخصص المرحلة", stageSpecialist.name, `${stageSpecialist.stageLabel}: ${stageSpecialist.pointsPerCompletedMatch} نقطة لكل مباراة.`)
            : makeBrief("round_friend", "⭐", "طلع بشي", bestGainer ? `${bestGainer.name}` : "بانتظار الفائز", bestGainer ? `جمع ${bestGainer.points || bestGainer.pointsGained || 0} نقطة في آخر مباراتين.` : "آخر مباراتين ما طلعت نجماً واضحاً.");
        const flexibleSixth = contrarianWinner
            ? makeBrief("against_crowd", "🧭", "ضد الموجة", contrarianWinner.name, `طلع بنقاط في ${contrarianWinner.match} بينما الجو العام راح جهة ثانية.`)
            : (rankJump
                ? makeBrief("rank_jump", "🪜", "طلع من الزحمة", rankJump.name, `تقدم ${rankJump.rankChange} مركز وجمع ${rankJump.pointsGained} نقطة مؤخراً.`)
                : makeBrief("shock_survivor", "🛡️", "ناجي اللخبطة", awards.shockSurvivor ? `${awards.shockSurvivor.name}` : "بانتظار الناجي", awards.shockSurvivor ? `خرج بنقاط من مباراة ${awards.shockSurvivor.match}.` : "الشارة تظهر عندما المباراة تلخبط أغلب التوقعات."));

        return [
            makeBrief("exact_king", "🏅", "ملك بالملّي", exactKing ? `${exactKing.name}` : "بانتظار الفائز", exactKing ? `${exactKing.exactScores} نتائج كاملة حتى الآن.` : "الشارة تنتظر من يخطف 50 نقطة."),
            makeBrief("outcome_collector", "🧠", "جامع العشرات", outcomeCollector ? `${outcomeCollector.name}` : "بانتظار الفائز", outcomeCollector ? `${outcomeCollector.correctOutcomes} توقعات صحيحة بنتيجة مختلفة.` : "العشرة نقاط قد تكون طريقاً هادئاً للقمة."),
            makeBrief("race_leader", "👑", "ماسك الحسبة", leader ? `${leader.name}` : "بانتظار القائد", leader ? `${leader.points} نقطة في الصدارة.` : "الصدارة ستظهر مع تقدم المباريات."),
            makeBrief("streak", "🔥", "نَفَس طويل", streakLeader ? `${streakLeader.name}` : "بانتظار السلسلة", streakLeader ? `${streakLeader.bestCorrectStreak} توقعات صحيحة متتالية.` : "الثبات يحتاج أكثر من مباراة واحدة."),
            flexibleFifth,
            flexibleSixth
        ];
    }

    return [];
}

function buildHighlightsBriefs(factsPack) {
    const impacts = factsPack.latestMatchImpacts || [];
    const matchLine = impacts.length > 0
        ? impacts.map(formatHighlightMatchResult).join(" • ")
        : "آخر مباراتين مكتملتين";

    const cards = [
        makeBrief(
            "match_results",
            "⚽",
            "المباراتين",
            matchLine,
            "النتائج هنا للربط فقط؛ السالفة الحقيقية في التوقعات."
        )
    ];

    const candidates = buildHighlightMomentCandidates(factsPack);
    const selectedMoments = selectHighlightMoments(candidates, 3, factsPack.checkpoint?.completedMatchCount || 0);

    return [...cards, ...selectedMoments].slice(0, 4);
}

function buildHighlightMomentCandidates(factsPack) {
    const update = factsPack.updateFacts || {};
    const impacts = factsPack.latestMatchImpacts || [];
    const participantCount = factsPack.contestFacts?.participantCount || 0;
    const totalPoints = update.totalPointsAwardedInUpdate || 0;
    const totalExact = update.totalExactScoresInUpdate || 0;
    const quietCount = update.participantsWithoutPointsInUpdate || 0;
    const scoringRows = update.bestGainersInUpdate || [];
    const scoringCount = Math.max(0, participantCount - quietCount);
    const allExactNames = unique(update.exactScoreHeroesInUpdate || []);
    const bestGainers = unique(scoringRows.map((row) => row.name)).slice(0, 3);
    const candidates = [];

    const strongestMatch = update.strongestMatch || [...impacts].sort((a, b) => b.awardedPoints - a.awardedPoints)[0] || null;
    const cruelMatch = update.shockMatch || [...impacts].sort((a, b) => b.zeroOrMissingRatePercent - a.zeroOrMissingRatePercent)[0] || null;

    if (totalPoints === 0) {
        candidates.push(makeStoryBrief({
            type: "zero_party",
            icon: "🫥",
            label: "ولا أحد أخذ الحلاوة",
            value: "0 نقطة في آخر مباراتين",
            note: "مباراتين مرّت، والتوقعات قالت: نخليها للذكرى.",
            score: 120,
            group: "points"
        }));
    }

    if (totalExact > 0) {
        candidates.push(makeStoryBrief({
            type: "exact_hero",
            icon: "🎯",
            label: "بالملّي دخل بهدوء",
            value: summarizeNamesForCard(allExactNames, 2, `${totalExact} بالملّي`),
            note: "هذي مو عشرة ترضية؛ هذي خمسين كاملة وتستاهل نظرة جانبية.",
            score: 115,
            group: "exact"
        }));
    } else {
        candidates.push(makeStoryBrief({
            type: "exact_absent",
            icon: "🎯",
            label: "بالملّي مختفي",
            value: "ولا 50 في آخر مباراتين",
            note: "واضح أنه أخذ بريك قصير وترك الجماعة مع العشرات والصفر.",
            score: totalPoints <= 40 ? 88 : 58,
            group: "exact"
        }));
    }

    if (scoringCount > 0 && scoringCount <= 5) {
        candidates.push(makeStoryBrief({
            type: "small_group_won",
            icon: "🙋",
            label: "اللي طلعوا بشي",
            value: summarizeNamesForCard(bestGainers, 3, `${scoringCount} مشاركين جمعوا نقاط`),
            note: "مو لازم تكون وليمة؛ أحياناً العشرة تكفي تقول: أنا هنا.",
            score: 106,
            group: "people"
        }));
    }

    if (scoringCount >= 6) {
        candidates.push(makeStoryBrief({
            type: "many_scored",
            icon: "🙂",
            label: "فيه ناس مشت أمورهم",
            value: `${scoringCount} من ${participantCount} جمعوا نقاط`,
            note: "مو يوم تاريخي، بس ما كان يوم تعيس على الجميع.",
            score: 70,
            group: "people"
        }));
    }

    if (participantCount > 0 && quietCount / participantCount >= 0.55) {
        candidates.push(makeStoryBrief({
            type: "quiet_majority",
            icon: "😅",
            label: "جلسة انتظار جماعية",
            value: `${quietCount} من ${participantCount} بلا نقاط`,
            note: "هذا النوع من الأرقام يخلي كلمة خيرها بغيرها تطلع تلقائياً.",
            score: 102,
            group: "people"
        }));
    }

    for (const impact of impacts) {
        const shortName = shortMatchName(impact.matchTitle);
        const contrarianNames = unique((impact.contrarianWinners || []).map((row) => row.name)).slice(0, 3);

        if (contrarianNames.length > 0 && impact.crowdFavoriteWasWrong) {
            candidates.push(makeStoryBrief({
                type: `against_crowd_${slugifyType(impact.matchTitle)}`,
                icon: "🧭",
                label: "ضد الجو العام",
                value: `${summarizeNamesForCard(contrarianNames, 3, `${contrarianNames.length} طلعوا بنقاط`)} في ${shortName}`,
                note: "الجماعة راحت يمين، وهم أخذوا الطريق الثاني وطلع فيه نقاط.",
                score: 112,
                group: "crowd"
            }));
        }

        if (impact.popularPredictionMissed && impact.mostCommonPrediction) {
            candidates.push(makeStoryBrief({
                type: `popular_score_${slugifyType(impact.matchTitle)}`,
                icon: "🔢",
                label: "النتيجة الشعبية خانت",
                value: `${impact.mostCommonPrediction.score} تكررت ${impact.mostCommonPrediction.count} مرات`,
                note: `${shortName} ما احترمت النتيجة اللي اتفقوا عليها.`,
                score: 94,
                group: "crowd"
            }));
        }

        if (impact.crowdFavoriteWasWrong && impact.mostCommonOutcome) {
            candidates.push(makeStoryBrief({
                type: `crowd_wrong_${slugifyType(impact.matchTitle)}`,
                icon: "🫣",
                label: "إحساس جماعي بس بالعكس",
                value: `${impact.mostCommonOutcome.count} توقعوا ${impact.mostCommonOutcome.label}`,
                note: `${shortName} قالت: رأي الأغلبية مو شرط يمشي.`,
                score: 90,
                group: "crowd"
            }));
        }

        if (impact.oneGoalAwayCount >= 2) {
            candidates.push(makeStoryBrief({
                type: `one_goal_${slugifyType(impact.matchTitle)}`,
                icon: "🤏",
                label: "قريبين من الباب",
                value: summarizeNamesForCard(impact.oneGoalAwayNames, 3, `${impact.oneGoalAwayCount} كانوا قريبين`),
                note: "فرق هدف واحد بين آه يا ليت وولا نقطة.",
                score: 86,
                group: "near"
            }));
        }

        if (impact.reversedOutcomeCount >= 4) {
            candidates.push(makeStoryBrief({
                type: `reverse_${slugifyType(impact.matchTitle)}`,
                icon: "↩️",
                label: "الإحساس عكس الطريق",
                value: `${impact.reversedOutcomeCount} توقعات راحت للجهة الثانية`,
                note: `${shortName} كانت اختبار اتجاهات أكثر من اختبار توقعات.`,
                score: 76,
                group: "near"
            }));
        }

        if (impact.farErrorCount >= 3) {
            candidates.push(makeStoryBrief({
                type: `far_${slugifyType(impact.matchTitle)}`,
                icon: "🫠",
                label: "النتيجة راحت بعيد",
                value: `${impact.farErrorCount} توقعات بعيدة`,
                note: "في توقعات كانت تحتاج GPS عشان ترجع للنتيجة.",
                score: 66,
                group: "near"
            }));
        }
    }

    if (strongestMatch && strongestMatch.awardedPoints > 0) {
        candidates.push(makeStoryBrief({
            type: "best_match_points",
            icon: "🍬",
            label: "أكرم مباراة",
            value: `${shortMatchName(strongestMatch.matchTitle)} وزعت ${strongestMatch.awardedPoints} نقطة`,
            note: "ما كانت حفلة كبيرة، بس على الأقل طلّعت ناس مبتسمة.",
            score: strongestMatch.awardedPoints >= 80 ? 82 : 54,
            group: "points"
        }));
    }

    if (cruelMatch && cruelMatch.zeroOrMissingRatePercent >= 65) {
        candidates.push(makeStoryBrief({
            type: "cruel_match",
            icon: "🧊",
            label: "المباراة الباردة",
            value: `${shortMatchName(cruelMatch.matchTitle)} — ${cruelMatch.zeroOrMissingRatePercent}% بلا نقاط أو توقع`,
            note: "النتيجة ما قالت لا، قالت خلّوها بعدين.",
            score: 78,
            group: "points"
        }));
    }

    return candidates;
}

function makeStoryBrief({ type, icon, label, value, note, score = 0, group = "general" }) {
    return {
        ...makeBrief(type, icon, label, value, note),
        score,
        group
    };
}

function selectHighlightMoments(candidates, maxCount, checkpointCount) {
    const sorted = [...(candidates || [])]
        .filter((card) => card && card.fact_value)
        .sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.label_ar).localeCompare(String(b.label_ar), "ar"));
    const selected = [];
    const usedGroups = new Set();

    for (const candidate of sorted) {
        if (selected.length >= maxCount) break;
        if (candidate.group && usedGroups.has(candidate.group)) continue;
        selected.push(candidate);
        if (candidate.group) usedGroups.add(candidate.group);
    }

    for (const candidate of sorted) {
        if (selected.length >= maxCount) break;
        if (!selected.some((row) => row.type === candidate.type)) selected.push(candidate);
    }

    // Very small rotation between equally good cards so every post does not feel cloned.
    if (selected.length > 2 && checkpointCount % 4 === 0) {
        const [first, ...rest] = selected;
        return [first, ...rest.reverse()].slice(0, maxCount);
    }

    return selected.slice(0, maxCount);
}

function shortMatchName(matchTitle) {
    const clean = String(matchTitle || "").replace(/\s+/g, " ").trim();
    if (!clean) return "المباراة";

    const parts = clean.split(" ضد ").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]} × ${parts[1]}`;
    }

    return clean.length > 38 ? `${clean.slice(0, 35)}...` : clean;
}

function formatHighlightMatchResult(impact) {
    const match = impact?.match || {};
    const team1 = match.team1 || impact?.matchTitle?.split(" ضد ")?.[0] || "فريق";
    const team2 = match.team2 || impact?.matchTitle?.split(" ضد ")?.[1] || "فريق";
    const score = impact?.actualScore || match.score || "-";

    return `${team1} ${score} ${team2}`;
}

function summarizeNamesForCard(names, limit = 3, fallback = "") {
    const cleanNames = unique(names || []).slice(0, limit);

    if (cleanNames.length === 0) return fallback || "لا أحد";
    if (cleanNames.length === 1) return cleanNames[0];
    if (cleanNames.length === 2) return `${cleanNames[0]} و${cleanNames[1]}`;
    return `${cleanNames.slice(0, -1).join("، ")}، و${cleanNames.at(-1)}`;
}

function slugifyType(value) {
    return String(value || "item")
        .replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "_")
        .slice(0, 28) || "item";
}

function buildHighlightBodyFromCards(cards, factsPack) {
    const storyCards = (cards || []).filter((card) => card.type !== "match_results");
    const first = storyCards[0];
    const totalPoints = factsPack.updateFacts?.totalPointsAwardedInUpdate || 0;

    if (!first) return "سوالف سريعة من آخر مباراتين، بدون محاضرة وبدون كشف حساب.";

    if (first.type === "zero_party") return "آخر مباراتين قررت تمر مرور الكرام… على الملعب وعلى جدول النقاط بعد.";
    if (first.type === "exact_hero") return "المنشور هذا مو عن النتيجة نفسها، عن اللي لقوا الباب السري للنقاط.";
    if (first.type === "small_group_won") return "فيه كم اسم طلع من الزحمة بشي بسيط، والباقي يؤجل الفرحة للجاي.";
    if (first.type.startsWith("against_crowd")) return "السالفة الحلوة هنا مو في النتيجة، في اللي ما مشوا مع موجة القروب.";
    if (first.type.startsWith("popular_score")) return "الجماعة حبت رقم معيّن… والملعب تعامل معه كاقتراح غير ملزم.";
    if (first.type === "quiet_majority") return "آخر مباراتين كانوا من النوع اللي يخلي القروب يضحك ضحكة خفيفة ويكمل.";
    if (totalPoints <= 40) return "النقاط جاءت على استحياء، كأنها تقول: خذوا شوي والباقي بعدين.";

    return "ثلاث سوالف خفيفة من آخر مباراتين؛ المهم فيها التوقعات أكثر من المباراة نفسها.";
}

function buildPredictionMoodNote({ mostCruelMatch, mostCommonPrediction, reversedTotal, farErrorTotal }) {
    if (!mostCruelMatch) return "الجو كان هادي، لا كارثة ولا حفلة نقاط.";

    const details = [];

    if (mostCommonPrediction) {
        details.push(`أكثر نتيجة تكررت كانت ${mostCommonPrediction.score} (${mostCommonPrediction.count} مرات).`);
    }

    if (reversedTotal > 0) {
        details.push(`${reversedTotal} توقعات راحت بعكس الفائز.`);
    }

    if (farErrorTotal > 0) {
        details.push(`${farErrorTotal} توقعات كانت بعيدة بأربعة أهداف أو أكثر.`);
    }

    return details.length > 0
        ? details.join(" ")
        : "المباراة كانت من النوع اللي يخلي الواحد يراجع إحساسه بهدوء.";
}

function formatPointWinners(rows, limit = 3) {
    const winners = (rows || [])
        .filter((row) => Number(row.points || row.pointsGained || 0) > 0)
        .slice(0, limit)
        .map((row) => `${row.name} +${Number(row.points || row.pointsGained || 0)}`);

    return winners.length > 0 ? winners.join("، ") : "";
}

function formatNames(names, limit = 8) {
    const cleanNames = unique((names || []).filter(Boolean)).slice(0, limit);
    return cleanNames.length > 0 ? cleanNames.join("، ") : "لا أحد";
}

function makeBrief(type, icon, label_ar, fact_value, fact_note) {
    return {
        type,
        icon,
        label_ar,
        fact_value: fact_value || "بانتظار المزيد",
        fact_note: fact_note || ""
    };
}

function polishAiPost(post, sectionKey, factsPack, sectionFacts) {
    const count = factsPack.checkpoint.completedMatchCount;
    const config = SECTION_CONFIG[sectionKey];
    const fallbackTitle = buildFriendlyFallbackTitle(sectionKey, factsPack);
    const deterministicSubtitles = {
        highlights: "",
        statistics: "أرقام مختارة لأن وراءها سالفة",
        awards: "ألقاب ودية محسوبة من الأرقام"
    };

    const rawTitle = String(post.title_ar || "").trim();

    post.section_key = sectionKey;
    post.icon = post.icon || config.icon;
    post.title_ar = titleNeedsFallback(rawTitle) ? fallbackTitle : rawTitle;
    post.subtitle_ar = sectionKey === "highlights"
        ? ""
        : (post.subtitle_ar || deterministicSubtitles[sectionKey] || `بعد ${count} مباراة`);
    post.cards_json = finalizeAiCards(post.cards_json || post.cards, sectionFacts.cardBriefs || [], config.cardCount, sectionKey);
    post.body_ar = sectionKey === "highlights"
        ? buildHighlightBodyFromCards(post.cards_json, factsPack)
        : (post.body_ar || buildFallbackBody(sectionKey, factsPack));

    return post;
}

function titleNeedsFallback(title) {
    const cleanTitle = String(title || "").trim();

    if (cleanTitle.length < 8) return true;

    const newspaperWords = /زلزال|ملحمة|إثارة|الدقائق الأخيرة|مفاجآت بالجملة|الفراعنة|الأسود|الصقور|تاريخي|يصنعون التاريخ|ينجو|يشتعل|صدمة|جولة دور|دور الـ|النقاط شحيحة|الصدارة تشتعل/i;
    const tooFormalWords = /تحديث التوقعات|حركة النقاط|لقطة التحديث|نجم التحديث/i;
    const contestWords = /نقاط|توقع|بالملّي|ترتيب|صدارة|الأضواء|شارات|أرقام|مشاركين|المسابقة|الجماعة|السالفة|الحسبة|خيرها|القطّارة|ألقاب|لقبه|رقم/i;

    if (newspaperWords.test(cleanTitle)) return true;
    if (tooFormalWords.test(cleanTitle)) return true;

    // If the title is only about teams/stage and does not mention the contest mood, replace it.
    if (!contestWords.test(cleanTitle)) return true;

    return false;
}

function buildFriendlyFallbackTitle(sectionKey, factsPack) {
    const count = factsPack.checkpoint.completedMatchCount;
    const update = factsPack.updateFacts || {};
    const contest = factsPack.contestFacts || {};
    const totalPoints = update.totalPointsAwardedInUpdate || 0;
    const exactCount = update.totalExactScoresInUpdate || 0;
    const leader = contest.pointsLeader?.name;

    if (sectionKey === "highlights") {
        const highlightCards = buildHighlightsBriefs(factsPack).filter((card) => card.type !== "match_results");
        const firstType = highlightCards[0]?.type || "";

        if (firstType === "zero_party") return "الأضواء: ولا نقطة قالت حاضر";
        if (firstType === "exact_hero") return "الأضواء: أحد لقى الباب السري";
        if (firstType.startsWith("against_crowd")) return "الأضواء: مو كل القروب على حق";
        if (firstType.startsWith("popular_score")) return "الأضواء: الرقم الشعبي ما نفع";
        if (firstType === "small_group_won") return "الأضواء: كم اسم طلع من الزحمة";
        if (firstType === "quiet_majority") return "الأضواء: خيرها بالمباراة الجاية";
        if (exactCount > 0) return "الأضواء: البالملّي دخل بهدوء";
        if (totalPoints === 0) return "الأضواء: ولا نقطة قالت حاضر";
        if (totalPoints <= 40) return "الأضواء: النقاط جاية على استحياء";
        return "الأضواء: السالفة في التوقعات";
    }

    if (sectionKey === "statistics") {
        return "الإحصائيات: الأرقام تقول سالفتها";
    }


    if (sectionKey === "awards") {
        return "الشارات الحالية: كل واحد ولقبه";
    }

    return `الأضواء بعد ${count}`;
}

function finalizeAiCards(aiCards, cardBriefs, cardCount, sectionKey) {
    const maxCards = Math.max(1, cardCount || 6);
    const normalizedAiCards = Array.isArray(aiCards)
        ? aiCards.map(normalizeSingleCard).filter(isUsefulCard)
        : [];
    const aiByType = new Map(normalizedAiCards.map((card) => [card.type, card]));
    const aiByLabel = new Map(normalizedAiCards.map((card) => [card.label_ar, card]));

    const lockedCards = (cardBriefs || []).slice(0, maxCards).map((brief) => {
        const aiCard = aiByType.get(brief.type) || aiByLabel.get(brief.label_ar) || {};
        const aiLabel = sanitizeCardLabel(aiCard.label_ar || brief.label_ar);
        const aiNote = String(aiCard.note_ar || "").trim();
        const isHighlights = sectionKey === "highlights";

        return {
            type: brief.type,
            icon: limitText(brief.icon, 8),
            label_ar: limitText(isHighlights ? brief.label_ar : (aiLabel || brief.label_ar), 55),
            // Facts are locked by code. AI may not change names, scores, counts, or points.
            value_ar: limitText(brief.fact_value, isHighlights ? 105 : 140),
            // Highlights are story-engineered by code; AI can influence title/body only.
            note_ar: limitText(isHighlights ? brief.fact_note : (aiNote || brief.fact_note), isHighlights ? 90 : 160)
        };
    });

    if (lockedCards.length > 0) return lockedCards;

    return normalizedAiCards.slice(0, maxCards);
}

function normalizeSingleCard(card) {
    const rawLabel = limitText(card?.label_ar || card?.label || card?.title_ar || card?.title, 55);

    return {
        type: limitText(card?.type || "moment", 40).replace(/\s+/g, "_") || "moment",
        icon: limitText(card?.icon || card?.icon_ar || "✨", 8),
        label_ar: sanitizeCardLabel(rawLabel),
        value_ar: limitText(card?.value_ar || card?.value || card?.text_ar || card?.text, 120),
        note_ar: limitText(card?.note_ar || card?.note || card?.body_ar || card?.body, 180)
    };
}

function sanitizeCardLabel(label) {
    const cleanLabel = String(label || "").trim();
    const replacements = new Map([
        ["حركة النقاط", "الحسبة"],
        ["لقطة التحديث", "وش صار؟"],
        ["طلع بشي", "مين طلع بشي؟"],
        ["نجم الجولة", "مين طلع بشي؟"],
        ["مزاج الجولة", "مزاج السالفة"]
    ]);

    return replacements.get(cleanLabel) || cleanLabel;
}

function isUsefulCard(card) {
    return Boolean(card.label_ar || card.value_ar || card.note_ar);
}


function buildLockedHighlightsBody(factsPack) {
    const update = factsPack.updateFacts || {};
    const totalPoints = update.totalPointsAwardedInUpdate || 0;
    const totalExact = update.totalExactScoresInUpdate || 0;
    const quietCount = update.participantsWithoutPointsInUpdate || 0;
    const participantCount = factsPack.contestFacts?.participantCount || 0;

    if (totalPoints <= 0) {
        return "آخر مباراتين مرّت بهدوء على الملعب، وبصمت واضح على التوقعات.";
    }

    if (totalExact > 0) {
        return "منشور خفيف من آخر مباراتين: نقاط قليلة، وبالملّي يحاول يغيّر الجو.";
    }

    if (participantCount > 0 && quietCount / participantCount >= 0.55) {
        return "آخر مباراتين كانت من النوع اللي يخلي الواحد يقول: خيرها بغيرها.";
    }

    return "سوالف سريعة من آخر مباراتين: فيه ناس طلعت بشي، وفيه ناس تنتظر المباراة الجاية.";
}

function buildFallbackBody(sectionKey, factsPack) {
    const count = factsPack.checkpoint.completedMatchCount;
    const update = factsPack.updateFacts || {};
    const contest = factsPack.contestFacts || {};

    if (sectionKey === "highlights") {
        const points = update.totalPointsAwardedInUpdate || 0;
        return `بعد ${count} مباراة، آخر مباراتين وزعت ${points} نقطة. اللي طلع بعشرة يقول الحمد لله، والبالملّي ما زال أسرع طريق لقلب الحسبة.`;
    }

    if (sectionKey === "statistics") {
        return `بعد ${count} مباراة، اخترنا الأرقام اللي لها طعم: صدارة، بالملّي، رقم محبوب، ومرحلة كريمة بالحسبة العادلة.`;
    }


    if (sectionKey === "awards") {
        return "شارات خفيفة من الأرقام الحالية؛ ألقاب ودية تتغير مع كل ما تتحرك الحسبة.";
    }

    return `محتوى ذكي بعد ${count} مباراة مكتملة.`;
}

async function parseJsonContent(content) {
    const cleaned = cleanJsonCandidate(content);

    try {
        return parseJsonCandidate(cleaned);
    } catch (firstError) {
        console.warn("AI response was not valid JSON on the first parse. Trying automatic JSON repair...");
        console.warn(`First JSON parse error: ${firstError.message}`);

        const repaired = await repairJsonWithAi(cleaned, firstError.message);

        try {
            return parseJsonCandidate(repaired);
        } catch (secondError) {
            console.error("AI JSON repair failed. Raw AI response preview:");
            console.error(cleaned.slice(0, 1200));
            console.error("Repaired AI response preview:");
            console.error(String(repaired).slice(0, 1200));
            throw secondError;
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAiStatus(status) {
    return status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function getAiRetryDelayMs(attemptIndex, modelIndex) {
    const baseDelay = Math.max(250, AI_RETRY_BASE_DELAY_MS);
    const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
    const jitter = Math.floor(Math.random() * 650);
    return exponentialDelay + jitter + modelIndex * 750;
}

async function requestAiChatCompletion(payload, purpose = "AI generation") {
    let lastError = null;

    for (const [modelIndex, modelName] of AI_MODELS.entries()) {
        for (let attemptIndex = 0; attemptIndex < AI_RETRY_ATTEMPTS; attemptIndex += 1) {
            const attemptNumber = attemptIndex + 1;

            try {
                const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${AI_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        ...payload,
                        model: modelName
                    })
                });

                if (response.ok) {
                    return {
                        data: await response.json(),
                        modelName
                    };
                }

                const text = await response.text();
                const message = `AI API error ${response.status} using ${modelName}: ${text}`;
                lastError = new Error(message);

                if (!isRetryableAiStatus(response.status)) {
                    throw lastError;
                }

                if (attemptIndex < AI_RETRY_ATTEMPTS - 1) {
                    const delayMs = getAiRetryDelayMs(attemptIndex, modelIndex);
                    console.warn(`${purpose}: ${response.status} from ${modelName}. Retrying in ${Math.round(delayMs / 1000)}s (${attemptNumber}/${AI_RETRY_ATTEMPTS})...`);
                    await sleep(delayMs);
                    continue;
                }

                console.warn(`${purpose}: ${modelName} stayed unavailable after ${AI_RETRY_ATTEMPTS} attempt(s).`);
            } catch (error) {
                lastError = error;

                if (String(error?.message || "").startsWith("AI API error") && !/AI API error (408|409|429|500|502|503|504)/.test(error.message)) {
                    throw error;
                }

                if (attemptIndex < AI_RETRY_ATTEMPTS - 1) {
                    const delayMs = getAiRetryDelayMs(attemptIndex, modelIndex);
                    console.warn(`${purpose}: request failed with ${modelName}. Retrying in ${Math.round(delayMs / 1000)}s (${attemptNumber}/${AI_RETRY_ATTEMPTS})...`);
                    await sleep(delayMs);
                    continue;
                }
            }
        }

        if (modelIndex < AI_MODELS.length - 1) {
            console.warn(`${purpose}: switching from ${modelName} to fallback model ${AI_MODELS[modelIndex + 1]}.`);
        }
    }

    throw lastError || new Error(`${purpose}: AI request failed`);
}

function cleanJsonCandidate(content) {
    let cleaned = String(content || "")
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .replace(/^\uFEFF/, "")
        .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    return cleaned;
}

function parseJsonCandidate(content) {
    const normalized = cleanJsonCandidate(content)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, "$1");

    return JSON.parse(normalized);
}

async function repairJsonWithAi(invalidJsonText, parseErrorMessage) {
    const completion = await requestAiChatCompletion(
        {
            temperature: 0,
            max_tokens: AI_REPAIR_MAX_TOKENS,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "You repair malformed JSON. Return valid JSON only. Do not add markdown. Do not change meanings. The final object must contain one post object."
                },
                {
                    role: "user",
                    content: `Repair this malformed JSON so JSON.parse can parse it. Error: ${parseErrorMessage}\n\n${invalidJsonText}`
                }
            ]
        },
        "JSON repair"
    );

    const data = completion.data;
    const repaired = data.choices?.[0]?.message?.content;

    if (!repaired) {
        throw new Error("AI JSON repair did not include message content");
    }

    return repaired;
}

function normalizeAiPostRow(post, sectionKey, factsPack) {
    if (!post || typeof post !== "object") return null;

    const latestMatchIds = factsPack.checkpoint.latestCompletedMatchIds;
    const sourceCompletedMatchCount = factsPack.checkpoint.completedMatchCount;

    return {
        section_key: sectionKey,
        title_ar: limitText(post.title_ar, 90) || `${SECTION_CONFIG[sectionKey].title} بعد ${sourceCompletedMatchCount} مباراة`,
        subtitle_ar: limitText(post.subtitle_ar, 130),
        body_ar: limitText(post.body_ar, 620) || "تم توليد هذا الملخص من حقائق المسابقة الحالية.",
        icon: limitText(post.icon, 8) || SECTION_CONFIG[sectionKey].icon,
        cards_json: normalizeCards(post.cards_json || post.cards, SECTION_CONFIG[sectionKey].cardCount),
        participant_id: null,
        source_completed_match_count: sourceCompletedMatchCount,
        source_match_ids: latestMatchIds,
        display_order: sourceCompletedMatchCount,
        visible: true,
        generated_by: AI_PROVIDER_NAME,
        model_name: post.__modelName || AI_MODEL,
        source_hash: buildSourceHash(sectionKey, sourceCompletedMatchCount)
    };
}

function normalizeCards(cards, cardCount) {
    if (!Array.isArray(cards)) return [];

    return cards.slice(0, Math.max(1, cardCount || 6)).map((card) => ({
        type: limitText(card?.type, 40),
        icon: limitText(card?.icon || card?.icon_ar, 8) || "•",
        label_ar: limitText(card?.label_ar || card?.label || card?.title_ar || card?.title, 55),
        value_ar: limitText(card?.value_ar || card?.value || card?.text_ar || card?.text, 120),
        note_ar: limitText(card?.note_ar || card?.note || card?.body_ar || card?.body, 160)
    })).filter((card) => card.label_ar || card.value_ar || card.note_ar);
}

function limitText(value, maxLength) {
    const text = String(value || "").trim();

    if (!text) return "";
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
