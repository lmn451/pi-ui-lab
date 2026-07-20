#!/usr/bin/env node

import fs from "node:fs/promises";

const [criticPath = "docs/critic-blockers-loop-v1.md", approvedPath = "docs/approved-plan-loop-v1.md"] = process.argv.slice(2);

const normalize = (value) => value.toLowerCase().replace(/\s+/g, " ").trim();
const cleanCell = (text) => text.trim().replace(/^`|`$/g, "");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitTableLine(line) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cleanCell(cell.trim()));
}

function parseTableRows(text, sectionTitles) {
  const lines = text.split(/\r?\n/);
  let sectionStart = -1;

  const sectionCandidates = sectionTitles.map((title) =>
    new RegExp(`^##\\s+${escapeRegex(title).replace(/\s+/g, "\\\\s+")}$`, "i"),
  );

  if (sectionCandidates.length > 0) {
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (sectionCandidates.some((regex) => regex.test(trimmed))) {
        sectionStart = i;
        break;
      }
    }
  } else {
    sectionStart = 0;
  }

  if (sectionStart === -1) {
    sectionStart = 0;
  }

  let headerLine = -1;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) {
      continue;
    }
    if (line.startsWith("|---")) {
      continue;
    }
    const headers = splitTableLine(line).map((value) => normalize(value));
    const hasFixColumn =
      headers.includes("required fix") || headers.includes("phase work") || headers.includes("phase");
    if (headers.length >= 4 &&
      (headers.includes("risk") || headers.includes("blocker")) &&
      hasFixColumn &&
      (headers.includes("required test") || headers.includes("required tests"))
    ) {
      headerLine = i;
      break;
    }
  }

  if (headerLine === -1) {
    return [];
  }

  const headers = splitTableLine(lines[headerLine].trim()).map((value) => normalize(value));
  const indexOf = (name, aliases) => {
    const aliasSet = new Set(aliases);
    let index = -1;
    for (let i = 0; i < headers.length; i += 1) {
      if (aliasSet.has(headers[i])) {
        index = i;
        break;
      }
    }
    return index;
  };

  const riskIndex = indexOf("risk", ["risk", "blocker"]);
  const statusIndex = indexOf("status", ["status"]);
  const whyIndex = indexOf("why", ["why"]);
  const requiredFixIndex = indexOf("required fix", ["required fix", "phase work", "required fix", "phase"]);
  const requiredTestIndex = indexOf("required test", ["required test", "required tests"]);

  if (
    riskIndex === -1 ||
    requiredFixIndex === -1 ||
    requiredTestIndex === -1
  ) {
    return [];
  }

  const rows = [];
  for (let i = headerLine + 2; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) {
      break;
    }
    if (line.includes("|---")) {
      continue;
    }

    const cells = splitTableLine(line);
    const neededLength = Math.max(riskIndex, requiredFixIndex, requiredTestIndex, statusIndex);
    if (cells.length <= neededLength) {
      continue;
    }

    rows.push({
      risk: normalize(cells[riskIndex] || ""),
      blockerStatus: normalize(cells[statusIndex] || ""),
      why: (cells[whyIndex] || "").trim(),
      requiredFix: (cells[requiredFixIndex] || "").trim(),
      requiredTest: (cells[requiredTestIndex] || "").trim(),
    });
  }

  return rows;
}

async function main() {
  const criticText = await fs.readFile(criticPath, "utf8");
  const approvedText = await fs.readFile(approvedPath, "utf8");

  const criticRows = parseTableRows(criticText, ["NO-GO blockers"]); 
  const approvedRows = parseTableRows(approvedText, ["Critic blocker remediation status", "NO-GO blockers"]);

  if (criticRows.length === 0 || approvedRows.length === 0) {
    console.log("NO-GO");
    console.log("- reason: missing required blocker table in one or both docs");
    process.exitCode = 1;
    return;
  }

  const criticMap = new Map();
  for (const row of criticRows) {
    if (row.risk) {
      criticMap.set(row.risk, row);
    }
  }
  const approvedMap = new Map();
  for (const row of approvedRows) {
    if (row.risk) {
      approvedMap.set(row.risk, row);
    }
  }

  const blockers = [];
  for (const [risk, row] of criticMap) {
    const approved = approvedMap.get(risk);
    if (!approved) {
      blockers.push({
        risk,
        why: row.why,
        requiredFix: row.requiredFix,
        requiredTest: row.requiredTest,
        blocker: "missing",
      });
      continue;
    }

    const status = approved.blockerStatus;
    if (!["resolved", "mitigated"].includes(status)) {
      blockers.push({
        risk,
        why: row.why,
        requiredFix: row.requiredFix,
        requiredTest: row.requiredTest,
        blocker: status,
      });
    }
  }

  if (blockers.length > 0) {
    console.log("NO-GO");
    for (const [index, blocker] of blockers.entries()) {
      console.log(`${index + 1}) ${blocker.risk} / ${blocker.why} / ${blocker.requiredFix} / ${blocker.requiredTest}`);
    }
    process.exitCode = 1;
    return;
  }

  const extras = [...approvedMap.keys()].filter((risk) => !criticMap.has(risk));
  if (extras.length > 0) {
    console.log("NO-GO");
    console.log(`- reason: approved plan contains ${extras.length} unmanaged blocker rows`);
    process.exitCode = 1;
    return;
  }

  console.log("APPROVED");
  console.log(`PASS: ${criticRows.length} critic blockers are mapped with accepted status.`);
}

main().catch((error) => {
  console.error("NO-GO");
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
