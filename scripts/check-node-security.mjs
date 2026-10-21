const REQUIRED_NODE = [22, 23, 4];

function compareVersions(actual, required) {
  for (let index = 0; index < required.length; index += 1) {
    const difference = actual[index] - required[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

const actual = process.versions.node.split(".").map(Number);
const required = REQUIRED_NODE.join(".");

console.log(`Node.js runtime: ${process.version}`);

if (actual.some(Number.isNaN) || actual[0] !== REQUIRED_NODE[0]) {
  console.error(
    `Safe Inspector requires the Node.js ${REQUIRED_NODE[0]}.x release line; received ${process.version}.`,
  );
  process.exit(1);
}

if (compareVersions(actual, REQUIRED_NODE) < 0) {
  console.error(
    `Node.js ${required} or newer is required to include the October 2026 security fixes.`,
  );
  process.exit(1);
}

console.log(`Node.js runtime satisfies the security floor (>=${required}).`);
