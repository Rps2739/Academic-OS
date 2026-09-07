import { useMemo, useState } from "react";

export interface Candle {
  t: number; // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
}

interface CandlestickChartProps {
  candles: Candle[];
  height?: number;
}

const VIEW_W = 600;

/** Hand-rolled SVG — no charting library. Token-driven colours stay
 * theme-aware for free in both light and dark; the app has no chart
 * dependency today and the bundle is already ~2.8 MB. */
export function CandlestickChart({ candles, height = 220 }: CandlestickChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { path, yTicks, xLabels, scaleY, candleWidth } = useMemo(() => {
    if (candles.length === 0) {
      return { path: [], yTicks: [], xLabels: [], scaleY: (v: number) => v, candleWidth: 0 };
    }
    const highs = candles.map((c) => c.h);
    const lows = candles.map((c) => c.l);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const pad = (max - min) * 0.05 || 1;
    const yMin = min - pad;
    const yMax = max + pad;

    const scaleY = (v: number) => height - ((v - yMin) / (yMax - yMin)) * height;
    const candleWidth = VIEW_W / candles.length;

    const ticks = 5;
    const yTicks = Array.from({ length: ticks }, (_, i) => {
      const v = yMin + ((yMax - yMin) * i) / (ticks - 1);
      return { value: v, y: scaleY(v) };
    });

    const labelCount = Math.min(6, candles.length);
    const xLabels = Array.from({ length: labelCount }, (_, i) => {
      const idx = Math.round((i / (labelCount - 1 || 1)) * (candles.length - 1));
      const date = new Date(candles[idx].t * 1000);
      return { x: idx * candleWidth + candleWidth / 2, label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
    });

    return { path: candles, yTicks, xLabels, scaleY, candleWidth };
  }, [candles, height]);

  if (candles.length === 0) {
    return <div className="candlestick-chart__empty">No chart data available.</div>;
  }

  const hovered = hoverIdx !== null ? candles[hoverIdx] : null;

  return (
    <div className="candlestick-chart">
      <svg
        viewBox={`0 -10 ${VIEW_W} ${height + 30}`}
        preserveAspectRatio="none"
        className="candlestick-chart__svg"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
          const idx = Math.min(candles.length - 1, Math.max(0, Math.floor(x / candleWidth)));
          setHoverIdx(idx);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={0} x2={VIEW_W} y1={t.y} y2={t.y} className="candlestick-chart__gridline" />
            <text x={2} y={t.y - 2} className="candlestick-chart__axis-label">
              {t.value.toFixed(2)}
            </text>
          </g>
        ))}

        {path.map((c, i) => {
          const x = i * candleWidth + candleWidth / 2;
          const up = c.c >= c.o;
          const bodyTop = scaleY(Math.max(c.o, c.c));
          const bodyBottom = scaleY(Math.min(c.o, c.c));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const bodyW = Math.max(1, candleWidth * 0.6);
          return (
            <g key={i} className={up ? "candlestick-chart__up" : "candlestick-chart__down"}>
              <line x1={x} x2={x} y1={scaleY(c.h)} y2={scaleY(c.l)} className="candlestick-chart__wick" />
              <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyHeight} className="candlestick-chart__body" />
            </g>
          );
        })}

        {hoverIdx !== null && (
          <line
            x1={hoverIdx * candleWidth + candleWidth / 2}
            x2={hoverIdx * candleWidth + candleWidth / 2}
            y1={0}
            y2={height}
            className="candlestick-chart__crosshair"
          />
        )}

        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height + 20} className="candlestick-chart__axis-label" textAnchor="middle">
            {l.label}
          </text>
        ))}
      </svg>

      {hovered && (
        <div className="candlestick-chart__tooltip">
          <span>{new Date(hovered.t * 1000).toLocaleDateString()}</span>
          <span>O {hovered.o.toFixed(2)}</span>
          <span>H {hovered.h.toFixed(2)}</span>
          <span>L {hovered.l.toFixed(2)}</span>
          <span>C {hovered.c.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
