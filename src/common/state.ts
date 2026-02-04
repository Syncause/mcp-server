
export interface GlobalState {
  isApiKeyValid: boolean | undefined; // undefined: checking, true: valid, false: invalid
  apiKeyError?: string;
  apiKey?: string;
}

export const state: GlobalState = {
  isApiKeyValid: undefined,
};
