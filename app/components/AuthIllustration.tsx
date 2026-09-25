import { useId, type ComponentPropsWithoutRef } from 'react';
import { cx } from 'cva.config';

/**
 * Pentagons (the header's brand mark) twisting toward a solid core. Points are
 * precomputed so the server and client render identical markup.
 */
const TWIST = [
    {
        points: '400.0,230.0 609.2,382.0 529.3,628.0 270.7,628.0 190.8,382.0',
        opacity: 0.2,
    },
    {
        points: '427.3,255.9 593.0,416.0 492.0,623.1 263.8,591.0 223.8,364.1',
        opacity: 0.26,
    },
    {
        points: '447.4,284.7 571.9,444.0 458.8,611.6 264.5,555.9 257.4,353.8',
        opacity: 0.33,
    },
    {
        points: '460.2,314.8 547.2,465.5 430.8,594.8 271.8,524.0 290.0,351.0',
        opacity: 0.41,
    },
    {
        points: '465.7,344.8 520.3,480.0 408.6,573.7 285.0,496.5 320.3,355.0',
        opacity: 0.5,
    },
    {
        points: '464.3,373.4 492.7,487.5 393.0,549.8 303.0,474.2 347.0,365.2',
        opacity: 0.6,
    },
    {
        points: '458.0,397.8 467.5,489.0 383.8,526.3 322.4,458.2 368.3,378.7',
        opacity: 0.72,
    },
];

const CORE = '443.1,420.9 441.0,482.0 382.2,498.9 348.0,448.2 385.7,400.0';

/** Small registration marks in the corners, like a technical drawing. */
const MARKS = [
    [96, 120],
    [704, 120],
    [96, 780],
    [704, 780],
];

type Props = ComponentPropsWithoutRef<'svg'>;

/**
 * Decorative login-page artwork, drawn in `currentColor` (the foreground
 * token by default) plus `fill-background`, so it follows light and dark mode
 * with no image request. Replace this component to rebrand the login page.
 */
export function AuthIllustration({ className, ...props }: Props) {
    // Gradient/pattern ids must be unique in the document; useId is stable
    // across SSR and hydration. Strip characters that are awkward in url(#).
    const id = useId().replace(/[^\w-]/g, '');
    const dotsId = `${id}-dots`;
    const fadeId = `${id}-fade`;
    const fadeMaskId = `${id}-fade-mask`;
    const glowId = `${id}-glow`;

    return (
        <svg
            viewBox="0 0 800 900"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            focusable="false"
            className={cx('text-foreground', className)}
            {...props}
        >
            <defs>
                <pattern
                    id={dotsId}
                    width="24"
                    height="24"
                    patternUnits="userSpaceOnUse"
                >
                    <circle cx="12" cy="12" r="1.25" fill="currentColor" />
                </pattern>
                <radialGradient id={fadeId} cx="50%" cy="50%" r="60%">
                    <stop offset="0" stopColor="white" />
                    <stop offset="1" stopColor="white" stopOpacity="0" />
                </radialGradient>
                <mask id={fadeMaskId}>
                    <rect width="800" height="900" fill={`url(#${fadeId})`} />
                </mask>
                <radialGradient id={glowId}>
                    <stop
                        offset="0"
                        stopColor="currentColor"
                        stopOpacity="0.1"
                    />
                    <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                </radialGradient>
            </defs>

            <rect
                width="800"
                height="900"
                fill={`url(#${dotsId})`}
                mask={`url(#${fadeMaskId})`}
                opacity="0.3"
            />
            <circle cx="400" cy="450" r="300" fill={`url(#${glowId})`} />

            <g fill="none" stroke="currentColor" strokeLinecap="round">
                <circle cx="400" cy="450" r="330" opacity="0.16" />
                <circle
                    cx="400"
                    cy="450"
                    r="270"
                    strokeDasharray="2 10"
                    strokeWidth="1.5"
                    opacity="0.4"
                />
                <ellipse
                    cx="400"
                    cy="450"
                    rx="360"
                    ry="110"
                    transform="rotate(-28 400 450)"
                    opacity="0.14"
                />
                <ellipse
                    cx="400"
                    cy="450"
                    rx="360"
                    ry="110"
                    transform="rotate(28 400 450)"
                    opacity="0.14"
                />
                {MARKS.map(([x, y]) => (
                    <path
                        key={`${x}-${y}`}
                        d={`M${x - 7} ${y}h14M${x} ${y - 7}v14`}
                        opacity="0.35"
                    />
                ))}
            </g>

            <g fill="none" stroke="currentColor" strokeLinejoin="round">
                {TWIST.map(({ points, opacity }) => (
                    <polygon
                        key={points}
                        points={points}
                        strokeWidth="1.5"
                        opacity={opacity}
                    />
                ))}
            </g>
            <polygon points={CORE} fill="currentColor" />

            <g fill="currentColor">
                <circle cx="670.3" cy="260.7" r="6" />
                <circle cx="89.9" cy="562.9" r="4" opacity="0.6" />
                <circle cx="492.3" cy="703.7" r="5" />
                <circle cx="166.2" cy="315.0" r="4" opacity="0.6" />
            </g>
            <circle
                cx="653.7"
                cy="542.3"
                r="6"
                className="fill-background"
                stroke="currentColor"
                strokeWidth="2"
            />
        </svg>
    );
}
