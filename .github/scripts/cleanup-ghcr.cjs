const SHA_TAG = /^[0-9a-f]{40}$/;
const PROTECTED_TAGS = new Set(["dev", "prod", "latest"]);

module.exports = async ({ github, context, core }) => {
  const packageName = process.env.PACKAGE_NAME;
  const keepBuilds = Number(process.env.KEEP_BUILDS || 10);
  const minAgeMs = Number(process.env.MIN_AGE_DAYS || 30) * 24 * 60 * 60 * 1000;
  const relatedWindowMs =
    Number(process.env.RELATED_WINDOW_MINUTES || 15) * 60 * 1000;
  const dryRun = String(process.env.DRY_RUN).toLowerCase() === "true";
  const owner = context.repo.owner;

  const versions = await github.paginate(
    github.rest.packages.getAllPackageVersionsForPackageOwnedByUser,
    {
      username: owner,
      package_type: "container",
      package_name: packageName,
      per_page: 100,
    },
  );

  const taggedBuilds = versions
    .filter((version) =>
      (version.metadata?.container?.tags || []).some((tag) => SHA_TAG.test(tag)),
    )
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));

  const retainedRoots = new Map();
  for (const version of taggedBuilds.slice(0, keepBuilds)) {
    retainedRoots.set(version.id, version);
  }
  for (const version of versions) {
    const tags = version.metadata?.container?.tags || [];
    if (tags.some((tag) => PROTECTED_TAGS.has(tag))) {
      retainedRoots.set(version.id, version);
    }
  }

  const retainedTimes = [...retainedRoots.values()].map((version) =>
    new Date(version.created_at).getTime(),
  );
  const cutoff = Date.now() - minAgeMs;
  const deletable = versions.filter((version) => {
    if (retainedRoots.has(version.id)) return false;
    const createdAt = new Date(version.created_at).getTime();
    if (createdAt >= cutoff) return false;
    return !retainedTimes.some(
      (retainedAt) => Math.abs(createdAt - retainedAt) <= relatedWindowMs,
    );
  });

  core.summary
    .addHeading("GHCR cleanup")
    .addTable([
      [
        { data: "Package versions", header: true },
        { data: "Protected roots", header: true },
        { data: "Deletion candidates", header: true },
        { data: "Dry run", header: true },
      ],
      [String(versions.length), String(retainedRoots.size), String(deletable.length), String(dryRun)],
    ]);

  for (const version of deletable) {
    const tags = version.metadata?.container?.tags || [];
    core.info(
      `${dryRun ? "Would delete" : "Deleting"} ${version.id} ` +
        `created=${version.created_at} tags=${tags.join(",") || "<untagged>"}`,
    );
    if (!dryRun) {
      await github.rest.packages.deletePackageVersionForUser({
        username: owner,
        package_type: "container",
        package_name: packageName,
        package_version_id: version.id,
      });
    }
  }

  await core.summary.write();
};
