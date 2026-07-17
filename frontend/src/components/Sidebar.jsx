import SafetyLegend from './SafetyLegend';

export default function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-4 lg:flex">
      <SafetyLegend />
    </aside>
  );
}
