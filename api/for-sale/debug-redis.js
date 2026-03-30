/**
 * GET — whether Redis env is visible to serverless (booleans only, no secrets).
 * Use after deploy: open /api/for-sale/debug-redis on your live site.
 */
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, message: "Method not allowed" });
    return;
  }
  var hasUrl = !!(
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  );
  var hasToken = !!(
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  );
  var moduleOk = false;
  try {
    require.resolve("@upstash/redis");
    moduleOk = true;
  } catch (e) {
    moduleOk = false;
  }
  res.status(200).json({
    ok: true,
    redisEnv: {
      hasUrl: hasUrl,
      hasToken: hasToken,
      ready: hasUrl && hasToken,
    },
    dependency: { upstashRedisInstalled: moduleOk },
    hint:
      hasUrl && hasToken
        ? "Env looks good. If saves still fail, check Vercel Function logs for Redis errors."
        : hasUrl || hasToken
          ? "Only one of URL/token is set — add the missing variable (both UPSTASH_REDIS_REST_* or both KV_REST_API_*)."
          : "Serverless does not see UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*). Add them for Production, save, redeploy.",
  });
};
