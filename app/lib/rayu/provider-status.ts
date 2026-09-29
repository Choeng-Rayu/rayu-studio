export type RayuProviderStatus =
  | 'ready'
  | 'sign-in-required'
  | 'upgrade-required'
  | 'no-models-configured'
  | 'unavailable';

export interface RayuEntitlementsSummary {
  plan?: { code?: string };
  allowedModels?: unknown[];
  hostedModels?: unknown[];
  topupBalance?: number;
}

/** A gateway error is never evidence that an account needs an upgrade. */
export function classifyRayuProvider(options: {
  signedIn: boolean;
  hasModels: boolean;
  catalogFailed: boolean;
  entitlements?: RayuEntitlementsSummary;
}): RayuProviderStatus {
  if (!options.signedIn) {
    return 'sign-in-required';
  }

  if (options.catalogFailed) {
    return 'unavailable';
  }

  const entitlements = options.entitlements;

  if (!entitlements) {
    return 'unavailable';
  }

  if (Array.isArray(entitlements.hostedModels) && entitlements.hostedModels.length === 0) {
    return 'no-models-configured';
  }

  if (Array.isArray(entitlements.allowedModels) && entitlements.allowedModels.length === 0) {
    if (entitlements.plan?.code === 'free' && !(entitlements.topupBalance && entitlements.topupBalance > 0)) {
      return 'upgrade-required';
    }

    return 'unavailable';
  }

  return options.hasModels ? 'ready' : 'unavailable';
}
