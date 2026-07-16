#!/usr/bin/env node
/**
 * Exporta conversas do Cursor (agent-transcripts/*.jsonl) para Markdown legível.
 *
 * Uso:
 *   node docs/agent-sessions/scripts/export-agent-transcripts.mjs
 *   node docs/agent-sessions/scripts/export-agent-transcripts.mjs --source "C:/path/to/agent-transcripts"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const DEFAULT_SOURCE =
  process.env.CURSOR_AGENT_TRANSCRIPTS ??
  path.join(
    process.env.USERPROFILE ?? process.env.HOME ?? "",
    ".cursor/projects/f-Projeto-Kinevo/agent-transcripts"
  );

const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "docs/agent-sessions/archives");

function parseArgs(argv) {
  const args = { source: DEFAULT_SOURCE, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--source" && argv[i + 1]) {
      args.source = path.resolve(argv[++i]);
    } else if (argv[i] === "--output" && argv[i + 1]) {
      args.output = path.resolve(argv[++i]);
    }
  }
  return args;
}

function walkJsonlFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsonlFiles(full, out);
    else if (ent.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

function extractTextBlocks(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function cleanTranscriptText(text) {
  return text
    .replace(/\[REDACTED\]/g, "")
    .replace(/<timestamp>[^<]*<\/timestamp>/g, "")
    .replace(/<user_query>\s*/g, "")
    .replace(/<\/user_query>/g, "")
    .replace(/<agent_transcripts>[\s\S]*?<\/agent_transcripts>/g, "")
    .replace(/<transcript_location>[\s\S]*?<\/transcript_location>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstUserPreview(text) {
  const cleaned = cleanTranscriptText(text);
  const oneLine = cleaned.replace(/\s+/g, " ").trim();
  return oneLine.slice(0, 160) + (oneLine.length > 160 ? "…" : "");
}

function sessionTitleFromPath(relPath) {
  const base = path.basename(relPath, ".jsonl");
  const parent = path.basename(path.dirname(relPath));
  if (parent === "subagents") return `Subagente ${base.slice(0, 8)}`;
  return `Sessão ${base.slice(0, 8)}`;
}

function convertJsonlToMarkdown(filePath, relPath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\n/).filter(Boolean);
  const title = sessionTitleFromPath(relPath);
  const parts = [
    `# ${title}`,
    "",
    `- **Arquivo origem:** \`${relPath.replace(/\\/g, "/")}\``,
    `- **Exportado em:** ${new Date().toISOString()}`,
    "",
    "---",
    "",
  ];

  let userCount = 0;
  let assistantCount = 0;
  let preview = "";

  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    const text = cleanTranscriptText(extractTextBlocks(row.message?.content));
    if (!text) continue;

    if (row.role === "user") {
      userCount += 1;
      if (!preview) preview = firstUserPreview(text);
      parts.push(`## Usuário (${userCount})`, "", text, "", "---", "");
    } else if (row.role === "assistant") {
      assistantCount += 1;
      parts.push(`## Assistente (${assistantCount})`, "", text, "", "---", "");
    }
  }

  return {
    markdown: parts.join("\n"),
    meta: { userCount, assistantCount, preview, title, relPath },
  };
}

