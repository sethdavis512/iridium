import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentDatetimeTool, getWeatherTool } from './weather';

/** Tools that read nothing from their run context. */
const context = {} as Parameters<NonNullable<typeof getWeatherTool.execute>>[1];

function jsonResponse(body: unknown) {
    return {
        ok: true,
        status: 200,
        json: async () => body,
    } as Response;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('get_weather', () => {
    it('returns conditions for a found location', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                jsonResponse({
                    results: [
                        {
                            name: 'Austin',
                            country: 'United States',
                            latitude: 30.27,
                            longitude: -97.74,
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    current: {
                        temperature_2m: 98.6,
                        relative_humidity_2m: 40,
                        wind_speed_10m: 5,
                        weather_code: 0,
                    },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const result = await getWeatherTool.execute!(
            { location: 'Austin' },
            context,
        );

        expect(result).toEqual({
            location: 'Austin, United States',
            temperatureF: 98.6,
            humidityPercent: 40,
            windSpeedMph: 5,
            conditions: 'Clear sky',
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reports unknown locations', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(jsonResponse({ results: [] })),
        );

        const result = await getWeatherTool.execute!(
            {
                location: 'Nowheresville',
            },
            context,
        );

        expect(result).toEqual({
            error: 'Could not find a place named "Nowheresville".',
        });
    });

    it('degrades gracefully when the API fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(new Error('network down')),
        );

        const result = await getWeatherTool.execute!(
            { location: 'Austin' },
            context,
        );

        expect(result).toEqual({
            error: 'Weather lookup failed. Try again later.',
        });
    });
});

describe('get_current_datetime', () => {
    it('returns ISO and UTC timestamps', async () => {
        const result = (await getCurrentDatetimeTool.execute!({}, context)) as {
            iso: string;
            utc: string;
        };

        expect(new Date(result.iso).toISOString()).toBe(result.iso);
        expect(result.utc).toContain('GMT');
    });
});
