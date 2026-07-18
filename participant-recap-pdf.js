/* ==============================================================
   V39.4.0 FINAL - Personal Journey Book PDF
   A participant-specific editorial recap with collective analysis.
   PDF libraries are loaded only after the participant clicks.
   ============================================================== */

const PARTICIPANT_RECAP_STAGE_ORDER = [
    "GROUP_STAGE",
    "ROUND_OF_32",
    "ROUND_OF_16",
    "QUARTER_FINALS",
    "SEMI_FINALS",
    "THIRD_PLACE",
    "FINAL"
];

const PARTICIPANT_RECAP_STAGE_COLORS = {
    GROUP_STAGE: "#60a5fa",
    ROUND_OF_32: "#a78bfa",
    ROUND_OF_16: "#34d6bd",
    QUARTER_FINALS: "#facc15",
    SEMI_FINALS: "#fb7185",
    THIRD_PLACE: "#caa45d",
    FINAL: "#f1d89a"
};

function renderParticipantRecapDownloadCard(participant, finalRow, recap, options = {}) {
    const completedMatches = Number(recap?.seasonStats?.completedMatches || 0);
    const predictionCount = Number(finalRow?.predictions || 0);
    const rank = finalRow?.finalRank || "-";
    const buttonId = options.buttonId || "participantRecapPdfDownloadBtn";
    const cardClass = options.cardClass ? ` ${options.cardClass}` : "";
    const eyebrow = options.eyebrow || "نسختك التذكارية";
    const title = options.title || "حمّل كتاب رحلتك في المسابقة";
    const description = options.description || "كتاب شخصي مصمم من بيانات رحلتك: تحليلك أمام بقية المشاركين، حركة مركزك، أسلوب توقعاتك، جميع اختياراتك بالأعلام والنتائج، وأجمل ما بقي من البطولة.";

    return `
        <section class="profile-recap-download-card${cardClass}">
            <div class="profile-recap-download-glow" aria-hidden="true"></div>
            <div class="profile-recap-download-icon" aria-hidden="true">
                <span>PDF</span>
                <strong>🏆</strong>
            </div>
            <div class="profile-recap-download-copy">
                <p class="eyebrow">${escapeHtml(eyebrow)}</p>
                <h4>${escapeHtml(title)}</h4>
                <p>${escapeHtml(description)}</p>
                <div class="profile-recap-download-meta">
                    <span>المركز ${escapeHtml(rank)}</span>
                    <span>${predictionCount} توقع</span>
                    <span>${completedMatches} مباراة</span>
                    <span>تحليل شخصي وجماعي</span>
                </div>
            </div>
            <button
                id="${escapeHtml(buttonId)}"
                class="profile-recap-download-btn"
                type="button"
                onclick="downloadParticipantRecapPdf('${escapeHtml(buttonId)}')"
            >
                <span aria-hidden="true">⬇</span>
                تحميل كتاب الرحلة PDF
            </button>
        </section>
    `;
}

async function downloadParticipantRecapPdf(buttonId = "participantRecapPdfDownloadBtn") {
    if (participantRecapPdfGenerationInProgress || !currentParticipant) return;

    participantRecapPdfGenerationInProgress = true;
    const button = document.getElementById(buttonId);
    const originalButtonHtml = button?.innerHTML || "تحميل كتاب الرحلة PDF";
    let documentElement = null;

    if (button) {
        button.disabled = true;
        button.innerHTML = `<span class="profile-recap-download-spinner" aria-hidden="true"></span> جاري تجهيز رحلتك...`;
    }

    showParticipantRecapPdfProgress("نجمع بيانات رحلتك...", 4);

    try {
        const [recap, profilePosts, highlightPosts] = await Promise.all([
            loadCurrentParticipantRecapModel(),
            loadAiPosts(FINAL_AI_PROFILE_SECTION, {
                participantId: currentParticipant.id,
                limit: 1,
                useCache: false
            }).catch(() => []),
            loadAiPosts(FINAL_AI_HIGHLIGHTS_SECTION, {
                limit: 40,
                useCache: false
            }).catch(() => [])
        ]);

        if (!isFinalRecapAvailable(recap)) {
            throw new Error("كتاب الرحلة يفتح بعد اكتمال البطولة.");
        }

        const finalRow = (recap.finalRows || []).find((row) => (
            String(row.id) === String(currentParticipant.id) || row.name === currentParticipant.name
        ));

        if (!finalRow) {
            throw new Error("تعذر العثور على بيانات المشارك في الترتيب النهائي.");
        }

        updateParticipantRecapPdfProgress("نحلّل رحلتك مقارنة بالجميع...", 11);

        const model = buildParticipantRecapPdfModel(
            currentParticipant,
            finalRow,
            recap,
            profilePosts?.[0] || null,
            highlightPosts || []
        );

        documentElement = renderParticipantRecapPdfDocument(model);
        document.body.appendChild(documentElement);

        await loadParticipantRecapPdfLibraries();
        await document.fonts?.ready;
        await renderParticipantRecapQrCodes(documentElement, model.publicUrl);
        await waitForParticipantRecapImages(documentElement);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        validateParticipantRecapLayout(documentElement);

        updateParticipantRecapPdfProgress("نصمم صفحات كتاب الرحلة...", 19);

        const safeName = sanitizeParticipantRecapFileName(currentParticipant.name || "participant");
        const fileName = `كتاب-رحلة-${safeName}-كأس-العالم-2026.pdf`;
        await exportParticipantRecapPdf(documentElement, fileName);

        updateParticipantRecapPdfProgress("اكتمل كتاب رحلتك ✓", 100, true);
    } catch (error) {
        console.error("Participant recap PDF generation failed:", error);
        showParticipantRecapPdfError(error?.message || "تعذر إنشاء ملف PDF حالياً. حاول مرة أخرى.");
    } finally {
        documentElement?.remove();
        participantRecapPdfGenerationInProgress = false;
        if (button) {
            button.disabled = false;
            button.innerHTML = originalButtonHtml;
        }
    }
}

function buildParticipantRecapPdfModel(participant, finalRow, recap, profilePost = null, highlightPosts = []) {
    const visual = getParticipantVisual(participant.name);
    const badges = buildCalculatedParticipantBadges(finalRow);
    const predictionRows = buildParticipantRecapPredictionRows(participant, recap);
    const stageSummaries = buildParticipantRecapStageSummaries(predictionRows, recap);
    const comparison = buildParticipantRecapComparison(finalRow, recap.finalRows || [], recap.seasonStats || {});
    const collective = buildParticipantRecapCollectiveAnalysis(finalRow, recap, predictionRows);
    const dna = buildParticipantRecapPredictionDna(finalRow, recap.finalRows || [], predictionRows, comparison);
    const teamAnalysis = buildParticipantRecapTeamAnalysis(predictionRows);
    const moments = buildParticipantRecapMoments(finalRow, predictionRows, recap);
    const highlights = buildParticipantRecapHighlights(highlightPosts, recap);
    const profileStory = profilePost?.body_ar || buildLocalProfileClosingText(
        participant,
        {
            totalPoints: finalRow.points,
            totalPredictions: finalRow.predictions,
            exactScores: finalRow.exactScores,
            bestStage: stageSummaries[0]?.label || "رحلة كاملة"
        },
        finalRow,
        badges
    );

    return {
        participant,
        finalRow,
        recap,
        visual,
        badges,
        predictionRows,
        stageSummaries,
        comparison,
        collective,
        dna,
        teamAnalysis,
        moments,
        highlights,
        profileStory,
        generatedAt: new Date()
    };
}

function buildParticipantRecapPredictionRows(participant, recap) {
    const participantPredictions = new Map(
        (recap.predictions || [])
            .filter((prediction) => String(prediction.participant_id) === String(participant.id))
            .map((prediction) => [String(prediction.match_id), prediction])
    );
    const factsByMatch = new Map(
        (recap.matchFacts || []).map((fact) => [String(fact.match?.id), fact])
    );

    return (recap.completedMatches || []).map((match, index) => {
        const prediction = participantPredictions.get(String(match.id)) || null;
        const p1 = prediction ? Number(prediction.predicted_team1_goals) : null;
        const p2 = prediction ? Number(prediction.predicted_team2_goals) : null;
        const actual1 = Number(match.actual_team1_goals);
        const actual2 = Number(match.actual_team2_goals);
        const points = prediction ? calculatePoints(p1, p2, actual1, actual2, match) : 0;
        const exact = Boolean(prediction && isExactScorePrediction(prediction, match));
        const correct = points > 0;
        const fact = factsByMatch.get(String(match.id)) || null;
        const predictionOutcome = prediction ? getOutcome(p1, p2) : null;
        const actualOutcome = getOutcome(actual1, actual2);
        const majorityOutcome = fact?.majorityOutcome?.outcome || null;
        const againstCrowd = Boolean(
            prediction &&
            correct &&
            majorityOutcome &&
            majorityOutcome !== actualOutcome &&
            predictionOutcome === actualOutcome
        );
        const crowdAligned = Boolean(prediction && majorityOutcome && predictionOutcome === majorityOutcome);
        const scoreError = prediction
            ? Math.abs(p1 - actual1) + Math.abs(p2 - actual2)
            : null;

        return {
            index: index + 1,
            match,
            prediction,
            submitted: Boolean(prediction),
            predictedScore: prediction ? `${p1}-${p2}` : "—",
            actualScore: `${actual1}-${actual2}`,
            points,
            exact,
            correct,
            againstCrowd,
            crowdAligned,
            majorityOutcome,
            predictionOutcome,
            actualOutcome,
            scoreError,
            stage: match.stage || "GROUP_STAGE",
            stageLabel: getFinalRecapStageLabel(match.stage),
            stageColor: PARTICIPANT_RECAP_STAGE_COLORS[match.stage] || "#7c8aa5",
            dateLabel: formatParticipantRecapDate(match.kickoff_at),
            statusLabel: !prediction ? "لم يُسجل" : exact ? "بالملّي" : correct ? "اتجاه صحيح" : "بدون نقاط",
            statusClass: !prediction ? "missing" : exact ? "exact" : correct ? "correct" : "zero"
        };
    });
}

function buildParticipantRecapStageSummaries(rows = [], recap = {}) {
    const stages = new Map();
    const fieldStageMap = new Map((recap.stageFacts || []).map((row) => [row.stage, row]));

    rows.forEach((row) => {
        if (!stages.has(row.stage)) {
            stages.set(row.stage, {
                stage: row.stage,
                label: row.stageLabel,
                matches: 0,
                predictions: 0,
                points: 0,
                correct: 0,
                exact: 0
            });
        }
        const stage = stages.get(row.stage);
        stage.matches += 1;
        if (row.submitted) stage.predictions += 1;
        stage.points += row.points;
        if (row.correct) stage.correct += 1;
        if (row.exact) stage.exact += 1;
    });

    return [...stages.values()].map((stage) => {
        const field = fieldStageMap.get(stage.stage) || {};
        return {
            ...stage,
            accuracy: stage.predictions > 0 ? Number(((stage.correct / stage.predictions) * 100).toFixed(1)) : 0,
            coverage: stage.matches > 0 ? Number(((stage.predictions / stage.matches) * 100).toFixed(1)) : 0,
            pointsPerMatch: stage.matches > 0 ? Number((stage.points / stage.matches).toFixed(1)) : 0,
            pointsPerPrediction: stage.predictions > 0 ? Number((stage.points / stage.predictions).toFixed(1)) : 0,
            fieldAveragePoints: Number(field.averagePoints || 0),
            fieldAccuracy: Number(field.accuracyPercent || 0),
            color: PARTICIPANT_RECAP_STAGE_COLORS[stage.stage] || "#7c8aa5"
        };
    }).sort((a, b) => (
        PARTICIPANT_RECAP_STAGE_ORDER.indexOf(a.stage) - PARTICIPANT_RECAP_STAGE_ORDER.indexOf(b.stage)
    ));
}

function buildParticipantRecapComparison(row, finalRows = [], seasonStats = {}) {
    const count = finalRows.length || 1;
    const averagePoints = participantRecapAverage(finalRows.map((item) => item.points));
    const averageAccuracy = participantRecapAverage(finalRows.map((item) => item.accuracyPercent));
    const averageExact = participantRecapAverage(finalRows.map((item) => item.exactScores));
    const averageStreak = participantRecapAverage(finalRows.map((item) => item.bestCorrectStreak));
    const topPercent = Math.max(1, Math.ceil((Number(row.finalRank || count) / count) * 100));
    const closestRival = [...finalRows]
        .filter((item) => String(item.id) !== String(row.id))
        .map((item) => ({ ...item, gap: Math.abs(Number(item.points || 0) - Number(row.points || 0)) }))
        .sort((a, b) => a.gap - b.gap || a.finalRank - b.finalRank)[0] || null;
    const personAbove = finalRows.find((item) => item.finalRank === Number(row.finalRank) - 1) || null;
    const personBelow = finalRows.find((item) => item.finalRank === Number(row.finalRank) + 1) || null;

    return {
        averagePoints,
        averageAccuracy,
        averageExact,
        averageStreak,
        topPercent,
        pointsDifference: Number((Number(row.points || 0) - averagePoints).toFixed(1)),
        medianDifference: Number((Number(row.points || 0) - Number(seasonStats.medianPoints || 0)).toFixed(1)),
        accuracyDifference: Number((Number(row.accuracyPercent || 0) - averageAccuracy).toFixed(1)),
        exactDifference: Number((Number(row.exactScores || 0) - averageExact).toFixed(1)),
        closestRival,
        personAbove,
        personBelow,
        gapToLeader: Math.max(0, Number(finalRows[0]?.points || 0) - Number(row.points || 0)),
        gapToPodium: Number(row.finalRank || count) <= 3
            ? 0
            : Math.max(0, Number(finalRows[2]?.points || 0) - Number(row.points || 0)),
        percentiles: {
            points: participantRecapMetricPercentile(row.points, finalRows.map((item) => item.points)),
            accuracy: participantRecapMetricPercentile(row.accuracyPercent, finalRows.map((item) => item.accuracyPercent)),
            exact: participantRecapMetricPercentile(row.exactScores, finalRows.map((item) => item.exactScores)),
            streak: participantRecapMetricPercentile(row.bestCorrectStreak, finalRows.map((item) => item.bestCorrectStreak)),
            bravery: participantRecapMetricPercentile(row.againstCrowdPoints, finalRows.map((item) => item.againstCrowdPoints)),
            participation: participantRecapMetricPercentile(row.predictions, finalRows.map((item) => item.predictions))
        }
    };
}

function buildParticipantRecapCollectiveAnalysis(row, recap, predictionRows) {
    const finalRows = recap.finalRows || [];
    const pointsValues = finalRows.map((item) => Number(item.points || 0));
    const sortedPoints = [...pointsValues].sort((a, b) => a - b);
    const mean = participantRecapAverage(sortedPoints);
    const variance = participantRecapAverage(sortedPoints.map((value) => Math.pow(value - mean, 2)));
    const standardDeviation = Number(Math.sqrt(variance).toFixed(1));
    const scoreBands = buildParticipantRecapScoreBands(finalRows, 5);
    const statusCounts = {
        exact: predictionRows.filter((item) => item.exact).length,
        correct: predictionRows.filter((item) => item.correct && !item.exact).length,
        zero: predictionRows.filter((item) => item.submitted && !item.correct).length,
        missing: predictionRows.filter((item) => !item.submitted).length
    };
    const collectiveExactLeader = [...finalRows].sort((a, b) => b.exactScores - a.exactScores || b.points - a.points)[0] || null;
    const collectiveAccuracyLeader = [...finalRows].sort((a, b) => b.accuracyPercent - a.accuracyPercent || b.points - a.points)[0] || null;
    const collectiveStreakLeader = [...finalRows].sort((a, b) => b.bestCorrectStreak - a.bestCorrectStreak || b.points - a.points)[0] || null;
    const collectiveBraveryLeader = [...finalRows].sort((a, b) => b.againstCrowdPoints - a.againstCrowdPoints || b.points - a.points)[0] || null;
    const mostExactMatch = [...(recap.matchFacts || [])].sort((a, b) => b.exactCount - a.exactCount || b.awardedPoints - a.awardedPoints)[0] || null;
    const biggestCrowdUpset = [...(recap.matchFacts || [])]
        .filter((fact) => fact.crowdWasWrong)
        .sort((a, b) => a.correctCount - b.correctCount || b.zeroOrMissingRate - a.zeroOrMissingRate)[0] || null;

    return {
        mean,
        median: Number(recap.seasonStats?.medianPoints || 0),
        min: sortedPoints[0] || 0,
        max: sortedPoints[sortedPoints.length - 1] || 0,
        standardDeviation,
        scoreBands,
        statusCounts,
        leaders: {
            exact: collectiveExactLeader,
            accuracy: collectiveAccuracyLeader,
            streak: collectiveStreakLeader,
            bravery: collectiveBraveryLeader
        },
        mostExactMatch,
        biggestCrowdUpset,
        participantPosition: finalRows.findIndex((item) => String(item.id) === String(row.id)) + 1
    };
}

