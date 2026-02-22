interface DonutProgressProps {
    value: number; // 0..1
    size?: number;
    strokeWidth?: number;
    className?: string;
    label?: string;
}

function clamp01(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

export function DonutProgress({
    value,
    size = 96,
    strokeWidth = 12,
    className,
    label,
}: DonutProgressProps) {
    const clamped = clamp01(value);
    const radius = size / 2;
    const innerRadius = radius - strokeWidth;
    const circumference = 2 * Math.PI * innerRadius;
    const offset = circumference * (1 - clamped);

    const trackColor = 'var(--color-base-content)';
    const foreground = 'var(--color-primary)';
    const textColor = 'var(--color-base-content)';

    return (
        <div className={className}>
            <svg width={size} height={size} role="img">
                <circle
                    cx={radius}
                    cy={radius}
                    r={innerRadius}
                    fill="none"
                    stroke={trackColor}
                    strokeOpacity={0.18}
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx={radius}
                    cy={radius}
                    r={innerRadius}
                    fill="none"
                    stroke={foreground}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${radius} ${radius})`}
                />
                <text
                    x={radius}
                    y={radius}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={textColor}
                    fontSize={14}
                    fontWeight={700}
                >
                    {(clamped * 100).toFixed(0)}%
                </text>
                {label && (
                    <text
                        x={radius}
                        y={radius + 14}
                        textAnchor="middle"
                        dominantBaseline="hanging"
                        fill={textColor}
                        fontSize={10}
                        opacity={0.7}
                    >
                        {label}
                    </text>
                )}
            </svg>
        </div>
    );
}
