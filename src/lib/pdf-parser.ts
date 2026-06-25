import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface ParsedItem {
  pagador_codigo: string | null;
  cliente: string;
  tipo_produto_codigo: number | null;
  tipo_produto_nome: string | null;
  entrada: string | null; // YYYY-MM-DD
  nota_fiscal: string | null;
  tipo: string | null; // CTW | NFW
  cte: string | null;
  contrato: string | null;
  endereco: string | null;
  area: string | null;
  saldo_vol: number | null;
  saldo_financ: number | null;
}

const PAGADOR_HEADER_RE = /^(\d{1,3}(?:\.\d{3})*|\d+)\s*-\s*(.+)$/;
const TIPO_PRODUTO_RE = /^([1-9])\s*-\s*(.+)$/;
const DATA_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const NUM_PTBR_RE = /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$/;
const TIPO_DOC_RE = /^(CTW|NFW)$/;
const SO_DIGITOS_RE = /^\d+$/;

// Áreas conhecidas (uma palavra). G2/G3/G4 = "GALPAO N" abreviado.
const AREAS_BASE = new Set([
  "GALPAO",
  "GALPÃO",
  "PATIO",
  "PÁTIO",
  "AVARIA",
  "AVARIAS",
  "CDMAO",
  "G2",
  "G3",
  "G4",
]);

const NOISE_RE = [
  /^Combitrans/i,
  /^COMBITRANS/i,
  /^Controle Armazenagem/i,
  /^Data\s*:/i,
  /^Hora\s*:/i,
  /^M[óo]dulo WMS/i,
  /^Controle_Armazenagem/i,
  /^P[áa]gina\b/i,
  /^JOAO\./i,
  /^datapar$/i,
  /^Entrada\s+Nota\s+Fiscal/i,
  /^Total\s*:/i,
];

function parseNumberPtBr(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function dataToISO(s: string): string | null {
  const m = DATA_RE.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isNoise(line: string): boolean {
  return NOISE_RE.some((re) => re.test(line));
}

async function extractLines(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as any[]) {
      const str = (it.str || "").trim();
      if (!str) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, s: str });
    }
    const ys = Array.from(rows.keys()).sort((a, b) => b - a);
    for (const y of ys) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((c) => c.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) allLines.push(line);
    }
  }
  return allLines;
}

/**
 * Extrai área do final dos tokens. Retorna [enderecoTokens, area|null].
 * Casos:
 *   ... QUADRA 1 GALPAO        -> endereco="QUADRA 1", area="GALPAO"
 *   ... QUADRA 1 GALPAO 4      -> endereco="QUADRA 1", area="GALPAO 4"
 *   ... AVARIAS                -> endereco=null, area="AVARIAS"
 *   ... G4                     -> endereco=null, area="G4"
 */
function splitEnderecoArea(tokens: string[]): { endereco: string | null; area: string | null } {
  if (tokens.length === 0) return { endereco: null, area: null };

  // "GALPAO 4" como área (2 tokens)
  if (tokens.length >= 2) {
    const penult = tokens[tokens.length - 2].toUpperCase();
    const last = tokens[tokens.length - 1];
    if ((penult === "GALPAO" || penult === "GALPÃO") && /^\d+$/.test(last)) {
      const area = `${tokens[tokens.length - 2]} ${last}`;
      const end = tokens.slice(0, -2).join(" ").trim() || null;
      return { endereco: end, area };
    }
  }

  // 1 token de área conhecida
  const last = tokens[tokens.length - 1].toUpperCase();
  if (AREAS_BASE.has(last)) {
    const end = tokens.slice(0, -1).join(" ").trim() || null;
    return { endereco: end, area: tokens[tokens.length - 1] };
  }

  // sem área → tudo é endereço
  return { endereco: tokens.join(" "), area: null };
}

// token de endereço começa com letra (QUADRA, AVARIA, GALPAO, G2, etc.)
const ENDERECO_TOK_RE = /^[A-Za-zÀ-ÿ]/;

/**
 * Linha de item:
 *   DATA [NF?] TIPO [num1?] [num2?] ENDEREÇO_TOKENS... SALDO_VOL SALDO_FINANC
 *
 * Estratégia: ancora no TIPO (CTW/NFW). Tudo numérico antes do tipo é NF.
 * Tudo numérico depois do tipo (até começar token alfa) são NF/CTE/contrato.
 *   - CTW: 2 nums => [cte, contrato]; 1 num => [contrato]
 *   - NFW: 2 nums => [nf?, contrato]; 1 num => [contrato]   (NFW não tem CTE)
 * Tokens alfa restantes = endereço + área.
 */
