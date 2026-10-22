import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";

const owner = "FallAbigail";
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

function truncate(value, maxLength) {
  const text = String(value ?? "").replaceAll(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

async function avatarAsDataUrl(avatarUrl) {
  const source = new URL(avatarUrl);
  if (source.hostname !== "avatars.githubusercontent.com") {
    throw new Error(`Unexpected GitHub avatar host: ${source.hostname}`);
  }
  source.searchParams.set("size", "144");
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not fetch GitHub profile photo: HTTP ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType)) {
    throw new Error(`Unexpected GitHub avatar content type: ${contentType || "missing"}`);
  }
  const image = Buffer.from(await response.arrayBuffer());
  if (!image.length || image.length > 2_000_000) {
    throw new Error(`GitHub profile photo has an unexpected size: ${image.length} bytes`);
  }

  return `data:${contentType};base64,${image.toString("base64")}`;
}

function profileSvg(profile, repositories, languages, activity, avatarDataUrl) {
  const width = 1000;
  const padding = 28;
  const gap = 14;
  const panelWidth = width - padding * 2;
  const topLanguages = languages.slice(0, 6);
  const stats = [
    { value: repositories.length, label: "PUBLIC REPOS", color: "#75e7ff" },
    { value: repositories.reduce((total, repo) => total + repo.stargazers_count, 0), label: "STARS", color: "#ffd36d" },
    { value: repositories.reduce((total, repo) => total + repo.forks_count, 0), label: "FORKS", color: "#c6a5ff" },
    { value: activity.user.contributionsCollection.totalCommitContributions, label: "COMMITS · 12 MO", color: "#ff8fca" },
  ];
  const contributionCalendar = activity.user.contributionsCollection.contributionCalendar;
  const totalContributions = contributionCalendar.totalContributions;
  const weeks = contributionCalendar.weeks;

  let y = 20;
  const heroY = y;
  const heroHeight = 250;
  y += heroHeight + gap;

  const toolkitY = y;
  const toolkitHeight = 78;
  y += toolkitHeight + gap;

  const statsY = y;
  const statsHeight = 116;
  y += statsHeight + gap;

  const languagesY = y;
  const languagesHeight = 174;
  y += languagesHeight + gap;

  const activityY = y;
  const activityHeight = 190;
  y += activityHeight + gap;

  y += 12;
  const footerY = y;
  const height = footerY + 28;

  const toolkitPills = (() => {
    const items = topLanguages.length ? topLanguages : [{ name: "Open source", percent: 0 }];
    const pillWidths = items.map(({ name }) => Math.max(92, name.length * 8 + 32));
    const totalWidth = pillWidths.reduce((sum, pillWidth) => sum + pillWidth, 0) + (items.length - 1) * 9;
    let x = (width - totalWidth) / 2;
    return items.map((language, index) => {
      const pillWidth = pillWidths[index];
      const color = languageColor(language.name);
      const pill = `<g>
        <rect x="${x}" y="${toolkitY + 30}" width="${pillWidth}" height="30" rx="15" fill="#10101d" stroke="${color}" stroke-opacity=".38" />
        <circle cx="${x + 16}" cy="${toolkitY + 45}" r="3.5" fill="${color}" />
        <text x="${x + 27}" y="${toolkitY + 49}" class="pill-label">${escapeXml(language.name)}</text>
      </g>`;
      x += pillWidth + 9;
      return pill;
    }).join("");
  })();

  const statColumns = stats.map((stat, index) => {
    const columnWidth = panelWidth / stats.length;
    const center = padding + columnWidth * index + columnWidth / 2;
    const divider = index ? `<line x1="${padding + columnWidth * index}" y1="${statsY + 29}" x2="${padding + columnWidth * index}" y2="${statsY + 87}" class="divider" />` : "";
    return `${divider}
      <text x="${center}" y="${statsY + 63}" text-anchor="middle" class="stat-value">${escapeXml(stat.value)}</text>
      <text x="${center}" y="${statsY + 83}" text-anchor="middle" class="stat-label" fill="${stat.color}">${escapeXml(stat.label)}</text>`;
  }).join("");

  const languageBarWidth = panelWidth - 64;
  const languageBarX = padding + 32;
  const totalLanguageBytes = topLanguages.reduce((total, language) => total + language.bytes, 0) || 1;
  let languageOffset = languageBarX;
  const languageSegments = topLanguages.map((language) => {
    const segmentWidth = languageBarWidth * language.bytes / totalLanguageBytes;
    const segment = `<rect x="${languageOffset.toFixed(2)}" y="${languagesY + 54}" width="${Math.max(segmentWidth, 2).toFixed(2)}" height="12" fill="${languageColor(language.name)}" />`;
    languageOffset += segmentWidth;
    return segment;
  }).join("");
  const languageLegend = topLanguages.map((language, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = languageBarX + column * (languageBarWidth / 3);
    const itemY = languagesY + 98 + row * 28;
    return `<g>
      <circle cx="${x + 5}" cy="${itemY - 4}" r="4" fill="${languageColor(language.name)}" />
      <text x="${x + 17}" y="${itemY}" class="body-label">${escapeXml(language.name)}</text>
      <text x="${x + languageBarWidth / 3 - 12}" y="${itemY}" class="body-value" text-anchor="end">${formatPercent(language.percent)}</text>
    </g>`;
  }).join("");

  const cell = 11;
  const cellGap = 3;
  const gridWidth = weeks.length * (cell + cellGap) - cellGap;
  const activityGridX = padding + (panelWidth - gridWidth) / 2;
  const activityGridY = activityY + 77;
  const activityCells = weeks.map((week, weekIndex) => week.contributionDays.map((day, dayIndex) => {
    const x = activityGridX + weekIndex * (cell + cellGap);
    const cellY = activityGridY + dayIndex * (cell + cellGap);
    return `<rect class="activity-level-${activityLevel(day)}" x="${x.toFixed(2)}" y="${cellY}" width="${cell}" height="${cell}" rx="2"><title>${escapeXml(day.date)}: ${day.contributionCount} contributions</title></rect>`;
  }).join("")).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(profile.name || profile.login)} — GitHub profile</title>
  <desc id="desc">An animated developer profile for ${escapeXml(profile.login)} with public repository statistics, programming languages, and contribution activity.</desc>
  <style>
    text { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .panel { fill: #0b0b16; stroke: #25233b; stroke-width: 1; }
    .panel-title { fill: #f1f2ff; font-size: 13px; font-weight: 700; letter-spacing: 2px; }
    .panel-kicker { fill: #8586a8; font-size: 9px; letter-spacing: 1.8px; }
    .divider { stroke: #302d49; stroke-width: 1; stroke-dasharray: 3 4; }
    .pill-label { fill: #e4e6fb; font-size: 10px; font-weight: 600; }
    .stat-value { fill: #ffffff; font-size: 27px; font-weight: 800; }
    .stat-label { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; }
    .body-label { fill: #d9d9ee; font-size: 11px; }
    .body-value { fill: #9293ae; font-size: 10px; font-variant-numeric: tabular-nums; }
    .activity-level-0 { fill: #171725; stroke: #27263c; stroke-width: .5; }
    .activity-level-1 { fill: #173e47; }
    .activity-level-2 { fill: #187985; }
    .activity-level-3 { fill: #31b6bc; }
    .activity-level-4 { fill: #9be8e7; }
    @keyframes float { 0%, 100% { transform: translate(0, 0); opacity: .58; } 50% { transform: translate(28px, -12px); opacity: .92; } }
    @keyframes float-alt { 0%, 100% { transform: translate(0, 0); opacity: .46; } 50% { transform: translate(-22px, 14px); opacity: .82; } }
    @keyframes scan { 0% { transform: translateX(-1050px); opacity: 0; } 15% { opacity: .8; } 85% { opacity: .8; } 100% { transform: translateX(1050px); opacity: 0; } }
    @keyframes pulse { 0%, 100% { opacity: .14; } 50% { opacity: .38; } }
    .glow-a { animation: float 11s ease-in-out infinite; }
    .glow-b { animation: float-alt 13s ease-in-out infinite .8s; }
    .scanline { animation: scan 9s linear infinite; }
    .pulse-line { animation: pulse 5s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
  </style>
  <defs>
    <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#090916"/><stop offset=".55" stop-color="#080811"/><stop offset="1" stop-color="#10101b"/></linearGradient>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111126"/><stop offset=".52" stop-color="#0b0d1a"/><stop offset="1" stop-color="#11101f"/></linearGradient>
    <linearGradient id="name-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".48" stop-color="#8cecff"/><stop offset=".78" stop-color="#d1a8ff"/><stop offset="1" stop-color="#ff9dce"/></linearGradient>
    <linearGradient id="scan-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#74e7ff" stop-opacity="0"/><stop offset=".5" stop-color="#74e7ff" stop-opacity=".26"/><stop offset="1" stop-color="#d19bff" stop-opacity="0"/></linearGradient>
    <radialGradient id="cyan-glow"><stop offset="0" stop-color="#00d9ee" stop-opacity=".22"/><stop offset="1" stop-color="#00d9ee" stop-opacity="0"/></radialGradient>
    <radialGradient id="violet-glow"><stop offset="0" stop-color="#9a55ff" stop-opacity=".24"/><stop offset="1" stop-color="#9a55ff" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#aaa7ff" stroke-opacity=".035" stroke-width=".7"/></pattern>
    <clipPath id="hero-clip"><rect x="${padding}" y="${heroY}" width="${panelWidth}" height="${heroHeight}" rx="20"/></clipPath>
    <clipPath id="avatar-clip"><circle cx="${padding + 50}" cy="${heroY + 48}" r="13.5"/></clipPath>
    <clipPath id="language-bar-clip"><rect x="${languageBarX}" y="${languagesY + 54}" width="${languageBarWidth}" height="12" rx="6"/></clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#canvas)" rx="24" />
  <rect width="${width}" height="${height}" fill="url(#grid)" rx="24" />

  <g clip-path="url(#hero-clip)">
    <rect x="${padding}" y="${heroY}" width="${panelWidth}" height="${heroHeight}" rx="20" fill="url(#hero)" />
    <ellipse class="glow-a" cx="${padding + 190}" cy="${heroY + 120}" rx="240" ry="130" fill="url(#violet-glow)" />
    <ellipse class="glow-b" cx="${width - 170}" cy="${heroY + 170}" rx="270" ry="150" fill="url(#cyan-glow)" />
    <circle cx="${width / 2}" cy="${heroY + 128}" r="114" fill="none" stroke="#b8a0ff" stroke-opacity=".09" />
    <circle cx="${width / 2}" cy="${heroY + 128}" r="150" fill="none" stroke="#6fe6ff" stroke-opacity=".07" />
    <rect class="scanline" x="0" y="${heroY + 112}" width="280" height="30" fill="url(#scan-gradient)" />
    <line class="pulse-line" x1="${padding + 210}" y1="${heroY + 188}" x2="${width - padding - 210}" y2="${heroY + 188}" stroke="#82e9ff" stroke-opacity=".5" />
    <path d="M ${padding + 24} ${heroY + 22} h 18 M ${padding + 24} ${heroY + 22} v 18 M ${width - padding - 24} ${heroY + 22} h -18 M ${width - padding - 24} ${heroY + 22} v 18 M ${padding + 24} ${heroY + heroHeight - 22} h 18 M ${padding + 24} ${heroY + heroHeight - 22} v -18 M ${width - padding - 24} ${heroY + heroHeight - 22} h -18 M ${width - padding - 24} ${heroY + heroHeight - 22} v -18" fill="none" stroke="#8ae9ff" stroke-opacity=".55" stroke-width="1.4" />
  </g>
  <rect x="${padding + .5}" y="${heroY + .5}" width="${panelWidth - 1}" height="${heroHeight - 1}" rx="20" fill="none" stroke="#35304f" />
  <image href="${avatarDataUrl}" x="${padding + 36.5}" y="${heroY + 34.5}" width="27" height="27" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)" />
  <circle cx="${padding + 50}" cy="${heroY + 48}" r="15" fill="none" stroke="#6be5fa" stroke-opacity=".82" />
  <text x="${padding + 76}" y="${heroY + 45}" class="panel-kicker">GITHUB PROFILE</text>
  <text x="${padding + 76}" y="${heroY + 60}" fill="#babbd4" font-size="9" letter-spacing="1">@${escapeXml(profile.login)}</text>
  <rect x="${width - padding - 170}" y="${heroY + 35}" width="142" height="26" rx="13" fill="#121322" stroke="#4b426e" />
  <circle cx="${width - padding - 152}" cy="${heroY + 48}" r="3" fill="#8cecff" />
  <text x="${width - padding - 141}" y="${heroY + 52}" fill="#c5c6de" font-size="9" font-weight="700" letter-spacing="1">PUBLIC PROJECTS</text>
  <text x="${width / 2}" y="${heroY + 126}" text-anchor="middle" fill="url(#name-gradient)" font-size="48" font-weight="900" letter-spacing="7">${escapeXml(profile.name || profile.login)}</text>
  <text x="${width / 2}" y="${heroY + 157}" text-anchor="middle" fill="#d9d5f1" font-size="11" font-weight="700" letter-spacing="3">SOFTWARE · TOOLS · INTERACTIVE PROJECTS</text>
  <text x="${width / 2}" y="${heroY + 215}" text-anchor="middle" fill="#8f90ac" font-size="10" letter-spacing="1.5">BUILDING AND SHARING PROJECTS ON GITHUB</text>

  <text x="${padding + 2}" y="${toolkitY + 13}" class="panel-kicker">TOOLKIT</text>
  <line x1="${padding + 77}" y1="${toolkitY + 10}" x2="${width - padding}" y2="${toolkitY + 10}" stroke="#292741" />
  ${toolkitPills}

  <rect class="panel" x="${padding}" y="${statsY}" width="${panelWidth}" height="${statsHeight}" rx="16" />
  <text x="${padding + 22}" y="${statsY + 23}" class="panel-kicker">PROFILE METRICS</text>
  ${statColumns}

  <rect class="panel" x="${padding}" y="${languagesY}" width="${panelWidth}" height="${languagesHeight}" rx="16" />
  <text x="${padding + 22}" y="${languagesY + 27}" class="panel-title">LANGUAGE DISTRIBUTION</text>
  <text x="${width - padding - 22}" y="${languagesY + 27}" text-anchor="end" class="panel-kicker">PUBLIC REPOSITORIES</text>
  <rect x="${languageBarX}" y="${languagesY + 54}" width="${languageBarWidth}" height="12" rx="6" fill="#191927" />
  <g clip-path="url(#language-bar-clip)">${languageSegments}</g>
  ${languageLegend}

  <rect class="panel" x="${padding}" y="${activityY}" width="${panelWidth}" height="${activityHeight}" rx="16" />
  <text x="${padding + 22}" y="${activityY + 28}" class="panel-title">ACTIVITY PULSE</text>
  <text x="${width - padding - 22}" y="${activityY + 28}" text-anchor="end" class="panel-kicker">${totalContributions} CONTRIBUTIONS · LAST 12 MONTHS</text>
  <text x="${activityGridX}" y="${activityY + 61}" class="panel-kicker">LESS</text>
  <text x="${activityGridX + gridWidth}" y="${activityY + 61}" text-anchor="end" class="panel-kicker">MORE</text>
  <g>${activityCells}</g>

  <line x1="${padding}" y1="${footerY - 8}" x2="${width - padding}" y2="${footerY - 8}" stroke="#292741" />
  <text x="${padding + 2}" y="${footerY + 9}" class="panel-kicker">FALLABIGAIL · GITHUB PROFILE</text>
  <text x="${width - padding - 2}" y="${footerY + 9}" text-anchor="end" class="panel-kicker">DATA REFRESHED AUTOMATICALLY</text>
</svg>`;
}

function repositorySlug(name) {
  return name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function featuredRepositories(repositories) {
  const preferredOrder = [
    "CanteenOS",
    "MedikaFlow",
    "LibSync",
    "blindmaze-game",
    "smk-bppi-baleendah",
  ];
  const rank = new Map(preferredOrder.map((name, index) => [name.toLowerCase(), index]));
  return [...repositories]
    .sort((left, right) => {
      const leftRank = rank.get(left.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || right.updated_at.localeCompare(left.updated_at);
    })
    .slice(0, 6);
}

function repositoryCardSvg(repository) {
  const width = 460;
  const height = 118;
  const accent = languageColor(repository.language || "TypeScript");
  const description = truncate(repository.description || "Public GitHub repository", 64);
  const language = repository.language || "Project";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(repository.name)}</title>
  <desc id="desc">${escapeXml(description)}. Open the repository on GitHub.</desc>
  <defs>
    <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11111f"/><stop offset="1" stop-color="#0b0b15"/></linearGradient>
    <linearGradient id="accent-line" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity=".2"/></linearGradient>
  </defs>
  <style>
    text { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .name { fill: #f3f3ff; font-size: 15px; font-weight: 700; }
    .description { fill: #a5a5bf; font-size: 11px; }
    .meta { fill: #8586a2; font-size: 10px; }
    .arrow { fill: none; stroke: #9c9db8; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  </style>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="15" fill="url(#card-bg)" stroke="#302d49" />
  <rect x="1" y="22" width="3" height="54" rx="1.5" fill="url(#accent-line)" />
  <text x="23" y="34" class="name">${escapeXml(truncate(repository.name, 40))}</text>
  <text x="23" y="57" class="description">${escapeXml(description)}</text>
  <circle cx="27" cy="87" r="4" fill="${accent}" />
  <text x="39" y="91" class="meta">${escapeXml(language)}</text>
  <text x="${width - 61}" y="91" text-anchor="end" class="meta">★ ${repository.stargazers_count}  ·  Forks ${repository.forks_count}</text>
  <path class="arrow" d="M ${width - 34} 25 h 10 v 10 M ${width - 44} 36 l 10 -10" />
</svg>`;
}

function projectTableMarkup(repositories) {
  const rows = [];
  for (let index = 0; index < repositories.length; index += 2) {
    const row = repositories.slice(index, index + 2).map((repository) => {
      const fileName = `project-${repositorySlug(repository.name)}.svg`;
      return `<td align="center"><a href="${escapeXml(repository.html_url)}"><img src="./assets/projects/${fileName}" width="460" alt="Open ${escapeXml(repository.name)} on GitHub" /></a></td>`;
    });
    if (row.length === 1 && index > 0) {
      rows.push(`<tr><td colspan="2" align="center">${row[0].replace('<td align="center">', "").replace("</td>", "")}</td></tr>`);
    } else {
      rows.push(`<tr>${row.join("")}</tr>`);
    }
  }
  return `<table align="center" border="0"><tbody>${rows.join("")}</tbody></table>`;
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
  const projects = featuredRepositories(repositories);
  const avatarDataUrl = await avatarAsDataUrl(profile.avatar_url);

  const readme = [
    "<!-- Generated from the public GitHub API by scripts/update-profile.mjs. -->",
    `<p align="center"><a href="https://github.com/${owner}?tab=repositories"><img src="./assets/profile.svg" alt="${escapeXml(profile.name || owner)} GitHub statistics, languages, and contribution activity" /></a></p>`,
    `<p align="center"><a href="https://github.com/${owner}?tab=repositories"><img src="./assets/project-constellation.gif" width="900" alt="Animated project map connecting ${escapeXml(owner)} to CanteenOS, LibSync, MedikaFlow, BlindMaze, and the SMK BPPI website" /></a></p>`,
    '<h2 align="center">Featured projects</h2>',
    projectTableMarkup(projects),
    '<h3 align="center">BlindMaze easter egg</h3>',
    '<p align="center"><a href="https://github.com/FallAbigail/blindmaze-game"><img src="./assets/blindmaze-easter-egg.gif" width="460" alt="A glowing cyan dot solving a small BlindMaze route" /></a></p>',
    `<p align="center"><a href="https://github.com/${owner}?tab=repositories">Explore all repositories →</a></p>`,
    "",
  ].join("\n");

  const assetsDirectory = new URL("./assets/", root);
  const projectAssetsDirectory = new URL("./assets/projects/", root);
  await mkdir(assetsDirectory, { recursive: true });
  await mkdir(projectAssetsDirectory, { recursive: true });
  await writeFile(new URL("./README.md", root), readme, "utf8");
  await writeFile(new URL("./assets/profile.svg", root), profileSvg(profile, repositories, languages, activity, avatarDataUrl), "utf8");
  await writeFile(new URL("./assets/activity.svg", root), activitySvg(activity.user.contributionsCollection), "utf8");
  await writeFile(new URL("./assets/languages.svg", root), languageSvg(languages), "utf8");
  const projectFiles = new Set();
  for (const repository of projects) {
    const fileName = `project-${repositorySlug(repository.name)}.svg`;
    projectFiles.add(fileName);
    await writeFile(new URL(`./assets/projects/${fileName}`, root), repositoryCardSvg(repository), "utf8");
  }
  for (const fileName of await readdir(projectAssetsDirectory)) {
    if (fileName.startsWith("project-") && fileName.endsWith(".svg") && !projectFiles.has(fileName)) {
      await unlink(new URL(`./assets/projects/${fileName}`, root));
    }
  }
  console.log(`Updated ${repositories.length} repositories, ${languages.length} languages, and ${activity.user.contributionsCollection.contributionCalendar.totalContributions} contributions.`);
}

await main();
