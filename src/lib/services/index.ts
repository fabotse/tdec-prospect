/**
 * External Services Factory
 * Story: 2.3 - Integration Connection Testing
 *
 * Central export point for all external service integrations.
 * Provides factory function to get service instances.
 */

import type { ServiceName } from "@/types/integration";
import { ExternalService, type TestConnectionResult } from "./base-service";
import { ApolloService } from "./apollo";
import { SignalHireService } from "./signalhire";
import { SnovioService } from "./snovio";
import { InstantlyService } from "./instantly";

// ==============================================
// RE-EXPORTS
// ==============================================

export {
  ExternalService,
  ExternalServiceError,
  ERROR_MESSAGES,
  type TestConnectionResult,
} from "./base-service";

export { ApolloService } from "./apollo";
export { SignalHireService } from "./signalhire";
export { SnovioService } from "./snovio";
export { InstantlyService } from "./instantly";

// ==============================================
// SERVICE INSTANCES
// ==============================================

const services: Record<ServiceName, ExternalService> = {
  apollo: new ApolloService(),
  signalhire: new SignalHireService(),
  snovio: new SnovioService(),
  instantly: new InstantlyService(),
};

// ==============================================
// FACTORY FUNCTIONS
// ==============================================

/**
 * Get service instance by name
 *
 * @param serviceName - The service name (apollo, signalhire, snovio, instantly)
 * @returns The service instance
 * @throws Error if service name is invalid
 */
export function getService(serviceName: ServiceName): ExternalService {
  const service = services[serviceName];

  if (!service) {
    throw new Error(`Serviço desconhecido: ${serviceName}`);
  }

  return service;
}

/**
 * Test connection to a service
 *
 * @param serviceName - The service name
 * @param apiKey - The API key to test
 * @returns TestConnectionResult with success/failure and message
 */
export async function testConnection(
  serviceName: ServiceName,
  apiKey: string
): Promise<TestConnectionResult> {
  const service = getService(serviceName);
  return service.testConnection(apiKey);
}
