const forbiddenModulePrefixes = [
  "@safe-global/onramp-kit",
  "@safe-global/relay-kit",
  "@safe-global/sdk-starter-kit",
  "viem/accounts",
];

const forbiddenOperationNames = new Set([
  "broadcastTransaction",
  "createWalletClient",
  "deployContract",
  "privateKeyToAccount",
  "sendCalls",
  "sendRawTransaction",
  "sendTransaction",
  "signMessage",
  "signTransaction",
  "signTypedData",
  "writeContract",
  "writeContracts",
]);

const forbiddenRpcMethods = new Set([
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sendUserOperation",
  "eth_sign",
  "eth_signTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v1",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "personal_sign",
  "wallet_sendCalls",
]);

function importedName(specifier) {
  if (specifier.type !== "ImportSpecifier") return null;
  return typeof specifier.imported.name === "string"
    ? specifier.imported.name
    : specifier.imported.value;
}

function calledName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type !== "MemberExpression") return null;
  if (!callee.computed && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  if (
    callee.computed &&
    callee.property.type === "Literal" &&
    typeof callee.property.value === "string"
  ) {
    return callee.property.value;
  }
  return null;
}

const readOnlyBoundary = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Preserve the read-only boundary by rejecting signing, writes, and broadcasts.",
    },
    schema: [],
    messages: {
      forbiddenImport:
        "The read-only boundary forbids importing signing-capable module '{{name}}'.",
      forbiddenOperation:
        "The read-only boundary forbids the signing or write operation '{{name}}'.",
      forbiddenRpc:
        "The read-only boundary forbids the signing or broadcast RPC method '{{name}}'.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        const forbiddenModule = forbiddenModulePrefixes.find(
          (prefix) => source === prefix || source.startsWith(`${prefix}/`),
        );
        if (forbiddenModule) {
          context.report({
            node,
            messageId: "forbiddenImport",
            data: { name: source },
          });
          return;
        }

        for (const specifier of node.specifiers) {
          const name = importedName(specifier);
          if (name && forbiddenOperationNames.has(name)) {
            context.report({
              node: specifier,
              messageId: "forbiddenOperation",
              data: { name },
            });
          }
        }
      },
      CallExpression(node) {
        const name = calledName(node.callee);
        if (name && forbiddenOperationNames.has(name)) {
          context.report({
            node,
            messageId: "forbiddenOperation",
            data: { name },
          });
        }
      },
      Literal(node) {
        if (
          typeof node.value === "string" &&
          forbiddenRpcMethods.has(node.value)
        ) {
          context.report({
            node,
            messageId: "forbiddenRpc",
            data: { name: node.value },
          });
        }
      },
    };
  },
};

export default readOnlyBoundary;
