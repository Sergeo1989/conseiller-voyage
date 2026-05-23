// T014 — OpenTelemetry SDK avec OTLP exporter.
// Cf. ADR-0003 (Grafana Cloud Canada). Init désactivée si
// OTEL_EXPORTER_OTLP_ENDPOINT n'est pas défini (dev sans observabilité).

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

interface OtelConfig {
  serviceName: string;
  endpoint: string;
  headers?: string;
  environment: string;
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(',')
      .map((pair) => pair.split('=').map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[0])),
  );
}

let sdk: NodeSDK | undefined;

export function initOtel(config: OtelConfig): void {
  const headers = parseHeaders(config.headers);

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
      'deployment.environment': config.environment,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces`, headers }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${config.endpoint}/v1/metrics`, headers }),
      exportIntervalMillis: 60_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Évite le bruit sur les fichiers locaux.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      .then(() => process.stderr.write('OTel SDK shut down\n'))
      .catch((err: unknown) => process.stderr.write(`OTel SDK shutdown error: ${String(err)}\n`));
  });
}
