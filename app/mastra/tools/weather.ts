import { createTool } from '@mastra/core/tools';
import z from 'zod';

const FETCH_TIMEOUT_MS = 8_000;

async function fetchJson(url: string) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
}

// Open-Meteo WMO weather interpretation codes, condensed.
const WEATHER_CODES: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
};

export const getWeatherTool = createTool({
    id: 'get_weather',
    description:
        'Get the current weather for a location. Use when the user asks about weather conditions or temperature somewhere.',
    inputSchema: z.object({
        location: z
            .string()
            .max(200, 'Location must be 200 characters or fewer')
            .describe('City or place name, e.g. "Austin" or "Paris, France"'),
    }),
    execute: async (args) => {
        try {
            // Open-Meteo is free and keyless: geocode, then fetch conditions.
            const geo = (await fetchJson(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.location)}&count=1`,
            )) as {
                results?: {
                    name: string;
                    country?: string;
                    latitude: number;
                    longitude: number;
                }[];
            };

            const place = geo.results?.[0];
            if (!place) {
                return {
                    error: `Could not find a place named "${args.location}".`,
                };
            }

            const forecast = (await fetchJson(
                `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`,
            )) as {
                current?: {
                    temperature_2m: number;
                    relative_humidity_2m: number;
                    wind_speed_10m: number;
                    weather_code: number;
                };
            };

            const current = forecast.current;
            if (!current) {
                return { error: 'Weather data is unavailable right now.' };
            }

            return {
                location: [place.name, place.country]
                    .filter(Boolean)
                    .join(', '),
                temperatureF: current.temperature_2m,
                humidityPercent: current.relative_humidity_2m,
                windSpeedMph: current.wind_speed_10m,
                conditions:
                    WEATHER_CODES[current.weather_code] ?? 'Unknown conditions',
            };
        } catch {
            return { error: 'Weather lookup failed. Try again later.' };
        }
    },
});

export const getCurrentDatetimeTool = createTool({
    id: 'get_current_datetime',
    description:
        'Get the current date and time (UTC). Use when the user asks what day or time it is, or when a calculation needs the current date.',
    inputSchema: z.object({}),
    execute: async () => {
        const now = new Date();

        return {
            iso: now.toISOString(),
            utc: now.toUTCString(),
        };
    },
});
