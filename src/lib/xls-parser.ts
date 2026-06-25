import * as XLSX from "xlsx";
import type { ParsedItem } from "./pdf-parser";

const PAGADOR_RE = /^(\d{1,3}(?:\.\d{3})*|\d+)\s*-\s*(.+)$/;
const TIPO_PROD_RE = /^([1-9])\s*-\s*(.+)$/;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toISODate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const str = String(v).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(str);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2 = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

/**
 * Layout do XLS exportado pelo WMS (índices 0-based):
 *  0  Entrada / Cliente / Tipo Produto / "AVARIA"
 *  2  Nota Fiscal (CTW)
 *  4  Tipo (NFW | CTW)
 *  7  Embarque NF-e
 *  9  Contrato (ignorado)
 * 11  Endereço (QUADRA n / AVARIA / PATIO / GALPAO 4)
 * 13  Área (GALPAO / G4 / AVARIA / PATIO)
 * 15  Saldo Vol.
 * 18  Saldo Financ.
 *
 * Regras:
 *  - NFW: nota_fiscal = coluna 7 (Embarque NF-e); cte = null
 *  - CTW: nota_fiscal = coluna 2 (Nota Fiscal);   cte = coluna 7 (CT-e)
 */
export async function parseInventoryXls(file: File): Promise<ParsedItem[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const items: ParsedItem[] = [];
  let pagador: string | null = null;
  let cliente = "";
  let tipoCod: number | null = null;
  let tipoNome: string | null = null;

  for (const r of rows) {
    if (!r) continue;
    const c0 = s(r[0]);
    const tipo = s(r[4]).toUpperCase();

    // Cabeçalho de seção AVARIA
    if (/^AVARIAS?$/i.test(c0) && !tipo) {
      pagador = null;
      cliente = "AVARIA";
      tipoCod = null;
      tipoNome = null;
      continue;
    }

    // Tipo de produto: "1 - BEBIDAS DIVERSAS"
    const mTp = TIPO_PROD_RE.exec(c0);
    if (mTp && !tipo) {
      tipoCod = parseInt(mTp[1], 10);
      tipoNome = mTp[2].trim();
      continue;
    }

    // Pagador / Cliente: "508 - HNK BR BEBIDAS LTDA"
    const mPag = PAGADOR_RE.exec(c0);
    if (mPag && !tipo && !TIPO_PROD_RE.test(c0)) {
      pagador = mPag[1];
      cliente = mPag[2].trim();
      tipoCod = null;
      tipoNome = null;
      continue;
    }

    // Linha de item (precisa ter Tipo CTW/NFW)
    if (tipo !== "CTW" && tipo !== "NFW") continue;

    const entrada = toISODate(r[0]);
    if (!entrada) continue;

    const nf2 = s(r[2]) || null; // Nota Fiscal (CTW)
    const nf7 = s(r[7]) || null; // Embarque NF-e
    const contrato = s(r[9]) || null;
    const endereco = s(r[11]) || null;
    const area = s(r[13]) || null;
    const saldoVol = num(r[15]);
    const saldoFinanc = num(r[18]);

    let nota_fiscal: string | null;
    let cte: string | null;
    if (tipo === "CTW") {
      nota_fiscal = nf2;
      cte = nf7;
    } else {
      // NFW: só tem a NF, que vem em "Embarque NF-e"
      nota_fiscal = nf7;
      cte = null;
    }

    items.push({
      pagador_codigo: pagador,
      cliente: cliente || (endereco === "AVARIA" ? "AVARIA" : ""),
      tipo_produto_codigo: tipoCod,
      tipo_produto_nome: tipoNome,
      entrada,
      nota_fiscal,
      tipo,
      cte,
      contrato,
      endereco,
      area,
      saldo_vol: saldoVol,
      saldo_financ: saldoFinanc,
    });
  }

  return items;
}
