const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

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

function hasActualScore(match) {
    return Number.isInteger(match.actual_team1_goals) && Number.isInteger(match.actual_team2_goals);
}

function getOutcome(a, b) {
    if (a > b) return "team1";
    if (b > a) return "team2";
    return "draw";
}

function calculatePoints(prediction, match) {
    const predicted1 = Number(prediction.predicted_team1_goals);
    const predicted2 = Number(prediction.predicted_team2_goals);

    if (predicted1 === match.actual_team1_goals && predicted2 === match.actual_team2_goals) return 50;

    return getOutcome(predicted1, predicted2) === getOutcome(match.actual_team1_goals, match.actual_team2_goals) ? 10 : 0;
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

async function main() {
    const [participants, matches] = await Promise.all([
        supabaseFetch("participants?select=id,name,active,sort_order&order=sort_order.asc"),
        supabaseFetch("matches?select=id,team1,team2,kickoff_at,status,stage,score_duration,winner_side,actual_team1_goals,actual_team2_goals&order=kickoff_at.asc")
    ]);

    const allParticipants = participants || [];
    const activeParticipants = allParticipants.filter((participant) => participant.active !== false);
    const allMatches = matches || [];
    const completedMatches = allMatches.filter(hasActualScore);
    const completedIds = completedMatches.map((match) => match.id);
    const activeParticipantIds = new Set(activeParticipants.map((participant) => String(participant.id)));
    const rawPredictions = await loadPredictionsForMatches(completedIds);
    const predictions = rawPredictions.filter((prediction) => activeParticipantIds.has(String(prediction.participant_id)));
    const inactivePredictionCount = rawPredictions.length - predictions.length;
    const predictionsByMatch = groupBy(predictions, "match_id");
    const predictionByParticipant = groupBy(predictions, "participant_id");

    const possiblePredictions = activeParticipants.length * completedMatches.length;
    const totalPredictions = predictions.length;

    const stageSummary = Array.from(groupBy(completedMatches, "stage").entries()).map(([stage, stageMatches]) => {
        const stagePredictionCount = stageMatches.reduce((sum, match) => sum + (predictionsByMatch.get(match.id)?.length || 0), 0);
        const stagePossible = stageMatches.length * activeParticipants.length;
        let stagePoints = 0;
        let exactScores = 0;
        let correctPredictions = 0;

        for (const match of stageMatches) {
            for (const prediction of predictionsByMatch.get(match.id) || []) {
                const points = calculatePoints(prediction, match);
                stagePoints += points;
                if (points === 50) exactScores += 1;
                if (points > 0) correctPredictions += 1;
            }
        }

        return {
            stage: stage || "GROUP_STAGE",
            completed_matches: stageMatches.length,
            predictions: stagePredictionCount,
            coverage_percent: percent(stagePredictionCount, stagePossible),
            points: stagePoints,
            average_points_per_possible_prediction: stagePossible > 0 ? Number((stagePoints / stagePossible).toFixed(2)) : 0,
            exact_scores: exactScores,
            correct_predictions: correctPredictions
        };
    });

    const matchCoverage = completedMatches.map((match) => {
        const matchPredictions = predictionsByMatch.get(match.id) || [];
        let points = 0;
        let exact = 0;
        let correct = 0;

        for (const prediction of matchPredictions) {
            const earned = calculatePoints(prediction, match);
            points += earned;
            if (earned === 50) exact += 1;
            if (earned > 0) correct += 1;
        }

        return {
            match_id: match.id,
            match: `${match.team1} ضد ${match.team2}`,
            score: `${match.actual_team1_goals}-${match.actual_team2_goals}`,
            stage: match.stage || "GROUP_STAGE",
            predictions: matchPredictions.length,
            missing: Math.max(0, activeParticipants.length - matchPredictions.length),
            coverage_percent: percent(matchPredictions.length, activeParticipants.length),
            awarded_points: points,
            exact_scores: exact,
            correct_predictions: correct
        };
    });

    const participantCoverage = activeParticipants.map((participant) => {
        const rows = predictionByParticipant.get(participant.id) || [];
        let points = 0;
        let exact = 0;
        let correct = 0;

        for (const prediction of rows) {
            const match = completedMatches.find((item) => item.id === prediction.match_id);
            if (!match) continue;
            const earned = calculatePoints(prediction, match);
            points += earned;
            if (earned === 50) exact += 1;
            if (earned > 0) correct += 1;
        }

        return {
            name: participant.name,
            predictions: rows.length,
            missing: Math.max(0, completedMatches.length - rows.length),
            coverage_percent: percent(rows.length, completedMatches.length),
            points,
            exact_scores: exact,
            correct_predictions: correct
        };
    }).sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, "ar"));

    const inactiveParticipants = allParticipants.filter((participant) => participant.active === false);
    const zeroPredictionActiveParticipants = participantCoverage.filter((row) => row.predictions === 0);

    const warnings = [];

    if (zeroPredictionActiveParticipants.length) {
        warnings.push(`${zeroPredictionActiveParticipants.length} active participant(s) have zero predictions. Mark non-participants inactive before final recap.`);
    }

    const completedWithoutScore = allMatches.filter((match) => match.status === "completed" && !hasActualScore(match));
    if (completedWithoutScore.length) {
        warnings.push(`${completedWithoutScore.length} completed matches are missing actual scores.`);
    }

    const penaltyNonDraw = completedMatches.filter((match) => match.score_duration === "PENALTY_SHOOTOUT" && match.actual_team1_goals !== match.actual_team2_goals);
    if (penaltyNonDraw.length) {
        warnings.push(`${penaltyNonDraw.length} penalty shootout matches have non-draw prediction scores. Penalties should not be counted.`);
    }

    const lowCoverageMatches = matchCoverage.filter((row) => row.coverage_percent < 70);
    if (lowCoverageMatches.length) {
        warnings.push(`${lowCoverageMatches.length} completed matches have prediction coverage below 70%.`);
    }

    const summary = {
        generated_at: new Date().toISOString(),
        active_participants: activeParticipants.length,
        inactive_participants: inactiveParticipants.map((participant) => participant.name),
        zero_prediction_active_participants: zeroPredictionActiveParticipants.map((participant) => participant.name),
        suggested_inactive_sql_for_zero_prediction_participants: zeroPredictionActiveParticipants.length
            ? `update participants set active = false where name in (${zeroPredictionActiveParticipants.map((participant) => `'${String(participant.name).replaceAll("'", "''")}'`).join(", ")});`
            : null,
        total_matches: allMatches.length,
        completed_matches_with_scores: completedMatches.length,
        scheduled_matches: allMatches.filter((match) => match.status === "scheduled").length,
        live_matches: allMatches.filter((match) => match.status === "live").length,
        possible_predictions: possiblePredictions,
        submitted_predictions_for_completed_matches: totalPredictions,
        ignored_predictions_from_inactive_participants: inactivePredictionCount,
        coverage_percent: percent(totalPredictions, possiblePredictions),
        stages: stageSummary,
        warnings,
        lowest_coverage_matches: matchCoverage.sort((a, b) => a.coverage_percent - b.coverage_percent || a.match.localeCompare(b.match, "ar")).slice(0, 10),
        most_missing_participants: participantCoverage.slice(0, 10)
    };

    console.log("FINAL_RECAP_DATA_AUDIT");
    console.log(JSON.stringify(summary, null, 2));

    if (warnings.length) {
        console.log("\nWarnings found. Review them before final recap generation.");
        process.exitCode = 2;
    } else {
        console.log("\nData audit passed with no warnings.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
