import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { UsageStats } from '../types/usage';

interface Props {
  stats: UsageStats;
}

const PROVIDER_COLORS: Record<string, string> = {
  claude: '#fb923c',
  kimi: '#c084fc',
  codex: '#4ade80',
};

const MODEL_PALETTE = [
  '#60a5fa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#f87171',
  '#22d3ee',
  '#fb923c',
];

function modelColor(model: string, provider: string, index: number): string {
  if (provider && PROVIDER_COLORS[provider]) {
    // Vary lightness slightly by hashing model name so same model is consistent
    const hash = model.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const base = PROVIDER_COLORS[provider];
    if (hash % 3 === 0) return base;
    if (hash % 3 === 1) return base + 'cc';
    return base + '99';
  }
  return MODEL_PALETTE[index % MODEL_PALETTE.length];
}

function formatNumber(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return n.toLocaleString();
}

function formatCost(n?: number): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return '$' + n.toFixed(4);
}

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '0.5rem',
  color: '#e4e4e7',
};

export default function ModelUsageCharts({ stats }: Props) {
  const modelData = Object.values(stats.byModel).map((m) => ({
    name: m.model || 'Unknown',
    provider: m.provider,
    records: m.records,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    totalTokens: m.totalTokens,
    costUsd: m.costUsd,
  }));

  // Sort by total tokens descending
  modelData.sort((a, b) => b.totalTokens - a.totalTokens);

  const pieData = modelData.map((m) => ({
    name: m.name,
    value: m.totalTokens,
    provider: m.provider,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Tokens by Model */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Tokens by Model</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modelData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
                angle={modelData.length > 5 ? -30 : 0}
                textAnchor={modelData.length > 5 ? 'end' : 'middle'}
                height={modelData.length > 5 ? 60 : 30}
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
                formatter={(value: any, name: any) => {
                  if (name === 'Input') return [formatNumber(Number(value)), 'Input tokens'];
                  if (name === 'Output') return [formatNumber(Number(value)), 'Output tokens'];
                  return [formatNumber(Number(value)), name];
                }}
              />
              <Legend
                wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }}
              />
              <Bar dataKey="inputTokens" name="Input" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} />
              <Bar dataKey="outputTokens" name="Output" stackId="a" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost by Model */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Cost by Model</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modelData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
                angle={modelData.length > 5 ? -30 : 0}
                textAnchor={modelData.length > 5 ? 'end' : 'middle'}
                height={modelData.length > 5 ? 60 : 30}
              />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#e4e4e7' }}
                formatter={(value: any) => [formatCost(Number(value)), 'Cost']}
              />
              <Bar dataKey="costUsd" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Token Distribution Pie */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Token Distribution</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={modelColor(entry.name, entry.provider, index)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#e4e4e7' }}
                formatter={(value: any, name: any) => {
                  const total = pieData.reduce((sum, item) => sum + item.value, 0);
                  const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : '0.0';
                  return [`${formatNumber(Number(value))} (${pct}%)`, name];
                }}
              />
              <Legend
                wrapperStyle={{ color: '#a1a1aa', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Records by Model */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Records by Model</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modelData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
                angle={modelData.length > 5 ? -30 : 0}
                textAnchor={modelData.length > 5 ? 'end' : 'middle'}
                height={modelData.length > 5 ? 60 : 30}
              />
              <YAxis
                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: '#e4e4e7' }}
                formatter={(value: any) => [formatNumber(Number(value)), 'Records']}
              />
              <Bar dataKey="records" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
