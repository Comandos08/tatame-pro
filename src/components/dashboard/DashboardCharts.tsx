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
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={membershipsByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{diplomasTitle}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={diplomasByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
