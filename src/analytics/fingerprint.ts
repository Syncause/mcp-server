import crypto from "crypto";

// Internal encryption salt - used to generate irreversible fingerprints for API Keys
// This is a fixed value used internally by the project, no user configuration required
const ANALYTICS_SALT = "4d5cda6b3479f877c244ad9031a9219e0261ff6255d9b0ec5435640fcf6dadac";

/**
 * Generate an irreversible fingerprint of the apiKey, used as PostHog distinctId / alias
 * Uses HMAC-SHA256 algorithm to ensure one-way encryption and protect user privacy
 */
export function apiKeyFingerprint(apiKey: string): string {
    // Normalization: avoid inconsistent fingerprints due to leading/trailing spaces/newlines
    const normalized = apiKey.trim();

    return crypto
        .createHmac("sha256", ANALYTICS_SALT)
        .update(normalized, "utf8")
        .digest("hex"); // 64 hex chars
}
