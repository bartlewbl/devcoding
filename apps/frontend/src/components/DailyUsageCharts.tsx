import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { DailyUsage } from '../types/usage';

interface Props {
  data: DailyUsage[];
}

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '0.5rem',
  color: '#e4e4e7',
};

function formatNumber(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return n.toLocaleString();
}

function getIntensityClass(tokens: number): string {
  if (tokens === 0) return 'bg-zinc-800';
  if (tokens < 1_000) return 'bg-emerald-900';
  if (tokens < 10_000) return 'bg-emerald-700';
  if (tokens < 50_000) return 'bg-emerald-500';
  if (tokens < 100_000) return 'bg-emerald-400';
  return 'bg-emerald-300';
}

function useContributionData(data: DailyUsage[]) {
  const dayMap = new Map(data.map((d) => [d.day, d.totalTokens]));

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 365);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday

  const days: { day: string; tokens: number; date: Date }[] = [];
  const iter = new Date(start);
  while (iter <= end) {
    const dayStr = iter.toISOString().split('T')[0];
    days.push({ day: dayStr, tokens: dayMap.get(dayStr) || 0, date: new Date(iter) });
    iter.setDate(iter.getDate() + 1);
  }

  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return weeks;
}

export default function DailyUsageCharts({ data }: Props) {
  const weeks = useContributionData(data);

  return (
    <div className="grid grid-cols-1 gap-6 mb-8">
      {/* Daily line chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Daily Token Usage</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
                tickFormatter={(v: string) => {
                  const d = new Date(v + 'T00:00:00');
                  return d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
                }}
                minTickGap={30}
              />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : `${v}`
                }
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#e4e4e7' }}
                labelFormatter={(label: any) => {
                  const d = new Date(String(label) + 'T00:00:00');
                  return d.toLocaleDateString('default', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                }}
                formatter={(value: any, name: any) => {
                  if (name === 'Total tokens') return [formatNumber(Number(value)), 'Total tokens'];
                  if (name === 'Records') return [formatNumber(Number(value)), 'Records'];
                  return [formatNumber(Number(value)), name];
                }}
              />
              <Area
                type="monotone"
                dataKey="totalTokens"
                name="Total tokens"
                stroke="#34d399"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#tokenGradient)"
              />
              <Area
                type="monotone"
                dataKey="records"
                name="Records"
                stroke="#60a5fa"
                strokeWidth={1.5}
                fill="none"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Contribution graph */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-1">Usage Activity</h3>
        <p className="text-xs text-zinc-500 mb-4">Last 365 days</p>
        <div className="overflow-x-auto pb-2">
          <div className="inline-block min-w-full">
            <div className="flex">
              {/* Day-of-week labels */}
              <div className="flex flex-col gap-1 pr-2 text-[10px] text-zinc-500 justify-around h-[88px]">
                <span className="h-3 leading-3">Mon</span>
                <span className="h-3 leading-3">Wed</span>
                <span className="h-3 leading-3">Fri</span>
              </div>
              {/* Grid */}
              <div className="flex gap-1">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-1">
                    {week.map((d, di) => (
                      <div
                        key={di}
                        title={`${d.day}: ${formatNumber(d.tokens)} tokens`}
                        className={`w-3 h-3 rounded-sm ${getIntensityClass(d.tokens)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-zinc-500">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm bg-zinc-800" />
                <div className="w-3 h-3 rounded-sm bg-emerald-900" />
                <div className="w-3 h-3 rounded-sm bg-emerald-700" />
                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                <div className="w-3 h-3 rounded-sm bg-emerald-400" />
                <div className="w-3 h-3 rounded-sm bg-emerald-300" />
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
