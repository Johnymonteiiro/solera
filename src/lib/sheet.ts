import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

// Planilha de export (CSV ou XLSX) a partir de linhas já montadas.
//
// Existe porque os três exports do estudo (agent-metrics, judge-repeat,
// revision-pairs) escreviam o mesmo bloco de ExcelJS + headers, e um dataset
// cujo CSV sai com encoding diferente do XLSX é dor de cabeça garantida na hora
// de cruzar com o Google Forms. O formato vem da extensão do arquivo.

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
}

export async function sheetResponse(
  columns: SheetColumn[],
  rows: Record<string, unknown>[],
  filename: string,
): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(filename.replace(/\.\w+$/, ""));
  sheet.columns = columns;
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };

  if (filename.endsWith(".xlsx")) {
    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer = await workbook.csv.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