function buildParticipantRecapPredictionDna(row, finalRows, predictionRows, comparison) {
    const submitted = predictionRows.filter((item) => item.submitted);
    const withMajority = submitted.filter((item) => item.majorityOutcome);
    const crowdFollowRate = withMajority.length
        ? Number(((withMajority.filter((item) => item.crowdAligned).length / withMajority.length) * 100).toFixed(1))
        : 0;
    const drawRate = submitted.length
        ? Number(((submitted.filter((item) => item.predictionOutcome === "draw").length / submitted.length) * 100).toFixed(1))
        : 0;
    const fieldDrawRate = participantRecapAverage(finalRows.map((item) => (
        item.predictions ? (Number(item.drawPredictions || 0) / Number(item.predictions)) * 100 : 0
    )));
    const fieldGoals = participantRecapAverage(finalRows.map((item) => item.averagePredictedGoals));
    const participationRate = predictionRows.length
        ? Number(((submitted.length / predictionRows.length) * 100).toFixed(1))
        : 0;
    const averageError = submitted.length
        ? Number((submitted.reduce((sum, item) => sum + Number(item.scoreError || 0), 0) / submitted.length).toFixed(2))
        : 0;

    return {
        metrics: [
            { label: "الدقة", value: comparison.percentiles.accuracy },
            { label: "بالملّي", value: comparison.percentiles.exact },
            { label: "الجرأة", value: comparison.percentiles.bravery },
            { label: "الثبات", value: comparison.percentiles.streak },
            { label: "الحضور", value: Math.round(participationRate) }
        ],
        crowdFollowRate,
        drawRate,
        fieldDrawRate,
        averagePredictedGoals: Number(row.averagePredictedGoals || 0),
        fieldAveragePredictedGoals: fieldGoals,
        participationRate,
        averageError,
        uniquePredictionRate: submitted.length
            ? Number(((Number(row.uniquePredictions || 0) / submitted.length) * 100).toFixed(1))
            : 0,
        scoringRate: submitted.length
            ? Number(((Number(row.correctPredictions || 0) / submitted.length) * 100).toFixed(1))
            : 0
    };
}

function buildParticipantRecapTeamAnalysis(predictionRows) {
    const teams = new Map();

    predictionRows.forEach((row) => {
        [row.match.team1, row.match.team2].forEach((team) => {
            if (!teams.has(team)) {
                teams.set(team, {
                    name: team,
                    matches: 0,
                    submitted: 0,
                    points: 0,
                    exact: 0,
                    correct: 0,
                    misses: 0,
                    scoreError: 0,
                    trustedWins: 0
                });
            }
            const teamRow = teams.get(team);
            teamRow.matches += 1;
            if (row.submitted) {
                teamRow.submitted += 1;
                teamRow.points += row.points;
                teamRow.scoreError += Number(row.scoreError || 0);
                if (row.exact) teamRow.exact += 1;
                if (row.correct) teamRow.correct += 1;
                if (!row.correct) teamRow.misses += 1;
                if (
                    (row.predictionOutcome === "team1" && row.match.team1 === team) ||
                    (row.predictionOutcome === "team2" && row.match.team2 === team)
                ) {
                    teamRow.trustedWins += 1;
                }
            }
        });
    });

    const rows = [...teams.values()].map((team) => ({
        ...team,
        averageError: team.submitted ? Number((team.scoreError / team.submitted).toFixed(1)) : 0
    }));

    return {
        bestPointsTeam: [...rows].sort((a, b) => b.points - a.points || b.exact - a.exact)[0] || null,
        mostTrustedTeam: [...rows].sort((a, b) => b.trustedWins - a.trustedWins || b.matches - a.matches)[0] || null,
        hardestTeam: [...rows].sort((a, b) => b.misses - a.misses || b.averageError - a.averageError)[0] || null,
        mostPreciseTeam: [...rows].filter((team) => team.submitted > 0).sort((a, b) => a.averageError - b.averageError || b.exact - a.exact)[0] || null,
        rows
    };
}

function buildParticipantRecapMoments(row, predictionRows = [], recap) {
    const scoredRows = predictionRows.filter((item) => item.points > 0);
    const exactRows = predictionRows.filter((item) => item.exact);
    const againstCrowdRows = predictionRows.filter((item) => item.againstCrowd);
    const closestMiss = predictionRows
        .filter((item) => item.submitted && !item.correct)
        .sort((a, b) => Number(a.scoreError || 999) - Number(b.scoreError || 999) || new Date(b.match.kickoff_at) - new Date(a.match.kickoff_at))[0] || null;
    const bestPrediction = [...scoredRows].sort((a, b) => b.points - a.points || new Date(b.match.kickoff_at) - new Date(a.match.kickoff_at))[0] || null;
    const latestExact = [...exactRows].sort((a, b) => new Date(b.match.kickoff_at) - new Date(a.match.kickoff_at))[0] || null;

    return {
        bestPrediction,
        latestExact,
        closestMiss,
        againstCrowdRows,
        topTeam: row.favoriteTeam || null,
        trustedTeam: row.mostTrustedTeam || null,
        betrayedTeam: row.teamBetrayed || null,
        championPredictionTeam: row.championPredictionTeam || null,
        championPredictionPoints: Number(row.championPredictionPoints || 0),
        podium: (recap.finalRows || []).slice(0, 3)
    };
}

function buildParticipantRecapHighlights(posts = [], recap) {
    const completedMatchIds = new Set((recap.completedMatches || []).map((match) => String(match.id)));
    const safePosts = (posts || []).filter((post) => {
        const card = Array.isArray(post.cards) ? post.cards[0] || {} : {};
        const matchId = String(card.source_match_id || "").trim();
        return !matchId || completedMatchIds.has(matchId);
    });
    const sortedPosts = typeof sortFinalAiHighlightPosts === "function"
        ? sortFinalAiHighlightPosts(safePosts, recap)
        : safePosts;
    const highlights = sortedPosts.slice(0, 8).map((post) => ({
        icon: post.icon || "✨",
        title: post.title_ar || "لقطة من البطولة",
        subtitle: post.subtitle_ar || post.cards?.[0]?.stage_ar || "أضواء الختام",
        body: post.body_ar || ""
    }));

    if (highlights.length) return highlights;

    return buildFinalHighlightCards(recap).slice(0, 8).map((card) => ({
        icon: card.icon || "✨",
        title: card.title,
        subtitle: "لقطة محسوبة",
        body: card.description
    }));
}

function renderParticipantRecapPdfDocument(model) {
    const documentElement = document.createElement("div");
    documentElement.className = "participant-recap-pdf-export-host";
    documentElement.setAttribute("aria-hidden", "true");
    const pageContents = buildParticipantRecapPdfPages(model);

    documentElement.innerHTML = `
        <div class="participant-recap-pdf-document" dir="rtl" style="--recap-accent:${model.visual.color}">
            ${pageContents.map((page, index) => renderParticipantRecapPdfPage(
                page.html,
                index + 1,
                pageContents.length,
                page.className || ""
            )).join("")}
        </div>
    `;

    return documentElement;
}

function buildParticipantRecapPdfPages(model) {
    const pages = [
        { className: "participant-recap-page-cover", html: renderParticipantRecapCoverPage(model) },
        { className: "participant-recap-page-portrait", html: renderParticipantRecapPortraitPage(model) },
        { className: "participant-recap-page-journey-v2", html: renderParticipantRecapJourneyPageV2(model) },
        { className: "participant-recap-page-comparison", html: renderParticipantRecapComparisonPage(model) },
        { className: "participant-recap-page-collective", html: renderParticipantRecapCollectivePage(model) },
        { className: "participant-recap-page-dna", html: renderParticipantRecapDnaPage(model) },
        { className: "participant-recap-page-moments-v2", html: renderParticipantRecapMomentsAndBadgesPage(model) },
        { className: "participant-recap-page-fingerprint participant-recap-pdf-page-crisp", html: renderParticipantRecapPredictionFingerprintPage(model) },
        { className: "participant-recap-page-ledger participant-recap-pdf-page-crisp", html: renderParticipantRecapPredictionLedgerPage(model) },
        { className: "participant-recap-page-highlights-v2", html: renderParticipantRecapHighlightsMagazinePage(model) },
        { className: "participant-recap-page-closing", html: renderParticipantRecapClosingPage(model) }
    ];

    const remainingBadges = model.badges.slice(14);
    if (remainingBadges.length) {
        pages.splice(7, 0, {
            className: "participant-recap-page-badges-extra",
            html: renderParticipantRecapExtraBadgesPage(model, remainingBadges)
        });
    }

    return pages;
}

function renderParticipantRecapPdfPage(content, pageNumber, totalPages, className = "") {
    return `
        <section class="participant-recap-pdf-page ${className}">
            <div class="participant-recap-page-decoration participant-recap-page-decoration-one"></div>
            <div class="participant-recap-page-decoration participant-recap-page-decoration-two"></div>
            <div class="participant-recap-page-content">${content}</div>
            <footer class="participant-recap-pdf-footer">
                <span>مسابقة توقعات كأس العالم 2026</span>
                <strong>${pageNumber} / ${totalPages}</strong>
            </footer>
        </section>
    `;
}

function renderParticipantRecapCoverPage(model) {
    const { participant, finalRow, recap, visual, comparison } = model;
    const stats = recap.seasonStats || {};
    const podium = (recap.finalRows || []).slice(0, 3);

    return `
        <div class="participant-recap-cover-topline">
            <span>WORLD CUP 2026</span>
            <small>نسخة تذكارية شخصية · تحليل كامل</small>
        </div>
        <div class="participant-recap-cover-center">
            <div class="participant-recap-cover-emblem" style="--recap-accent:${visual.color}">${escapeHtml(visual.icon)}</div>
            <p>كتاب رحلتي في</p>
            <h1>مسابقة التوقعات</h1>
            <h2>${escapeHtml(participant.name)}</h2>
            <div class="participant-recap-cover-rank">
                <strong>#${finalRow.finalRank}</strong>
                <span>${finalRow.points} نقطة</span>
            </div>
            <p class="participant-recap-cover-story">${escapeHtml(buildParticipantRecapCoverLine(finalRow))}</p>
            <div class="participant-recap-v2-cover-position">ضمن أعلى ${comparison.topPercent}% من المشاركين</div>
        </div>
        <div class="participant-recap-cover-bottom">
            <div class="participant-recap-cover-numbers">
                <span><strong>${finalRow.predictions}</strong><small>توقع</small></span>
                <span><strong>${finalRow.correctPredictions}</strong><small>جاب نقاط</small></span>
                <span><strong>${finalRow.exactScores}</strong><small>بالملّي</small></span>
                <span><strong>${finalRow.accuracyPercent}%</strong><small>دقة</small></span>
            </div>
            <div class="participant-recap-cover-podium">
                <small>منصة الختام</small>
                <p>${podium.map((row, index) => `${["🥇", "🥈", "🥉"][index]} ${escapeHtml(row.name)}`).join(" · ")}</p>
            </div>
            <p class="participant-recap-cover-season-line">${stats.completedMatches} مباراة · ${stats.totalPredictions} توقع · ${stats.participantCount} مشاركاً</p>
        </div>
    `;
}

function buildParticipantRecapCoverLine(row) {
    if (row.finalRank === 1) return "رحلة انتهت باللقب، لكنها صُنعت من توقع بعد توقع حتى آخر صافرة.";
    if (row.finalRank <= 3) return "رحلة انتهت على منصة الختام بعد منافسة بقيت حيّة حتى اللحظة الأخيرة.";
    if (row.uniqueCorrect > 0) return "رحلة فيها قراءات مختلفة، ومواقف اختارت طريقاً بعيداً عن توقع الأغلبية.";
    if (row.exactScores > 0) return "رحلة تركت بصمتها في لحظات جاءت فيها النتيجة بالملّي.";
    return "كل توقع كان خطوة، وكل مباراة أضافت سطراً إلى هذه الرحلة.";
}

function renderParticipantRecapPortraitPage(model) {
    const { participant, finalRow, profileStory, comparison, visual, collective } = model;
    const scoreComposition = [
        { label: "بالملّي", value: collective.statusCounts.exact, color: "#f1d89a" },
        { label: "اتجاه صحيح", value: collective.statusCounts.correct, color: "#34d6bd" },
        { label: "بدون نقاط", value: collective.statusCounts.zero, color: "#7c8aa5" },
        { label: "لم يُسجل", value: collective.statusCounts.missing, color: "#7d1738" }
    ];

    return `
        ${renderParticipantRecapPageHeading("صورتك في موسم واحد", "صفحة واحدة تلخص كيف بدت رحلتك بعد آخر صافرة")}
        <div class="participant-recap-v2-portrait-hero" style="--recap-accent:${visual.color}">
            <div class="participant-recap-v2-portrait-avatar">${escapeHtml(visual.icon)}</div>
            <div>
                <small>هوية الرحلة</small>
                <h2>${escapeHtml(participant.name)}</h2>
                <p>${escapeHtml(profileStory)}</p>
            </div>
            <div class="participant-recap-v2-rank-seal"><span>المركز</span><strong>#${finalRow.finalRank}</strong></div>
        </div>
        <div class="participant-recap-v2-portrait-grid">
            <section class="participant-recap-v2-composition-card">
                <div class="participant-recap-v2-section-label">بصمة النتائج</div>
                ${buildParticipantRecapDonutChart(scoreComposition, finalRow.predictions || model.predictionRows.length)}
                <div class="participant-recap-v2-donut-legend">
                    ${scoreComposition.map((item) => `<span><i style="background:${item.color}"></i><b>${item.value}</b><small>${item.label}</small></span>`).join("")}
                </div>
            </section>
            <section class="participant-recap-v2-signature-card">
                <div class="participant-recap-v2-section-label">توقيعك في المسابقة</div>
                <h3>${escapeHtml(buildParticipantRecapStyleTitle(finalRow))}</h3>
                <p>${escapeHtml(buildParticipantRecapStyleDescription(finalRow))}</p>
                <div class="participant-recap-v2-signature-stats">
                    <span><strong>${finalRow.bestCorrectStreak || 0}</strong><small>أطول سلسلة</small></span>
                    <span><strong>${finalRow.againstCrowdPoints || 0}</strong><small>ضد الموجة</small></span>
                    <span><strong>${finalRow.uniqueCorrect || 0}</strong><small>قراءة منفردة</small></span>
                    <span><strong>${finalRow.bestFiveMatchSpan || 0}</strong><small>أفضل 5 مباريات</small></span>
                </div>
            </section>
        </div>
        <div class="participant-recap-v2-comparison-ribbon">
            <div><small>عن متوسط النقاط</small><strong>${formatParticipantRecapSigned(comparison.pointsDifference)}</strong></div>
            <div><small>عن الوسيط</small><strong>${formatParticipantRecapSigned(comparison.medianDifference)}</strong></div>
            <div><small>عن متوسط الدقة</small><strong>${formatParticipantRecapSigned(comparison.accuracyDifference, "%")}</strong></div>
            <div><small>موقعك</small><strong>Top ${comparison.topPercent}%</strong></div>
        </div>
    `;
}

function renderParticipantRecapJourneyPageV2(model) {
    const row = model.finalRow;
    const bestRank = row.ranks?.length ? Math.min(...row.ranks) : row.finalRank;
    const firstRank = row.firstRank || row.finalRank;
    const movement = firstRank - row.finalRank;

    return `
        ${renderParticipantRecapPageHeading("رحلة مركزك", "الترتيب لم يكن صورة ثابتة؛ هذه هي الحركة التي أوصلتك إلى النهاية")}
        <div class="participant-recap-rank-chart-card participant-recap-v2-rank-chart-card">
            ${buildParticipantRecapRankChart(row.ranks || [], model.recap.seasonStats?.participantCount || 1)}
        </div>
        <div class="participant-recap-journey-stats participant-recap-v2-journey-stats">
            <span><small>أول مركز</small><strong>#${firstRank}</strong></span>
            <span><small>أفضل مركز</small><strong>#${bestRank}</strong></span>
            <span><small>المركز النهائي</small><strong>#${row.finalRank}</strong></span>
            <span><small>حركة الرحلة</small><strong>${movement > 0 ? `صعود ${movement}` : movement < 0 ? `نزول ${Math.abs(movement)}` : "ثبات"}</strong></span>
            <span><small>مرات الصدارة</small><strong>${row.appearancesInFirst || 0}</strong></span>
            <span><small>ضمن الثلاثة</small><strong>${row.appearancesInTop3 || 0}</strong></span>
        </div>
        <div class="participant-recap-v2-stage-comparison">
            <div class="participant-recap-v2-section-head"><h3>أداؤك أمام متوسط الجميع</h3><small>النقاط لكل مباراة في المرحلة</small></div>
            ${model.stageSummaries.map((stage) => {
                const maxValue = Math.max(stage.pointsPerMatch, stage.fieldAveragePoints, 1);
                const personalWidth = Math.max(4, (stage.pointsPerMatch / maxValue) * 100);
                const fieldWidth = Math.max(4, (stage.fieldAveragePoints / maxValue) * 100);
                return `
                    <div class="participant-recap-v2-stage-row">
                        <div class="participant-recap-v2-stage-name"><i style="background:${stage.color}"></i><strong>${escapeHtml(stage.label)}</strong><small>${stage.points} نقطة · ${stage.exact} بالملّي</small></div>
                        <div class="participant-recap-v2-stage-bars">
                            <span><b style="width:${personalWidth}%"></b><em>${stage.pointsPerMatch}</em></span>
                            <span class="field"><b style="width:${fieldWidth}%"></b><em>${stage.fieldAveragePoints}</em></span>
                        </div>
                    </div>
                `;
            }).join("")}
            <div class="participant-recap-v2-stage-legend"><span><i class="you"></i>أنت</span><span><i class="field"></i>متوسط الجميع</span></div>
        </div>
    `;
}