function buildIndex(entries) {
  const parents = entries.filter((e) => !e.relPath.includes(`${path.sep}subagents${path.sep}`));
  const subagents = entries.filter((e) => e.relPath.includes(`${path.sep}subagents${path.sep}`));

  const lines = [
    "# Índice — Conversas dos Agentes (Kinevo)",
    "",
    "Arquivo gerado automaticamente. Reexecute o script de exportação após novas sessões no Cursor.",
    "",
    "## Como atualizar",
    "",
    "```bash",
    "node docs/agent-sessions/scripts/export-agent-transcripts.mjs",
    "```",
    "",
    "## Sessões principais",
    "",
    "| Sessão | Mensagens (U/A) | Prévia | Arquivo |",
    "|--------|-----------------|--------|---------|",
  ];

  for (const entry of parents.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const id = path.basename(entry.relPath, ".jsonl");
    const mdName = entry.relPath.replace(/\.jsonl$/i, ".md").replace(/\\/g, "/");
    lines.push(
      `| [\`${id.slice(0, 8)}\`](./archives/${mdName}) | ${entry.userCount} / ${entry.assistantCount} | ${entry.preview.replace(/\|/g, "\\|")} | \`${mdName}\` |`
    );
  }

  lines.push("", "## Subagentes", "", "| Subagente | Mensagens (U/A) | Prévia | Arquivo |", "|-----------|-----------------|--------|---------|");

  for (const entry of subagents.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const id = path.basename(entry.relPath, ".jsonl");
    const mdName = entry.relPath.replace(/\.jsonl$/i, ".md").replace(/\\/g, "/");
    lines.push(
      `| \`${id.slice(0, 8)}\` | ${entry.userCount} / ${entry.assistantCount} | ${entry.preview.replace(/\|/g, "\\|")} | [\`arquivo\`](./archives/${mdName}) |`
    );
  }

  lines.push(
    "",
    "## Referência rápida por tema",
    "",
    "### Mobile (`Kinevo_Alunos`) — sessão `662ec52c`",
    "- Integração Cloud (Axios, React Query, Firebase)",
    "- Sessão de treino, circuito/EMOM, bi-sets, técnicas",
    "- Data loss em `completedExercises` + persistência AsyncStorage",
    "- Loop automático execução↔descanso em exercícios de tempo",
    "- DESC. do card concluído via Total − Ativo (`d3b2282`)",
    "- **Cancelar Exercício** isolado: `handleCancelExercise`, `clearAbortedExerciseStoreState`, `beginSafeWorkoutExit` (`524683a`)",
    "- Rodapé: um botão Cancelar Exercício + Cancelar Treino lado a lado",
    "",
    "### Web (`Kinevo_v2` + `Kinevo Pro`) — sessão `78936e37`",
    "- Retomada de conversa exportada (caminhos relativos / Performance)",
    "- Arquivamento de laudos em `laudosAlunos`",
    "- Variação por mesociclo, métodos, chat/WhatsApp",
    "- Drag-and-drop de semanas no editor (`editorState.js`, `app.js`)",
    "- Volume por blocos/técnicas + pausa de periodização (`exerciseProfileManager.js`, `43464be`)",
    "- Campo `intervalo` nas técnicas da biblioteca — Cloud Function (`2e53192`)",
    "",
    "### Ecossistema + Web UI — sessão `c0b016ef`",
    "- Mapa completo Kinevo_v2 / Kinevo Pro / Kinevo_Alunos",
    "- Edição em massa: excluir e adicionar exercício na biblioteca",
    "",
    "### Salvamento completo do projeto",
    "- Vasculhar **4 repositórios Git**: `Projeto_Kinevo`, `Kinevo_Alunos`, `Kinevo_v2`, `Kinevo Pro`",
    "- Conversas: `node docs/agent-sessions/scripts/export-agent-transcripts.mjs`",
    "",
    "## Localização original (Cursor)",
    "",
    "`%USERPROFILE%\\.cursor\\projects\\f-Projeto-Kinevo\\agent-transcripts\\`",
    ""
  );

  return lines.join("\n");
}

function main() {
  const { source, output } = parseArgs(process.argv);

  if (!fs.existsSync(source)) {
    console.error(`Pasta de transcripts não encontrada: ${source}`);
    process.exit(1);
  }

  fs.mkdirSync(output, { recursive: true });

  const files = walkJsonlFiles(source);
  const indexEntries = [];

  for (const file of files) {
    const rel = path.relative(source, file);
    const { markdown, meta } = convertJsonlToMarkdown(file, rel);
    const outMd = path.join(output, rel.replace(/\.jsonl$/i, ".md"));
    fs.mkdirSync(path.dirname(outMd), { recursive: true });
    fs.writeFileSync(outMd, markdown, "utf8");
    indexEntries.push({ ...meta });
    console.log(`OK ${rel}`);
  }

  const indexPath = path.join(path.dirname(output), "INDEX.md");
  fs.writeFileSync(indexPath, buildIndex(indexEntries), "utf8");

  const readmePath = path.join(path.dirname(output), "README.md");
  fs.writeFileSync(
    readmePath,
    [
      "# Arquivo de conversas dos agentes",
      "",
      "Esta pasta guarda exportações legíveis das sessões do Cursor para consulta futura.",
      "",
      "- **Índice:** [INDEX.md](./INDEX.md)",
      "- **Transcripts em Markdown:** [archives/](./archives/)",
      "- **Script de exportação:** [scripts/export-agent-transcripts.mjs](./scripts/export-agent-transcripts.mjs)",
      "",
      "Para atualizar após novas conversas:",
      "",
      "```bash",
      "node docs/agent-sessions/scripts/export-agent-transcripts.mjs",
      "```",
      "",
    ].join("\n"),
    "utf8"
  );

  console.log(`\nExportadas ${files.length} conversas → ${output}`);
  console.log(`Índice: ${indexPath}`);
}

main();
