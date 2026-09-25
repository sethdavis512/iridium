import {
    AgentRegistry,
    createVoltAgentObservability,
    type ObservabilityStorageAdapter,
} from '@voltagent/core';

/**
 * Keeps nothing. VoltAgent's default observability stores up to 10k spans and
 * 50k log records per process in memory (including prompt and response text)
 * for a local VoltAgent console, and queues exports to VoltOps. Iridium runs
 * neither, so nothing ever reads them; discarding avoids holding user content
 * and the memory. Swap in an OTLP span processor or VoltOps keys to export.
 */
class DiscardingObservabilityStorage implements ObservabilityStorageAdapter {
    async addSpan() {}
    async updateSpan() {}
    async getSpan() {
        return null;
    }
    async getTrace() {
        return [];
    }
    async listTraces() {
        return [];
    }
    async saveLogRecord() {}
    async getLogsByTraceId() {
        return [];
    }
    async getLogsBySpanId() {
        return [];
    }
    async queryLogs() {
        return [];
    }
    async deleteOldSpans() {
        return 0;
    }
    async deleteOldLogs() {
        return 0;
    }
    async clear() {}
}

/**
 * Registered globally because an Agent without a VoltAgent server instance
 * reads observability from the registry before falling back to its own
 * in-memory default. Import this module before running any agent.
 */
AgentRegistry.getInstance().setGlobalObservability(
    createVoltAgentObservability({
        serviceName: 'iridium',
        storage: new DiscardingObservabilityStorage(),
        voltOpsSync: { sampling: { strategy: 'never' } },
    }),
);