function renderParticipantRecapComparisonPage(model) {
    const { finalRow, comparison, recap, participant } = model;
    return `
        ${renderParticipantRecapPageHeading("أنت بين الجميع", "ليست مقارنة للفوز فقط؛ بل مقارنة في الدقة والثبات والجرأة والحضور")}
        <div class="participant-recap-v2-field-grid">
            <section class="participant-recap-v2-scatter-card">
                <div class="participant-recap-v2-section-head"><h3>خريطة المنافسة</h3><small>النقاط × الدقة · حجم الدائرة = النتائج بالملّي</small></div>
                ${buildParticipantRecapScatterChart(recap.finalRows || [], participant.id)}
            </section>
            <section class="participant-recap-v2-percentile-card">
                <div class="participant-recap-v2-section-head"><h3>مؤشراتك المئوية</h3><small>كم مشاركاً تفوقت عليه في كل جانب</small></div>
                ${renderParticipantRecapPercentileRows(comparison.percentiles)}
            </section>
        </div>
        <div class="participant-recap-v2-rival-strip">
            <div class="participant-recap-v2-rival-main">
                <small>أقرب منافس لك بالنقاط</small>
                <strong>${escapeHtml(comparison.closestRival?.name || "—")}</strong>
                <span>${comparison.closestRival ? `${comparison.closestRival.points} نقطة · الفارق ${comparison.closestRival.gap}` : "لا توجد مقارنة كافية"}</span>
            </div>
            <div><small>الفارق عن الأول</small><strong>${comparison.gapToLeader}</strong><span>نقطة</span></div>
            <div><small>الفارق عن المنصة</small><strong>${comparison.gapToPodium}</strong><span>نقطة</span></div>
            <div><small>ضمن أعلى</small><strong>${comparison.topPercent}%</strong><span>من المشاركين</span></div>
        </div>
        <div class="participant-recap-v2-neighbor-row">
            ${comparison.personAbove ? `<span><small>فوقك مباشرة</small><strong>#${comparison.personAbove.finalRank} ${escapeHtml(comparison.personAbove.name)}</strong><em>${comparison.personAbove.points} نقطة</em></span>` : `<span><small>فوقك مباشرة</small><strong>لا أحد</strong><em>أنت في الصدارة</em></span>`}
            ${comparison.personBelow ? `<span><small>خلفك مباشرة</small><strong>#${comparison.personBelow.finalRank} ${escapeHtml(comparison.personBelow.name)}</strong><em>${comparison.personBelow.points} نقطة</em></span>` : `<span><small>خلفك مباشرة</small><strong>لا أحد</strong><em>آخر مركز في الجدول</em></span>`}
        </div>
    `;
}

function renderParticipantRecapCollectivePage(model) {
    const { collective, recap, participant } = model;
    const stats = recap.seasonStats || {};
    const leaders = collective.leaders;

    return `
        ${renderParticipantRecapPageHeading("المسابقة كما صنعناها جميعاً", "قراءة جماعية جديدة: توزيع النقاط، وجوه التميز، والمباريات التي حيّرت الجميع")}
        <div class="participant-recap-v2-collective-top">
            <section class="participant-recap-v2-distribution-card">
                <div class="participant-recap-v2-section-head"><h3>توزيع النقاط</h3><small>كل عمود يمثل مجموعة من المشاركين</small></div>
                ${buildParticipantRecapDistributionChart(collective.scoreBands, model.finalRow.points)}
                <div class="participant-recap-v2-distribution-stats">
                    <span><small>الأعلى</small><strong>${collective.max}</strong></span>
                    <span><small>المتوسط</small><strong>${collective.mean}</strong></span>
                    <span><small>الوسيط</small><strong>${collective.median}</strong></span>
                    <span><small>مدى التنافس</small><strong>${collective.standardDeviation}</strong></span>
                </div>
            </section>
            <section class="participant-recap-v2-season-pulse-card">
                <div class="participant-recap-v2-section-head"><h3>نبض الموسم</h3><small>أرقام لا تظهر في جدول الترتيب وحده</small></div>
                <div class="participant-recap-v2-season-pulse-grid">
                    <span><strong>${stats.totalPredictions}</strong><small>توقع جماعي</small></span>
                    <span><strong>${stats.totalExact}</strong><small>بالملّي</small></span>
                    <span><strong>${stats.accuracyPercent}%</strong><small>دقة جماعية</small></span>
                    <span><strong>${stats.averagePointsPerMatch}</strong><small>نقطة/مباراة</small></span>
                </div>
                <div class="participant-recap-v2-match-facts">
                    ${stats.generousMatch ? `<div><b>🎁</b><span><small>أكرم مباراة</small><strong>${escapeHtml(stats.generousMatch.title)}</strong><em>${stats.generousMatch.awardedPoints} نقطة</em></span></div>` : ""}
                    ${collective.biggestCrowdUpset ? `<div><b>🌪️</b><span><small>أكبر مفاجأة للأغلبية</small><strong>${escapeHtml(collective.biggestCrowdUpset.title)}</strong><em>${collective.biggestCrowdUpset.score}</em></span></div>` : ""}
                    ${collective.mostExactMatch ? `<div><b>🎯</b><span><small>أكثر مباراة بالملّي</small><strong>${escapeHtml(collective.mostExactMatch.title)}</strong><em>${collective.mostExactMatch.exactCount} نتائج كاملة</em></span></div>` : ""}
                </div>
            </section>
        </div>
        <div class="participant-recap-v2-category-leaders">
            ${renderParticipantRecapCollectiveLeader("🎯", "ملك بالملّي", leaders.exact, `${leaders.exact?.exactScores || 0} نتيجة كاملة`, participant.id)}
            ${renderParticipantRecapCollectiveLeader("🧠", "الأعلى دقة", leaders.accuracy, `${leaders.accuracy?.accuracyPercent || 0}%`, participant.id)}
            ${renderParticipantRecapCollectiveLeader("🔥", "أطول سلسلة", leaders.streak, `${leaders.streak?.bestCorrectStreak || 0} مباريات`, participant.id)}
            ${renderParticipantRecapCollectiveLeader("⚡", "الأجرأ ضد الموجة", leaders.bravery, `${leaders.bravery?.againstCrowdPoints || 0} نقطة`, participant.id)}
        </div>
        <div class="participant-recap-v2-leaderboard-ribbon">
            ${(recap.finalRows || []).map((row) => `<span class="${String(row.id) === String(participant.id) ? "is-current" : ""}" style="--ribbon-size:${Math.max(18, (row.points / Math.max(1, collective.max)) * 100)}%"><b>#${row.finalRank}</b><strong>${escapeHtml(row.name)}</strong><em>${row.points}</em></span>`).join("")}
        </div>
    `;
}

function renderParticipantRecapDnaPage(model) {
    const { dna, finalRow, teamAnalysis } = model;
    return `
        ${renderParticipantRecapPageHeading("حمضك النووي في التوقعات", "كيف كنت تتخذ القرار؟ هل تميل للأغلبية، للمفاجآت، للأهداف، أم للثبات؟")}
        <div class="participant-recap-v2-dna-grid">
            <section class="participant-recap-v2-radar-card">
                <div class="participant-recap-v2-section-head"><h3>بصمتك الخماسية</h3><small>المؤشرات مقارنة ببقية المشاركين</small></div>
                ${buildParticipantRecapRadarChart(dna.metrics)}
            </section>
            <section class="participant-recap-v2-habits-card">
                <div class="participant-recap-v2-section-head"><h3>عاداتك في القراءة</h3><small>سلوكيات مستخرجة من سجل التوقعات</small></div>
                <div class="participant-recap-v2-habit-grid">
                    ${renderParticipantRecapHabit("👥", "اتباع اتجاه الأغلبية", `${dna.crowdFollowRate}%`, dna.crowdFollowRate >= 60 ? "كنت قريباً من المزاج العام غالباً." : "كنت أكثر استقلالاً من المزاج العام.")}
                    ${renderParticipantRecapHabit("🤝", "اختيار التعادل", `${dna.drawRate}%`, `متوسط الجميع ${dna.fieldDrawRate}%.`)}
                    ${renderParticipantRecapHabit("⚽", "شهية الأهداف", dna.averagePredictedGoals, `متوسط الجميع ${dna.fieldAveragePredictedGoals}.`)}
                    ${renderParticipantRecapHabit("📏", "متوسط خطأ النتيجة", dna.averageError, "مجموع الفارق بين توقعك والنتيجة.")}
                    ${renderParticipantRecapHabit("🧩", "توقعات فريدة", `${dna.uniquePredictionRate}%`, "نتائج لم يكتبها مشارك آخر.")}
                    ${renderParticipantRecapHabit("✅", "نسبة التسجيل", `${dna.scoringRate}%`, "توقعات انتهت بنقاط.")}
                </div>
            </section>
        </div>
        <div class="participant-recap-v2-team-stories">
            ${renderParticipantRecapTeamStory("💰", "أكثر منتخب جمع لك نقاطاً", teamAnalysis.bestPointsTeam, `${teamAnalysis.bestPointsTeam?.points || 0} نقطة`)}
            ${renderParticipantRecapTeamStory("🤝", "أكثر منتخب وثقت بفوزه", teamAnalysis.mostTrustedTeam, `${teamAnalysis.mostTrustedTeam?.trustedWins || 0} مرات`)}
            ${renderParticipantRecapTeamStory("🎯", "الأسهل قراءة", teamAnalysis.mostPreciseTeam, `متوسط خطأ ${teamAnalysis.mostPreciseTeam?.averageError || 0}`)}
            ${renderParticipantRecapTeamStory("💔", "الأصعب عليك", teamAnalysis.hardestTeam, `${teamAnalysis.hardestTeam?.misses || 0} إخفاقات`)}
        </div>
        <div class="participant-recap-v2-dna-quote">“${escapeHtml(buildParticipantRecapPersonalQuote(finalRow))}”</div>
    `;
}

function renderParticipantRecapMomentsAndBadgesPage(model) {
    const cards = buildParticipantRecapMomentCards(model).slice(0, 6);
    const badges = model.badges.slice(0, 14);

    return `
        ${renderParticipantRecapPageHeading("اللحظات والشارات", "لقطات شخصية لا تختصرها خانة النقاط، وشارات تحفظ لكل لحظة اسمها")}
        <div class="participant-recap-v2-moment-strip">
            ${cards.map((card) => `
                <article>
                    <span>${card.icon}</span>
                    <div><small>${escapeHtml(card.title)}</small><strong>${escapeHtml(card.value)}</strong><p>${escapeHtml(card.body)}</p></div>
                </article>
            `).join("")}
        </div>
        <div class="participant-recap-v2-badge-constellation">
            <div class="participant-recap-v2-badge-center"><small>أسلوبك</small><strong>${escapeHtml(buildParticipantRecapStyleTitle(model.finalRow))}</strong></div>
            ${badges.map((badge, index) => `
                <article class="badge-${index + 1}">
                    <span>${escapeHtml(badge.icon || "🏅")}</span>
                    <strong>${escapeHtml(badge.title)}</strong>
                    <small>${escapeHtml(badge.value || "")}</small>
                </article>
            `).join("")}
        </div>
        <div class="participant-recap-champion-pick-card participant-recap-v2-champion-pick">
            <div>
                <small>توقع بطل كأس العالم</small>
                <h3>${escapeHtml(model.moments.championPredictionTeam || "لم يتم تسجيل توقع")}</h3>
                <p>${model.moments.championPredictionTeam ? `هذا الاختيار أضاف ${model.moments.championPredictionPoints} نقطة إلى رصيدك النهائي.` : "لم يكن هناك اختيار محفوظ لهذه الخانة."}</p>
            </div>
            <strong>${model.moments.championPredictionPoints || 0}<span>نقطة</span></strong>
        </div>
    `;
}

function renderParticipantRecapExtraBadgesPage(model, badges) {
    return `
        ${renderParticipantRecapPageHeading("بقية شارات رحلتك", "لأن بعض الرحلات أكبر من أن تختصرها صفحة واحدة")}
        <div class="participant-recap-v2-extra-badges">
            ${badges.map((badge) => `
                <article><span>${escapeHtml(badge.icon || "🏅")}</span><div><strong>${escapeHtml(badge.title)}</strong><b>${escapeHtml(badge.value || "")}</b><p>${escapeHtml(badge.note || "شارة محسوبة من بيانات رحلتك.")}</p></div></article>
            `).join("")}
        </div>
    `;
}

function renderParticipantRecapPredictionFingerprintPage(model) {
    const counts = model.collective.statusCounts;
    return `
        ${renderParticipantRecapPageHeading("بصمة 104 مباريات", "بدلاً من جدول طويل: خريطة واحدة ترى فيها الموسم كاملاً من أول مباراة إلى آخر مباراة")}
        <div class="participant-recap-v2-fingerprint-summary">
            <span class="exact"><strong>${counts.exact}</strong><small>بالملّي</small></span>
            <span class="correct"><strong>${counts.correct}</strong><small>اتجاه صحيح</small></span>
            <span class="zero"><strong>${counts.zero}</strong><small>بدون نقاط</small></span>
            <span class="missing"><strong>${counts.missing}</strong><small>بدون توقع</small></span>
            <span><strong>${model.finalRow.points}</strong><small>إجمالي النقاط</small></span>
        </div>
        <div class="participant-recap-v2-fingerprint-grid">
            ${model.predictionRows.map((row) => `
                <div class="participant-recap-v2-fingerprint-cell ${row.statusClass}" title="${escapeHtml(row.match.team1)} ضد ${escapeHtml(row.match.team2)}" style="--stage-color:${row.stageColor}">
                    <small>${row.index}</small>
                    <span>${renderParticipantRecapFlag(row.match.team1)}${renderParticipantRecapFlag(row.match.team2)}</span>
                    <strong>${row.points}</strong>
                </div>
            `).join("")}
        </div>
        <div class="participant-recap-v2-fingerprint-legend">
            ${PARTICIPANT_RECAP_STAGE_ORDER.map((stage) => {
                const rows = model.predictionRows.filter((row) => row.stage === stage);
                if (!rows.length) return "";
                return `<span><i style="background:${PARTICIPANT_RECAP_STAGE_COLORS[stage]}"></i>${escapeHtml(getFinalRecapStageLabel(stage))}<b>${rows.reduce((sum, row) => sum + row.points, 0)} نقطة</b></span>`;
            }).join("")}
        </div>
        <div class="participant-recap-v2-fingerprint-note">كل مربع مباراة، واللون الداخلي يحكي النتيجة، والخط الصغير يحدد المرحلة. هذه هي رحلتك كاملة في نظرة واحدة.</div>
    `;
}

function renderParticipantRecapPredictionLedgerPage(model) {
    const columns = splitParticipantRecapLedgerColumns(model.predictionRows, 2);
    return `
        ${renderParticipantRecapPageHeading("دفتر التوقعات الكامل", "كل المباريات في صفحة واحدة: الأعلام، توقعك، النتيجة، والنقاط")}
        <div class="participant-recap-v2-ledger-summary">
            <span><strong>${model.finalRow.predictions}</strong><small>توقع مسجل</small></span>
            <span><strong>${model.finalRow.correctPredictions}</strong><small>جاب نقاط</small></span>
            <span><strong>${model.finalRow.exactScores}</strong><small>بالملّي</small></span>
            <span><strong>${model.finalRow.points}</strong><small>نقطة نهائية</small></span>
        </div>
        <div class="participant-recap-v2-ledger-columns">
            ${columns.map((rows) => `
                <div class="participant-recap-v2-ledger-column">
                    <div class="participant-recap-v2-ledger-head"><span>#</span><span>المباراة</span><span>توقع</span><span>فعلي</span><span>ن</span></div>
                    ${rows.map((row) => `
                        <div class="participant-recap-v2-ledger-row ${row.statusClass}" style="--stage-color:${row.stageColor}">
                            <span>${row.index}</span>
                            <div class="participant-recap-v2-ledger-match">${renderParticipantRecapFlag(row.match.team1)}<b>${escapeHtml(compactParticipantRecapTeamName(row.match.team1))}</b><i>×</i>${renderParticipantRecapFlag(row.match.team2)}<b>${escapeHtml(compactParticipantRecapTeamName(row.match.team2))}</b></div>
                            <em>${escapeHtml(row.predictedScore)}</em>
                            <em>${escapeHtml(row.actualScore)}</em>
                            <strong>${row.points}</strong>
                        </div>
                    `).join("")}
                </div>
            `).join("")}
        </div>
        <div class="participant-recap-v2-ledger-legend"><span class="exact">بالملّي</span><span class="correct">اتجاه صحيح</span><span class="zero">بدون نقاط</span><span class="missing">بدون توقع</span></div>
    `;
}

function renderParticipantRecapHighlightsMagazinePage(model) {
    const highlights = model.highlights.slice(0, 6);
    const hero = highlights[0] || null;
    const rest = highlights.slice(1);

    return `
        ${renderParticipantRecapPageHeading("صفحة من ذاكرة البطولة", "ليست نسخة من صفحة الأضواء؛ بل افتتاحية قصيرة لما بقي عالقاً بعد النهاية")}
        <div class="participant-recap-v2-magazine">
            ${hero ? `
                <article class="participant-recap-v2-magazine-hero">
                    <div class="participant-recap-v2-magazine-number">01</div>
                    <span>${escapeHtml(hero.icon || "✨")}</span>
                    <small>${escapeHtml(hero.subtitle || "أضواء الختام")}</small>
                    <h2>${escapeHtml(hero.title)}</h2>
                    <p>${escapeHtml(hero.body)}</p>
                </article>
            ` : ""}
            <div class="participant-recap-v2-magazine-grid">
                ${rest.map((highlight, index) => `
                    <article>
                        <div>${String(index + 2).padStart(2, "0")}</div>
                        <span>${escapeHtml(highlight.icon || "✨")}</span>
                        <small>${escapeHtml(highlight.subtitle || "أضواء الختام")}</small>
                        <h3>${escapeHtml(highlight.title)}</h3>
                        <p>${escapeHtml(highlight.body)}</p>
                    </article>
                `).join("")}
            </div>
        </div>
        <div class="participant-recap-v2-magazine-line">انتهت النتائج، لكن هذه اللقطات بقيت لأنها كانت جزءاً من الضحك، المفاجآت، والحديث الذي صنع روح المسابقة.</div>
    `;
}

function renderParticipantRecapClosingPage(model) {
    const stats = model.recap.seasonStats || {};
    const podiumSentence = buildFinalPodiumSentence(model.recap.finalRows || []);

    return `
        <div class="participant-recap-closing-wrap">
            <div class="participant-recap-closing-heart">♥</div>
            <p class="participant-recap-closing-kicker">ختام الرحلة</p>
            <h1>شكراً… لأنكم جعلتم الفكرة تعيش</h1>
            <p>
                لم تكن المسابقة مجرد أرقام في جدول، ولا توقعات تُحفظ قبل بداية المباراة. كانت موعداً ننتظره معاً؛ رسالة بعد نتيجة، وضحكة على توقع ضاع في اللحظة الأخيرة، وفرحة لا تُنسى عندما تصيب النتيجة بالملّي.
            </p>
            <p>
                كل دخول للموقع، وكل توقع، وكل حديث بعد مباراة كان سبباً في أن تكبر التجربة وتصبح أكثر من مجرد مسابقة. وجودكم هو الذي أعطاها روحاً، وجعل بناءها ومتابعتها حتى النهاية ذكرى جميلة بحد ذاتها.
            </p>
            <div class="participant-recap-closing-numbers">
                <span><strong>${stats.participantCount}</strong><small>مشاركاً</small></span>
                <span><strong>${stats.completedMatches}</strong><small>مباراة</small></span>
                <span><strong>${stats.totalPredictions}</strong><small>توقعاً</small></span>
            </div>
            <p>
                ${podiumSentence ? `منصة الختام حملت أسماء تستحق لحظتها: ${podiumSentence}. ` : ""}
                مبروك لأصحاب المراكز على ما حققوه، ومبروك لكل من شارك وأضاف لهذه التجربة شيئاً من حضوره وروحه؛ لأن اللقب والمراكز لأصحابها، أما الحكاية فصنعناها جميعاً.
            </p>
            <div class="participant-recap-closing-personal">
                <small>نسخة ${escapeHtml(model.participant.name)}</small>
                <strong>احتفظ بهذا الكتاب؛ فهو لا يحفظ النتيجة فقط، بل يحفظ الطريق الذي أوصلك إليها.</strong>
            </div>
        </div>
    `;
}

function renderParticipantRecapPageHeading(title, subtitle) {
    return `
        <header class="participant-recap-pdf-heading">
            <div><small>WORLD CUP 2026 · PERSONAL JOURNEY BOOK</small><h1>${escapeHtml(title)}</h1></div>
            <p>${escapeHtml(subtitle)}</p>
        </header>
    `;
}

function buildParticipantRecapRankChart(ranks = [], participantCount = 1) {
    if (!ranks.length) {
        return `<div class="participant-recap-chart-empty">لا توجد حركة ترتيب كافية للرسم.</div>`;
    }

    const width = 660;
    const height = 250;
    const paddingX = 36;
    const paddingY = 28;
    const maxSamples = 30;
    const step = Math.max(1, Math.ceil(ranks.length / maxSamples));
    const samples = ranks.filter((_, index) => index % step === 0 || index === ranks.length - 1);
    const xStep = samples.length > 1 ? (width - paddingX * 2) / (samples.length - 1) : 0;
    const rankRange = Math.max(1, participantCount - 1);
    const points = samples.map((rank, index) => ({
        x: paddingX + index * xStep,
        y: paddingY + ((Number(rank) - 1) / rankRange) * (height - paddingY * 2),
        rank
    }));
    const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const areaPath = `${path} L${points[points.length - 1].x.toFixed(1)},${height - paddingY} L${points[0].x.toFixed(1)},${height - paddingY} Z`;
    const guideRanks = [...new Set([1, 3, Math.ceil(participantCount / 2), participantCount])].filter((rank) => rank <= participantCount);

    return `
        <svg class="participant-recap-rank-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="رحلة المركز خلال المسابقة">
            <defs>
                <linearGradient id="participantRecapRankAreaV2" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#f1d89a" stop-opacity="0.36"></stop>
                    <stop offset="100%" stop-color="#f1d89a" stop-opacity="0.02"></stop>
                </linearGradient>
            </defs>
            ${guideRanks.map((rank) => {
                const y = paddingY + ((rank - 1) / rankRange) * (height - paddingY * 2);
                return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="rgba(13,28,53,.14)" stroke-width="1"></line><text x="${width - 5}" y="${y + 4}" fill="#5f6b7d" font-size="13" text-anchor="end">#${rank}</text>`;
            }).join("")}
            <path d="${areaPath}" fill="url(#participantRecapRankAreaV2)"></path>
            <path d="${path}" fill="none" stroke="#c9932f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
            ${points.map((point, index) => index === 0 || index === points.length - 1 || point.rank === 1 ? `<circle cx="${point.x}" cy="${point.y}" r="6" fill="#18a89a" stroke="#ffffff" stroke-width="3"></circle>` : "").join("")}
            <text x="${paddingX}" y="${height - 3}" fill="#657286" font-size="13">البداية</text>
            <text x="${width - paddingX}" y="${height - 3}" fill="#657286" font-size="13" text-anchor="end">النهاية</text>
        </svg>
    `;
}

function buildParticipantRecapDonutChart(items, total) {
    const safeTotal = Math.max(1, Number(total || items.reduce((sum, item) => sum + item.value, 0)));
    const radius = 74;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return `
        <svg class="participant-recap-v2-donut" viewBox="0 0 220 220" role="img" aria-label="توزيع نتائج التوقعات">
            <circle cx="110" cy="110" r="${radius}" fill="none" stroke="rgba(13,28,53,.09)" stroke-width="28"></circle>
            ${items.map((item) => {
                const length = (Number(item.value || 0) / safeTotal) * circumference;
                const circle = `<circle cx="110" cy="110" r="${radius}" fill="none" stroke="${item.color}" stroke-width="28" stroke-linecap="butt" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"></circle>`;
                offset += length;
                return circle;
            }).join("")}
            <text x="110" y="104" text-anchor="middle" fill="#0d1c35" font-size="35" font-weight="900">${safeTotal}</text>
            <text x="110" y="128" text-anchor="middle" fill="#657286" font-size="13">مباراة</text>
        </svg>
    `;
}

function buildParticipantRecapScatterChart(rows, participantId) {
    const width = 400;
    const height = 330;
    const padding = 42;
    const maxPoints = Math.max(1, ...rows.map((row) => Number(row.points || 0)));
    const minAccuracy = Math.min(...rows.map((row) => Number(row.accuracyPercent || 0)), 0);
    const maxAccuracy = Math.max(...rows.map((row) => Number(row.accuracyPercent || 0)), 100);
    const accuracyRange = Math.max(1, maxAccuracy - minAccuracy);

    return `
        <svg class="participant-recap-v2-scatter" viewBox="0 0 ${width} ${height}" role="img" aria-label="خريطة النقاط والدقة لجميع المشاركين">
            ${[0, .25, .5, .75, 1].map((ratio) => {
                const y = padding + ratio * (height - padding * 2);
                const value = Math.round(maxPoints * (1 - ratio));
                return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(13,28,53,.12)"></line><text x="${padding - 8}" y="${y + 4}" fill="#687386" font-size="11" text-anchor="end">${value}</text>`;
            }).join("")}
            ${rows.map((row) => {
                const x = padding + ((Number(row.accuracyPercent || 0) - minAccuracy) / accuracyRange) * (width - padding * 2);
                const y = height - padding - (Number(row.points || 0) / maxPoints) * (height - padding * 2);
                const current = String(row.id) === String(participantId);
                const radius = 5 + Math.min(8, Number(row.exactScores || 0) * .45);
                const fill = current ? "#f1d89a" : row.finalRank <= 3 ? "#34d6bd" : "rgba(124,138,165,.78)";
                return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius}" fill="${fill}" stroke="${current ? "#0d1c35" : "rgba(13,28,53,.20)"}" stroke-width="${current ? 3 : 1}"></circle>${current ? `<text x="${x.toFixed(1)}" y="${(y - radius - 8).toFixed(1)}" fill="#0d1c35" font-size="12" font-weight="900" text-anchor="middle">أنت</text>` : ""}`;
            }).join("")}
            <text x="${width / 2}" y="${height - 7}" fill="#657286" font-size="12" text-anchor="middle">الدقة ←</text>
            <text x="13" y="${height / 2}" fill="#657286" font-size="12" text-anchor="middle" transform="rotate(-90 13 ${height / 2})">النقاط ←</text>
        </svg>
    `;
}

function renderParticipantRecapPercentileRows(percentiles) {
    const rows = [
        ["النقاط", percentiles.points, "🏆"],
        ["الدقة", percentiles.accuracy, "🧠"],
        ["بالملّي", percentiles.exact, "🎯"],
        ["أطول سلسلة", percentiles.streak, "🔥"],
        ["ضد الموجة", percentiles.bravery, "⚡"],
        ["الالتزام", percentiles.participation, "📅"]
    ];

    return `<div class="participant-recap-v2-percentile-list">${rows.map(([label, value, icon]) => `
        <div><span>${icon}<strong>${label}</strong></span><em><i style="width:${Math.max(4, value)}%"></i></em><b>${value}%</b></div>
    `).join("")}</div>`;
}

function buildParticipantRecapDistributionChart(bands, participantPoints) {
    const maxCount = Math.max(1, ...bands.map((band) => band.count));
    return `
        <div class="participant-recap-v2-distribution-chart">
            ${bands.map((band) => {
                const current = participantPoints >= band.min && participantPoints <= band.max;
                return `<div class="${current ? "is-current" : ""}"><b style="height:${Math.max(10, (band.count / maxCount) * 100)}%"></b><strong>${band.count}</strong><small>${band.min}-${band.max}</small>${current ? `<em>أنت</em>` : ""}</div>`;
            }).join("")}
        </div>
    `;
}

function renderParticipantRecapCollectiveLeader(icon, title, row, value, participantId) {
    if (!row) return "";
    return `
        <article class="${String(row.id) === String(participantId) ? "is-current" : ""}">
            <span>${icon}</span><small>${escapeHtml(title)}</small><strong>${escapeHtml(row.name)}</strong><em>${escapeHtml(value)}</em>
        </article>
    `;
}

function buildParticipantRecapRadarChart(metrics) {
    const size = 330;
    const center = size / 2;
    const radius = 112;
    const count = metrics.length;
    const angleStep = (Math.PI * 2) / count;
    const pointFor = (index, value) => {
        const angle = -Math.PI / 2 + index * angleStep;
        const r = radius * (value / 100);
        return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
    };
    const grid = [25, 50, 75, 100].map((level) => metrics.map((_, index) => {
        const point = pointFor(index, level);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(" "));
    const polygon = metrics.map((metric, index) => {
        const point = pointFor(index, metric.value);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(" ");

    return `
        <svg class="participant-recap-v2-radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="رسم بصمة التوقعات">
            ${grid.map((points, index) => `<polygon points="${points}" fill="${index === grid.length - 1 ? "rgba(13,28,53,.025)" : "none"}" stroke="rgba(13,28,53,.16)"></polygon>`).join("")}
            ${metrics.map((_, index) => {
                const point = pointFor(index, 100);
                return `<line x1="${center}" y1="${center}" x2="${point.x}" y2="${point.y}" stroke="rgba(13,28,53,.12)"></line>`;
            }).join("")}
            <polygon points="${polygon}" fill="rgba(21,143,131,.18)" stroke="#c9932f" stroke-width="3"></polygon>
            ${metrics.map((metric, index) => {
                const point = pointFor(index, metric.value);
                const labelPoint = pointFor(index, 118);
                return `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#18a89a" stroke="#ffffff" stroke-width="2"></circle><text x="${labelPoint.x}" y="${labelPoint.y}" fill="#0d1c35" font-size="13" font-weight="900" text-anchor="middle">${escapeHtml(metric.label)}</text><text x="${labelPoint.x}" y="${labelPoint.y + 15}" fill="#657286" font-size="11" text-anchor="middle">${metric.value}%</text>`;
            }).join("")}
        </svg>
    `;
}

function renderParticipantRecapHabit(icon, label, value, note) {
    return `<article><span>${icon}</span><div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${escapeHtml(note)}</p></div></article>`;
}

function renderParticipantRecapTeamStory(icon, label, team, value) {
    return `
        <article><span>${icon}</span><div>${team ? renderParticipantRecapFlag(team.name) : ""}<small>${escapeHtml(label)}</small><strong>${escapeHtml(team?.name || "—")}</strong><em>${escapeHtml(value)}</em></div></article>
    `;
}

function buildParticipantRecapMomentCards(model) {
    const { moments } = model;
    const cards = [];

    if (moments.bestPrediction) cards.push({
        icon: "💥",
        title: "أثقل ضربة",
        value: `${moments.bestPrediction.points} نقطة`,
        body: `${moments.bestPrediction.match.team1} ضد ${moments.bestPrediction.match.team2} · ${moments.bestPrediction.predictedScore} ثم ${moments.bestPrediction.actualScore}.`
    });
    if (moments.latestExact) cards.push({
        icon: "🎯",
        title: "آخر لقطة بالملّي",
        value: moments.latestExact.predictedScore,
        body: `${moments.latestExact.match.team1} ضد ${moments.latestExact.match.team2} · ${moments.latestExact.dateLabel}.`
    });
    if (moments.againstCrowdRows.length) cards.push({
        icon: "⚡",
        title: "حين خالفت الموجة",
        value: `${moments.againstCrowdRows.length} مرات`,
        body: "قراءات جابت نقاط بينما الاتجاه الأكثر شعبية كان في الجهة الخطأ."
    });
    if (moments.closestMiss) cards.push({
        icon: "😮‍💨",
        title: "أقرب حسرة",
        value: moments.closestMiss.predictedScore,
        body: `${moments.closestMiss.match.team1} ضد ${moments.closestMiss.match.team2} انتهت ${moments.closestMiss.actualScore}.`
    });
    if (moments.trustedTeam) cards.push({
        icon: "🤝",
        title: "أكثر منتخب وثقت به",
        value: moments.trustedTeam.name,
        body: `${moments.trustedTeam.count} توقعات بفوزه خلال المسابقة.`
    });
    if (moments.betrayedTeam) cards.push({
        icon: "💔",
        title: "أكثر منتخب خذلك",
        value: moments.betrayedTeam.name,
        body: `${moments.betrayedTeam.count} مرات لم تسر النتيجة كما توقعت.`
    });

    return cards;
}

function renderParticipantRecapFlag(teamName) {
    const code = typeof getTeamFlagCode === "function" ? getTeamFlagCode(teamName) : "un";
    if (!code || code === "un") return `<span class="participant-recap-v2-flag-fallback">⚑</span>`;
    return `<img class="participant-recap-v2-flag" src="https://flagcdn.com/24x18/${encodeURIComponent(code)}.png" crossorigin="anonymous" alt="" data-team="${escapeHtml(teamName)}" />`;
}

function compactParticipantRecapTeamName(name) {
    const replacements = {
        "الولايات المتحدة": "أمريكا",
        "كوريا الجنوبية": "كوريا",
        "البوسنة والهرسك": "البوسنة",
        "الكونغو الديمقراطية": "الكونغو",
        "جمهورية التشيك": "التشيك"
    };
    return replacements[name] || name;
}

function splitParticipantRecapLedgerColumns(rows, count) {
    const size = Math.ceil(rows.length / count);
    return Array.from({ length: count }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

function buildParticipantRecapScoreBands(rows, count) {
    const points = rows.map((row) => Number(row.points || 0));
    const min = points.length ? Math.min(...points) : 0;
    const max = points.length ? Math.max(...points) : 0;
    const width = Math.max(1, Math.ceil((max - min + 1) / count));
    return Array.from({ length: count }, (_, index) => {
        const bandMin = min + index * width;
        const bandMax = index === count - 1 ? max : bandMin + width - 1;
        return {
            min: bandMin,
            max: bandMax,
            count: points.filter((value) => value >= bandMin && value <= bandMax).length
        };
    });
}

function participantRecapAverage(values) {
    const numbers = (values || []).map(Number).filter(Number.isFinite);
    return numbers.length ? Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(1)) : 0;
}

function participantRecapMetricPercentile(value, values) {
    const numbers = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!numbers.length) return 0;
    const belowOrEqual = numbers.filter((item) => item <= Number(value || 0)).length;
    return Math.max(1, Math.min(100, Math.round((belowOrEqual / numbers.length) * 100)));
}

function buildParticipantRecapStyleTitle(row) {
    if (row.finalRank === 1) return "نَفَس البطل";
    if (row.finalRank <= 3) return "حضور المنصة";
    if (row.uniqueCorrect >= 3) return "القارئ المستقل";
    if (row.againstCrowdPoints >= 40) return "الجريء ضد الموجة";
    if (row.exactScores >= 3) return "صائد النتائج الكاملة";
    if (row.bestCorrectStreak >= 4) return "صاحب السلسلة الهادئة";
    return "المشارك الذي أكمل الحكاية";
}

function buildParticipantRecapStyleDescription(row) {
    if (row.finalRank === 1) return "الصدارة النهائية جاءت من تراكم النقاط، الثبات، والقدرة على البقاء في الصورة حتى آخر مباراة.";
    if (row.finalRank <= 3) return "الوجود على المنصة يعني أن الرحلة لم تكن لقطة عابرة، بل منافسة حافظت على قوتها حتى الختام.";
    if (row.uniqueCorrect >= 3) return "أجمل ما في الرحلة كان القدرة على رؤية بعض المباريات بطريقة لم يشاركك فيها أحد.";
    if (row.againstCrowdPoints >= 40) return "لم تكن تختار الخيار الأكثر شعبية دائماً؛ بعض أفضل نقاطك جاءت حين ذهبت في الاتجاه الآخر.";
    if (row.exactScores >= 3) return "النتيجة الكاملة كانت توقيعك الأوضح، واللحظة التي جعلت التوقع يبدو كأنه مكتوب بعد المباراة.";
    return "لم تكن الرحلة كلها انتصارات، لكنها كانت حضوراً مستمراً صنع جزءاً حقيقياً من روح المسابقة.";
}

function buildParticipantRecapPersonalQuote(row) {
    if (row.finalRank === 1) return "في النهاية، لم تكن الصدارة مجرد رقم؛ كانت حصيلة رحلة كاملة.";
    if (row.finalRank <= 3) return "الوصول إلى المنصة جميل، لكن الأجمل هو الطريق الذي بقي مفتوحاً حتى النهاية.";
    if (row.uniqueCorrect > 0) return "بعض أجمل النقاط جاءت عندما لم يكن الطريق الذي اخترته مزدحماً.";
    if (row.exactScores > 0) return "يكفي أن تأتي مباراة واحدة بالملّي لتبقى في الذاكرة طويلاً.";
    return "المسابقة انتهت، لكن كل توقع فيها ترك أثراً صغيراً في الحكاية.";
}

function formatParticipantRecapSigned(value, suffix = "") {
    const number = Number(value || 0);
    if (number > 0) return `+${number}${suffix}`;
    return `${number}${suffix}`;
}

function formatParticipantRecapDate(value) {
    if (!value) return "";
    try {
        return new Date(value).toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
    } catch (error) {
        return "";
    }
}

async function loadParticipantRecapPdfLibraries() {
    await Promise.all([
        loadParticipantRecapExternalScript(PARTICIPANT_RECAP_HTML2CANVAS_URL, "participant-recap-html2canvas"),
        loadParticipantRecapExternalScript(PARTICIPANT_RECAP_JSPDF_URL, "participant-recap-jspdf")
    ]);

    if (!window.html2canvas || !window.jspdf?.jsPDF) {
        throw new Error("تعذر تحميل محرك PDF. تحقق من الاتصال وحاول مرة أخرى.");
    }
}

function loadParticipantRecapExternalScript(src, id) {
    if (document.getElementById(id)) {
        return new Promise((resolve, reject) => {
            const existing = document.getElementById(id);
            if (existing.dataset.loaded === "true") {
                resolve();
                return;
            }
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.async = true;
        script.addEventListener("load", () => {
            script.dataset.loaded = "true";
            resolve();
        }, { once: true });
        script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.appendChild(script);
    });
}

async function waitForParticipantRecapImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    if (!images.length) return;

    await Promise.all(images.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
            const done = () => resolve();
            image.addEventListener("load", done, { once: true });
            image.addEventListener("error", () => {
                image.classList.add("participant-recap-v2-flag-broken");
                done();
            }, { once: true });
            setTimeout(done, 4500);
        });
    }));
}

async function exportParticipantRecapPdf(documentElement, fileName) {
    const { jsPDF } = window.jspdf;
    const pages = Array.from(documentElement.querySelectorAll(".participant-recap-pdf-page"));
    const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
        putOnlyUsedFonts: true
    });
    const renderScale = 1.7;

    for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const progress = 20 + Math.round(((index + 1) / pages.length) * 74);
        updateParticipantRecapPdfProgress(`نصمم الصفحة ${index + 1} من ${pages.length}...`, progress);

        const canvas = await window.html2canvas(page, {
            scale: renderScale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#07111f",
            logging: false,
            imageTimeout: 15000,
            width: 794,
            height: 1123,
            windowWidth: 794,
            windowHeight: 1123,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDocument) => {
                clonedDocument.documentElement.style.width = "794px";
                clonedDocument.body.style.width = "794px";
                clonedDocument.body.style.margin = "0";
            }
        });

        const crisp = page.classList.contains("participant-recap-pdf-page-crisp");
        const imageType = crisp ? "PNG" : "JPEG";
        const image = crisp ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.93);
        if (index > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(image, imageType, 0, 0, 210, 297, undefined, crisp ? "NONE" : "FAST");

        canvas.width = 1;
        canvas.height = 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    pdf.setProperties({
        title: `كتاب رحلة ${currentParticipant?.name || "المشارك"} في مسابقة توقعات كأس العالم 2026`,
        subject: "كتاب شخصي لتحليل رحلة المشارك ومقارنتها بجميع المشاركين",
        author: "مسابقة توقعات كأس العالم 2026",
        creator: `World Cup Project v${APP_VERSION}`
    });

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function sanitizeParticipantRecapFileName(value) {
    return String(value || "participant")
        .trim()
        .replace(/[\\/:*?"<>|%#{}]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

function showParticipantRecapPdfProgress(message, progress = 0) {
    let overlay = document.getElementById("participantRecapPdfProgressOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "participantRecapPdfProgressOverlay";
        overlay.className = "participant-recap-pdf-progress-overlay";
        overlay.innerHTML = `
            <div class="participant-recap-pdf-progress-card">
                <div class="participant-recap-pdf-progress-icon">📖</div>
                <p class="eyebrow">كتاب الرحلة</p>
                <h3 id="participantRecapPdfProgressMessage">جاري التجهيز...</h3>
                <div class="participant-recap-pdf-progress-track"><span id="participantRecapPdfProgressBar"></span></div>
                <small>يُنشأ الكتاب صفحة بصفحة حتى يبقى آمناً على الجوال والكمبيوتر.</small>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.classList.remove("participant-recap-pdf-progress-success", "participant-recap-pdf-progress-error");
    updateParticipantRecapPdfProgress(message, progress);
}

