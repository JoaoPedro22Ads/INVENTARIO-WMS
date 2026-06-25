import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface InvMeta {
  name: string;
  inventory_date: string;
  shift: string;
}
interface ItemLite {
  endereco: string | null;
  area: string | null;
  cliente: string;
  nota_fiscal: string | null;
  cte: string | null;
  tipo: string | null;
  saldo_vol: number | null;
  status: string;
  observacoes: string | null;
}
interface ExtraLite {
  endereco: string | null;
  cliente: string | null;
  nota_fiscal: string | null;
  observacoes: string;
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  conferido: "Conferido",
  faltando: "Faltando",
};

export function exportInventoryPdf(inv: InvMeta, items: ItemLite[], extras: ExtraLite[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 60, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("COMBITRANS — Relatório de Inventário", 40, 28);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${inv.name}  •  ${new Date(inv.inventory_date + "T12:00:00").toLocaleDateString("pt-BR")}  •  turno ${inv.shift}`,
    40,
    46,
  );

  doc.setTextColor(0);

  // Resumo
  const total = items.length;
  const done = items.filter((i) => i.status !== "pendente").length;
  const pend = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const volTotal = items.reduce((s, i) => s + (i.saldo_vol ?? 0), 0);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo", 40, 84);
  doc.setFont("helvetica", "normal");
  doc.text(`Total: ${total}    Conferidas: ${done}    Pendentes: ${pend}    Conclusão: ${pct}%`, 40, 100);
  doc.text(`Volume total: ${volTotal.toLocaleString("pt-BR")}    Extras: ${extras.length}`, 40, 114);

  autoTable(doc, {
    startY: 130,
    head: [["Endereço", "Cliente", "NF", "CT-e", "Tipo", "Vol", "Status", "Obs"]],
    body: items.map((it) => [
      it.endereco ?? it.area ?? "—",
      it.cliente,
      it.nota_fiscal ?? "—",
      it.cte ?? "—",
      it.tipo ?? "—",
      it.saldo_vol != null ? String(it.saldo_vol) : "—",
      STATUS_LABEL[it.status] ?? it.status,
      it.observacoes ?? "",
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 110 },
      2: { cellWidth: 60 },
      3: { cellWidth: 60 },
      4: { cellWidth: 38 },
      5: { cellWidth: 30, halign: "right" },
      6: { cellWidth: 50 },
      7: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const v = String(data.cell.raw);
        if (v === "Conferido") data.cell.styles.textColor = [22, 163, 74];
        else if (v === "Faltando") data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });

  if (extras.length) {
    const y = (doc as any).lastAutoTable.finalY + 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cargas extras (fora do sistema)", 40, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Endereço", "Cliente", "NF", "Observação"]],
      body: extras.map((e) => [e.endereco ?? "—", e.cliente ?? "—", e.nota_fiscal ?? "—", e.observacoes]),
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    });
  }

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Página ${i}/${pages}  •  Gerado em ${new Date().toLocaleString("pt-BR")}`,
      pageW - 40,
      doc.internal.pageSize.getHeight() - 20,
      { align: "right" },
    );
  }

  const safeName = inv.name.replace(/[^\w\-]+/g, "_");
  doc.save(`${safeName}.pdf`);
}
