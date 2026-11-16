// The XP environments the proxy forwards to, keyed by the first path segment (/dev1/_/...)
export const XP_ORIGINS: Record<string, string> = {
    dev1: 'https://www.dev.nav.no',
    dev2: 'https://www-q6.nav.no',
    prod: 'https://www.nav.no',
};

export const XP_ENVS = Object.keys(XP_ORIGINS);

// Own keys only, so /constructor/_/... and the like aren't taken for an environment
export const isXpEnv = (env: string) => Object.hasOwn(XP_ORIGINS, env);

export const proxyConfig = {
    // How long the connection to XP may be idle before the proxy gives up and answers 504.
    // Under the ingress' 60s (haproxy.org/timeout-server), so the proxy answers, and counts it, before the ingress cuts it off
    timeoutMs: 45_000,
};
