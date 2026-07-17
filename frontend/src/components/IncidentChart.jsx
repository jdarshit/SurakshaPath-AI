import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = {
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#a855f7',
  pink: '#ec4899',
};

/**
 * BarChartComponent - Incident counts by type/severity/area
 */
export function BarChartComponent({ data, title, dataKey = 'count' }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey={Object.keys(data[0] || {})[0]}
            stroke="rgba(255,255,255,0.3)"
            fontSize={12}
          />
          <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              borderRadius: '12px',
              color: '#fff',
            }}
          />
          <Legend />
          <Bar dataKey={dataKey} fill={COLORS.cyan} radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * PieChartComponent - Distribution visualization
 */
export function PieChartComponent({ data, title }) {
  const colors = [COLORS.cyan, COLORS.emerald, COLORS.amber, COLORS.red, COLORS.purple, COLORS.pink];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              borderRadius: '12px',
              color: '#fff',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * LineChartComponent - Trend visualization
 */
export function LineChartComponent({ data, title, dataKey = 'value' }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey={Object.keys(data[0] || {})[0]}
            stroke="rgba(255,255,255,0.3)"
            fontSize={12}
          />
          <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
              borderRadius: '12px',
              color: '#fff',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={COLORS.cyan}
            strokeWidth={2}
            dot={{ fill: COLORS.cyan, r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BarChartComponent;