function updateParticipantRecapPdfProgress(message, progress = 0, isComplete = false) {
    const overlay = document.getElementById("participantRecapPdfProgressOverlay");
    const messageElement = document.getElementById("participantRecapPdfProgressMessage");
    const bar = document.getElementById("participantRecapPdfProgressBar");
    if (!overlay) return;

    if (messageElement) messageElement.textContent = message;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;

    if (isComplete) {
        overlay.classList.add("participant-recap-pdf-progress-success");
        setTimeout(() => overlay.remove(), 1800);
    }
}

function showParticipantRecapPdfError(message) {
    let overlay = document.getElementById("participantRecapPdfProgressOverlay");
    if (!overlay) {
        showParticipantRecapPdfProgress(message, 0);
        overlay = document.getElementById("participantRecapPdfProgressOverlay");
    }
    overlay?.classList.add("participant-recap-pdf-progress-error");
    const messageElement = document.getElementById("participantRecapPdfProgressMessage");
    if (messageElement) messageElement.textContent = message;
    const icon = overlay?.querySelector(".participant-recap-pdf-progress-icon");
    if (icon) icon.textContent = "⚠️";
    setTimeout(() => overlay?.remove(), 4200);
}

/* ==============================================================
   V39.2.0 - Personal Memory Book redesign
   The previous PDF page system is intentionally superseded below.
   Reliable calculations are retained; all layouts are rebuilt.
   ============================================================== */