function parseItemLine(tokens: string[]): {
  entrada: string | null;
  nota_fiscal: string | null;
  tipo: string | null;
  cte: string | null;
  contrato: string | null;
  endereco: string | null;
  area: string | null;
  saldo_vol: number | null;
  saldo_financ: number | null;
} | null {
  if (tokens.length < 5) return null;

  const entrada = dataToISO(tokens[0]);
  if (!entrada) return null;

  const last = tokens[tokens.length - 1];
  const beforeLast = tokens[tokens.length - 2];
  if (!NUM_PTBR_RE.test(last) || !NUM_PTBR_RE.test(beforeLast)) return null;
  const saldoFinanc = parseNumberPtBr(last);
  const saldoVol = parseNumberPtBr(beforeLast);

  // Acha posição do tipo (CTW/NFW)
  let tipoIdx = -1;
  for (let i = 1; i < tokens.length - 2; i++) {
    if (TIPO_DOC_RE.test(tokens[i])) { tipoIdx = i; break; }
  }
  if (tipoIdx === -1) return null;
  const tipo = tokens[tipoIdx];

  // NF antes do tipo (0 ou 1 número)
  let nf: string | null = null;
  const preTipo = tokens.slice(1, tipoIdx);
  if (preTipo.length > 0 && SO_DIGITOS_RE.test(preTipo[0])) {
    nf = preTipo[0];
  }

  // Middle: depois do tipo até antes dos 2 saldos
  const middle = tokens.slice(tipoIdx + 1, tokens.length - 2);

  // Onde começam os tokens alfa (endereço)?
  let enderecoStart = middle.findIndex((t) => ENDERECO_TOK_RE.test(t));
  if (enderecoStart === -1) enderecoStart = middle.length;

  const nums = middle.slice(0, enderecoStart);
  const endTokens = middle.slice(enderecoStart);

  let cte: string | null = null;
  let contrato: string | null = null;

  if (tipo === "CTW") {
    if (nums.length >= 2) { cte = nums[0]; contrato = nums[1]; }
    else if (nums.length === 1) { contrato = nums[0]; }
  } else {
    // NFW (sem CTE). Se tem 2 nums e ainda não temos NF, primeiro vira NF.
    if (nums.length >= 2) {
      if (!nf) nf = nums[0];
      contrato = nums[nums.length - 1];
    } else if (nums.length === 1) {
      contrato = nums[0];
    }
  }

  const { endereco, area } = splitEnderecoArea(endTokens);

  return {
    entrada,
    nota_fiscal: nf,
    tipo,
    cte,
    contrato,
    endereco,
    area,
    saldo_vol: saldoVol,
    saldo_financ: saldoFinanc,
  };
}

export async function parseInventoryPdf(file: File): Promise<ParsedItem[]> {
  const lines = await extractLines(file);
  const items: ParsedItem[] = [];

  let currentPagador: string | null = null;
  let currentCliente = "";
  let currentTipoCod: number | null = null;
  let currentTipoNome: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isNoise(line)) continue;

    // AVARIA / AVARIAS como cabeçalho de seção (cliente)
    if (/^AVARIAS?$/i.test(line)) {
      currentPagador = null;
      currentCliente = "AVARIA";
      currentTipoCod = null;
      currentTipoNome = null;
      continue;
    }

    // Tipo de produto (1-9 + nome)
    const tp = TIPO_PRODUTO_RE.exec(line);
    if (tp && !DATA_RE.test(line.split(" ")[0])) {
      currentTipoCod = parseInt(tp[1], 10);
      currentTipoNome = tp[2].trim();
      continue;
    }

    // Cabeçalho pagador / cliente
    const pag = PAGADOR_HEADER_RE.exec(line);
    if (pag && !DATA_RE.test(line.split(" ")[0]) && !TIPO_PRODUTO_RE.test(line)) {
      currentPagador = pag[1];
      currentCliente = pag[2].trim();
      currentTipoCod = null;
      currentTipoNome = null;
      continue;
    }

    // Linha de item
    const firstTok = line.split(" ")[0];
    if (DATA_RE.test(firstTok) && currentCliente) {
      const tokens = line.split(/\s+/);
      const parsed = parseItemLine(tokens);
      if (parsed) {
        items.push({
          pagador_codigo: currentPagador,
          cliente: currentCliente,
          tipo_produto_codigo: currentTipoCod,
          tipo_produto_nome: currentTipoNome,
          ...parsed,
        });
      }
    }
  }
  return items;
}
