import { mkdir, writeFile } from "node:fs/promises";

const owner = "FallAbigal";
const profileRepository = owner;
const root = new URL("../", import.meta.url);
const token = process.env.GITHUB_TOKEN;
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "FallAbigal-profile-data-sync",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const languageColors = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  PHP: "#777bb4",
  CSS: "#563d7c",
  HTML: "#e34c26",
  PLpgSQL: "#336791",
  Python: "#3572a5",
  Java: "#b07219",
  Go: "#00add8",
  Rust: "#dea584",
  Lua: "#000080",
};

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: apiHeaders });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json();
}

async function githubGraphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...apiHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(`GitHub GraphQL ${response.status}: ${JSON.stringify(payload.errors ?? payload)}`);
  }
  return payload.data;
}

function escapeCell(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, " ");
}

function formatPercent(value) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function languageColor(language) {
  return languageColors[language] ?? "#94a3b8";
}

function languageSvg(languages) {
  const width = 880;
  const barX = 24;
  const barWidth = width - 48;
  const barY = 58;
  const rowStart = 104;
  const rowHeight = 30;
  const height = rowStart + languages.length * rowHeight + 22;
  const total = languages.reduce((sum, language) => sum + language.bytes, 0) || 1;
  let barOffset = barX;

  const bar = languages.map((language) => {
    const segmentWidth = barWidth * (language.bytes / total);
    const segment = `<rect x="${barOffset.toFixed(2)}" y="${barY}" width="${Math.max(segmentWidth, 1).toFixed(2)}" height="14" fill="${languageColor(language.name)}" />`;
    barOffset += segmentWidth;
    return segment;
  }).join("");

  const rows = languages.map((language, index) => {
    const y = rowStart + index * rowHeight;
    return [
      `<circle cx="30" cy="${y - 5}" r="5" fill="${languageColor(language.name)}" />`,
      `<text x="46" y="${y}" class="label">${escapeXml(language.name)}</text>`,
      `<text x="${width - 24}" y="${y}" text-anchor="end" class="value">${formatPercent(language.percent)}</text>`,
    ].join("");
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Languages used across public repositories</title>
  <desc id="desc">${languages.length} languages detected from the public repositories of ${owner}.</desc>
  <style>
    .card { fill: #ffffff; stroke: #e2e8f0; }
    .title { fill: #0f172a; font: 700 19px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .subtitle, .label, .value { fill: #64748b; font: 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .value { font-variant-numeric: tabular-nums; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #161b22; stroke: #30363d; }
      .title { fill: #f0f6fc; }
      .subtitle, .label, .value { fill: #8b949e; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" />
  <text x="24" y="29" class="title">${languages.length} Languages</text>
  <text x="24" y="47" class="subtitle">Most used languages</text>
  <clipPath id="language-bar-clip"><rect x="${barX}" y="${barY}" width="${barWidth}" height="14" rx="7" /></clipPath>
  <g clip-path="url(#language-bar-clip)">${bar}</g>
  ${rows}
</svg>`;
}

function activityLevel(day) {
  const levels = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
  };
  return levels[day.contributionLevel] ?? (day.contributionCount > 0 ? 2 : 0);
}

function activitySvg(activity) {
  const width = 880;
  const gridX = 24;
  const gridY = 76;
  const cell = 11;
  const gap = 3;
  const weeks = activity.contributionCalendar.weeks;
  const grid = weeks.map((week, weekIndex) => week.contributionDays.map((day, dayIndex) => {
    const x = gridX + weekIndex * (cell + gap);
    const y = gridY + dayIndex * (cell + gap);
    return `<rect class="level-${activityLevel(day)}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2"><title>${escapeXml(day.date)}: ${day.contributionCount} contributions</title></rect>`;
  }).join("")).join("");
  const legend = [0, 1, 2, 3, 4].map((level, index) => (
    `<rect class="level-${level}" x="${width - 126 + index * 19}" y="${gridY + 102}" width="11" height="11" rx="2" />`
  )).join("");
  const total = activity.contributionCalendar.totalContributions;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="210" viewBox="0 0 ${width} 210" role="img" aria-labelledby="title desc">
  <title id="title">${total} GitHub contributions in the last 12 months</title>
  <desc id="desc">Contribution activity for ${owner} across the last 12 months.</desc>
  <style>
    .card { fill: #ffffff; stroke: #e2e8f0; }
    .title { fill: #0f172a; font: 700 19px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .subtitle, .legend-label { fill: #64748b; font: 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .level-0 { fill: #ebedf0; }
    .level-1 { fill: #9be9a8; }
    .level-2 { fill: #40c463; }
    .level-3 { fill: #30a14e; }
    .level-4 { fill: #216e39; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #161b22; stroke: #30363d; }
      .title { fill: #f0f6fc; }
      .subtitle, .legend-label { fill: #8b949e; }
      .level-0 { fill: #21262d; }
      .level-1 { fill: #0e4429; }
      .level-2 { fill: #006d32; }
      .level-3 { fill: #26a641; }
      .level-4 { fill: #39d353; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="${width - 1}" height="209" rx="12" />
  <text x="24" y="29" class="title">${total} contributions</text>
  <text x="24" y="48" class="subtitle">GitHub activity · last 12 months</text>
  <g>${grid}</g>
  <text x="${width - 185}" y="${gridY + 111}" class="legend-label">Less</text>
  <g>${legend}</g>
  <text x="${width - 24}" y="${gridY + 111}" text-anchor="end" class="legend-label">More</text>
</svg>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function activityTable(activity) {
  const collection = activity.user.contributionsCollection;
  const rows = [
    ["Contributions", collection.contributionCalendar.totalContributions],
    ["Commits", collection.totalCommitContributions],
    ["Pull requests", collection.totalPullRequestContributions],
    ["Issues", collection.totalIssueContributions],
    ["Reviews", collection.totalPullRequestReviewContributions],
  ].map(([label, total]) => `| ${label} | ${total} |`);

  return [
    "## Total GitHub activity",
    "",
    '<img src="./assets/activity.svg" alt="Total GitHub activity for the last 12 months" />',
    "",
    "| Metric | Total |",
    "| --- | ---: |",
    ...rows,
    "",
  ].join("\n");
}

function statsTable(repositories, profile) {
  const stars = repositories.reduce((sum, repository) => sum + repository.stargazers_count, 0);
  const rows = [
    ["Public code repos", repositories.length],
    ["Stars", stars],
    ["Followers", profile.followers],
    ["Following", profile.following],
  ].map(([label, total]) => `| ${label} | ${total} |`);

  return [
    "## Account data",
    "",
    "| Metric | Total |",
    "| --- | ---: |",
    ...rows,
    "",
  ].join("\n");
}

async function main() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const activityQuery = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                date
              }
            }
          }
        }
      }
    }
  `;
  const [profile, allRepositories] = await Promise.all([
    github(`/users/${owner}`),
    github(`/users/${owner}/repos?per_page=100&sort=updated`),
  ]);
  const activity = await githubGraphql(activityQuery, {
    login: owner,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const repositories = allRepositories.filter((repository) => (
    !repository.private && repository.name !== profileRepository
  ));
  const languagesByName = new Map();

  for (const repository of repositories) {
    const languages = await github(`/repos/${owner}/${repository.name}/languages`);
    for (const [name, bytes] of Object.entries(languages)) {
      languagesByName.set(name, (languagesByName.get(name) ?? 0) + bytes);
    }
  }

  const totalBytes = [...languagesByName.values()].reduce((sum, bytes) => sum + bytes, 0) || 1;
  const languages = [...languagesByName.entries()]
    .sort(([, left], [, right]) => right - left)
    .map(([name, bytes]) => ({ name, bytes, percent: (bytes / totalBytes) * 100 }));

  const readme = [
    "<!-- Generated from the public GitHub API by scripts/update-profile.mjs. -->",
    '<div align="center">',
    "  <h1>FallAbigail</h1>",
    '  <p><a href="https://github.com/FallAbigal">@FallAbigal</a></p>',
    "</div>",
    "",
    activityTable(activity),
    "## Languages",
    "",
    '<img src="./assets/languages.svg" alt="Languages used across public repositories" />',
    "",
    statsTable(repositories, profile),
    '<p align="center"><a href="https://github.com/FallAbigal?tab=repositories">View all repositories →</a></p>',
    "",
  ].join("\n");

  const assetsDirectory = new URL("./assets/", root);
  await mkdir(assetsDirectory, { recursive: true });
  await writeFile(new URL("./README.md", root), readme, "utf8");
  await writeFile(new URL("./assets/activity.svg", root), activitySvg(activity.user.contributionsCollection), "utf8");
  await writeFile(new URL("./assets/languages.svg", root), languageSvg(languages), "utf8");
  console.log(`Updated ${repositories.length} repositories, ${languages.length} languages, and ${activity.user.contributionsCollection.contributionCalendar.totalContributions} contributions.`);
}

await main();