const PARTICIPANT_RECAP_QRCODE_URL = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
const PARTICIPANT_RECAP_MAX_HIGHLIGHTS_PER_PAGE = 6;
const PARTICIPANT_RECAP_BADGES_PER_PAGE = 12;
const PARTICIPANT_RECAP_LEDGER_MATCHES_PER_PAGE = 52;

function buildParticipantRecapPdfModel(participant, finalRow, recap, profilePost = null, highlightPosts = []) {
    const visual = getParticipantVisual(participant.name);
    const badges = buildCalculatedParticipantBadges(finalRow);
    const predictionRows = buildParticipantRecapPredictionRows(participant, recap);
    const stageSummaries = buildParticipantRecapStageSummaries(predictionRows, recap);
    const comparison = buildParticipantRecapComparison(finalRow, recap.finalRows || [], recap.seasonStats || {});
    const collective = buildParticipantRecapCollectiveAnalysis(finalRow, recap, predictionRows);
    const dna = buildParticipantRecapPredictionDna(finalRow, recap.finalRows || [], predictionRows, comparison);
    const teamAnalysis = buildParticipantRecapTeamAnalysis(predictionRows);
    const journey = buildParticipantRecapJourneyInsights(finalRow);
    const moments = buildParticipantRecapMoments(finalRow, predictionRows, recap, journey);
    const highlights = buildParticipantRecapHighlights(highlightPosts, recap);
    const profileStory = profilePost?.body_ar || buildLocalProfileClosingText(
        participant,
        {
            totalPoints: finalRow.points,
            totalPredictions: finalRow.predictions,
            exactScores: finalRow.exactScores,
            bestStage: stageSummaries.find((stage) => stage.isBest)?.label || "رحلة كاملة"
        },
        finalRow,
        badges
    );
    const publicUrl = resolveParticipantRecapPublicUrl();

    const model = {
        participant,
        finalRow,
        recap,
        visual,
        badges,
        predictionRows,
        stageSummaries,
        comparison,
        collective,
        dna,
        teamAnalysis,
        journey,
        moments,
        highlights,
        profileStory,
        publicUrl,
        generatedAt: new Date()
    };

    model.personality = buildParticipantRecapPersonality(model);
    model.personalHighlights = buildParticipantRecapPersonalHighlights(model);
    return model;
}

function buildParticipantRecapStageSummaries(rows = [], recap = {}) {
    const stages = new Map();
    const fieldStageMap = new Map((recap.stageFacts || []).map((row) => [row.stage, row]));

    rows.forEach((row) => {
        if (!stages.has(row.stage)) {
            stages.set(row.stage, {
                stage: row.stage,
                label: row.stageLabel,
                matches: 0,
                predictions: 0,
                points: 0,
                correct: 0,
                exact: 0
            });
        }
        const stage = stages.get(row.stage);
        stage.matches += 1;
        if (row.submitted) stage.predictions += 1;
        stage.points += Number(row.points || 0);
        if (row.correct) stage.correct += 1;
        if (row.exact) stage.exact += 1;
    });

    const summaries = [...stages.values()].map((stage) => {
        const field = fieldStageMap.get(stage.stage) || {};
        const coverage = stage.matches ? (stage.predictions / stage.matches) * 100 : 0;
        const pointsPerMatch = stage.matches ? stage.points / stage.matches : 0;
        const pointsPerPrediction = stage.predictions ? stage.points / stage.predictions : 0;
        const fieldAveragePoints = Number(field.averagePoints || 0);
        const relativeIndex = fieldAveragePoints > 0 ? pointsPerMatch / fieldAveragePoints : (pointsPerMatch > 0 ? 1.5 : 0);
        const sampleWeight = 0.78 + (0.22 * Math.min(1, stage.matches / 5));
        const coverageWeight = 0.86 + (0.14 * (coverage / 100));
        const performanceScore = Number((relativeIndex * sampleWeight * coverageWeight).toFixed(3));

        return {
            ...stage,
            accuracy: stage.predictions ? Number(((stage.correct / stage.predictions) * 100).toFixed(1)) : 0,
            coverage: Number(coverage.toFixed(1)),
            pointsPerMatch: Number(pointsPerMatch.toFixed(2)),
            pointsPerPrediction: Number(pointsPerPrediction.toFixed(2)),
            fieldAveragePoints,
            fieldAccuracy: Number(field.accuracyPercent || 0),
            performanceScore,
            relativeToField: fieldAveragePoints > 0
                ? Number((((pointsPerMatch - fieldAveragePoints) / fieldAveragePoints) * 100).toFixed(0))
                : 0,
            color: PARTICIPANT_RECAP_STAGE_COLORS[stage.stage] || "#7c8aa5",
            isBest: false
        };
    }).sort((a, b) => (
        PARTICIPANT_RECAP_STAGE_ORDER.indexOf(a.stage) - PARTICIPANT_RECAP_STAGE_ORDER.indexOf(b.stage)
    ));

    const bestStage = [...summaries].sort((a, b) => (
        b.performanceScore - a.performanceScore ||
        b.pointsPerMatch - a.pointsPerMatch ||
        b.points - a.points
    ))[0];

    if (bestStage) {
        const target = summaries.find((stage) => stage.stage === bestStage.stage);
        if (target) target.isBest = true;
    }

    return summaries;
}

function buildParticipantRecapTeamAnalysis(predictionRows) {
    const teams = new Map();

    predictionRows.forEach((row) => {
        [row.match.team1, row.match.team2].forEach((team) => {
            if (!teams.has(team)) {
                teams.set(team, {
                    name: team,
                    matches: 0,
                    submitted: 0,
                    points: 0,
                    exact: 0,
                    correct: 0,
                    misses: 0,
                    scoreError: 0,
                    trustedWins: 0,
                    againstCrowdPoints: 0
                });
            }

            const teamRow = teams.get(team);
            teamRow.matches += 1;
            if (!row.submitted) return;

            teamRow.submitted += 1;
            teamRow.points += Number(row.points || 0);
            teamRow.scoreError += Number(row.scoreError || 0);
            if (row.exact) teamRow.exact += 1;
            if (row.correct) teamRow.correct += 1;
            if (!row.correct) teamRow.misses += 1;
            if (row.againstCrowd) teamRow.againstCrowdPoints += Number(row.points || 0);
            if (
                (row.predictionOutcome === "team1" && row.match.team1 === team) ||
                (row.predictionOutcome === "team2" && row.match.team2 === team)
            ) {
                teamRow.trustedWins += 1;
            }
        });
    });

    const rows = [...teams.values()].map((team) => ({
        ...team,
        averageError: team.submitted ? Number((team.scoreError / team.submitted).toFixed(1)) : 0,
        readingRate: team.submitted ? Number(((team.correct / team.submitted) * 100).toFixed(0)) : 0,
        pointsPerMatch: team.matches ? Number((team.points / team.matches).toFixed(1)) : 0
    }));

    const eligibleForRate = rows.filter((team) => team.submitted >= 2);

    return {
        bestPointsTeam: [...rows].sort((a, b) => b.points - a.points || b.exact - a.exact)[0] || null,
        mostTrustedTeam: [...rows].sort((a, b) => b.trustedWins - a.trustedWins || b.matches - a.matches)[0] || null,
        hardestTeam: [...rows].sort((a, b) => b.misses - a.misses || b.averageError - a.averageError)[0] || null,
        mostPreciseTeam: [...eligibleForRate].sort((a, b) => a.averageError - b.averageError || b.exact - a.exact)[0] || null,
        exactHeroTeam: [...rows].sort((a, b) => b.exact - a.exact || b.points - a.points)[0] || null,
        mostReadableTeam: [...eligibleForRate].sort((a, b) => b.readingRate - a.readingRate || b.points - a.points)[0] || null,
        braveTeam: [...rows].sort((a, b) => b.againstCrowdPoints - a.againstCrowdPoints || b.points - a.points)[0] || null,
        mostSeenTeam: [...rows].sort((a, b) => b.matches - a.matches || b.submitted - a.submitted)[0] || null,
        rows
    };
}

function buildParticipantRecapJourneyInsights(row) {
    const ranks = (row.ranks || []).map(Number).filter(Number.isFinite);
    const firstRank = Number(row.firstRank || ranks[0] || row.finalRank || 0);
    const finalRank = Number(row.finalRank || ranks[ranks.length - 1] || firstRank);
    const bestRank = ranks.length ? Math.min(...ranks) : finalRank;
    const worstRank = ranks.length ? Math.max(...ranks) : finalRank;
    let biggestRise = 0;
    let biggestDrop = 0;
    let longestTop3Run = 0;
    let currentTop3Run = 0;
    let longestCalmRun = 1;
    let currentCalmRun = 1;

    for (let index = 1; index < ranks.length; index += 1) {
        const change = ranks[index - 1] - ranks[index];
        biggestRise = Math.max(biggestRise, change);
        biggestDrop = Math.max(biggestDrop, -change);
        if (Math.abs(change) <= 1) currentCalmRun += 1;
        else currentCalmRun = 1;
        longestCalmRun = Math.max(longestCalmRun, currentCalmRun);
    }

    ranks.forEach((rank) => {
        if (rank <= 3) currentTop3Run += 1;
        else currentTop3Run = 0;
        longestTop3Run = Math.max(longestTop3Run, currentTop3Run);
    });

    return {
        firstRank,
        finalRank,
        bestRank,
        worstRank,
        netMovement: firstRank - finalRank,
        biggestRise,
        biggestDrop,
        longestTop3Run,
        longestCalmRun,
        appearancesInFirst: Number(row.appearancesInFirst || 0),
        appearancesInTop3: Number(row.appearancesInTop3 || 0),
        bestFiveMatchSpan: Number(row.bestFiveMatchSpan || 0)
    };
}

function buildParticipantRecapMoments(row, predictionRows = [], recap, journey = null) {
    const scoredRows = predictionRows.filter((item) => item.points > 0);
    const exactRows = predictionRows.filter((item) => item.exact);
    const againstCrowdRows = predictionRows.filter((item) => item.againstCrowd);
    const closestMiss = predictionRows
        .filter((item) => item.submitted && !item.correct)
        .sort((a, b) => Number(a.scoreError || 999) - Number(b.scoreError || 999) || new Date(b.match.kickoff_at) - new Date(a.match.kickoff_at))[0] || null;
    const bestPrediction = [...scoredRows].sort((a, b) => b.points - a.points || new Date(b.match.kickoff_at) - new Date(a.match.kickoff_at))[0] || null;
    const latestExact = [...exactRows].sort((a, b) => new Date(b.match.kickoff_at) - new Date(a.match.kickoff_at))[0] || null;
    const byDay = new Map();

    predictionRows.forEach((item) => {
        const key = String(item.match.kickoff_at || "").slice(0, 10) || item.dateLabel;
        if (!byDay.has(key)) byDay.set(key, { key, points: 0, exact: 0, correct: 0, matches: [] });
        const day = byDay.get(key);
        day.points += Number(item.points || 0);
        if (item.exact) day.exact += 1;
        if (item.correct) day.correct += 1;
        day.matches.push(item);
    });

    const bestDay = [...byDay.values()].sort((a, b) => b.points - a.points || b.exact - a.exact)[0] || null;

    return {
        bestPrediction,
        latestExact,
        closestMiss,
        againstCrowdRows,
        bestDay,
        journey: journey || buildParticipantRecapJourneyInsights(row),
        topTeam: row.favoriteTeam || null,
        trustedTeam: row.mostTrustedTeam || null,
        betrayedTeam: row.teamBetrayed || null,
        championPredictionTeam: row.championPredictionTeam || null,
        championPredictionPoints: Number(row.championPredictionPoints || 0),
        podium: (recap.finalRows || []).slice(0, 3),
        longestStreak: Number(row.bestCorrectStreak || 0),
        bestFiveMatchSpan: Number(row.bestFiveMatchSpan || 0)
    };
}

