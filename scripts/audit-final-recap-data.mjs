const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPECTED_WORLD_CUP_MATCH_COUNT = Number(process.env.EXPECTED_WORLD_CUP_MATCH_COUNT || 104);
const EVENT_NOTES_TABLE = "final_event_notes";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!Number.isInteger(EXPECTED_WORLD_CUP_MATCH_COUNT) || EXPECTED_WORLD_CUP_MATCH_COUNT < 1) {
    throw new Error("EXPECTED_WORLD_CUP_MATCH_COUNT must be a positive integer");
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

function countBy(values) {
    return values.reduce((acc, value) => {
        const key = value || "unspecified";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function getStageForEventNote(note, matchById) {
    if (note.stage) return note.stage;
    if (!note.match_id) return null;
    return matchById.get(String(note.match_id))?.stage || null;
}

function compactEventNote(note, matchById) {
    const match = note.match_id ? matchById.get(String(note.match_id)) : null;
    return {
        id: note.id,
        match: match ? `${match.team1} ضد ${match.team2}` : null,
        stage: note.stage || match?.stage || null,
        event_type: note.event_type || null,
        mood: note.mood || null,
        title_ar: note.title_ar || null,
        approved: note.approved === true,
        has_source: Boolean(note.source_url || note.source_name)
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
    const predicted1 = Number(prediction.predicted_team1_goals);
    const predicted2 = Number(prediction.predicted_team2_goals);

    if (isExactScorePrediction(prediction, match)) return getExactScorePointsForStage(match);

    return getOutcome(predicted1, predicted2) === getOutcome(match.actual_team1_goals, match.actual_team2_goals) ? 10 : 0;
}

function getExactScorePointsForStage(match = {}) {
    const stage = match.stage || "";
    if (stage === "FINAL") return 200;
    if (stage === "SEMI_FINALS" || stage === "THIRD_PLACE") return 100;
    return 50;
}

function isExactScorePrediction(prediction, match) {
    return Number(prediction.predicted_team1_goals) === Number(match.actual_team1_goals)
        && Number(prediction.predicted_team2_goals) === Number(match.actual_team2_goals);
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
    const [participants, matches, finalAiRows, eventNotes] = await Promise.all([
        supabaseFetch("participants?select=id,name,active,sort_order&order=sort_order.asc"),
        supabaseFetch("matches?select=id,team1,team2,kickoff_at,status,stage,score_duration,winner_side,actual_team1_goals,actual_team2_goals&order=kickoff_at.asc"),
        optionalSupabaseFetch("ai_posts?section_key=in.(final_highlights,final_profile)&select=section_key,visible,participant_id,title_ar,created_at"),
        loadFinalEventNotes()
    ]);

    const allParticipants = participants || [];
    const activeParticipants = allParticipants.filter((participant) => participant.active !== false);
    const allMatches = matches || [];
    const matchById = new Map(allMatches.map((match) => [String(match.id), match]));
    const allEventNotes = eventNotes || [];
    const approvedEventNotes = allEventNotes.filter((note) => note.approved === true);
    const draftEventNotes = allEventNotes.filter((note) => note.approved !== true);
    const approvedEventNotesMissingSource = approvedEventNotes.filter((note) => !note.source_url && !note.source_name);
    const eventNotesWithMissingMatch = allEventNotes.filter((note) => note.match_id && !matchById.has(String(note.match_id)));
    const completedMatches = allMatches.filter(isCompletedMatch);
    const storedRemainingMatches = allMatches.filter((match) => !isCompletedMatch(match));
    const scheduledMatches = allMatches.filter((match) => match.status === "scheduled");
    const liveMatches = allMatches.filter((match) => match.status === "live");
    const completedWithoutScore = allMatches.filter((match) => match.status === "completed" && !hasActualScore(match));
    const missingFixtureRows = Math.max(0, EXPECTED_WORLD_CUP_MATCH_COUNT - allMatches.length);
    const expectedRemainingMatches = Math.max(0, EXPECTED_WORLD_CUP_MATCH_COUNT - completedMatches.length);
    const finalDataReady = (
        allMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT &&
        completedMatches.length >= EXPECTED_WORLD_CUP_MATCH_COUNT &&
        scheduledMatches.length === 0 &&
        liveMatches.length === 0 &&
        completedWithoutScore.length === 0
    );
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
                if (isExactScorePrediction(prediction, match)) exactScores += 1;
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
            if (isExactScorePrediction(prediction, match)) exact += 1;
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
            if (isExactScorePrediction(prediction, match)) exact += 1;
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
    const finalHighlightRows = (finalAiRows || []).filter((row) => row.section_key === "final_highlights");
    const finalProfileRows = (finalAiRows || []).filter((row) => row.section_key === "final_profile");
    const visibleFinalHighlightRows = finalHighlightRows.filter((row) => row.visible === true);
    const visibleFinalProfileRows = finalProfileRows.filter((row) => row.visible === true);
    const approvedEventNotesByStage = countBy(approvedEventNotes.map((note) => getStageForEventNote(note, matchById) || "unspecified"));
    const approvedEventNotesByType = countBy(approvedEventNotes.map((note) => note.event_type || "unspecified"));
    const approvedEventNotesByMood = countBy(approvedEventNotes.map((note) => note.mood || "unspecified"));

    const warnings = [];

    if (zeroPredictionActiveParticipants.length) {
        warnings.push(`${zeroPredictionActiveParticipants.length} active participant(s) have zero predictions. Mark non-participants inactive before final recap.`);
    }

    if (allMatches.length < EXPECTED_WORLD_CUP_MATCH_COUNT) {
        warnings.push(`Database has ${allMatches.length} match rows, but expected ${EXPECTED_WORLD_CUP_MATCH_COUNT}. ${missingFixtureRows} fixture row(s) are not in the database yet.`);
    }

    if (completedMatches.length < EXPECTED_WORLD_CUP_MATCH_COUNT) {
        warnings.push(`${expectedRemainingMatches} match(es) are still not completed/scored out of ${EXPECTED_WORLD_CUP_MATCH_COUNT}.`);
    }

    if (completedWithoutScore.length) {
        warnings.push(`${completedWithoutScore.length} completed matches are missing actual scores.`);
    }

    const penaltyNonDraw = completedMatches.filter((match) => match.score_duration === "PENALTY_SHOOTOUT" && match.actual_team1_goals !== match.actual_team2_goals);
    if (penaltyNonDraw.length) {
        warnings.push(`${penaltyNonDraw.length} penalty shootout matches have non-draw prediction scores. Penalties should not be counted.`);
    }

    const lowCoverageMatches = matchCoverage.filter((row) => row.coverage_percent < 70);
    if (lowCoverageMatches.length) {
        warnings.push(`${lowCoverageMatches.length} completed matches have prediction coverage below 70%. This is admin-only and should not be used to shame participants.`);
    }

    if (eventNotesWithMissingMatch.length) {
        warnings.push(`${eventNotesWithMissingMatch.length} final_event_notes row(s) reference a missing match_id.`);
    }

    if (approvedEventNotesMissingSource.length) {
        warnings.push(`${approvedEventNotesMissingSource.length} approved final_event_notes row(s) have no source_name/source_url. They can still be used if manually verified, but review them.`);
    }

    if (finalDataReady && approvedEventNotes.length === 0) {
        warnings.push("Final data is ready, but there are no approved final_event_notes. Highlights will be contest-only and will not include real WC event moments.");
    }

    if (finalDataReady && visibleFinalHighlightRows.length < 30) {
        warnings.push(`Final data is ready, but only ${visibleFinalHighlightRows.length} visible final highlight post(s) exist. Generate/review/publish final_highlights before opening الأضواء.`);
    }

    if (finalDataReady && visibleFinalProfileRows.length < activeParticipants.length) {
        warnings.push(`Final data is ready, but visible final profile messages are ${visibleFinalProfileRows.length}/${activeParticipants.length}. Generate/review/publish final_profile messages before opening profile notes.`);
    }

    const summary = {
        generated_at: new Date().toISOString(),
        active_participants: activeParticipants.length,
        inactive_participants: inactiveParticipants.map((participant) => participant.name),
        zero_prediction_active_participants: zeroPredictionActiveParticipants.map((participant) => participant.name),
        suggested_inactive_sql_for_zero_prediction_participants: zeroPredictionActiveParticipants.length
            ? `update participants set active = false where name in (${zeroPredictionActiveParticipants.map((participant) => `'${String(participant.name).replaceAll("'", "''")}'`).join(", ")});`
            : null,
        expected_world_cup_matches: EXPECTED_WORLD_CUP_MATCH_COUNT,
        total_matches_in_db: allMatches.length,
        missing_fixture_rows: missingFixtureRows,
        completed_matches_with_scores: completedMatches.length,
        expected_remaining_matches: expectedRemainingMatches,
        stored_remaining_matches_in_db: storedRemainingMatches.length,
        scheduled_matches_in_db: scheduledMatches.length,
        live_matches_in_db: liveMatches.length,
        completed_without_score: completedWithoutScore.length,
        final_data_ready: finalDataReady,
        possible_predictions: possiblePredictions,
        submitted_predictions_for_completed_matches: totalPredictions,
        ignored_predictions_from_inactive_participants: inactivePredictionCount,
        coverage_percent: percent(totalPredictions, possiblePredictions),
        final_event_notes: {
            total: allEventNotes.length,
            approved: approvedEventNotes.length,
            draft_or_unapproved: draftEventNotes.length,
            approved_missing_source: approvedEventNotesMissingSource.length,
            with_missing_match_id: eventNotesWithMissingMatch.length,
            approved_by_stage: approvedEventNotesByStage,
            approved_by_type: approvedEventNotesByType,
            approved_by_mood: approvedEventNotesByMood,
            next_review_items: draftEventNotes.slice(0, 8).map((note) => compactEventNote(note, matchById)),
            missing_match_items: eventNotesWithMissingMatch.slice(0, 8).map((note) => compactEventNote(note, matchById))
        },
        final_ai_posts: {
            final_highlights_total: finalHighlightRows.length,
            final_highlights_visible: visibleFinalHighlightRows.length,
            final_profile_total: finalProfileRows.length,
            final_profile_visible: visibleFinalProfileRows.length
        },
        stages: stageSummary,
        warnings,
        lowest_coverage_matches: matchCoverage.sort((a, b) => a.coverage_percent - b.coverage_percent || a.match.localeCompare(b.match, "ar")).slice(0, 10),
        most_missing_participants: participantCoverage.slice(0, 10),
        note: missingFixtureRows > 0
            ? "Some future knockout fixtures may not exist in the DB yet if the external API has not created TBD fixtures. Run the full fixture sync after each knockout round, or add missing fixtures manually if needed."
            : "All expected fixture rows are present in the DB."
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
