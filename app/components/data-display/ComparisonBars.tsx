import { cx } from '~/cva.config';

interface ComparisonBarsProps {
    aLabel: string;
    aValue: number;
    bLabel: string;
    bValue: number;
    formatValue?: (n: number) => string;
    className?: string;
}

export function ComparisonBars({
    aLabel,
    aValue,
    bLabel,
    bValue,
    formatValue = (n) => String(n),
    className,
}: ComparisonBarsProps) {
    const maxValue = Math.max(0, aValue, bValue);
    const aPct = maxValue === 0 ? 0 : aValue / maxValue;
    const bPct = maxValue === 0 ? 0 : bValue / maxValue;

    return (
        <div className={cx('flex flex-col gap-3', className)}>
            <BarRow
                label={aLabel}
                valueLabel={formatValue(aValue)}
                pct={aPct}
                fillClassName="bg-primary"
            />
            <BarRow
                label={bLabel}
                valueLabel={formatValue(bValue)}
                pct={bPct}
                fillClassName="bg-accent"
            />
        </div>
    );
}

function BarRow({
    label,
    valueLabel,
    pct,
    fillClassName,
}: {
    label: string;
    valueLabel: string;
    pct: number;
    fillClassName: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs opacity-70">
                <span>{label}</span>
                <span className="font-mono">{valueLabel}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-base-300 overflow-hidden">
                <div
                    className={cx('h-full rounded-full', fillClassName)}
                    style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }}
                />
            </div>
        </div>
    );
}
