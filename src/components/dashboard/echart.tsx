"use client";

import { BarChart, HeatmapChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import * as React from "react";

// Import modular: só o que os gráficos do app usam. `import "echarts"` inteiro
// põe ~1MB no bundle do cliente por dois tipos de gráfico.
echarts.use([
  BarChart,
  HeatmapChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);

/**
 * Gráfico ECharts. Inicializa no mount, reaplica a `option` quando ela muda e
 * acompanha a largura do container (a sidebar recolhe e o card muda de tamanho
 * sem evento de janela).
 */
export function EChart({
  option,
  height,
  ariaLabel,
}: {
  option: EChartsCoreOption;
  height: number;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const chart = React.useRef<echarts.ECharts | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, null, { renderer: "svg" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  React.useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={ariaLabel} style={{ height, width: "100%" }} />;
}