function buildParticipantRecapHighlights(posts = [], recap) {
    const completedMatchIds = new Set((recap.completedMatches || []).map((match) => String(match.id)));
    const safePosts = (posts || []).filter((post) => {
        const card = Array.isArray(post.cards) ? post.cards[0] || {} : {};
        const matchId = String(card.source_match_id || "").trim();
        return !matchId || completedMatchIds.has(matchId);
    });
    const sortedPosts = typeof sortFinalAiHighlightPosts === "function"
        ? sortFinalAiHighlightPosts(safePosts, recap)
        : safePosts;
    const highlights = sortedPosts.slice(0, 24).map((post) => ({
        icon: post.icon || "✨",
        title: post.title_ar || "لقطة من البطولة",
        subtitle: post.subtitle_ar || post.cards?.[0]?.stage_ar || "من ذاكرة البطولة",
        body: post.body_ar || "",
        displayOrder: Number(post.display_order || 0),
        participantId: post.participant_id || null
    }));

    if (highlights.length) return highlights;

    return buildFinalHighlightCards(recap).slice(0, 18).map((card) => ({
        icon: card.icon || "✨",
        title: card.title,
        subtitle: "لقطة محسوبة",
        body: card.description,
        displayOrder: 0,
        participantId: null
    }));
}

function buildParticipantRecapPersonality(model) {
    const actualGoals = model.predictionRows.reduce((sum, row) => (
        sum + Number(row.match.actual_team1_goals || 0) + Number(row.match.actual_team2_goals || 0)
    ), 0);
    const actualAverageGoals = model.predictionRows.length
        ? Number((actualGoals / model.predictionRows.length).toFixed(2))
        : 0;
    const goalDifference = Number((model.dna.averagePredictedGoals - actualAverageGoals).toFixed(2));
    const crowdTitle = model.dna.crowdFollowRate >= 68
        ? "قريب من نبض المجموعة"
        : model.dna.crowdFollowRate <= 42
            ? "قارئ مستقل"
            : "متوازن بين الرأي والحدس";
    const goalTitle = goalDifference >= 0.45
        ? "يحب المباريات المفتوحة"
        : goalDifference <= -0.45
            ? "حذر في عدد الأهداف"
            : "واقعي في توقع الأهداف";
    const drawTitle = model.dna.drawRate >= model.dna.fieldDrawRate + 5
        ? "صديق التعادل"
        : model.dna.drawRate <= Math.max(0, model.dna.fieldDrawRate - 5)
            ? "يبحث عن فائز"
            : "تعادلاته محسوبة";

    return {
        title: buildParticipantRecapStyleTitle(model.finalRow),
        crowdTitle,
        goalTitle,
        drawTitle,
        actualAverageGoals,
        goalDifference,
        exactEvery: model.finalRow.exactScores > 0
            ? Math.max(1, Math.round(model.finalRow.predictions / model.finalRow.exactScores))
            : null,
        scoredOutOfTen: model.finalRow.predictions
            ? Math.round((model.finalRow.correctPredictions / model.finalRow.predictions) * 10)
            : 0,
        independentCount: Math.round((model.dna.uniquePredictionRate / 100) * Math.max(1, model.finalRow.predictions)),
        crowdCount: Math.round((model.dna.crowdFollowRate / 100) * Math.max(1, model.finalRow.predictions))
    };
}

function buildParticipantRecapPersonalHighlights(model) {
    const cards = [];
    const moments = model.moments;

    if (moments.bestPrediction) cards.push({
        icon: "💥",
        title: "ضربتك الأثقل",
        subtitle: "من رحلتك الشخصية",
        body: `${moments.bestPrediction.points} نقطة من ${moments.bestPrediction.match.team1} × ${moments.bestPrediction.match.team2}؛ توقعت ${moments.bestPrediction.predictedScore} وانتهت ${moments.bestPrediction.actualScore}.`,
        personal: true
    });
    if (moments.latestExact) cards.push({
        icon: "🎯",
        title: "آخر مرة جاءت بالملّي",
        subtitle: "لحظة بقيت في الذاكرة",
        body: `${moments.latestExact.match.team1} × ${moments.latestExact.match.team2} — ${moments.latestExact.actualScore}.`,
        personal: true
    });
    if (moments.againstCrowdRows.length) cards.push({
        icon: "⚡",
        title: "عندما ذهبت وحدك",
        subtitle: "قراءة ضد الاتجاه العام",
        body: `${moments.againstCrowdRows.length} توقعات جابت نقاطاً بينما كانت الأغلبية في اتجاه آخر.`,
        personal: true
    });
    if (model.teamAnalysis.bestPointsTeam) cards.push({
        icon: "🏳️",
        title: `${model.teamAnalysis.bestPointsTeam.name} كان كريماً معك`,
        subtitle: "منتخب صنع جزءاً من رصيدك",
        body: `${model.teamAnalysis.bestPointsTeam.points} نقطة جاءت من مبارياته خلال الرحلة.`,
        personal: true
    });
    if (moments.bestDay) cards.push({
        icon: "🌟",
        title: "يومك الأقوى",
        subtitle: "دفعة واحدة غيرت المزاج",
        body: `${moments.bestDay.points} نقطة في يوم واحد، بينها ${moments.bestDay.exact} نتائج بالملّي.`,
        personal: true
    });
    if (model.journey.biggestRise > 0) cards.push({
        icon: "🚀",
        title: "قفزتك الأجمل",
        subtitle: "حركة في جدول الترتيب",
        body: `تقدمت ${model.journey.biggestRise} مراكز دفعة واحدة في إحدى محطات المسابقة.`,
        personal: true
    });

    return cards.slice(0, 6);
}

