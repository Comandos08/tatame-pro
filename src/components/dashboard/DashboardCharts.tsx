import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";

interface MonthlyData {
  month: string;
  count: number;
}

interface DashboardChartsProps {
  membershipsByMonth: MonthlyData[];
  diplomasByMonth: MonthlyData[];
  membershipsTitle: string;
  diplomasTitle: string;
  subtitle: string;
  chartConfig: ChartConfig;
}

// Recharts' ResponsiveContainer measures its parent on mount and logs
// "The width(-1) and height(-1) of chart should be greater than 0..."
// whenever the parent has no measurable size yet — which happens during
// the Suspense fallback → real-content swap. This wrapper defers the
// actual chart render until the host element has reported a width
// through ResizeObserver, so recharts never sees a -1 dimension.
function MeasuredChart({
  config,
  children,
}: {
  config: ChartConfig;
  children: React.ComponentProps<typeof ChartContainer>["children"];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const el = hostRef.current;
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setReady(true);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) setReady(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="h-[250px] w-full">
      {ready ? (
        <ChartContainer config={config} className="h-[250px] w-full">
          {children}
        </ChartContainer>
      ) : null}
    </div>
  );
}

// Extracted from TenantDashboard so recharts (~25 KiB gzipped) is loaded
// lazily and below-the-fold instead of bloating the dashboard's initial
// chunk. Both BarChart cards render side-by-side on desktop and stacked
// on mobile, identical to the original markup.
export default function DashboardCharts({
  membershipsByMonth,
  diplomasByMonth,
  membershipsTitle,
  diplomasTitle,
  subtitle,
  chartConfig,
}: DashboardChartsProps) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{membershipsTitle}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <MeasuredChart config={chartConfig}>
            <BarChart data={membershipsByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </MeasuredChart>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{diplomasTitle}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <MeasuredChart config={chartConfig}>
            <BarChart data={diplomasByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </MeasuredChart>
        </CardContent>
      </Card>
    </div>
  );
}
