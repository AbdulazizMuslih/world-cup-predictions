import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_NOTES_FILE = process.env.EVENT_NOTES_FILE || "data/final-event-notes.json";
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
const DELETE_EXISTING_DRAFTS = String(process.env.DELETE_EXISTING_DRAFTS || "false").toLowerCase() === "true";
const DEFAULT_APPROVED = String(process.env.DEFAULT_APPROVED || "false").toLowerCase() === "true";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

async function supabaseFetch(apiPath, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${apiPath}`, {
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

function cleanText(value, maxLength) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
        .trim();
}

function normalizeEventNote(row, index) {
    const title = cleanText(row.title_ar, 140);
    const details = cleanText(row.details_ar || row.body_ar, 700);

    if (!title) {
        throw new Error(`Row ${index + 1} is missing title_ar.`);
    }

    if (!details) {
        throw new Error(`Row ${index + 1} is missing details_ar.`);
    }

    return {
        match_id: row.match_id || null,
        stage: cleanText(row.stage, 60) || null,
        event_type: cleanText(row.event_type || "story", 80),
        mood: cleanText(row.mood || "story", 80),
        title_ar: title,
        details_ar: details,
        source_url: cleanText(row.source_url, 900) || null,
        source_name: cleanText(row.source_name || "manual review", 180) || null,
        approved: typeof row.approved === "boolean" ? row.approved : DEFAULT_APPROVED
    };
}

async function main() {
    const absoluteFile = path.resolve(process.cwd(), EVENT_NOTES_FILE);
    const raw = await fs.readFile(absoluteFile, "utf8");
    const json = JSON.parse(raw);
    const inputRows = Array.isArray(json) ? json : json.event_notes;

    if (!Array.isArray(inputRows)) {
        throw new Error("Event notes file must contain an array or { event_notes: [...] }.");
    }

    const rows = inputRows.map(normalizeEventNote);

    console.log("FINAL_EVENT_NOTES_IMPORT");
    console.log(JSON.stringify({
        file: absoluteFile,
        rows: rows.length,
        dryRun: DRY_RUN,
        deleteExistingDrafts: DELETE_EXISTING_DRAFTS,
        defaultApproved: DEFAULT_APPROVED,
        preview: rows.slice(0, 5)
    }, null, 2));

    if (DRY_RUN) {
        console.log("Dry run only. Nothing inserted.");
        return;
    }

    if (DELETE_EXISTING_DRAFTS) {
        await supabaseFetch("final_event_notes?approved=eq.false", {
            method: "DELETE",
            headers: { Prefer: "return=minimal" }
        });
        console.log("Deleted existing unapproved final_event_notes drafts.");
    }

    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await supabaseFetch("final_event_notes", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(chunk)
        });
    }

    console.log(`Inserted ${rows.length} row(s) into final_event_notes.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