function resolveParticipantRecapPublicUrl() {
    const configured = String(window.WORLD_CUP_PUBLIC_URL || "").trim();
    if (configured) return configured.replace(/\/$/, "");

    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (canonical && /^https?:\/\//i.test(canonical)) return canonical.replace(/\/$/, "");

    try {
        const url = new URL(window.location.href);
        const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
        if (url.protocol === "file:" || localHosts.has(url.hostname)) return "";
        url.search = "";
        url.hash = "";
        url.pathname = url.pathname.replace(/\/[^/]*$/, "/");
        return url.toString().replace(/\/$/, "");
    } catch (error) {
        return "";
    }
}

function buildParticipantRecapPdfPages(model) {
    const pages = [
        { className: "participant-recap-page-cover memory-book-page-light memory-book-page-cover", html: renderParticipantMemoryCoverPage(model) },
        { className: "memory-book-page-light memory-book-page-overview", html: renderParticipantMemoryOverviewPage(model) },
        { className: "memory-book-page-light memory-book-page-journey", html: renderParticipantMemoryJourneyPage(model) },
        { className: "memory-book-page-light memory-book-page-stages", html: renderParticipantMemoryStagesPage(model) },
        { className: "memory-book-page-light memory-book-page-map", html: renderParticipantMemoryCompetitionMapPage(model) },
        { className: "memory-book-page-light memory-book-page-fingerprint", html: renderParticipantMemoryFingerprintPage(model) },
        { className: "memory-book-page-light memory-book-page-personality", html: renderParticipantMemoryPersonalityPage(model) },
        { className: "memory-book-page-light memory-book-page-teams", html: renderParticipantMemoryTeamsPage(model) },
        { className: "memory-book-page-light memory-book-page-moments", html: renderParticipantMemoryMomentsPage(model) }
    ];

    const badgeChunks = chunkParticipantRecapItems(model.badges, PARTICIPANT_RECAP_BADGES_PER_PAGE);
    (badgeChunks.length ? badgeChunks : [[]]).forEach((badges, index) => {
        pages.push({
            className: `memory-book-page-light memory-book-page-badges memory-book-badge-count-${badges.length}`,
            html: renderParticipantMemoryBadgesPage(model, badges, index + 1, Math.max(1, badgeChunks.length))
        });
    });

    pages.push(
        { className: "memory-book-page-light memory-book-page-collective", html: renderParticipantMemoryCollectivePage(model) },
        { className: "memory-book-page-light memory-book-page-leaderboard", html: renderParticipantMemoryLeaderboardPage(model) }
    );

    const ledgerChunks = chunkParticipantRecapItems(model.predictionRows, PARTICIPANT_RECAP_LEDGER_MATCHES_PER_PAGE);
    ledgerChunks.slice(0, 2).forEach((rows, index) => {
        pages.push({
            className: "memory-book-page-ledger memory-book-page-light participant-recap-pdf-page-crisp",
            html: renderParticipantMemoryLedgerPage(model, rows, index + 1, ledgerChunks.length)
        });
    });

    const allHighlights = [...model.personalHighlights, ...model.highlights]
        .filter((highlight, index, rows) => rows.findIndex((item) => (
            item.title === highlight.title && item.body === highlight.body
        )) === index)
        .slice(0, 30);
    const highlightChunks = chunkParticipantRecapItems(allHighlights, PARTICIPANT_RECAP_MAX_HIGHLIGHTS_PER_PAGE);
    (highlightChunks.length ? highlightChunks : [[]]).forEach((highlights, index) => {
        pages.push({
            className: "memory-book-page-light memory-book-page-highlights",
            html: renderParticipantMemoryHighlightsPage(model, highlights, index + 1, Math.max(1, highlightChunks.length))
        });
    });

    pages.push({ className: "participant-recap-page-closing memory-book-page-light memory-book-page-closing", html: renderParticipantMemoryClosingPage(model) });
    return pages;
}

function renderParticipantRecapPdfPage(content, pageNumber, totalPages, className = "") {
    return `
        <section class="participant-recap-pdf-page memory-book-page ${className}">
            <div class="participant-recap-page-decoration participant-recap-page-decoration-one"></div>
            <div class="participant-recap-page-decoration participant-recap-page-decoration-two"></div>
            <div class="participant-recap-page-content">${content}</div>
            <footer class="participant-recap-pdf-footer memory-book-footer">
                <span>World Cup Prediction Contest · 2026</span>
                <strong>${pageNumber} / ${totalPages}</strong>
            </footer>
        </section>
    `;
}

function renderParticipantMemoryHeading(title, subtitle = "", label = "WORLD CUP PREDICTION CONTEST") {
    return `
        <header class="memory-book-heading">
            <div>
                <small>${escapeHtml(label)}</small>
                <h1>${escapeHtml(title)}</h1>
            </div>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </header>
    `;
}

function renderParticipantMemoryCoverPage(model) {
    const podium = (model.recap.finalRows || []).slice(0, 3);
    return `
        <div class="memory-cover-topline">
            <span>WORLD CUP PREDICTION CONTEST</span>
            <small>2026 · كتاب تذكاري شخصي</small>
        </div>
        <div class="memory-cover-main">
            <div class="memory-cover-emblem" style="--recap-accent:${model.visual.color}">${escapeHtml(model.visual.icon)}</div>
            <p class="memory-cover-kicker">كتاب رحلة</p>
            <h1>${escapeHtml(model.participant.name)}</h1>
            <h2>في مسابقة توقعات كأس العالم</h2>
            <div class="memory-cover-scoreline">
                <span><small>المركز النهائي</small><strong>#${model.finalRow.finalRank}</strong></span>
                <span><small>الرصيد</small><strong>${model.finalRow.points}</strong><em>نقطة</em></span>
            </div>
            <p class="memory-cover-intro">
                شهر كامل من التوقعات، الثقة، المفاجآت، والنتائج التي جاءت أحياناً بالملّي وأحياناً ضاعت في آخر لحظة. هذا الكتاب يحتفظ بما صنعته في الطريق، لا بالنتيجة الأخيرة فقط.
            </p>
            <div class="memory-cover-story">${escapeHtml(buildParticipantRecapCoverLine(model.finalRow))}</div>
        </div>
        <div class="memory-cover-bottom">
            <div class="memory-cover-stat-row">
                <span><strong>${model.finalRow.predictions}</strong><small>توقع</small></span>
                <span><strong>${model.finalRow.correctPredictions}</strong><small>جاب نقاط</small></span>
                <span><strong>${model.finalRow.exactScores}</strong><small>بالملّي</small></span>
                <span><strong>${model.finalRow.accuracyPercent}%</strong><small>دقة</small></span>
            </div>
            <p>${podium.map((row, index) => `${["🥇", "🥈", "🥉"][index]} ${escapeHtml(row.name)}`).join("  ·  ")}</p>
        </div>
    `;
}

function renderParticipantMemoryOverviewPage(model) {
    const composition = [
        { label: "بالملّي", value: model.collective.statusCounts.exact, color: "#c9932f" },
        { label: "اتجاه صحيح", value: model.collective.statusCounts.correct, color: "#158f83" },
        { label: "بدون نقاط", value: model.collective.statusCounts.zero, color: "#76839a" },
        { label: "بدون توقع", value: model.collective.statusCounts.missing, color: "#a64961" }
    ];
    const bestStage = model.stageSummaries.find((stage) => stage.isBest) || model.stageSummaries[0];
    const championCopy = buildParticipantMemoryChampionPredictionCopy(model);

    return `
        ${renderParticipantMemoryHeading("نظرة عامة على رحلتك", "أهم ملامح الشهر في قراءة سريعة وواضحة")}
        <div class="memory-overview-hero" style="--recap-accent:${model.visual.color}">
            <div class="memory-overview-avatar">${escapeHtml(model.visual.icon)}</div>
            <div><small>الهوية التي ظهرت في توقعاتك</small><h2>${escapeHtml(model.personality.title)}</h2><p>${escapeHtml(buildParticipantRecapStyleDescription(model.finalRow))}</p></div>
            <div class="memory-overview-rank"><small>المركز</small><strong>#${model.finalRow.finalRank}</strong></div>
        </div>
        <div class="memory-overview-grid">
            <section class="memory-chart-card">
                <h3>كيف توزعت توقعاتك؟</h3>
                ${buildParticipantRecapDonutChart(composition, model.predictionRows.length)}
                <div class="memory-donut-legend">${composition.map((item) => `<span><i style="background:${item.color}"></i><b>${item.value}</b><small>${item.label}</small></span>`).join("")}</div>
            </section>
            <section class="memory-overview-stats">
                <div><small>النقاط</small><strong>${model.finalRow.points}</strong><span>${formatParticipantRecapSigned(model.comparison.pointsDifference)} عن المتوسط</span></div>
                <div><small>الدقة</small><strong>${model.finalRow.accuracyPercent}%</strong><span>${model.personality.scoredOutOfTen} من كل 10 توقعات تقريباً جابت نقاط</span></div>
                <div><small>أطول سلسلة</small><strong>${model.finalRow.bestCorrectStreak || 0}</strong><span>توقعات متتالية بالنقاط</span></div>
                <div><small>أفضل مرحلة</small><strong>${escapeHtml(bestStage?.label || "—")}</strong><span>${bestStage ? `${bestStage.points} نقطة · ${bestStage.relativeToField >= 0 ? "+" : ""}${bestStage.relativeToField}% أمام متوسط المجموعة` : ""}</span></div>
            </section>
        </div>
        <div class="memory-champion-card ${championCopy.statusClass}">
            <div>${renderParticipantRecapFlag(model.moments.championPredictionTeam || "")}</div>
            <div><small>توقع بطل كأس العالم</small><h3>${escapeHtml(championCopy.title)}</h3><p>${escapeHtml(championCopy.body)}</p></div>
            <strong>${championCopy.points}<span>نقطة</span></strong>
        </div>
    `;
}

function renderParticipantMemoryJourneyPage(model) {
    const journey = model.journey;
    const movementText = journey.netMovement > 0 ? `صعود ${journey.netMovement}` : journey.netMovement < 0 ? `نزول ${Math.abs(journey.netMovement)}` : "نهاية عند نقطة البداية";
    return `
        ${renderParticipantMemoryHeading("رحلتك", "كيف تحرك اسمك في الجدول من أول مباراة حتى آخر صافرة")}
        <div class="memory-rank-chart-card">${buildParticipantRecapRankChart(model.finalRow.ranks || [], model.recap.seasonStats?.participantCount || 1)}</div>
        <div class="memory-journey-metrics">
            <article><span>🚩</span><small>البداية</small><strong>#${journey.firstRank}</strong><p>المركز الذي بدأت منه الرحلة.</p></article>
            <article><span>🌟</span><small>أفضل ظهور</small><strong>#${journey.bestRank}</strong><p>${journey.appearancesInFirst ? `ظهرت في الصدارة ${journey.appearancesInFirst} مرة.` : "أقرب نقطة وصلت إليها في الجدول."}</p></article>
            <article><span>🚀</span><small>أكبر قفزة</small><strong>${journey.biggestRise || 0}</strong><p>مراكز تقدمتها دفعة واحدة.</p></article>
            <article><span>🏁</span><small>النهاية</small><strong>#${journey.finalRank}</strong><p>${movementText} مقارنة بالبداية.</p></article>
            <article><span>🔥</span><small>داخل الثلاثة</small><strong>${journey.appearancesInTop3}</strong><p>مرة ظهر فيها اسمك ضمن المنصة المؤقتة.</p></article>
            <article><span>🌊</span><small>أطول هدوء</small><strong>${journey.longestCalmRun}</strong><p>محطات متتالية دون حركة كبيرة في المركز.</p></article>
        </div>
        <div class="memory-journey-quote">${escapeHtml(buildParticipantMemoryJourneyLine(model))}</div>
    `;
}

function renderParticipantMemoryStagesPage(model) {
    const bestStage = model.stageSummaries.find((stage) => stage.isBest);
    const maxPointsPerMatch = Math.max(1, ...model.stageSummaries.map((stage) => Math.max(stage.pointsPerMatch, stage.fieldAveragePoints)));
    return `
        ${renderParticipantMemoryHeading("مرحلة بمرحلة", "كل دور كان له مزاجه؛ هنا يظهر أين تألقت وأين كانت المباريات أعند")}
        ${bestStage ? `<div class="memory-best-stage"><span>✨</span><div><small>مرحلتك الذهبية</small><h2>${escapeHtml(bestStage.label)}</h2><p>${bestStage.points} نقطة بمعدل ${bestStage.pointsPerMatch} للمباراة، بعد موازنة الأداء مع عدد مباريات المرحلة ومتوسط الجميع.</p></div></div>` : ""}
        <div class="memory-stage-list">
            ${model.stageSummaries.map((stage) => {
                const personalWidth = Math.max(3, (stage.pointsPerMatch / maxPointsPerMatch) * 100);
                const fieldWidth = Math.max(3, (stage.fieldAveragePoints / maxPointsPerMatch) * 100);
                return `
                    <article class="${stage.isBest ? "is-best" : ""}" style="--stage-color:${stage.color}">
                        <div class="memory-stage-title"><i></i><div><strong>${escapeHtml(stage.label)}</strong><small>${stage.matches} مباراة · ${stage.predictions} توقع مسجل</small></div></div>
                        <div class="memory-stage-bars">
                            <span><small>أنت</small><b><i style="width:${personalWidth}%"></i></b><em>${stage.pointsPerMatch}</em></span>
                            <span class="field"><small>الجميع</small><b><i style="width:${fieldWidth}%"></i></b><em>${stage.fieldAveragePoints}</em></span>
                        </div>
                        <div class="memory-stage-numbers"><span><b>${stage.points}</b> نقطة</span><span><b>${stage.accuracy}%</b> دقة</span><span><b>${stage.exact}</b> بالملّي</span><span class="${stage.relativeToField >= 0 ? "positive" : "negative"}">${stage.relativeToField >= 0 ? "+" : ""}${stage.relativeToField}% مقابل المتوسط</span></div>
                    </article>
                `;
            }).join("")}
        </div>
    `;
}

function renderParticipantMemoryCompetitionMapPage(model) {
    const peopleBeatenPoints = Math.max(0, (model.recap.finalRows || []).filter((row) => Number(row.points || 0) < Number(model.finalRow.points || 0)).length);
    const peopleBeatenAccuracy = Math.max(0, (model.recap.finalRows || []).filter((row) => Number(row.accuracyPercent || 0) < Number(model.finalRow.accuracyPercent || 0)).length);
    return `
        ${renderParticipantMemoryHeading("أنت بين الجميع", "خريطة بسيطة توضح مكانك في المنافسة ومن كان الأقرب إليك")}
        <div class="memory-competition-map">
            <section class="memory-scatter-card"><h3>خريطة المنافسة</h3><p>كل دائرة مشارك؛ كلما ارتفعت زادت النقاط، وكلما اتجهت يميناً ارتفعت الدقة.</p>${buildParticipantRecapScatterChart(model.recap.finalRows || [], model.participant.id)}</section>
            <section class="memory-competition-facts">
                <article><span>👥</span><small>تفوقت بالنقاط على</small><strong>${peopleBeatenPoints}</strong><p>من أصل ${model.recap.finalRows.length} مشاركاً.</p></article>
                <article><span>🧠</span><small>تفوقت بالدقة على</small><strong>${peopleBeatenAccuracy}</strong><p>مشاركين قرأت نتائج أكثر منهم.</p></article>
                <article><span>🤏</span><small>أقرب منافس</small><strong>${escapeHtml(model.comparison.closestRival?.name || "—")}</strong><p>${model.comparison.closestRival ? `الفارق ${model.comparison.closestRival.gap} نقطة فقط.` : "لا توجد مقارنة كافية."}</p></article>
                <article><span>🏆</span><small>${model.finalRow.finalRank <= 3 ? "أنت على المنصة" : "الفارق عن المنصة"}</small><strong>${model.comparison.gapToPodium}</strong><p>${model.finalRow.finalRank <= 3 ? "مكانك النهائي بين الثلاثة الأوائل." : "نقطة كانت تفصلك عن المركز الثالث."}</p></article>
            </section>
        </div>
        <div class="memory-neighbors">
            <span><small>فوقك مباشرة</small><strong>${model.comparison.personAbove ? `#${model.comparison.personAbove.finalRank} ${escapeHtml(model.comparison.personAbove.name)}` : "لا أحد — أنت في الصدارة"}</strong><em>${model.comparison.personAbove ? `${model.comparison.personAbove.points} نقطة` : ""}</em></span>
            <span><small>موقعك النهائي</small><strong>#${model.finalRow.finalRank} ${escapeHtml(model.participant.name)}</strong><em>${model.finalRow.points} نقطة</em></span>
            <span><small>خلفك مباشرة</small><strong>${model.comparison.personBelow ? `#${model.comparison.personBelow.finalRank} ${escapeHtml(model.comparison.personBelow.name)}` : "لا أحد"}</strong><em>${model.comparison.personBelow ? `${model.comparison.personBelow.points} نقطة` : ""}</em></span>
        </div>
    `;
}

function renderParticipantMemoryFingerprintPage(model) {
    const dimensionNotes = buildParticipantMemoryDimensionNotes(model);
    return `
        ${renderParticipantMemoryHeading("بصمتك الخماسية", "خمسة جوانب ترسم أسلوبك كما ظهر أمام بقية المشاركين")}
        <div class="memory-fingerprint-layout">
            <section class="memory-radar-card">${buildParticipantRecapRadarChart(model.dna.metrics)}</section>
            <section class="memory-fingerprint-copy"><span class="memory-style-label">أسلوبك</span><h2>${escapeHtml(model.personality.title)}</h2><p>${escapeHtml(buildParticipantRecapPersonalQuote(model.finalRow))}</p></section>
        </div>
        <div class="memory-dimension-grid">
            ${dimensionNotes.map((item) => `<article><span>${item.icon}</span><div><small>${escapeHtml(item.label)}</small><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.note)}</p></div></article>`).join("")}
        </div>
    `;
}

function renderParticipantMemoryPersonalityPage(model) {
    const p = model.personality;
    return `
        ${renderParticipantMemoryHeading("شخصيتك في التوقعات", "تفاصيل خفيفة تكشف كيف كنت تفكر قبل صافرة البداية")}
        <div class="memory-personality-title"><span>🪄</span><div><small>الوصف الأقرب لك</small><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(buildParticipantRecapStyleDescription(model.finalRow))}</p></div></div>
        <div class="memory-personality-grid">
            <article><span>👥</span><small>علاقتك برأي الأغلبية</small><strong>${escapeHtml(p.crowdTitle)}</strong><p>وافقت الاتجاه الأشهر في ${model.dna.crowdFollowRate}% من توقعاتك.</p></article>
            <article><span>⚽</span><small>مزاج الأهداف</small><strong>${escapeHtml(p.goalTitle)}</strong><p>توقعت ${model.dna.averagePredictedGoals} هدفاً للمباراة مقابل ${p.actualAverageGoals} فعلياً.</p></article>
            <article><span>🤝</span><small>التعادل</small><strong>${escapeHtml(p.drawTitle)}</strong><p>${model.dna.drawRate}% من توقعاتك انتهت بتعادل على الورق.</p></article>
            <article><span>🧩</span><small>نتائج لم يكررها أحد</small><strong>${p.independentCount}</strong><p>توقعات فريدة كتبتها بطريقتك الخاصة.</p></article>
            <article><span>🎯</span><small>موعدك مع بالملّي</small><strong>${p.exactEvery ? `مرة كل ${p.exactEvery}` : "لم تأتِ بعد"}</strong><p>${p.exactEvery ? "توقعات تقريباً كانت تأتيك نتيجة كاملة." : "لكن الرحلة فيها لحظات أخرى تستحق الذكر."}</p></article>
            <article><span>✅</span><small>معدل التسجيل</small><strong>${p.scoredOutOfTen}/10</strong><p>هذا عدد التوقعات التي كانت تجيب نقاطاً تقريباً من كل عشرة.</p></article>
            <article><span>📏</span><small>قرب النتيجة</small><strong>${model.dna.averageError}</strong><p>متوسط مجموع الفارق بين توقعك والنتيجة الفعلية.</p></article>
            <article><span>📅</span><small>الحضور</small><strong>${model.dna.participationRate}%</strong><p>${model.finalRow.predictions} توقعاً من أصل ${model.predictionRows.length} مباراة.</p></article>
        </div>
    `;
}

function renderParticipantMemoryTeamsPage(model) {
    const cards = [
        buildParticipantMemoryTeamCard("💰", "أكثر منتخب منحك نقاطاً", model.teamAnalysis.bestPointsTeam, (team) => `${team.points} نقطة من مبارياته.`),
        buildParticipantMemoryTeamCard("🤝", "أكثر منتخب وثقت به", model.teamAnalysis.mostTrustedTeam, (team) => `${team.trustedWins} مرات توقعت فوزه.`),
        buildParticipantMemoryTeamCard("🎯", "الأسهل قراءة", model.teamAnalysis.mostPreciseTeam, (team) => `متوسط فرق ${team.averageError} هدف فقط.`),
        buildParticipantMemoryTeamCard("💔", "الأكثر إرهاقاً", model.teamAnalysis.hardestTeam, (team) => `${team.misses} توقعات خرجت دون نقاط.`),
        buildParticipantMemoryTeamCard("✨", "صاحب أكثر نتائج بالملّي", model.teamAnalysis.exactHeroTeam, (team) => `${team.exact} نتائج كاملة في مبارياته.`),
        buildParticipantMemoryTeamCard("🧠", "أوضح منتخب لك", model.teamAnalysis.mostReadableTeam, (team) => `${team.readingRate}% من مبارياته جابت نقاطاً.`),
        buildParticipantMemoryTeamCard("⚡", "منحك جرأة ضد الموجة", model.teamAnalysis.braveTeam, (team) => `${team.againstCrowdPoints} نقطة عندما خالفت الأغلبية.`),
        buildParticipantMemoryTeamCard("👀", "أكثر منتخب مرّ في رحلتك", model.teamAnalysis.mostSeenTeam, (team) => `${team.matches} مباريات ظهرت في سجلك.`)
    ].filter(Boolean);

    return `
        ${renderParticipantMemoryHeading("المنتخبات التي صنعت رحلتك", "بعض المنتخبات منحتك نقاطاً، وبعضها تركك تعيد حساباتك")}
        <div class="memory-team-grid">${cards.join("")}</div>
        <div class="memory-team-note">الأرقام هنا لا تحكم على المنتخبات؛ بل تحكي علاقتك أنت بنتائجها خلال شهر التوقعات.</div>
    `;
}

function renderParticipantMemoryMomentsPage(model) {
    const cards = buildParticipantMemoryMomentCards(model);
    return `
        ${renderParticipantMemoryHeading("لحظات لا تُنسى", "لقطات صغيرة تختصر الضحك، الحسرة، والفرحة التي صنعت الرحلة")}
        <div class="memory-moment-grid">
            ${cards.map((card) => `<article><span>${card.icon}</span><small>${escapeHtml(card.title)}</small><strong>${escapeHtml(card.value)}</strong><p>${escapeHtml(card.body)}</p></article>`).join("")}
        </div>
        <div class="memory-moment-closing">ربما لا تتذكر كل مباراة بعد سنوات، لكنك ستتذكر الشعور عندما جاءت واحدة بالملّي، أو عندما ضاعت نقطة في آخر لحظة.</div>
    `;
}

function renderParticipantMemoryBadgesPage(model, badges, pageIndex, totalPages) {
    return `
        ${renderParticipantMemoryHeading(pageIndex === 1 ? "شاراتك" : "شارات أخرى من رحلتك", pageIndex === 1 ? "كل شارة تحفظ جانباً صغيراً من أسلوبك وحضورك" : `الصفحة ${pageIndex} من ${totalPages} لشارات الرحلة`)}
        <div class="memory-badge-style"><small>الهوية الأقرب لرحلتك</small><strong>${escapeHtml(model.personality.title)}</strong><p>${escapeHtml(buildParticipantRecapStyleDescription(model.finalRow))}</p></div>
        <div class="memory-badge-grid">
            ${badges.length ? badges.map((badge) => `
                <article>
                    <span>${escapeHtml(badge.icon || "🏅")}</span>
                    <strong>${escapeHtml(badge.title)}</strong>
                    <b>${escapeHtml(badge.value || badge.note || "شارة محسوبة")}</b>
                    <p>${escapeHtml(badge.note || buildParticipantMemoryBadgeNote(badge))}</p>
                </article>
            `).join("") : `<div class="memory-empty-state">رحلتك محفوظة حتى لو لم تتكوّن شارات إضافية.</div>`}
        </div>
    `;
}

function renderParticipantMemoryCollectivePage(model) {
    const stats = model.recap.seasonStats || {};
    const closePack = (model.recap.finalRows || []).filter((row) => Math.abs(Number(row.points || 0) - Number(model.collective.median || 0)) <= 100).length;
    return `
        ${renderParticipantMemoryHeading("المسابقة كما صنعناها جميعاً", "حقائق ممتعة عن الشهر كله، وليس عن ترتيب شخص واحد فقط")}
        <div class="memory-collective-top">
            <section class="memory-distribution-card"><h3>أين تجمعت النقاط؟</h3><p>كل عمود يمثل مجموعة من المشاركين، والعمود المضيء هو مكانك.</p>${buildParticipantRecapDistributionChart(model.collective.scoreBands, model.finalRow.points)}</section>
            <section class="memory-collective-donut"><h3>نبض التوقعات</h3>${buildParticipantRecapDonutChart([
                { label: "بالملّي", value: stats.totalExact || 0, color: "#c9932f" },
                { label: "اتجاه صحيح", value: Math.max(0, (stats.totalCorrect || 0) - (stats.totalExact || 0)), color: "#158f83" },
                { label: "دون نقاط", value: Math.max(0, (stats.totalPredictions || 0) - (stats.totalCorrect || 0)), color: "#76839a" }
            ], stats.totalPredictions || 1)}<p>${stats.accuracyPercent || 0}% من التوقعات الجماعية جابت نقاطاً.</p></section>
        </div>
        <div class="memory-fun-facts-grid">
            <article><span>🏆</span><small>أعلى رصيد</small><strong>${model.collective.max}</strong><p>نقطة وصل إليها بطل المسابقة.</p></article>
            <article><span>⚖️</span><small>منتصف الجدول</small><strong>${model.collective.median}</strong><p>نقطة كان عندها منتصف المشاركين تقريباً.</p></article>
            <article><span>🤏</span><small>قلب المنافسة</small><strong>${closePack}</strong><p>مشاركين أنهوا المسابقة داخل 100 نقطة من منتصف الجدول.</p></article>
            <article><span>🎯</span><small>نتائج بالملّي</small><strong>${stats.totalExact || 0}</strong><p>لحظة كاملة أصابها المشاركون خلال البطولة.</p></article>
            <article><span>🎁</span><small>أكرم مباراة</small><strong>${escapeHtml(stats.generousMatch?.title || "—")}</strong><p>${stats.generousMatch ? `${stats.generousMatch.awardedPoints} نقطة وزعتها على الجميع.` : ""}</p></article>
            <article><span>🌪️</span><small>أكثر مباراة حيّرت المجموعة</small><strong>${escapeHtml(model.collective.biggestCrowdUpset?.title || stats.cruelMatch?.title || "—")}</strong><p>${model.collective.biggestCrowdUpset ? `${model.collective.biggestCrowdUpset.correctCount} فقط جابوا نقاطاً.` : ""}</p></article>
        </div>
        <div class="memory-category-leaders">
            ${renderParticipantRecapCollectiveLeader("🎯", "ملك بالملّي", model.collective.leaders.exact, `${model.collective.leaders.exact?.exactScores || 0} نتائج`, model.participant.id)}
            ${renderParticipantRecapCollectiveLeader("🧠", "الأعلى دقة", model.collective.leaders.accuracy, `${model.collective.leaders.accuracy?.accuracyPercent || 0}%`, model.participant.id)}
            ${renderParticipantRecapCollectiveLeader("🔥", "أطول سلسلة", model.collective.leaders.streak, `${model.collective.leaders.streak?.bestCorrectStreak || 0} مباريات`, model.participant.id)}
            ${renderParticipantRecapCollectiveLeader("⚡", "الأجرأ", model.collective.leaders.bravery, `${model.collective.leaders.bravery?.againstCrowdPoints || 0} نقطة`, model.participant.id)}
        </div>
    `;
}

function renderParticipantMemoryLeaderboardPage(model) {
    const podium = (model.recap.finalRows || []).slice(0, 3);
    return `
        ${renderParticipantMemoryHeading("الترتيب النهائي", "منصة الختام والصورة الكاملة بعد احتساب كل النقاط")}
        <div class="memory-podium">
            ${[podium[1], podium[0], podium[2]].filter(Boolean).map((row) => `
                <article class="rank-${row.finalRank}"><span>${row.finalRank === 1 ? "🥇" : row.finalRank === 2 ? "🥈" : "🥉"}</span><small>المركز ${row.finalRank}</small><strong>${escapeHtml(row.name)}</strong><b>${row.points}</b><em>نقطة</em></article>
            `).join("")}
        </div>
        <div class="memory-leaderboard-table">
            <div class="memory-leaderboard-head"><span>المركز</span><span>المشارك</span><span>النقاط</span><span>بالملّي</span><span>الدقة</span><span>توقع البطل</span></div>
            ${(model.recap.finalRows || []).map((row) => `
                <div class="memory-leaderboard-row ${String(row.id) === String(model.participant.id) ? "is-current" : ""}">
                    <span>#${row.finalRank}</span><strong>${escapeHtml(row.name)}</strong><b>${row.points}</b><span>${row.exactScores || 0}</span><span>${row.accuracyPercent || 0}%</span><span>${row.championPredictionPoints ? `+${row.championPredictionPoints}` : "—"}</span>
                </div>
            `).join("")}
        </div>
        <div class="memory-leaderboard-note">صفك مميز بلون مختلف حتى تجد مكانك فوراً، مهما كان موقعك في الجدول.</div>
    `;
}

function renderParticipantMemoryLedgerPage(model, rows, pageIndex, totalPages) {
    const columns = chunkParticipantRecapItems(rows, 26);
    const start = rows[0]?.index || 1;
    const end = rows[rows.length - 1]?.index || start;
    return `
        ${renderParticipantMemoryHeading("دفتر التوقعات", `المباريات ${start}-${end} · الصفحة ${pageIndex} من ${totalPages}`)}
        <div class="memory-ledger-summary">
            <span><strong>${model.finalRow.predictions}</strong><small>توقع مسجل</small></span>
            <span><strong>${model.finalRow.correctPredictions}</strong><small>جاب نقاط</small></span>
            <span><strong>${model.finalRow.exactScores}</strong><small>بالملّي</small></span>
            <span><strong>${model.finalRow.points}</strong><small>نقطة</small></span>
        </div>
        <div class="memory-ledger-columns">
            ${columns.map((columnRows) => `
                <div class="memory-ledger-column">
                    <div class="memory-ledger-head"><span>#</span><span>المباراة</span><span>توقعك</span><span>النتيجة</span><span>ن</span></div>
                    ${columnRows.map((row) => `
                        <div class="memory-ledger-row ${row.statusClass}" style="--stage-color:${row.stageColor}">
                            <span>${row.index}</span>
                            <div class="memory-ledger-match"><i>${renderParticipantRecapFlag(row.match.team1)}</i><b>${escapeHtml(compactParticipantRecapTeamName(row.match.team1))}</b><em>×</em><i>${renderParticipantRecapFlag(row.match.team2)}</i><b>${escapeHtml(compactParticipantRecapTeamName(row.match.team2))}</b></div>
                            <strong>${escapeHtml(row.predictedScore)}</strong><strong>${escapeHtml(row.actualScore)}</strong><b>${row.points}</b>
                        </div>
                    `).join("")}
                </div>
            `).join("")}
        </div>
        <div class="memory-ledger-legend"><span class="exact">بالملّي</span><span class="correct">اتجاه صحيح</span><span class="zero">دون نقاط</span><span class="missing">دون توقع</span></div>
    `;
}

function renderParticipantMemoryHighlightsPage(model, highlights, pageIndex, totalPages) {
    const hero = highlights[0] || null;
    const rest = highlights.slice(1);
    return `
        ${renderParticipantMemoryHeading("مجلة الأضواء", `لقطات شخصية وجماعية بقيت من ذاكرة المسابقة · ${pageIndex}/${totalPages}`)}
        <div class="memory-highlight-magazine">
            ${hero ? `<article class="memory-highlight-hero ${hero.personal ? "is-personal" : ""}"><span>${escapeHtml(hero.icon || "✨")}</span><small>${escapeHtml(hero.subtitle || "من ذاكرة البطولة")}</small><h2>${escapeHtml(hero.title)}</h2><p>${escapeHtml(trimParticipantMemoryText(hero.body, 260))}</p>${hero.personal ? `<b>من رحلتك أنت</b>` : ""}</article>` : `<div class="memory-empty-state">لا توجد أضواء منشورة لهذه النسخة.</div>`}
            <div class="memory-highlight-grid">
                ${rest.map((highlight) => `<article class="${highlight.personal ? "is-personal" : ""}"><span>${escapeHtml(highlight.icon || "✨")}</span><small>${escapeHtml(highlight.subtitle || "لقطة من البطولة")}</small><h3>${escapeHtml(highlight.title)}</h3><p>${escapeHtml(trimParticipantMemoryText(highlight.body, 150))}</p>${highlight.personal ? `<b>من رحلتك</b>` : ""}</article>`).join("")}
            </div>
        </div>
        <div class="memory-highlight-note">الأضواء لا تعيد سرد كل المباريات؛ تختار اللحظات التي صنعت حديثاً، ضحكة، مفاجأة، أو ذكرى تستحق أن تبقى.</div>
    `;
}

function renderParticipantMemoryClosingPage(model) {
    const stats = model.recap.seasonStats || {};
    const podiumSentence = buildFinalPodiumSentence(model.recap.finalRows || []);
    const siteText = model.publicUrl ? model.publicUrl.replace(/^https?:\/\//, "") : "رابط الموقع الرسمي";
    return `
        <div class="memory-closing-wrap">
            <div class="memory-closing-heart">❤️</div>
            <h1 dir="rtl">ختام المسابقة</h1>
            <h2>شكراً… لأنكم جعلتم الفكرة تعيش</h2>
            <p>
                لم تكن المسابقة مجرد أرقام في جدول، ولا توقعات تُحفظ قبل بداية المباراة. كانت موعداً ننتظره معاً؛ رسالة بعد نتيجة، وضحكة على توقع ضاع في اللحظة الأخيرة، وفرحة صغيرة لا تُنسى عندما تأتي النتيجة بالملّي.
            </p>
            <p>
                كل دخول للموقع، وكل توقع، وكل حديث بعد مباراة أعطى الفكرة روحاً أكبر مما بدأت به. ولهذا لا يحفظ هذا الكتاب النتيجة الأخيرة فقط؛ بل يحفظ شهراً من الحماس، والمنافسة، واللحظات التي عشناها معاً.
            </p>
            <div class="memory-closing-numbers"><span><strong>${stats.participantCount}</strong><small>مشاركاً</small></span><span><strong>${stats.completedMatches}</strong><small>مباراة</small></span><span><strong>${stats.totalPredictions}</strong><small>توقعاً</small></span></div>
            <p class="memory-closing-podium">
                ${podiumSentence ? `منصة الختام حملت أسماء تستحق لحظتها: ${podiumSentence}. ` : ""}
                مبروك لأصحاب المراكز الثلاثة الأولى على منافسة امتدت حتى النهاية، ومبروك لكل من شارك وصنع لحظة أو ضحكة أو ذكرى بقيت معنا.
            </p>
            <strong class="memory-closing-line">اللقب والمراكز لأصحابها… أما الحكاية، فصنعناها جميعاً.</strong>
            <div class="memory-closing-personal"><small>نسخة ${escapeHtml(model.participant.name)}</small><p>${escapeHtml(buildParticipantMemoryPersonalClosingLine(model))}</p></div>
            <div class="participant-memory-site-card" data-public-url="${escapeHtml(model.publicUrl || "")}">
                <div><small>عد إلى الموقع متى أردت استرجاع التفاصيل</small><strong>${escapeHtml(siteText)}</strong></div>
                <canvas class="participant-memory-qr" width="126" height="126" aria-label="رمز QR للموقع"></canvas>
            </div>
        </div>
    `;
}

function buildParticipantMemoryChampionPredictionCopy(model) {
    const team = model.moments.championPredictionTeam;
    const points = Number(model.moments.championPredictionPoints || 0);
    const championName = model.recap.seasonStats?.champion?.name || null;
    const runnerUpName = model.recap.seasonStats?.runnerUp?.name || null;

    if (!team) return { title: "لم يتم تسجيل توقع", body: "لم يكن هناك اختيار محفوظ لهذه الخانة.", points: 0, statusClass: "is-missing" };
    if (!championName) return { title: team, body: "تم حفظ الاختيار — بانتظار حسم البطولة.", points: 0, statusClass: "is-pending" };
    if (normalizeTeamName(team) === normalizeTeamName(championName)) return { title: team, body: "أصبت اختيار البطل وحصلت على المكافأة الكاملة.", points, statusClass: "is-winner" };
    if (runnerUpName && normalizeTeamName(team) === normalizeTeamName(runnerUpName)) return { title: team, body: "وصل اختيارك إلى النهائي وحصلت على نقاط الوصيف.", points, statusClass: "is-runner-up" };
    return { title: team, body: "الاختيار كان محفوظاً، لكنه لم يصل إلى البطل أو الوصيف.", points, statusClass: "is-zero" };
}

function buildParticipantMemoryJourneyLine(model) {
    const j = model.journey;
    if (model.finalRow.finalRank === 1) return "بدأت الرحلة بمنافسة مفتوحة، وانتهت باسمك في أعلى الجدول.";
    if (j.netMovement >= 3) return `من المركز ${j.firstRank} إلى المركز ${j.finalRank}: رحلة صعود واضحة لم تأتِ في مباراة واحدة.`;
    if (j.biggestRise >= 3) return `كانت هناك لحظة تقدمت فيها ${j.biggestRise} مراكز دفعة واحدة، وعاد اسمك إلى قلب المنافسة.`;
    if (j.appearancesInTop3 > 0) return `ظهر اسمك ضمن الثلاثة الأوائل ${j.appearancesInTop3} مرة، حتى لو أخذت النهاية شكلاً آخر.`;
    return "بعض الرحلات تتحرك بسرعة، وبعضها تبني مكانها بهدوء؛ المهم أنك بقيت جزءاً من الجدول حتى النهاية.";
}

function buildParticipantMemoryDimensionNotes(model) {
    const total = Math.max(1, model.recap.finalRows.length);
    const beaten = (percent) => Math.max(0, Math.round((Number(percent || 0) / 100) * total) - 1);
    return [
        { icon: "🧠", label: "الدقة", value: `${model.finalRow.accuracyPercent}%`, note: `تفوقت في الدقة على نحو ${beaten(model.comparison.percentiles.accuracy)} مشاركين.` },
        { icon: "🎯", label: "بالملّي", value: `${model.finalRow.exactScores} نتائج`, note: `نتيجة كاملة كل ${model.personality.exactEvery || "—"} توقعات تقريباً.` },
        { icon: "⚡", label: "الجرأة", value: `${model.finalRow.againstCrowdPoints || 0} نقطة`, note: `نقاط جاءت عندما كان الاتجاه الأشهر في الجهة الأخرى.` },
        { icon: "🔥", label: "الثبات", value: `${model.finalRow.bestCorrectStreak || 0} متتالية`, note: `أطول سلسلة توقعات جابت نقاطاً دون انقطاع.` },
        { icon: "📅", label: "الحضور", value: `${model.finalRow.predictions}/${model.predictionRows.length}`, note: `عدد المباريات التي كان لك فيها توقع محفوظ.` }
    ];
}

function buildParticipantMemoryTeamCard(icon, title, team, noteBuilder) {
    if (!team) return "";
    return `<article><div class="memory-team-flag">${renderParticipantRecapFlag(team.name)}</div><span>${icon}</span><small>${escapeHtml(title)}</small><strong>${escapeHtml(team.name)}</strong><p>${escapeHtml(noteBuilder(team))}</p></article>`;
}

function buildParticipantMemoryMomentCards(model) {
    const m = model.moments;
    const cards = [];
    if (m.bestPrediction) cards.push({ icon: "💥", title: "أثقل ضربة", value: `${m.bestPrediction.points} نقطة`, body: `${m.bestPrediction.match.team1} × ${m.bestPrediction.match.team2} — توقعت ${m.bestPrediction.predictedScore} وانتهت ${m.bestPrediction.actualScore}.` });
    if (m.latestExact) cards.push({ icon: "🎯", title: "آخر لقطة بالملّي", value: m.latestExact.actualScore, body: `${m.latestExact.match.team1} × ${m.latestExact.match.team2} في ${m.latestExact.dateLabel}.` });
    if (m.closestMiss) cards.push({ icon: "😮‍💨", title: "أقرب حسرة", value: m.closestMiss.predictedScore, body: `انتهت ${m.closestMiss.actualScore} في ${m.closestMiss.match.team1} × ${m.closestMiss.match.team2}.` });
    cards.push({ icon: "⚡", title: "حين خالفت الموجة", value: `${m.againstCrowdRows.length} مرات`, body: "قراءات جابت نقاطاً بينما كان الاتجاه الأشهر خاطئاً." });
    cards.push({ icon: "🔥", title: "أطول سلسلة", value: `${m.longestStreak} توقعات`, body: "أطول فترة متتالية بقيت فيها توقعاتك تجيب نقاطاً." });
    cards.push({ icon: "🚀", title: "أكبر قفزة", value: `${m.journey.biggestRise} مراكز`, body: "أفضل حركة مفاجئة لك في جدول الترتيب." });
    cards.push({ icon: "🌟", title: "أفضل يوم", value: `${m.bestDay?.points || 0} نقطة`, body: `${m.bestDay?.correct || 0} توقعات جابت نقاطاً في يوم واحد.` });
    cards.push({ icon: "🏎️", title: "أفضل خمس مباريات", value: `${m.bestFiveMatchSpan} نقطة`, body: "أقوى دفعة قصيرة صنعتها خلال خمس مباريات متتالية." });
    return cards.slice(0, 8);
}

function buildParticipantMemoryBadgeNote(badge) {
    const title = String(badge?.title || "");
    if (title.includes("بالملّي")) return "لحظات جاءت فيها النتيجة كاملة كما كتبتها.";
    if (title.includes("سلسلة")) return "فترة متتالية بقي فيها رصيدك يتحرك للأمام.";
    if (title.includes("الموجة")) return "نقاط جاءت من قراءة مختلفة عن الاتجاه الأشهر.";
    if (title.includes("دقة")) return "نسبة التوقعات التي انتهت بنقاط.";
    return "شارة محسوبة من تفاصيل رحلتك في المسابقة.";
}

function buildParticipantMemoryPersonalClosingLine(model) {
    if (model.finalRow.finalRank === 1) return "احتفظ بهذه الصفحات؛ فهي تذكرك بأن اللقب لم يأتِ من لحظة واحدة، بل من رحلة بقيت فيها في الصورة حتى آخر صافرة.";
    if (model.finalRow.finalRank <= 3) return "هذه الصفحات تحفظ رحلة انتهت على المنصة، لكن جمالها الحقيقي كان في كل توقع أبقى المنافسة حيّة حتى النهاية.";
    if (model.finalRow.exactScores > 0) return `احتفظ بهذه الرحلة؛ ففيها ${model.finalRow.exactScores} لحظات جاءت بالملّي، وأخرى ضاعت، ومنافسة كنت جزءاً حقيقياً منها.`;
    return "احتفظ بهذه الرحلة؛ ففيها توقعات أصبتها، وأخرى ضاعت، وضحكات ومفاجآت جعلت شهراً كاملاً يستحق أن يبقى في الذاكرة.";
}

function chunkParticipantRecapItems(items, size) {
    const rows = Array.isArray(items) ? items : [];
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
    return chunks;
}

function trimParticipantMemoryText(value, maxLength) {
    const text = String(value || "").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

async function renderParticipantRecapQrCodes(root, publicUrl) {
    const canvases = Array.from(root.querySelectorAll(".participant-memory-qr"));
    if (!canvases.length) return;
    if (!publicUrl) {
        canvases.forEach((canvas) => canvas.classList.add("is-unavailable"));
        return;
    }

    try {
        await loadParticipantRecapExternalScript(PARTICIPANT_RECAP_QRCODE_URL, "participant-recap-qrcode");
        if (!window.QRCode?.toCanvas) throw new Error("QR library unavailable");
        await Promise.all(canvases.map((canvas) => window.QRCode.toCanvas(canvas, publicUrl, {
            width: 126,
            margin: 1,
            color: { dark: "#07111f", light: "#fffaf0" }
        })));
    } catch (error) {
        console.warn("Could not render recap QR code:", error?.message || error);
        canvases.forEach((canvas) => canvas.classList.add("is-unavailable"));
    }
}

function validateParticipantRecapLayout(root) {
    const pages = Array.from(root.querySelectorAll(".participant-recap-pdf-page"));
    const problems = [];

    pages.forEach((page, pageIndex) => {
        const pageRect = page.getBoundingClientRect();
        const importantElements = Array.from(page.querySelectorAll([
            ".memory-book-heading",
            ".memory-badge-grid article",
            ".memory-moment-grid article",
            ".memory-team-grid article",
            ".memory-personality-grid article",
            ".memory-ledger-column",
            ".memory-highlight-magazine",
            ".participant-memory-site-card"
        ].join(",")));

        importantElements.forEach((element) => {
            const rect = element.getBoundingClientRect();
            const outside = rect.left < pageRect.left - 1 || rect.right > pageRect.right + 1 || rect.top < pageRect.top - 1 || rect.bottom > pageRect.bottom + 1;
            if (outside) problems.push(`page ${pageIndex + 1}: ${element.className || element.tagName}`);
        });
    });

    if (problems.length) {
        console.error("Participant recap layout validation failed", problems);
        throw new Error("تعذر ترتيب إحدى صفحات الكتاب بأمان. حدّث الصفحة وحاول مرة أخرى.");
    }
}

async function exportParticipantRecapPdf(documentElement, fileName) {
    const { jsPDF } = window.jspdf;
    const pages = Array.from(documentElement.querySelectorAll(".participant-recap-pdf-page"));
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
    const mobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    const renderScale = mobileDevice ? 1.45 : 1.7;

    for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const progress = 20 + Math.round(((index + 1) / pages.length) * 74);
        updateParticipantRecapPdfProgress(`نصمم الصفحة ${index + 1} من ${pages.length}...`, progress);

        const canvas = await window.html2canvas(page, {
            scale: renderScale,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#f6f2e9",
            logging: false,
            imageTimeout: 15000,
            width: 794,
            height: 1123,
            windowWidth: 794,
            windowHeight: 1123,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDocument) => {
                clonedDocument.documentElement.style.width = "794px";
                clonedDocument.body.style.width = "794px";
                clonedDocument.body.style.margin = "0";
            }
        });

        const crisp = page.classList.contains("participant-recap-pdf-page-crisp");
        const imageType = crisp ? "PNG" : "JPEG";
        const image = crisp ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.94);
        if (index > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(image, imageType, 0, 0, 210, 297, undefined, crisp ? "NONE" : "FAST");

        const siteCard = page.querySelector(".participant-memory-site-card");
        const publicUrl = siteCard?.dataset.publicUrl;
        if (siteCard && publicUrl) {
            const pageRect = page.getBoundingClientRect();
            const cardRect = siteCard.getBoundingClientRect();
            const x = ((cardRect.left - pageRect.left) / pageRect.width) * 210;
            const y = ((cardRect.top - pageRect.top) / pageRect.height) * 297;
            const width = (cardRect.width / pageRect.width) * 210;
            const height = (cardRect.height / pageRect.height) * 297;
            pdf.link(x, y, width, height, { url: publicUrl });
        }

        canvas.width = 1;
        canvas.height = 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    pdf.setProperties({
        title: `كتاب رحلة ${currentParticipant?.name || "المشارك"} - World Cup Prediction Contest 2026`,
        subject: "كتاب تذكاري شخصي لرحلة المشارك في مسابقة توقعات كأس العالم",
        author: "World Cup Prediction Contest",
        creator: `World Cup Project v${APP_VERSION}`
    });

    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
