import type { ProviderId } from "../domain/types.js";

export interface SourceRegistryEntry {
  providerId: ProviderId;
  providerName: string;
  discoveryUrl: string;
  sourceType: "official product catalog";
  state: "discovery only";
}

export const sourceRegistry: SourceRegistryEntry[] = [
  {
    providerId: "speedcloud",
    providerName: "NxtGen SpeedCloud",
    discoveryUrl: "https://speedcloud.nxtgen.com/india",
    sourceType: "official product catalog",
    state: "discovery only",
  },
  {
    providerId: "aws",
    providerName: "Amazon Web Services",
    discoveryUrl: "https://aws.amazon.com/products/",
    sourceType: "official product catalog",
    state: "discovery only",
  },
  {
    providerId: "azure",
    providerName: "Microsoft Azure",
    discoveryUrl: "https://azure.microsoft.com/en-us/products/",
    sourceType: "official product catalog",
    state: "discovery only",
  },
  {
    providerId: "gcp",
    providerName: "Google Cloud",
    discoveryUrl: "https://cloud.google.com/products",
    sourceType: "official product catalog",
    state: "discovery only",
  },
];
